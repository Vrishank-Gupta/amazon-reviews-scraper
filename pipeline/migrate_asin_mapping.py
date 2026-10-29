"""
One-time migration: re-pin raw_reviews.product_name / .category / .sku_code,
and product_ratings_snapshot.product_name, to the new master mapping
(data/asins.csv, generated from data/mapping_updated.xlsx via
build_asin_mapping.py). Existing review content and review_tags rows are
never touched — only identity columns get overwritten, keyed by asin.

Safe to re-run: every statement is idempotent (ADD COLUMN IF NOT EXISTS-style
check, UPDATE ... WHERE asin=%s).

Usage:
    python pipeline/migrate_asin_mapping.py                      # apply
    python pipeline/migrate_asin_mapping.py --dry-run             # show what would change, no writes
    python pipeline/migrate_asin_mapping.py --purge-unmapped      # also delete raw_reviews/review_tags
                                                                   # rows for ASINs not in the mapping CSV
"""
import argparse
import csv
import os
import sys

import pymysql
import pymysql.cursors

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

ASINS_CSV = os.path.join(project_root, "data", "asins.csv")


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=3306,
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def column_exists(conn, table_name, column_name):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s
        """,
        (table_name, column_name),
    )
    exists = bool(cur.fetchone()["c"])
    cur.close()
    return exists


def load_mapping(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without writing")
    parser.add_argument("--csv", default=ASINS_CSV, help="Path to the mapping CSV (default: data/asins.csv)")
    parser.add_argument("--purge-unmapped", action="store_true", help="Delete raw_reviews/review_tags rows for ASINs not in the mapping CSV")
    args = parser.parse_args()

    rows = load_mapping(args.csv)
    print(f"Loaded {len(rows)} ASIN mappings from {args.csv}")
    mapped_asins = {row["asin"].strip() for row in rows}

    conn = get_conn()
    try:
        sku_column_exists = column_exists(conn, "raw_reviews", "sku_code")
        if not sku_column_exists:
            if args.dry_run:
                print("[dry-run] Would run: ALTER TABLE raw_reviews ADD COLUMN sku_code VARCHAR(100) NULL")
            else:
                cur = conn.cursor()
                cur.execute("ALTER TABLE raw_reviews ADD COLUMN sku_code VARCHAR(100) NULL")
                conn.commit()
                cur.close()
                print("Added sku_code column to raw_reviews")
                sku_column_exists = True
        else:
            print("sku_code column already exists")

        cur = conn.cursor()
        total_matched = 0
        changed_asins = []
        for row in rows:
            asin = row["asin"].strip()
            product_name = row.get("product_name", "").strip()
            category = row.get("category", "").strip()
            sku_code = row.get("sku_code", "").strip()

            cur.execute(
                "SELECT COUNT(*) AS c FROM raw_reviews WHERE asin = %s",
                (asin,),
            )
            existing = cur.fetchone()["c"]
            if not existing:
                continue  # never scraped yet — nothing to migrate for this ASIN
            total_matched += existing

            if args.dry_run:
                if sku_column_exists:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS c FROM raw_reviews
                        WHERE asin = %s AND (
                            product_name <> %s OR category <> %s OR
                            sku_code IS NULL OR sku_code <> %s
                        )
                        """,
                        (asin, product_name, category, sku_code),
                    )
                else:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM raw_reviews WHERE asin = %s AND (product_name <> %s OR category <> %s)",
                        (asin, product_name, category),
                    )
                would_change = cur.fetchone()["c"]
                if would_change:
                    changed_asins.append((asin, product_name, would_change))
            else:
                cur.execute(
                    "UPDATE raw_reviews SET product_name=%s, category=%s, sku_code=%s WHERE asin=%s",
                    (product_name, category, sku_code, asin),
                )

        if args.dry_run:
            print(f"\n{total_matched} existing rows matched a mapped ASIN")
            print(f"{len(changed_asins)} ASIN(s) have at least one row whose identity fields would change:")
            for asin, name, count in changed_asins[:30]:
                print(f"  {asin}  {name!r}  ({count} rows)")
            if len(changed_asins) > 30:
                print(f"  ... and {len(changed_asins) - 30} more")
        else:
            conn.commit()
            print(f"\nMigration applied. {total_matched} existing rows covered by the mapping.")

        # product_ratings_snapshot carries its own product_name copy (written by
        # the scraper's daily rating-snapshot insert) that drifts independently
        # of raw_reviews — re-pin it too.
        snap_total_matched = 0
        snap_changed_asins = []
        for row in rows:
            asin = row["asin"].strip()
            product_name = row.get("product_name", "").strip()

            cur.execute(
                "SELECT COUNT(*) AS c FROM product_ratings_snapshot WHERE asin = %s",
                (asin,),
            )
            existing = cur.fetchone()["c"]
            if not existing:
                continue
            snap_total_matched += existing

            if args.dry_run:
                cur.execute(
                    "SELECT COUNT(*) AS c FROM product_ratings_snapshot WHERE asin = %s AND product_name <> %s",
                    (asin, product_name),
                )
                would_change = cur.fetchone()["c"]
                if would_change:
                    snap_changed_asins.append((asin, product_name, would_change))
            else:
                cur.execute(
                    "UPDATE product_ratings_snapshot SET product_name=%s WHERE asin=%s",
                    (product_name, asin),
                )

        if args.dry_run:
            print(f"\n[product_ratings_snapshot] {snap_total_matched} existing rows matched a mapped ASIN")
            print(f"[product_ratings_snapshot] {len(snap_changed_asins)} ASIN(s) have at least one row whose product_name would change:")
            for asin, name, count in snap_changed_asins[:30]:
                print(f"  {asin}  {name!r}  ({count} rows)")
            if len(snap_changed_asins) > 30:
                print(f"  ... and {len(snap_changed_asins) - 30} more")
        else:
            conn.commit()
            print(f"[product_ratings_snapshot] Migration applied. {snap_total_matched} existing rows covered by the mapping.")

        if args.purge_unmapped:
            cur.execute("SELECT DISTINCT asin FROM raw_reviews")
            unmapped = [row["asin"] for row in cur.fetchall() if row["asin"] not in mapped_asins]
            if not unmapped:
                print("\nNo unmapped ASINs found — nothing to purge.")
            else:
                placeholders = ",".join(["%s"] * len(unmapped))
                cur.execute(f"SELECT COUNT(*) AS c FROM raw_reviews WHERE asin IN ({placeholders})", unmapped)
                row_count = cur.fetchone()["c"]
                if args.dry_run:
                    print(f"\n[dry-run] Would purge {row_count} row(s) across {len(unmapped)} unmapped ASIN(s): {unmapped}")
                else:
                    cur.execute(
                        f"DELETE t FROM review_tags t JOIN raw_reviews r ON r.review_id = t.review_id WHERE r.asin IN ({placeholders})",
                        unmapped,
                    )
                    cur.execute(f"DELETE FROM raw_reviews WHERE asin IN ({placeholders})", unmapped)
                    conn.commit()
                    print(f"\nPurged {row_count} row(s) across {len(unmapped)} unmapped ASIN(s): {unmapped}")

        cur.close()
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
