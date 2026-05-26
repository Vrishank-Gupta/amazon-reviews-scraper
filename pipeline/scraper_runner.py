"""
scraper_runner.py — Sequential scraper, single persistent browser session.
One Chrome window stays open for all ASINs — no re-login between products.
Login detection watches the browser automatically — no terminal input needed.
"""

import csv
import os
import random
import sys
import time
from datetime import timedelta

import pymysql
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

from scraper import scrape_product_rating, scrape_product_variations, scrape_reviews_for_asin

# ── Config ─────────────────────────────────────────────────────────────────────
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

CHROMEDRIVER_PATH   = os.getenv("CHROMEDRIVER_PATH", "")
ASINS_CSV           = os.path.join(project_root, "data", "asins.csv")

# Chrome profile stored inside the repo by default so login persists across runs.
# Override with CHROME_PROFILE in .env if you want a different location.
_DEFAULT_CHROME_PROFILE = os.path.join(project_root, "chrome-profile")
os.makedirs(_DEFAULT_CHROME_PROFILE, exist_ok=True)
PAUSE_BETWEEN_ASINS = float(os.getenv("SCRAPER_PAUSE", "8"))

_asin_filter_raw = os.getenv("SCRAPE_ASINS", "").strip()
_cli_asins = [a for a in sys.argv[1:] if a.strip()]
ASIN_FILTER = (
    set(_cli_asins)
    if _cli_asins
    else set(a.strip() for a in _asin_filter_raw.split(",") if a.strip())
)


# ── DB ─────────────────────────────────────────────────────────────────────────
def get_db():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=3306,
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        autocommit=False,
    )


def get_asin_cutoff_date(asin: str, conn):
    """
    Return cutoff date for this ASIN: last scrape_date minus a 3-day buffer.
    The buffer catches reviews Amazon delayed publishing by 1-2 days after submission.
    Returns None if this ASIN has never been scraped.
    """
    cur = conn.cursor()
    if column_exists(conn, "raw_reviews", "scrape_asin"):
        cur.execute(
            "SELECT MAX(scrape_date) FROM raw_reviews WHERE scrape_asin = %s OR asin = %s",
            (asin, asin),
        )
    else:
        cur.execute("SELECT MAX(scrape_date) FROM raw_reviews WHERE asin = %s", (asin,))
    row = cur.fetchone()
    cur.close()
    if not (row and row[0]):
        return None
    return row[0] - timedelta(days=3)


