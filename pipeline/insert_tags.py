"""
insert_tags.py
Reads tagged_reviews.json (Claude's output) and writes to review_tags table.
Run: python insert_tags.py
"""
import json
import os
import sys

import pymysql

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

in_path = os.path.join(project_root, "pipeline", "tagged_reviews.json")
with open(in_path, "r", encoding="utf-8") as f:
    tagged = json.load(f)

conn = pymysql.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    charset="utf8mb4",
)
cur = conn.cursor()

inserted = 0
skipped = 0
for item in tagged:
    try:
        cur.execute(
            """
            INSERT IGNORE INTO review_tags
                (review_id, asin, sentiment, primary_categories, sub_tags)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                item["id"],
                item["asin"],
                item["sentiment"],
                json.dumps(item.get("primary_categories", [])),
                json.dumps(item.get("sub_tags", [])),
            ),
        )
        if cur.rowcount:
            inserted += 1
        else:
            skipped += 1
    except Exception as e:
        print(f"  Error on {item.get('id')}: {e}")

conn.commit()
conn.close()
print(f"Done — inserted {inserted}, skipped (already tagged) {skipped}")
