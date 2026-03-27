import os
import random
import time
from datetime import date, datetime, timedelta

from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# Days back to scrape - can be overridden at runtime via env var
SCRAPE_DAYS_BACK = int(os.environ.get("SCRAPE_DAYS_BACK", 30))


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


def _first_review_id(driver):
    """Return the first visible review id on the current page, if any."""
    try:
        return driver.execute_script("""
            const el = document.querySelector('[data-hook="review"]');
            return el ? el.getAttribute('id') : null;
        """)
    except Exception:
        return None


def _review_page_url(asin, page_number):
    """Build a stable review URL for products that still expose classic pagination."""
    return (
        f"https://www.amazon.in/product-reviews/{asin}"
        f"/ref=cm_cr_arp_d_viewopt_srt?sortBy=recent&pageNumber={page_number}"
    )


def _extract_reviews(driver):
    """Read all currently visible reviews from the page."""
    return driver.execute_script("""
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


def _find_show_more_control(driver):
    """Find Amazon's inline review expansion control, if present."""
    preferred_selectors = [
        "[data-hook='show-more-button']",
        "a[data-hook='show-more-button']",
    ]

    for selector in preferred_selectors:
        try:
            matches = driver.find_elements(By.CSS_SELECTOR, selector)
            button = next((el for el in matches if el.is_displayed()), None)
            if button:
                return button
        except StaleElementReferenceException:
            continue

    trigger_phrases = ("show 10 more reviews", "show more reviews")
    try:
        candidates = driver.find_elements(
            By.XPATH,
            "//*[self::button or self::a or @role='button' or contains(@class,'a-button') or contains(@class,'a-link')]",
        )
        return next(
            (
                el for el in candidates
                if el.is_displayed()
                and any(
                    phrase in (
                        (el.text or "")
                        or (el.get_attribute("textContent") or "")
                    ).strip().lower()
                    for phrase in trigger_phrases
                )
            ),
            None,
        )
    except StaleElementReferenceException:
        return None


def _click_show_more_reviews(driver, previous_count, timeout=15):
    """
    Click Amazon's inline 'Show 10 more reviews' control and wait for more reviews to appear.
    Returns True when more reviews were loaded, else False.
    """
    button = _find_show_more_control(driver)
    if not button:
        print("  -> No visible 'Show more reviews' control detected.")
        return False

    for attempt in range(3):
        try:
            button = _find_show_more_control(driver)
            if not button:
                print("  -> 'Show more reviews' control disappeared before click.")
                return False

            previous_state = button.get_attribute("data-reviews-state-param") or ""
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
            time.sleep(random.uniform(0.8, 1.4))
            try:
                button.click()
            except Exception:
                driver.execute_script("arguments[0].click();", button)

            WebDriverWait(driver, timeout).until(
                lambda d: (
                    len(d.find_elements(By.CSS_SELECTOR, "[data-hook='review']")) > previous_count
                    or (
                        (_find_show_more_control(d) is not None)
                        and ((_find_show_more_control(d).get_attribute("data-reviews-state-param") or "") != previous_state)
                    )
                )
            )
            time.sleep(random.uniform(1.0, 2.0))
            return True
        except StaleElementReferenceException:
            if attempt < 2:
                time.sleep(random.uniform(0.3, 0.7))
                continue
            print("  -> 'Show more reviews' kept rerendering before click; giving up on inline expansion.")
            return False
        except TimeoutException:
            print("  -> Clicked 'Show 10 more reviews', but no additional reviews appeared.")
            return False

    return False


def _goto_next_review_page(driver, asin, current_batch, previous_first_review_id, timeout=15):
    """
    Fallback for products that still use page URLs instead of inline expansion.
    Returns True when navigation succeeds, else False.
    """
    next_page_number = current_batch + 2
    next_url = _review_page_url(asin, next_page_number)

    try:
        driver.get(next_url)
        WebDriverWait(driver, timeout).until(
            lambda d: (
                f"pageNumber={next_page_number}" in d.current_url
                or _first_review_id(d) != previous_first_review_id
            )
        )
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-hook='review']"))
        )
        time.sleep(random.uniform(1.5, 2.5))
        return True
    except TimeoutException:
        print(f"  -> Review page {next_page_number} did not load from {next_url}. Stopping pagination.")
        return False


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
            const ratingEl = document.querySelector(
                '#acrPopover .a-size-medium.a-color-base, ' +
                '#averageCustomerReviews .a-size-base.a-color-base, ' +
                'span[data-hook="rating-out-of-text"], ' +
                '#acrPopover span.a-size-base'
            );

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
            print(f"  -> Rating snapshot: {result['overall_rating']}★ ({result['total_ratings']} ratings)")
            return result

        print(f"  -> Could not parse rating for {asin} - selectors may have changed")
        return None
    except Exception as e:
        print(f"  -> scrape_product_rating failed for {asin}: {e}")
        return None


def scrape_reviews_for_asin(driver, asin, product_name, category=None, max_pages=10, already_on_page=False):
    """
    Scrape Amazon.in reviews for a given ASIN.
    Stops once reviews older than SCRAPE_DAYS_BACK are encountered.
    Supports both inline 'Show 10 more reviews' expansion and classic page URLs.
    """
    reviews = []
    seen_review_ids = set()
    today = date.today()
    cutoff = today - timedelta(days=SCRAPE_DAYS_BACK)
    scrape_date_str = today.isoformat()

    base_url = _review_page_url(asin, 1)
    if not already_on_page:
        driver.get(base_url)
        time.sleep(6)

    for batch in range(max_pages):
        for _ in range(4):
            driver.execute_script("window.scrollBy(0, 800);")
            time.sleep(random.uniform(1.5, 2.5))

        visible_reviews = _extract_reviews(driver)
        if not visible_reviews:
            print(f"  -> No reviews found in visible batch {batch + 1}; stopping.")
            break

        new_reviews = []
        for review in visible_reviews:
            review_id = review.get("review_id")
            if review_id and review_id in seen_review_ids:
                continue
            new_reviews.append(review)

        if not new_reviews:
            print("  -> No new reviews appeared after expansion/navigation; stopping.")
            break

        hit_cutoff = False
        for review in new_reviews:
            if not review["review"]:
                continue

            parsed_date = parse_amazon_date(review.get("review_date", ""))
            if parsed_date and parsed_date < cutoff:
                print(f"  -> Reached reviews older than {SCRAPE_DAYS_BACK} days ({parsed_date}), stopping.")
                hit_cutoff = True
                break

            review_id = review.get("review_id")
            if review_id:
                seen_review_ids.add(review_id)
            review["asin"] = asin
            review["product_name"] = product_name
            review["category"] = category or ""
            review["scrape_date"] = scrape_date_str
            reviews.append(review)

        if hit_cutoff:
            break

        if batch == max_pages - 1:
            print(f"  -> Reached max_pages={max_pages}, stopping.")
            break

        if _click_show_more_reviews(driver, len(visible_reviews)):
            continue

        print("  -> No inline expansion button found, trying next review page URL.")
        if not _goto_next_review_page(driver, asin, batch, visible_reviews[0].get("review_id")):
            break

    return reviews