def column_exists(conn, table_name: str, column_name: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND column_name = %s
        """,
        (table_name, column_name),
    )
    exists = bool(cur.fetchone()[0])
    cur.close()
    return exists


def ensure_review_variant_columns(conn):
    columns = {
        "scrape_asin": "ALTER TABLE raw_reviews ADD COLUMN scrape_asin VARCHAR(20) NULL AFTER asin",
        "variant_asin": "ALTER TABLE raw_reviews ADD COLUMN variant_asin VARCHAR(20) NULL AFTER scrape_asin",
        "variant_label": "ALTER TABLE raw_reviews ADD COLUMN variant_label VARCHAR(255) NULL AFTER variant_asin",
        "variant_dimension": "ALTER TABLE raw_reviews ADD COLUMN variant_dimension VARCHAR(64) NULL AFTER variant_label",
    }
    indexes = {
        "idx_raw_reviews_scrape_asin": "ALTER TABLE raw_reviews ADD INDEX idx_raw_reviews_scrape_asin (scrape_asin)",
        "idx_raw_reviews_variant_asin": "ALTER TABLE raw_reviews ADD INDEX idx_raw_reviews_variant_asin (variant_asin)",
        "idx_raw_reviews_variant_label": "ALTER TABLE raw_reviews ADD INDEX idx_raw_reviews_variant_label (variant_label)",
    }

    cur = conn.cursor()
    changed = False
    try:
        for column_name, ddl in columns.items():
            if not column_exists(conn, "raw_reviews", column_name):
                cur.execute(ddl)
                changed = True

        cur.execute(
            """
            SELECT index_name
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'raw_reviews'
            """
        )
        existing_indexes = {row[0] for row in cur.fetchall()}
        for index_name, ddl in indexes.items():
            if index_name not in existing_indexes:
                cur.execute(ddl)
                changed = True

        if changed:
            conn.commit()
            print("  -> Added review variant columns/indexes")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def insert_reviews(reviews: list, conn) -> int:
    missing_id = [r for r in reviews if not r.get("review_id")]
    if missing_id:
        print(f"  ⚠️  {len(missing_id)}/{len(reviews)} reviews have no review_id — skipping them (page structure may differ)")
    ensure_review_variant_columns(conn)
    cur = conn.cursor()
    inserted = 0
    for r in reviews:
        if not r.get("review_id"):
            continue
        values = {
            "review_id": r["review_id"],
            "asin": r.get("variant_asin") or r.get("asin"),
            "scrape_asin": r.get("scrape_asin") or r.get("asin"),
            "variant_asin": r.get("variant_asin") or r.get("asin"),
            "variant_label": r.get("variant_label") or r.get("product_name"),
            "variant_dimension": r.get("variant_dimension") or "Set name",
            "product_name": r["product_name"],
            "category": r.get("category", ""),
            "rating": r["rating"],
            "title": r["title"],
            "review": r["review"],
            "review_date": r["review_date"],
            "review_url": r["review_url"],
            "scrape_date": r["scrape_date"],
        }
        cur.execute(
            """
            UPDATE raw_reviews
            SET asin=%s,
                scrape_asin=%s,
                variant_asin=%s,
                variant_label=%s,
                variant_dimension=%s,
                product_name=%s,
                category=%s,
                rating=%s,
                title=%s,
                review=%s,
                review_date=%s,
                review_url=%s,
                scrape_date=%s
            WHERE review_id=%s
            """,
            (
                values["asin"],
                values["scrape_asin"],
                values["variant_asin"],
                values["variant_label"],
                values["variant_dimension"],
                values["product_name"],
                values["category"],
                values["rating"],
                values["title"],
                values["review"],
                values["review_date"],
                values["review_url"],
                values["scrape_date"],
                values["review_id"],
            ),
        )
        if cur.rowcount:
            continue
        cur.execute(
            """
            INSERT IGNORE INTO raw_reviews
                (review_id, asin, scrape_asin, variant_asin, variant_label, variant_dimension,
                 product_name, category, rating, title,
                 review, review_date, review_url, scrape_date)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                values["review_id"],
                values["asin"],
                values["scrape_asin"],
                values["variant_asin"],
                values["variant_label"],
                values["variant_dimension"],
                values["product_name"],
                values["category"],
                values["rating"], values["title"], values["review"],
                values["review_date"], values["review_url"], values["scrape_date"],
            ),
        )
        inserted += cur.rowcount
    conn.commit()
    cur.close()
    return inserted


def insert_rating_snapshot(asin: str, product_name: str, snapshot: dict, conn):
    if not snapshot or not snapshot.get("overall_rating"):
        return
    cur = conn.cursor()
    cur.execute(
        """
        INSERT IGNORE INTO product_ratings_snapshot
            (asin, product_name, scraped_date, overall_rating, total_ratings)
        VALUES (%s, %s, CURDATE(), %s, %s)
        """,
        (asin, product_name, snapshot["overall_rating"], snapshot.get("total_ratings")),
    )
    conn.commit()
    cur.close()


# ── Browser ────────────────────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

