import os
import random
import re
import time
from datetime import date, datetime, timedelta

from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# Days back to scrape - can be overridden at runtime via env var
SCRAPE_DAYS_BACK = int(os.environ.get("SCRAPE_DAYS_BACK", 30))


def _norm_variant_label(value):
    """Normalize Amazon variation labels for matching review cards to DP metadata."""
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


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


def scrape_product_variations(driver, asin):
    """
    Scrape the product detail page for Amazon's variation metadata.

    Amazon review cards show labels like "Set name: 3MP Pack of 2" while the
    product page exposes the ASIN for each label in dimensionValuesDisplayData.
    We keep this as a lightweight enrichment step before opening reviews.
    """
    metadata = {
        "seed_asin": asin,
        "selected_asin": asin,
        "selected_label": "",
        "dimension_name": "Set name",
        "label_to_asin": {},
        "asin_to_label": {},
        "product_title": "",
    }

    try:
        driver.get(f"https://www.amazon.in/dp/{asin}")
        time.sleep(random.uniform(4, 6))

        result = driver.execute_script(r"""
            const out = {
                title: document.querySelector('#productTitle')?.innerText.trim() || '',
                selectedAsin: null,
                selectedLabel: '',
                dimensionName: 'Set name',
                dimensionValuesDisplayData: null,
                labels: null
            };

            const scripts = Array.from(document.scripts)
                .map(s => s.textContent || '')
                .filter(Boolean);

            const extractObjectAfter = (text, key) => {
                const keyIndex = text.indexOf('"' + key + '"');
                if (keyIndex < 0) return null;
                const start = text.indexOf('{', keyIndex);
                if (start < 0) return null;
                let depth = 0;
                for (let i = start; i < text.length; i++) {
                    const ch = text[i];
                    if (ch === '{') depth++;
                    if (ch === '}') depth--;
                    if (depth === 0) return text.slice(start, i + 1);
                }
                return null;
            };

            for (const text of scripts) {
                if (!out.dimensionValuesDisplayData && text.includes('dimensionValuesDisplayData')) {
                    const raw = extractObjectAfter(text, 'dimensionValuesDisplayData');
                    if (raw) {
                        try { out.dimensionValuesDisplayData = JSON.parse(raw); } catch (e) {}
                    }
                }
                if (!out.labels && text.includes('variationDisplayLabels')) {
                    const raw = extractObjectAfter(text, 'variationDisplayLabels');
                    if (raw) {
                        try { out.labels = JSON.parse(raw); } catch (e) {}
                    }
                }
                if (!out.selectedAsin) {
                    const m = text.match(/"productAsin"\s*:\s*"([A-Z0-9]{10})"/);
                    if (m) out.selectedAsin = m[1];
                }
                if (out.dimensionValuesDisplayData && out.labels) break;
            }

            if (out.labels) {
                const firstKey = Object.keys(out.labels)[0];
                if (firstKey) out.dimensionName = out.labels[firstKey] || out.dimensionName;
            }

            const data = out.dimensionValuesDisplayData || {};
            const selected = out.selectedAsin || arguments[0];
            out.selectedAsin = selected;
            if (data[selected] && data[selected].length) out.selectedLabel = data[selected][0];
            return out;
        """, asin)

        if result:
            metadata["product_title"] = result.get("title") or ""
            metadata["selected_asin"] = result.get("selectedAsin") or asin
            metadata["selected_label"] = result.get("selectedLabel") or ""
            metadata["dimension_name"] = result.get("dimensionName") or "Set name"

            variation_data = result.get("dimensionValuesDisplayData") or {}
            for variant_asin, values in variation_data.items():
                if not variant_asin or not values:
                    continue
                label = str(values[0]).strip()
                if not label:
                    continue
                metadata["asin_to_label"][variant_asin] = label
                metadata["label_to_asin"][_norm_variant_label(label)] = variant_asin

        if not metadata["selected_label"]:
            metadata["selected_label"] = metadata["asin_to_label"].get(asin, "") or metadata["product_title"] or asin
        metadata["label_to_asin"].setdefault(_norm_variant_label(metadata["selected_label"]), metadata["selected_asin"])
        metadata["asin_to_label"].setdefault(metadata["selected_asin"], metadata["selected_label"])

        print(
            "  -> Variant map: "
            f"{len(metadata['asin_to_label']) or 1} option(s); "
            f"selected '{metadata['selected_label']}'"
        )
        return metadata
    except Exception as e:
        print(f"  -> scrape_product_variations failed for {asin}: {e}")
        metadata["selected_label"] = asin
        metadata["label_to_asin"][_norm_variant_label(asin)] = asin
        metadata["asin_to_label"][asin] = asin
        return metadata


