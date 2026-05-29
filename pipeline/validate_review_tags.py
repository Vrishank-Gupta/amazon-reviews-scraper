"""
validate_review_tags.py

Audits and optionally repairs review_tags rows using deterministic rules:
- category/sub_tag must exist in taxonomy
- sub_tags must belong to selected categories
- product-type-specific categories must not be assigned to the wrong product line
- negative-only issue categories are removed from positive/neutral rows
- obvious rating/sentiment conflicts are corrected

Run:
  python pipeline/validate_review_tags.py
  python pipeline/validate_review_tags.py --fix
"""
import argparse
import json
import os
import sys
from collections import Counter, defaultdict

import pymysql

from utils.taxonomy import TAXONOMY

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

parser = argparse.ArgumentParser(description="Audit/repair review_tags taxonomy consistency.")
parser.add_argument("--fix", action="store_true", help="Write repaired rows back to review_tags.")
args = parser.parse_args()

TAG_TO_CATEGORIES = defaultdict(list)
for category, tags in TAXONOMY.items():
    for tag in tags:
        TAG_TO_CATEGORIES[tag].append(category)

ALLOWED_CATEGORIES = set(TAXONOMY)
ALLOWED_TAGS = set(TAG_TO_CATEGORIES)
NEGATIVE_ONLY_CATEGORIES = {"False / Excessive Alerts"}

ALIASES = {
    "Clear footage without major echo": "Good two-way talk audio",
    "Poor clarity beyond 10 feet": "Faces or number plates not readable",
    "Clarity reduced": "Blurry or low resolution",
    "Installation service did not contact / show up": "Qubo installation service did not contact / show up",
    "Motion detection works well": "Motion detection well-calibrated",
    "Blurry or low resolution (not matching advertised spec)": "Blurry or low resolution",
}

STRONG_NEGATIVE_TEXT = [
    "not working",
    "worst",
    "poor",
    "bad",
    "issue",
    "problem",
    "stopped",
    "return",
    "refund",
    "broken",
    "defect",
    "doesn't work",
    "does not work",
    "unable",
    "failed",
    "failure",
]


def star_num(rating):
    try:
        return int(round(float(str(rating).split()[0])))
    except Exception:
        return None


def is_dashcam(product):
    product = (product or "").lower()
    return any(token in product for token in ["dashcam", "starvis", "front", "rear", "3 channel", "4k"])


def is_home_camera(product):
    product = (product or "").lower()
    return any(token in product for token in ["camera", "cam", "3mp", "4mp", "ptz", "bullet", "360"]) and not is_dashcam(product)


def dedupe(items):
    seen = set()
    return [item for item in items if item and not (item in seen or seen.add(item))]


def repair_row(row):
    issues = []
    sentiment = row["sentiment"] if row["sentiment"] in {"Positive", "Neutral", "Negative"} else "Neutral"
    original_sentiment = sentiment
    star = star_num(row["rating"])
    review_text = f"{row.get('title') or ''} {row.get('review') or ''}".lower()

    if star in {1, 2} and sentiment == "Positive":
        sentiment = "Negative"
        issues.append("1-2_star_positive")
    elif star == 3 and sentiment == "Positive":
        sentiment = "Neutral"
        issues.append("3_star_positive")
    elif star in {4, 5} and sentiment == "Negative" and not any(token in review_text for token in STRONG_NEGATIVE_TEXT):
        sentiment = "Positive"
        issues.append("4-5_star_negative_without_complaint")

    raw_categories = json.loads(row["primary_categories"] or "[]")
    raw_tags = json.loads(row["sub_tags"] or "[]")

    categories = []
    tags = []

    for item in raw_categories:
        if item in ALLOWED_CATEGORIES:
            categories.append(item)
        elif item in ALLOWED_TAGS:
            tags.append(item)
            issues.append("category_was_subtag")
        else:
            issues.append("invalid_category")

    for item in raw_tags:
        item = ALIASES.get(item, item)
        if item in ALLOWED_TAGS:
            tags.append(item)
            categories.extend(TAG_TO_CATEGORIES[item])
        elif item in ALLOWED_CATEGORIES:
            categories.append(item)
            issues.append("subtag_was_category")
        else:
            issues.append("invalid_subtag")

    if is_dashcam(row["product_name"]):
        blocked = {"Home Camera Features", "False / Excessive Alerts"}
        if any(category in blocked for category in categories):
            issues.append("dashcam_home_category")
        categories = [category for category in categories if category not in blocked]
        tags = [tag for tag in tags if not (set(TAG_TO_CATEGORIES[tag]) <= blocked)]
    elif is_home_camera(row["product_name"]):
        blocked = {"Dashcam Features", "Windshield Glare"}
        if any(category in blocked for category in categories):
            issues.append("home_dashcam_category")
        categories = [category for category in categories if category not in blocked]
        tags = [tag for tag in tags if not (set(TAG_TO_CATEGORIES[tag]) <= blocked)]

    if sentiment != "Negative":
        if any(category in NEGATIVE_ONLY_CATEGORIES for category in categories):
            issues.append("non_negative_negative_only_category")
        categories = [category for category in categories if category not in NEGATIVE_ONLY_CATEGORIES]
        tags = [tag for tag in tags if not (set(TAG_TO_CATEGORIES[tag]) <= NEGATIVE_ONLY_CATEGORIES)]

    categories = dedupe(categories)
    tags = dedupe(tags)

    for tag in list(tags):
        if not (set(categories) & set(TAG_TO_CATEGORIES[tag])):
            issues.append("subtag_category_mismatch")
            categories.extend(TAG_TO_CATEGORIES[tag])

    categories = dedupe(categories)[:4]
    tags = dedupe(tags)[:6]

    changed = (
        sentiment != original_sentiment
        or categories != raw_categories
        or tags != raw_tags
    )
    return changed, issues, {
        "sentiment": sentiment,
        "primary_categories": categories,
        "sub_tags": tags,
    }


conn = pymysql.connect(
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)

try:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                r.review_id, r.product_name, r.rating, r.title, r.review,
                t.sentiment, t.primary_categories, t.sub_tags
            FROM raw_reviews r
            JOIN review_tags t ON r.review_id = t.review_id
        """)
        rows = cur.fetchall()

        issue_counts = Counter()
        changed_count = 0
        for row in rows:
            changed, issues, fixed = repair_row(row)
            issue_counts.update(issues)
            if changed:
                changed_count += 1
                if args.fix:
                    cur.execute(
                        """
                        UPDATE review_tags
                        SET sentiment=%s, primary_categories=%s, sub_tags=%s
                        WHERE review_id=%s
                        """,
                        (
                            fixed["sentiment"],
                            json.dumps(fixed["primary_categories"], ensure_ascii=False),
                            json.dumps(fixed["sub_tags"], ensure_ascii=False),
                            row["review_id"],
                        ),
                    )
        if args.fix:
            conn.commit()

    print(json.dumps({
        "rows_checked": len(rows),
        "rows_changed": changed_count,
        "fixed": bool(args.fix),
        "issues": dict(issue_counts),
    }, indent=2, sort_keys=True))
finally:
    conn.close()