def make_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument(f"--user-agent={random.choice(USER_AGENTS)}")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=en-IN")

    # Persistent Chrome profile — stays logged in between script runs.
    # Defaults to <repo>/chrome-profile (created automatically, gitignored).
    # Override with CHROME_PROFILE in .env to use a different path.
    chrome_profile = os.getenv("CHROME_PROFILE", _DEFAULT_CHROME_PROFILE).strip()
    options.add_argument(f"--user-data-dir={chrome_profile}")
    print(f"  Using profile: {chrome_profile}")

    if CHROMEDRIVER_PATH:
        driver = webdriver.Chrome(service=Service(CHROMEDRIVER_PATH), options=options)
    else:
        driver = webdriver.Chrome(options=options)

    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
        window.chrome = { runtime: {} };
    """})
    return driver


# ── Login detection — watches page, not just URL ──────────────────────────────
def needs_login(driver) -> bool:
    """
    Returns True if the page is asking for login.
    Checks URL patterns AND actual page content — Amazon sometimes shows
    a login form without changing to /ap/signin in the URL.
    """
    url = driver.current_url.lower()
    if "ap/signin" in url or "sign-in" in url:
        return True

    # Check for login form elements on the page
    try:
        result = driver.execute_script("""
            return !!(
                document.querySelector('input#ap_email') ||
                document.querySelector('input#ap_password') ||
                document.querySelector('form[name="signIn"]') ||
                document.querySelector('#auth-signin-button')
            );
        """)
        return bool(result)
    except Exception:
        return False


def reviews_visible(driver) -> bool:
    """Returns True if at least one review element is present on the page."""
    try:
        result = driver.execute_script("""
            return document.querySelectorAll('[data-hook="review"]').length > 0;
        """)
        return bool(result)
    except Exception:
        return False


def is_bot_detection_page(driver) -> bool:
    """Returns True if Amazon is showing a bot-detection / interstitial page."""
    try:
        result = driver.execute_script("""
            var body = document.body ? document.body.innerText : '';
            return !!(
                document.querySelector('input[name="amzn-captcha-token"]') ||
                document.querySelector('#captchacharacters') ||
                document.querySelector('.a-box-inner form[action*="validateCaptcha"]') ||
                body.indexOf('Continue shopping') !== -1 ||
                body.indexOf('Robot Check') !== -1 ||
                body.indexOf('Enter the characters you see below') !== -1 ||
                body.indexOf('Sorry, we just need to make sure') !== -1 ||
                body.indexOf('Type the characters you see in this image') !== -1
            );
        """)
        return bool(result)
    except Exception:
        return False


def wait_until_reviews_ready(driver, asin, timeout=300):
    """
    Navigate to the reviews page for an ASIN and wait until:
      - Reviews are visible (success), OR
      - A login form appears (pause and wait for user to log in)
    Polls every 2 seconds. Gives up after timeout seconds.
    """
    url = (f"https://www.amazon.in/product-reviews/{asin}"
           f"/ref=cm_cr_arp_d_viewopt_srt?sortBy=recent")
    print(f"  Opening reviews page...")
    driver.get(url)

    login_warned = False
    waited = 0

    while waited < timeout:
        time.sleep(2)
        waited += 2

        if reviews_visible(driver):
            # Reviews are on screen — ready to scrape
            if login_warned:
                print("  ✓ Logged in — reviews visible, continuing...\n")
            return

        if needs_login(driver):
            if not login_warned:
                print("\n" + "="*60)
                print("⚠️  Amazon is asking you to log in.")
                print("    Please log in in the browser window.")
                print("    This script will continue automatically.")
                print("="*60)
                login_warned = True
            else:
                if waited % 10 == 0:
                    print(f"  Still waiting for login... ({waited}s elapsed)")
            continue

        if is_bot_detection_page(driver):
            if waited % 10 == 0 or waited == 2:
                print(f"  ⚠️  Bot-detection / CAPTCHA page detected.")
                print(f"      Please solve it in the browser window — script will continue automatically.")
            continue

        # Page loaded but no reviews and no login form — may still be rendering.
        # Only bail out as "0 reviews" after 30s so slow-loading pages get a fair chance.
        if waited >= 30:
            page_ready = driver.execute_script("return document.readyState === 'complete'")
            if page_ready:
                print(f"  -> Page loaded but no reviews found — product likely has 0 reviews. Skipping.")
                return
        if waited % 20 == 0 and waited > 0:
            print(f"  Waiting for page to load... ({waited}s) URL: {driver.current_url[:80]}")

    raise RuntimeError(
        f"Timed out after {timeout}s waiting for reviews page. "
        f"Last URL: {driver.current_url}"
    )


# ── Scrape one ASIN (reuses existing driver) ──────────────────────────────────
def scrape_asin(row: dict, driver, db_conn) -> dict:
    asin         = row["asin"]
    csv_product_name = row.get("product_name", "")
    category     = row.get("category", "")

    try:
        print(f"  Reading product variation map...")
        variant_metadata = scrape_product_variations(driver, asin)
        product_name = variant_metadata.get("selected_label") or csv_product_name or asin

        # Wait until reviews page is ready (handles login automatically)
        wait_until_reviews_ready(driver, asin)

        # Use latest DB date as cutoff so we only fetch genuinely new reviews
        cutoff = get_asin_cutoff_date(asin, db_conn)
        if cutoff:
            print(f"  Cutoff: {cutoff} (last scrape − 3d buffer) — fetching newer reviews")
        else:
            print(f"  No prior reviews in DB — fetching last {os.getenv('SCRAPE_DAYS_BACK', 30)} days")

        # Now hand off to scraper — page is already loaded and verified
        print(f"  Scraping reviews...")
        reviews = scrape_reviews_for_asin(
            driver,
            asin,
            product_name,
            category=category,
            already_on_page=True,
            cutoff_date=cutoff,
            variant_metadata=variant_metadata,
        )
        print(f"  Got {len(reviews)} reviews — saving...")
        inserted = insert_reviews(reviews, db_conn)
        print(f"  ✓ {inserted} new rows inserted")

        print(f"  Scraping overall rating...")
        snapshot = scrape_product_rating(driver, asin)
        if snapshot:
            insert_rating_snapshot(asin, product_name, snapshot, db_conn)
            print(f"  ✓ Snapshot: {snapshot['overall_rating']}★ ({snapshot.get('total_ratings', '?')} ratings)")

        return {"asin": asin, "product_name": product_name,
                "scraped": len(reviews), "inserted": inserted, "error": None}

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return {"asin": asin, "product_name": csv_product_name or asin,
                "scraped": 0, "inserted": 0, "error": str(e)}


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    asins = []
    with open(ASINS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if ASIN_FILTER and row["asin"] not in ASIN_FILTER:
                continue
            asins.append(row)

    if not asins:
        print("No ASINs to scrape.")
        return

    print(f"\n{'='*60}")
    print(f"Scraper starting — {len(asins)} ASINs, 1 browser session")
    print(f"Estimated time: ~{len(asins) * 3} minutes")
    print(f"{'='*60}\n")

    db_conn = get_db()
    driver  = make_driver()
    results = []
    
    try:
        for i, row in enumerate(asins, 1):
            print(f"\n── [{i}/{len(asins)}] {row['product_name']} ({row['asin']}) ──")
            result = scrape_asin(row, driver, db_conn)
            results.append(result)

            if i < len(asins):
                pause = random.uniform(PAUSE_BETWEEN_ASINS * 0.8, PAUSE_BETWEEN_ASINS * 1.2)
                print(f"  Pausing {pause:.0f}s before next ASIN...")
                time.sleep(pause)

    finally:
        try:
            driver.quit()
        except Exception:
            pass
        db_conn.close()

    # Summary
    total_scraped  = sum(r["scraped"]  for r in results)
    total_inserted = sum(r["inserted"] for r in results)
    failed         = [r for r in results if r["error"]]

    print(f"\n{'='*60}")
    print(f"DONE")
    print(f"  ASINs     : {len(results)}")
    print(f"  Scraped   : {total_scraped} reviews")
    print(f"  New in DB : {total_inserted} rows")
    print(f"  Failed    : {len(failed)}")
    if failed:
        for f in failed:
            print(f"    ✗ {f['asin']} ({f['product_name']}): {f['error']}")
    print(f"{'='*60}\n")

    if failed:
        raise RuntimeError(f"{len(failed)} ASIN(s) failed — check logs above")


if __name__ == "__main__":
    main()
