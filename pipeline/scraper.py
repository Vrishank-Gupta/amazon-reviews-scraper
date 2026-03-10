import time
import random
from datetime import date, datetime, timedelta

SCRAPE_DAYS_BACK = 20


def parse_amazon_date(date_str):
    """
    Parse Amazon India review date strings like:
    'Reviewed in India on 15 March 2024'
    'Reviewed in India on 3 January 2025'
    Returns a date object or None if unparseable.
    """
    try:
        # Strip the prefix
        cleaned = date_str.replace("Reviewed in India on ", "").strip()
        return datetime.strptime(cleaned, "%d %B %Y").date()
    except Exception:
        return None


def scrape_reviews_for_asin(driver, asin, product_name, max_pages=10):
    """
    Scrape Amazon.in reviews for a given ASIN.
    Stops paginating once reviews older than SCRAPE_DAYS_BACK are encountered.
    Returns a list of review dicts.
    """
    reviews = []
    today = date.today()
    cutoff = today - timedelta(days=SCRAPE_DAYS_BACK)
    scrape_date_str = today.isoformat()

    base_url = (
        f"https://www.amazon.in/product-reviews/{asin}"
        f"/ref=cm_cr_arp_d_viewopt_srt?sortBy=recent"
    )
    driver.get(base_url)
    time.sleep(6)

    for page in range(max_pages):
        # Progressive scroll to trigger lazy-loaded content
        for _ in range(4):
            driver.execute_script("window.scrollBy(0, 800);")
            time.sleep(random.uniform(1.5, 2.5))

        page_reviews = driver.execute_script("""
            return Array.from(document.querySelectorAll('[data-hook="review"]')).map(r => {
                const id       = r.getAttribute("id");
                const ratingEl = r.querySelector('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]');
                const titleEl  = r.querySelector('[data-hook="review-title"]');
                const bodyEl   = r.querySelector('[data-hook="review-body"] span');
                const dateEl   = r.querySelector('[data-hook="review-date"]');
                return {
                    review_id:   id,
                    rating:      ratingEl ? ratingEl.innerText.trim() : "",
                    title:       titleEl  ? titleEl.innerText.trim()  : "",
                    review:      bodyEl   ? bodyEl.innerText.trim()   : "",
                    review_date: dateEl   ? dateEl.innerText.trim()   : "",
                    review_url:  id ? "https://www.amazon.in/review/" + id : ""
                };
            });
        """)

        hit_cutoff = False
        for r in page_reviews:
            if not r["review"]:
                continue

            # Check if this review is within our date window
            parsed_date = parse_amazon_date(r.get("review_date", ""))
            if parsed_date and parsed_date < cutoff:
                print(f"  → Reached reviews older than {SCRAPE_DAYS_BACK} days ({parsed_date}), stopping.")
                hit_cutoff = True
                break

            r["asin"] = asin
            r["product_name"] = product_name
            r["scrape_date"] = scrape_date_str
            reviews.append(r)

        if hit_cutoff:
            break

        # Click next page
        try:
            driver.execute_script("document.querySelector('li.a-last a').click();")
            time.sleep(5)
        except Exception:
            break

    return reviews