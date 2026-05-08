"""
fetch_untagged.py
Dumps all untagged reviews to untagged_reviews.json so Claude can classify them.
Run: python fetch_untagged.py
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

conn = pymysql.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    charset="utf8mb4",
)
cur = conn.cursor()

cur.execute("""
    SELECT r.review_id, r.asin, r.product_name, r.review
    FROM raw_reviews r
    LEFT JOIN review_tags t ON r.review_id = t.review_id
    WHERE t.review_id IS NULL
""")
rows = cur.fetchall()
conn.close()

reviews = [
    {"id": row[0], "asin": row[1], "product": row[2], "text": row[3]}
    for row in rows
]

out_path = os.path.join(project_root, "pipeline", "untagged_reviews.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(reviews, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(reviews)} untagged reviews to {out_path}")
