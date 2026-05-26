
import csv
import os
import random
import sys
import time
from datetime import date

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

pipeline_dir = os.path.dirname(os.path.abspath(__file__))
if pipeline_dir not in sys.path:
    sys.path.insert(0, pipeline_dir)

from scraper import scrape_product_variations, scrape_reviews_for_asin
from scraper_runner import (
    ASINS_CSV,
    PAUSE_BETWEEN_ASINS,
    ensure_review_variant_columns,
    get_db,
    make_driver,
    wait_until_reviews_ready,
)

MAX_PAGES = int(os.getenv("BACKFILL_MAX_PAGES", "50"))
DRY_RUN = os.getenv("BACKFILL_DRY_RUN", "").strip().lower() in {"1", "true", "yes", "on"}


def load_asins():
    requested = {arg.strip().upper() for arg in sys.argv[1:] if arg.strip()}
    env_requested = {
        value.strip().upper()
        for value in os.getenv("SCRAPE_ASINS", "").split(",")
        if value.strip()
    }
    asin_filter = requested or env_requested

    rows = []
    with open(ASINS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            asin = (row.get("asin") or "").strip().upper()
            if not asin:
                continue
            if asin_filter and asin not in asin_filter:
                continue
            rows.append({
                "asin": asin,
                "product_name": (row.get("product_name") or asin).strip(),
                "category": (row.get("category") or "").strip(),
            })
    return rows


def update_existing_reviews(conn, reviews):
    if not reviews:
        return {"matched": 0, "updated": 0, "missing": 0}

    cur = conn.cursor()
    matched = updated = missing = 0
    try:
        for review in reviews:
            review_id = review.get("review_id")
            if not review_id:
                continue

            cur.execute("SELECT COUNT(*) FROM raw_reviews WHERE review_id = %s", (review_id,))
            if not cur.fetchone()[0]:
                missing += 1
                continue

            matched += 1
            if DRY_RUN:
                continue

            cur.execute(
                """
                UPDATE raw_reviews
                SET scrape_asin = %s,
                    variant_asin = %s,
                    variant_label = %s,
                    variant_dimension = %s,
                    product_name = %s,
                    category = CASE
                        WHEN category IS NULL OR category = '' THEN %s
                        ELSE category
                    END
                WHERE review_id = %s
                """,
                (
                    review.get("scrape_asin"),
                    review.get("variant_asin"),
                    review.get("variant_label"),
                    review.get("variant_dimension") or "Set name",
                    review.get("product_name"),
                    review.get("category", ""),
                    review_id,
                ),
            )
            updated += cur.rowcount
        if not DRY_RUN:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()

    return {"matched": matched, "updated": updated, "missing": missing}


def backfill_asin(row, driver, conn):
    asin = row["asin"]
    category = row.get("category", "")
    print(f"\n-- Backfill {row.get('product_name') or asin} ({asin}) --")

    print("  Reading product variation map...")
    variant_metadata = scrape_product_variations(driver, asin)
    product_name = variant_metadata.get("selected_label") or row.get("product_name") or asin

    wait_until_reviews_ready(driver, asin)
    print(f"  Scanning review pages for existing review IDs (max_pages={MAX_PAGES})...")
    reviews = scrape_reviews_for_asin(
        driver,
        asin,
        product_name,
        category=category,
        max_pages=MAX_PAGES,
        already_on_page=True,
        cutoff_date=date(1900, 1, 1),
        variant_metadata=variant_metadata,
    )

    result = update_existing_reviews(conn, reviews)
    print(
        "  Result: "
        f"{result['matched']} existing matched, "
        f"{result['updated']} updated, "
        f"{result['missing']} seen on Amazon but not in DB"
    )
    return {"asin": asin, "seen": len(reviews), **result}


def main():
    rows = load_asins()
    if not rows:
        print("No ASINs selected for backfill.")
        return

    print(f"Variant backfill starting for {len(rows)} ASIN(s)")
    if DRY_RUN:
        print("DRY RUN: no database rows will be updated")

    conn = get_db()
    driver = make_driver()
    results = []
    try:
        ensure_review_variant_columns(conn)
        for index, row in enumerate(rows, 1):
            print(f"\n[{index}/{len(rows)}]")
            try:
                results.append(backfill_asin(row, driver, conn))
            except Exception as exc:
                print(f"  ERROR: {row['asin']} failed: {exc}")
                results.append({
                    "asin": row["asin"],
                    "seen": 0,
                    "matched": 0,
                    "updated": 0,
                    "missing": 0,
                    "error": str(exc),
                })
            if index < len(rows):
                pause = random.uniform(PAUSE_BETWEEN_ASINS * 0.8, PAUSE_BETWEEN_ASINS * 1.2)
                print(f"  Pausing {pause:.0f}s before next ASIN...")
                time.sleep(pause)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        conn.close()

    print("\nBackfill complete")
    print(f"  ASINs scanned : {len(results)}")
    print(f"  Reviews seen  : {sum(r['seen'] for r in results)}")
    print(f"  DB matched    : {sum(r['matched'] for r in results)}")
    print(f"  Rows updated  : {sum(r['updated'] for r in results)}")
    print(f"  Not in DB     : {sum(r['missing'] for r in results)}")
    failed = [r for r in results if r.get("error")]
    if failed:
        print(f"  Failed ASINs  : {len(failed)}")
        for row in failed:
            print(f"    - {row['asin']}: {row['error']}")


if __name__ == "__main__":
    main()
