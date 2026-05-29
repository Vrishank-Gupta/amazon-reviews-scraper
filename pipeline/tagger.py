"""
tagger.py
Fetches reviews from raw_reviews, sends them to GPT-4o-mini in batches,
and writes sentiment + category tags to review_tags.
"""
import json
import os
import sys
import argparse
from collections import defaultdict

import pymysql
from openai import OpenAI

from utils.taxonomy import TAXONOMY

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

BATCH_SIZE = 5
MODEL = "gpt-4o-mini"

parser = argparse.ArgumentParser(description="Tag Amazon reviews with VOC sentiment/categories.")
parser.add_argument("--retag-all", action="store_true", help="Retag every raw review and update existing review_tags rows.")
parser.add_argument("--limit", type=int, default=0, help="Optional max number of unique reviews to process.")
parser.add_argument("--dry-run", action="store_true", help="Classify and validate, but do not write to DB.")
args = parser.parse_args()

RETAG_ALL_REVIEWS = args.retag_all or os.getenv("RETAG_ALL_REVIEWS_ON_PIPELINE", "").strip().lower() in {"1", "true", "yes", "on"}

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY is not set in .env")
client = OpenAI(api_key=api_key)

conn = pymysql.connect(
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    charset="utf8mb4",
)
cur = conn.cursor()

where_clause = "" if RETAG_ALL_REVIEWS else "WHERE t.review_id IS NULL"
cur.execute(f"""
    SELECT r.review_id, r.asin, r.product_name, r.rating, r.title, r.review
    FROM raw_reviews r
    LEFT JOIN review_tags t ON r.review_id = t.review_id
    {where_clause}
""")
# De-duplicate by review_id — multiple ASINs can share the same review pool;
# we only need to tag each unique review_id once.
seen_ids = set()
rows = []
for row in cur.fetchall():
    if row[0] not in seen_ids:
        seen_ids.add(row[0])
        rows.append(row)
if args.limit:
    rows = rows[:args.limit]
print(f"Reviews to process: {len(rows)}")

TAG_TO_CATEGORIES = defaultdict(list)
for category_name, tags in TAXONOMY.items():
    for tag in tags:
        TAG_TO_CATEGORIES[tag].append(category_name)

ALLOWED_CATEGORIES = set(TAXONOMY)
ALLOWED_TAGS = set(TAG_TO_CATEGORIES)
NEGATIVE_ONLY_CATEGORIES = {"False / Excessive Alerts"}


def first_star(rating: str):
    try:
        return int(round(float(str(rating).split()[0])))
    except Exception:
        return None


def is_dashcam(product_name: str) -> bool:
    product = (product_name or "").lower()
    return any(token in product for token in ["dashcam", "starvis", "front", "rear", "3 channel", "4k"])


def is_home_camera(product_name: str) -> bool:
    product = (product_name or "").lower()
    if is_dashcam(product):
        return False
    return any(token in product for token in ["camera", "cam", "3mp", "4mp", "ptz", "bullet", "360"])


def sanitize_result(result: dict, product_name: str, rating: str) -> dict:
    sentiment = result.get("sentiment") if result.get("sentiment") in {"Positive", "Neutral", "Negative"} else "Neutral"
    star = first_star(rating)
    text_join = " ".join(str(x).lower() for x in [result.get("reason", ""), result.get("summary", "")])

    if star in {1, 2} and sentiment == "Positive":
        sentiment = "Negative"
    elif star == 3 and sentiment == "Positive":
        sentiment = "Neutral"
    elif star in {4, 5} and sentiment == "Negative":
        strong_complaint = any(token in text_join for token in [
            "not working", "worst", "poor", "bad", "issue", "problem", "stopped", "return", "refund", "broken", "defect",
        ])
        if not strong_complaint:
            sentiment = "Positive"

    raw_categories = [str(item).strip() for item in result.get("primary_categories", []) if str(item).strip()]
    raw_tags = [str(item).strip() for item in result.get("sub_tags", []) if str(item).strip()]

    categories = []
    tags = []

    for item in raw_categories:
        if item in ALLOWED_CATEGORIES:
            categories.append(item)
        elif item in ALLOWED_TAGS:
            tags.append(item)

    for item in raw_tags:
        if item in ALLOWED_TAGS:
            tags.append(item)
            for category_name in TAG_TO_CATEGORIES[item]:
                categories.append(category_name)
        elif item in ALLOWED_CATEGORIES:
            categories.append(item)

    if is_dashcam(product_name):
        blocked = {"Home Camera Features", "False / Excessive Alerts"}
        categories = [item for item in categories if item not in blocked]
        tags = [item for item in tags if not (set(TAG_TO_CATEGORIES[item]) <= blocked)]
    elif is_home_camera(product_name):
        blocked = {"Dashcam Features", "Windshield Glare"}
        categories = [item for item in categories if item not in blocked]
        tags = [item for item in tags if not (set(TAG_TO_CATEGORIES[item]) <= blocked)]

    if sentiment != "Negative":
        categories = [item for item in categories if item not in NEGATIVE_ONLY_CATEGORIES]
        tags = [
            item for item in tags
            if not (set(TAG_TO_CATEGORIES[item]) <= NEGATIVE_ONLY_CATEGORIES)
        ]

    seen = set()
    categories = [item for item in categories if not (item in seen or seen.add(item))]
    seen = set()
    tags = [item for item in tags if not (item in seen or seen.add(item))]

    if not categories and sentiment == "Positive":
        categories = ["Product Value & Competition"]
        tags = ["Good value for money"]

    return {
        "sentiment": sentiment,
        "primary_categories": categories[:4],
        "sub_tags": tags[:6],
    }


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def sanitize(text: str) -> str:
    # Replace all control characters (0x00-0x1F) with spaces — literal newlines
    # inside JSON strings are invalid and cause json.loads to fail
    return "".join(" " if ch < " " else ch for ch in text)


