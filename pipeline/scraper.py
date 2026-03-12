import os
import time
import random
from datetime import date, datetime, timedelta

# ── Days back to scrape — can be overridden at runtime via env var ────────────
SCRAPE_DAYS_BACK = int(os.environ.get("SCRAPE_DAYS_BACK", 30))
# ─────────────────────────────────────────────────────────────────────────────


def parse_amazon_date(date_str):
    """
    Parse Amazon India review date strings like:
    'Reviewed in India on 15 March 2024'
    Returns a date object or None if unparseable.
    """
    try:
        cleaned = date_str.replace("Reviewed in India on ", "").strip()
        return datetime.strptime(cleaned, "%d %B %Y").date()
    except Exception:
        return None


def scrape_product_rating(driver, asin):
    """
    Scrape the Amazon.in product page to get:
      - overall_rating  : float, e.g. 4.1
      - total_ratings   : int,   e.g. 2847

    Called AFTER scrape_reviews_for_asin so the session is already warm.
    Returns a dict or None on failure.
    """
    try:
        driver.get(f"https://www.amazon.in/dp/{asin}")
        time.sleep(random.uniform(4, 6))

        result = driver.execute_script("""
            // Overall rating — e.g. "4.1 out of 5 stars"
            const ratingEl = document.querySelector(
                '#acrPopover .a-size-medium.a-color-base, ' +
                '#averageCustomerReviews .a-size-base.a-color-base, ' +
                'span[data-hook="rating-out-of-text"], ' +
                '#acrPopover span.a-size-base'
            );

            // Total ratings — e.g. "2,847 ratings"
            const countEl = document.querySelector(
                '#acrCustomerReviewText, ' +
                'span[data-hook="total-review-count"]'
            );

            let rating = null;
            if (ratingEl) {
                const m = ratingEl.innerText.match(/([0-9.]+)/);
                if (m) rating = parseFloat(m[1]);
            }

            let count = null;
            if (countEl) {
                const m = countEl.innerText.replace(/,/g, '').match(/([0-9]+)/);
                if (m) count = parseInt(m[1]);
            }

            return { overall_rating: rating, total_ratings: count };
        """)

        if result and result.get("overall_rating"):
            print(f"  → Rating snapshot: {result['overall_rating']}★ ({result['total_ratings']} ratings)")
            return result
        else:
            print(f"  → Could not parse rating for {asin} — selectors may have changed")
            return None

    except Exception as e:
        print(f"  → scrape_product_rating failed for {asin}: {e}")
        return None


def scrape_reviews_for_asin(driver, asin, product_name, category=None, max_pages=10, already_on_page=False):
    """
    Scrape Amazon.in reviews for a given ASIN.
    Stops paginating once reviews older than SCRAPE_DAYS_BACK are encountered.
    Returns a list of review dicts.

    already_on_page: if True, skip the initial driver.get() — caller has already
                     navigated and verified the reviews page is loaded.
    """
    reviews = []
    today = date.today()
    cutoff = today - timedelta(days=SCRAPE_DAYS_BACK)
    scrape_date_str = today.isoformat()

    base_url = (
        f"https://www.amazon.in/product-reviews/{asin}"
        f"/ref=cm_cr_arp_d_viewopt_srt?sortBy=recent"
    )

    if not already_on_page:
        driver.get(base_url)
        time.sleep(6)

    for page in range(max_pages):
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

            parsed_date = parse_amazon_date(r.get("review_date", ""))
            if parsed_date and parsed_date < cutoff:
                print(f"  → Reached reviews older than {SCRAPE_DAYS_BACK} days ({parsed_date}), stopping.")
                hit_cutoff = True
                break

            r["asin"] = asin
            r["product_name"] = product_name
            r["category"] = category or ""
            r["scrape_date"] = scrape_date_str
            reviews.append(r)

        if hit_cutoff:
            break

        try:
            driver.execute_script("document.querySelector('li.a-last a').click();")
            time.sleep(5)
        except Exception:
            break

    return reviews