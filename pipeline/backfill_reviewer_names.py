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

_REVIEW_PAGE_AUTHOR_CACHE = {}


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


def ensure_reviewer_name_column(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS column_count
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'raw_reviews'
              AND column_name = 'reviewer_name'
            """
        )
        if cur.fetchone()["column_count"]:
            return
        cur.execute(
            "ALTER TABLE raw_reviews "
            "ADD COLUMN reviewer_name VARCHAR(255) NULL AFTER review_id"
        )
    conn.commit()


def fetch_reviews_without_names(conn, days):
    review_date_sql = (
        "STR_TO_DATE(REGEXP_REPLACE(review_date, "
        "'Reviewed in India on ', ''), '%%d %%M %%Y')"
    )
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT review_id, review_url, product_name, asin, scrape_asin, review_date
            FROM raw_reviews
            WHERE (reviewer_name IS NULL OR TRIM(reviewer_name) = '')
              AND {review_date_sql} >= %s
            ORDER BY {review_date_sql} DESC, product_name
            """,
            (date.today() - timedelta(days=days),),
        )
        return cur.fetchall()


def scrape_reviewer_name(driver, row):
    review_id = row["review_id"]
    direct_urls = [
        row.get("review_url") or f"https://www.amazon.in/review/{review_id}",
        f"https://www.amazon.in/gp/customer-reviews/{review_id}",
    ]
    for url in direct_urls:
        driver.get(url)
        for _ in range(10):
            reviewer_name = driver.execute_script(
                """
                const reviewId = arguments[0];
                const card = document.getElementById(reviewId)
                    || document.querySelector(`[data-hook="review"][id="${reviewId}"]`);
                if (!card) return "";
                const author = card.querySelector(
                    '[data-hook="review-author"], a.a-profile, .a-profile-name'
                );
                return author ? author.innerText.trim() : "";
                """,
                review_id,
            )
            if reviewer_name:
                return reviewer_name
            time.sleep(0.5)

    candidate_asins = []
    for asin in [row.get("asin"), row.get("scrape_asin")]:
        if asin and asin not in candidate_asins:
            candidate_asins.append(asin)

    for asin in candidate_asins:
        if asin not in _REVIEW_PAGE_AUTHOR_CACHE:
            authors = {}
            seen_ids = set()
            for page_number in range(1, 21):
                driver.get(
                    f"https://www.amazon.in/product-reviews/{asin}"
                    f"/ref=cm_cr_arp_d_viewopt_srt"
                    f"?sortBy=recent&pageNumber={page_number}"
                )
                time.sleep(2)
                page_authors = driver.execute_script(
                    """
                    const result = {};
                    for (const card of document.querySelectorAll('[data-hook="review"]')) {
                        const author = card.querySelector(
                            '[data-hook="review-author"], a.a-profile, .a-profile-name'
                        );
                        if (card.id && author?.innerText?.trim()) {
                            result[card.id] = author.innerText.trim();
                        }
                    }
                    return result;
                    """
                ) or {}
                new_ids = set(page_authors) - seen_ids
                if not page_authors or not new_ids:
                    break
                authors.update(page_authors)
                seen_ids.update(page_authors)
            _REVIEW_PAGE_AUTHOR_CACHE[asin] = authors

        reviewer_name = _REVIEW_PAGE_AUTHOR_CACHE[asin].get(review_id)
        if reviewer_name:
            return reviewer_name
    return ""


def update_reviewer_name(conn, review_id, reviewer_name):
    conn.ping(reconnect=True)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE raw_reviews SET reviewer_name=%s WHERE review_id=%s",
            (reviewer_name, review_id),
        )
    conn.commit()


def main():
    days = int(os.getenv("BACKFILL_REVIEWER_NAMES_DAYS", "30"))
    if len(sys.argv) > 1:
        days = int(sys.argv[1])

    conn = get_db()
    driver = make_driver()
    updated = 0
    try:
        ensure_reviewer_name_column(conn)
        rows = fetch_reviews_without_names(conn, days)
        print(f"Found {len(rows)} review(s) without names in the last {days} days")
        for index, row in enumerate(rows, 1):
            try:
                reviewer_name = scrape_reviewer_name(driver, row)
                if not reviewer_name:
                    print(f"[{index}/{len(rows)}] {row['review_id']} name not found")
                    continue
                update_reviewer_name(conn, row["review_id"], reviewer_name)
                updated += 1
                print(
                    f"[{index}/{len(rows)}] {row['review_id']} "
                    f"{reviewer_name} - {row['product_name']}"
                )
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
