"""
Tag Amazon reviews with the local hierarchical ML model.

Run:
  python pipeline/local_ml_tagger.py --dry-run --limit 10
  python pipeline/local_ml_tagger.py --retag-all
"""
import argparse
import json
import os
import sys

import pymysql
import pymysql.cursors

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from pipeline.ml.voc_model import load_artifact, predict_rows
from shared.env import load_project_env

load_project_env()


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def fetch_rows(conn, retag_all=False, limit=0):
    where_clause = "" if retag_all else "WHERE t.review_id IS NULL"
    limit_clause = "LIMIT %s" if limit else ""
    query = f"""
        SELECT
            r.review_id, r.asin, r.scrape_asin, r.variant_asin, r.variant_label,
            r.product_name, r.category AS product_category, r.rating, r.title, r.review
        FROM raw_reviews r
        LEFT JOIN review_tags t ON r.review_id = t.review_id
        {where_clause}
        ORDER BY r.review_id
        {limit_clause}
    """
    with conn.cursor() as cur:
        cur.execute(query, (limit,) if limit else None)
        return cur.fetchall()


def upsert_predictions(conn, rows, predictions):
    prediction_by_id = {item["id"]: item for item in predictions}
    written = 0
    skipped = 0
    with conn.cursor() as cur:
        for row in rows:
            review_id = row["review_id"]
            result = prediction_by_id.get(review_id)
            if not result:
                skipped += 1
                continue
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
                    row.get("asin"),
                    result["sentiment"],
                    json.dumps(result.get("primary_categories", []), ensure_ascii=False),
                    json.dumps(result.get("sub_tags", []), ensure_ascii=False),
                ),
            )
            written += 1
    conn.commit()
    return written, skipped


def main():
    parser = argparse.ArgumentParser(description="Tag reviews with the local hierarchical ML model.")
    parser.add_argument("--model", default=os.path.join(project_root, "models", "voc_tagger_hierarchical.joblib"))
    parser.add_argument("--retag-all", action="store_true", help="Update every existing review_tags row.")
    parser.add_argument("--limit", type=int, default=0, help="Optional max reviews to process.")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true", help="Predict and summarize, but do not write.")
    args = parser.parse_args()

    artifact = load_artifact(args.model)
    conn = get_conn()
    try:
        rows = fetch_rows(conn, retag_all=args.retag_all, limit=args.limit)
        total = len(rows)
        print(f"Reviews to process: {total}")
        written = 0
        skipped = 0
        for start in range(0, total, args.batch_size):
            batch = rows[start:start + args.batch_size]
            predictions = predict_rows(artifact, batch)
            if args.dry_run:
                for item in predictions[:5]:
                    print(json.dumps(item, ensure_ascii=False))
            else:
                batch_written, batch_skipped = upsert_predictions(conn, batch, predictions)
                written += batch_written
                skipped += batch_skipped
            print(f"  Processed {min(start + len(batch), total)}/{total}")

        print(json.dumps({
            "processed": total,
            "written": written,
            "skipped": skipped,
            "dry_run": bool(args.dry_run),
            "retag_all": bool(args.retag_all),
        }, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()

