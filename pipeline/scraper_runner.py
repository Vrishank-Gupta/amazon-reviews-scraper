"""
scraper_runner.py — Sequential scraper, single persistent browser session.
One Chrome window stays open for all ASINs — no re-login between products.
Login detection watches the browser automatically — no terminal input needed.
"""

import csv
import os
import random
import time

import pymysql
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

from scraper import scrape_reviews_for_asin, scrape_product_rating

# ── Config ─────────────────────────────────────────────────────────────────────
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(project_root, ".env"))

CHROMEDRIVER_PATH   = os.getenv("CHROMEDRIVER_PATH", "")
ASINS_CSV           = os.path.join(project_root, "data", "asins.csv")
PAUSE_BETWEEN_ASINS = float(os.getenv("SCRAPER_PAUSE", "8"))

_asin_filter_raw = os.getenv("SCRAPE_ASINS", "").strip()
ASIN_FILTER = set(a.strip() for a in _asin_filter_raw.split(",") if a.strip())


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


def insert_reviews(reviews: list, conn) -> int:
    cur = conn.cursor()
    inserted = 0
    for r in reviews:
        cur.execute(
            """
            INSERT IGNORE INTO raw_reviews
                (review_id, asin, product_name, category, rating, title,
                 review, review_date, review_url, scrape_date)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                r["review_id"], r["asin"], r["product_name"],
                r.get("category", ""),
                r["rating"], r["title"], r["review"],
                r["review_date"], r["review_url"], r["scrape_date"],
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
        INSERT INTO product_ratings_snapshot
            (asin, product_name, scraped_date, overall_rating, total_ratings)
        VALUES (%s, %s, CURDATE(), %s, %s)
        ON DUPLICATE KEY UPDATE
            overall_rating = VALUES(overall_rating),
            total_ratings  = VALUES(total_ratings)
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

    # Persistent Chrome profile — stays logged in between script runs
    # Set CHROME_PROFILE in .env, e.g.: CHROME_PROFILE=C:\chrome-amazon-profile
    chrome_profile = os.getenv("CHROME_PROFILE", "").strip()
    if chrome_profile:
        options.add_argument(f"--user-data-dir={chrome_profile}")
        print(f"  Using profile: {chrome_profile}")
    else:
        print(f"  Tip: add CHROME_PROFILE=C:\\chrome-amazon-profile to .env to stay logged in")

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

        # Page loaded but no reviews and no login form
        # Could be a redirect, CAPTCHA, or empty product — wait a bit more
        if waited % 20 == 0 and waited > 0:
            print(f"  Waiting for page to load... ({waited}s) URL: {driver.current_url[:80]}")

    raise RuntimeError(
        f"Timed out after {timeout}s waiting for reviews page. "
        f"Last URL: {driver.current_url}"
    )


# ── Scrape one ASIN (reuses existing driver) ──────────────────────────────────
def scrape_asin(row: dict, driver, db_conn) -> dict:
    asin         = row["asin"]
    product_name = row["product_name"]
    category     = row.get("category", "")

    try:
        # Wait until reviews page is ready (handles login automatically)
        wait_until_reviews_ready(driver, asin)

        # Now hand off to scraper — page is already loaded and verified
        print(f"  Scraping reviews...")
        reviews = scrape_reviews_for_asin(driver, asin, product_name, category=category, already_on_page=True)
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
        return {"asin": asin, "product_name": product_name,
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