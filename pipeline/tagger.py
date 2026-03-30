"""
tagger.py
Fetches reviews from raw_reviews, sends them to GPT-4o-mini in batches,
and writes sentiment + category tags to review_tags.
"""
import json
import os
import sys

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
RETAG_ALL_REVIEWS = os.getenv("RETAG_ALL_REVIEWS_ON_PIPELINE", "").strip().lower() in {"1", "true", "yes", "on"}

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

if RETAG_ALL_REVIEWS:
    print("RETAG_ALL_REVIEWS_ON_PIPELINE is enabled. Clearing existing review tags before tagging.")
    cur.execute("DELETE FROM review_tags")
    conn.commit()

cur.execute(
    """
    SELECT r.review_id, r.asin, r.product_name, r.review
    FROM raw_reviews r
    LEFT JOIN review_tags t ON r.review_id = t.review_id
    WHERE t.review_id IS NULL
    """
)
rows = cur.fetchall()
print(f"Reviews to process: {len(rows)}")


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def build_prompt(review_payload: list) -> str:
    return f"""
You are a strict classification engine.

Allowed taxonomy:
{json.dumps(TAXONOMY, indent=2)}

Product type rules (MUST follow):
- "Dashcam Features" and "Windshield Glare" and "Overheating" ONLY apply to dashcam products (e.g. Dashcam ProX). NEVER use these for home/indoor cameras.
- "Home Camera Features" and "False / Excessive Alerts" ONLY apply to home/indoor cameras (e.g. Cam360). NEVER use these for dashcams.
- Use the "product" field in each review to determine product type before tagging.

Rules:
- Classify EACH review independently
- Only use categories from the taxonomy above
- Multiple categories are allowed per review
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
    review_payload = [{"id": row[0], "product": row[2], "text": row[3]} for row in batch]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You output strict JSON only."},
                {"role": "user", "content": build_prompt(review_payload)},
            ],
            temperature=0,
        )
        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)
    except Exception as exc:
        print(f"Batch failed: {exc}")
        continue

    results = {item["id"]: item for item in parsed.get("results", [])}

    for review_id, asin, _, _ in batch:
        if review_id not in results:
            print(f"  Missing result for {review_id}")
            continue

        result = results[review_id]
        cur.execute(
            """
            INSERT INTO review_tags
                (review_id, asin, sentiment, primary_categories, sub_tags)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                review_id,
                asin,
                result.get("sentiment"),
                json.dumps(result.get("primary_categories", [])),
                json.dumps(result.get("sub_tags", [])),
            ),
        )

    conn.commit()
    print(f"  Tagged {len(batch)} reviews")

conn.close()
print("Tagging complete.")
