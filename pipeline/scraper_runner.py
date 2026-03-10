"""
scraper_runner.py
Reads ASINs from data/asins.csv, scrapes Amazon.in reviews via Selenium,
and inserts new rows into raw_reviews (duplicates silently ignored).
"""
import csv
import os
import pymysql
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

from scraper import scrape_reviews_for_asin

# ── Config ────────────────────────────────────────────────────────────────────
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(project_root, ".env"))

CHROMEDRIVER_PATH = r"C:\chromedriver\chromedriver.exe"
CHROME_PROFILE    = r"C:\amazon_profile"
ASINS_CSV         = os.path.join(project_root, "data", "asins.csv")

# ── DB ────────────────────────────────────────────────────────────────────────
conn = pymysql.connect(
    host=os.getenv("DB_HOST", "127.0.0.1"),
    port=3306,
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    charset="utf8mb4",
)
cur = conn.cursor()

# ── Browser ───────────────────────────────────────────────────────────────────
options = Options()
options.add_argument("--start-maximized")
options.add_argument(f"--user-data-dir={CHROME_PROFILE}")

driver = webdriver.Chrome(
    service=Service(CHROMEDRIVER_PATH),
    options=options,
)

# ── Scrape & insert ───────────────────────────────────────────────────────────
try:
    with open(ASINS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            asin         = row["asin"]
            product_name = row["product_name"]
            print(f"Scraping ASIN: {asin} — {product_name}")

            reviews = scrape_reviews_for_asin(driver, asin, product_name)

            for r in reviews:
                cur.execute(
                    """
                    INSERT IGNORE INTO raw_reviews
                        (review_id, asin, product_name, rating, title,
                         review, review_date, review_url, scrape_date)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        r["review_id"], asin, product_name,
                        r["rating"], r["title"], r["review"],
                        r["review_date"], r["review_url"], r["scrape_date"],
                    ),
                )

            conn.commit()
            print(f"  → Inserted {len(reviews)} reviews")

finally:
    driver.quit()
    conn.close()