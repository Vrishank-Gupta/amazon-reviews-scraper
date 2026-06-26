import os
import sys
import time
from datetime import date, timedelta

import pymysql

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

from scraper_runner import make_driver

load_project_env()


def get_db():
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


def fetch_unknown_reviews(conn, days):
    review_date_sql = "STR_TO_DATE(REGEXP_REPLACE(review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT review_id, review_url, product_name, asin, review_date
            FROM raw_reviews
            WHERE verified_purchase IS NULL
              AND {review_date_sql} >= %s
            ORDER BY {review_date_sql} DESC, product_name
            """,
            (date.today() - timedelta(days=days),),
        )
        return cur.fetchall()


def detect_verified_purchase(driver, row):
    review_url = row.get("review_url") or f"https://www.amazon.in/review/{row['review_id']}"
    driver.get(review_url)
    time.sleep(2.5)
    return driver.execute_script(
        """
        const root = document.querySelector('[data-hook="review"]') || document.body;
        const badge = root?.querySelector?.('[data-hook="avp-badge"]');
        const format = root?.querySelector?.('[data-hook="format-strip"]');
        const text = [
            badge?.innerText || '',
            format?.innerText || '',
            root?.innerText || ''
        ].join('\\n');
        return /verified purchase/i.test(text);
        """
    )


def update_review(conn, review_id, verified):
    conn.ping(reconnect=True)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE raw_reviews SET verified_purchase=%s WHERE review_id=%s",
            (1 if verified else 0, review_id),
        )
    conn.commit()


def main():
    days = int(os.getenv("BACKFILL_VERIFIED_PURCHASE_DAYS", "30"))
    if len(sys.argv) > 1:
        days = int(sys.argv[1])

    conn = get_db()
    driver = make_driver()
    updated = 0
    try:
        rows = fetch_unknown_reviews(conn, days)
        print(f"Found {len(rows)} unknown review(s) in last {days} days")
        for index, row in enumerate(rows, 1):
            try:
                verified = bool(detect_verified_purchase(driver, row))
                update_review(conn, row["review_id"], verified)
                updated += 1
                label = "verified" if verified else "unverified"
                print(f"[{index}/{len(rows)}] {row['review_id']} {label} - {row['product_name']}")
            except Exception as exc:
                print(f"[{index}/{len(rows)}] {row['review_id']} failed: {exc}")
        print(f"Updated {updated}/{len(rows)} review(s)")
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        conn.close()


if __name__ == "__main__":
    main()