def build_prompt(review_payload: list) -> str:
    return f"""
You are a strict Voice-of-Customer classifier for Amazon India reviews of Qubo / Hero Electronix products.

Allowed taxonomy:
{json.dumps(TAXONOMY, indent=2)}

Product type rules (MUST follow):
- "Dashcam Features" and "Windshield Glare" and "Overheating" ONLY apply to dashcam products (e.g. Dashcam ProX). NEVER use these for home/indoor cameras.
- "Home Camera Features" and "False / Excessive Alerts" ONLY apply to home/indoor cameras (e.g. Cam360). NEVER use these for dashcams.
- Use the "product" field in each review to determine product type before tagging.

Rules:
- Classify EACH review independently
- Use the rating, title, and text together. 1-2 star reviews are usually Negative; 3 star is usually Neutral; 4-5 star reviews are usually Positive unless the text is clearly complaint-dominant.
- Pick 1-4 primary_categories. Only use exact category names from the taxonomy above.
- Pick 0-6 sub_tags. Only use exact sub_tag strings from the taxonomy above.
- Every sub_tag must belong to at least one selected primary_category.
- Do not invent categories or tags.
- Do not put praise under a negative issue category. For example, "Accurate person / motion alerts" is App Features, not False / Excessive Alerts.
- Use "False / Excessive Alerts" only for actual alert complaints such as false alerts, excessive alerts, notification spam, or motion detection being too sensitive.
- If the review is mostly praise with one minor caveat, sentiment should be Positive or Neutral, not Negative.
- If the review is mostly complaint with one minor praise, sentiment should be Negative.
- Return VALID JSON ONLY - no explanation, no markdown

Expected output format:
{{
  "results": [
    {{
      "id": "review_id",
      "sentiment": "Positive | Neutral | Negative",
      "primary_categories": [],
      "sub_tags": []
    }}
  ]
}}

Reviews:
{json.dumps(review_payload, indent=2)}
"""


for batch in chunks(rows, BATCH_SIZE):
    review_payload = [
        {
            "id": row[0],
            "product": row[2],
            "rating": row[3],
            "title": sanitize(row[4] or ""),
            "text": sanitize(row[5] or ""),
        }
        for row in batch
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You output strict JSON only."},
                {"role": "user", "content": build_prompt(review_payload)},
            ],
            temperature=0,
        )
        content = sanitize(response.choices[0].message.content.strip())
        # Strip markdown code fences if the model wraps output in ```json ... ```
        if content.startswith("```"):
            content = content.split("```", 2)[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.rstrip("`").strip()
        parsed = json.loads(content)
    except Exception as exc:
        print(f"Batch failed: {exc}")
        continue

    results = {item["id"]: item for item in parsed.get("results", [])}

    for review_id, asin, product_name, rating, _, _ in batch:
        if review_id not in results:
            print(f"  Missing result for {review_id}")
            continue

        result = sanitize_result(results[review_id], product_name, rating)
        if not args.dry_run:
            cur.execute(
                """
                INSERT INTO review_tags
                    (review_id, asin, sentiment, primary_categories, sub_tags)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    asin=VALUES(asin),
                    sentiment=VALUES(sentiment),
                    primary_categories=VALUES(primary_categories),
                    sub_tags=VALUES(sub_tags)
                """,
                (
                    review_id,
                    asin,
                    result["sentiment"],
                    json.dumps(result["primary_categories"], ensure_ascii=False),
                    json.dumps(result["sub_tags"], ensure_ascii=False),
                ),
            )

    if not args.dry_run:
        conn.commit()
    print(f"  Tagged {len(batch)} reviews")

conn.close()
print("Tagging complete.")