def _resolve_review_variant(review, seed_asin, product_name, variant_metadata):
    raw_format = (review.get("variant_text") or "").strip()
    dimension_name = variant_metadata.get("dimension_name") or "Set name"
    variant_label = ""

    if raw_format:
        text = raw_format.replace("Verified Purchase", "").strip()
        if ":" in text:
            maybe_dimension, maybe_label = text.split(":", 1)
            dimension_name = maybe_dimension.strip() or dimension_name
            variant_label = maybe_label.strip()
        else:
            variant_label = text

    if not variant_label:
        variant_label = variant_metadata.get("selected_label") or product_name or seed_asin

    label_to_asin = variant_metadata.get("label_to_asin") or {}
    variant_asin = label_to_asin.get(_norm_variant_label(variant_label))
    if not variant_asin and _norm_variant_label(variant_label) == _norm_variant_label(variant_metadata.get("selected_label")):
        variant_asin = variant_metadata.get("selected_asin")
    if not variant_asin:
        variant_asin = seed_asin

    return {
        "scrape_asin": seed_asin,
        "variant_asin": variant_asin,
        "variant_label": variant_label,
        "variant_dimension": dimension_name,
        "product_name": variant_label,
    }


def _extract_reviews(driver):
    """Read all currently visible reviews from the page."""
    return driver.execute_script("""
        return Array.from(document.querySelectorAll('[data-hook="review"]')).map(r => {
            const id       = r.getAttribute("id");
            const ratingEl = r.querySelector('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]');
            const titleEl  = r.querySelector('[data-hook="review-title"]');
            const bodyEl   = r.querySelector('[data-hook="review-body"] span');
            const dateEl   = r.querySelector('[data-hook="review-date"]');
            const formatEl = r.querySelector('[data-hook="format-strip"]');
            return {
                review_id:   id,
                rating:      ratingEl ? ratingEl.innerText.trim() : "",
                title:       titleEl  ? titleEl.innerText.trim()  : "",
                review:      bodyEl   ? bodyEl.innerText.trim()   : "",
                review_date: dateEl   ? dateEl.innerText.trim()   : "",
                variant_text: formatEl ? formatEl.innerText.trim() : "",
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

            def reviews_expanded_or_button_changed(d):
                if len(d.find_elements(By.CSS_SELECTOR, "[data-hook='review']")) > previous_count:
                    return True
                current_button = _find_show_more_control(d)
                if not current_button:
                    return False
                return (current_button.get_attribute("data-reviews-state-param") or "") != previous_state

            WebDriverWait(driver, timeout).until(reviews_expanded_or_button_changed)
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


def scrape_reviews_for_asin(
    driver,
    asin,
    product_name,
    category=None,
    max_pages=10,
    already_on_page=False,
    cutoff_date=None,
    variant_metadata=None,
):
    """
    Scrape Amazon.in reviews for a given ASIN.
    Stops once reviews older than cutoff_date (or SCRAPE_DAYS_BACK if not provided) are encountered.
    Supports both inline 'Show 10 more reviews' expansion and classic page URLs.
    """
    reviews = []
    seen_review_ids = set()
    today = date.today()
    cutoff = cutoff_date if cutoff_date is not None else today - timedelta(days=SCRAPE_DAYS_BACK)
    scrape_date_str = today.isoformat()
    variant_metadata = variant_metadata or {
        "selected_asin": asin,
        "selected_label": product_name or asin,
        "dimension_name": "Set name",
        "label_to_asin": {_norm_variant_label(product_name or asin): asin},
        "asin_to_label": {asin: product_name or asin},
    }

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
            variant = _resolve_review_variant(review, asin, product_name, variant_metadata)
            review["asin"] = variant["variant_asin"]
            review["scrape_asin"] = variant["scrape_asin"]
            review["variant_asin"] = variant["variant_asin"]
            review["variant_label"] = variant["variant_label"]
            review["variant_dimension"] = variant["variant_dimension"]
            review["product_name"] = variant["product_name"]
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
