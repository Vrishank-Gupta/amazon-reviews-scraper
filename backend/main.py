from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import pymysql
import pymysql.cursors
import json
import csv
import subprocess
import os
from typing import Optional
from dotenv import load_dotenv
from collections import defaultdict

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI()

# CORS — reads allowed origins from env so it works both locally and in prod
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── ASIN map — loaded once at startup from asins.csv ─────────────────────────
# ASIN_MAP  : { asin: { product_name, category } }
# CAT_MAP   : { category: [product_name, ...] }
# ALL_PRODS : [product_name, ...]

def _load_asin_map():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "asins.csv"))
    asin_map, cat_map, all_prods = {}, defaultdict(list), []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                asin = row["asin"].strip()
                name = row["product_name"].strip()
                cat  = row.get("category", "").strip()
                asin_map[asin] = {"product_name": name, "category": cat}
                if name not in all_prods:
                    all_prods.append(name)
                if cat and name not in cat_map[cat]:
                    cat_map[cat].append(name)
    except FileNotFoundError:
        pass
    return asin_map, dict(cat_map), all_prods

ASIN_MAP, CAT_MAP, ALL_PRODS = _load_asin_map()


def _refresh_asin_globals():
    global ASIN_MAP, CAT_MAP, ALL_PRODS
    ASIN_MAP, CAT_MAP, ALL_PRODS = _load_asin_map()


def _categories_path():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "categories.json"))


def _load_categories():
    cats = set(c for c in CAT_MAP.keys() if c)
    path = _categories_path()
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                cats.update(str(x).strip() for x in data if str(x).strip())
        except Exception:
            pass
    return sorted(cats)


def _category_usage():
    usage = defaultdict(int)
    for meta in ASIN_MAP.values():
        cat = (meta.get("category") or "").strip()
        if cat:
            usage[cat] += 1
    return usage


def _save_categories(categories):
    path = _categories_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cleaned = sorted({str(c).strip() for c in categories if str(c).strip()})
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=True, indent=2)


def resolve_products(product: Optional[str], category: Optional[str]) -> Optional[list]:
    """
    Resolve the product filter to a flat list of product_names.
    Priority: explicit product list > category > None (= all products)
    Returns None if no filter should be applied (all products).
    """
    if product:
        return [p.strip() for p in product.split("|||") if p.strip()]
    if category:
        prods = CAT_MAP.get(category, [])
        return prods if prods else None
    return None


def product_filter_sql(products: Optional[list], table_alias: str = "r") -> tuple:
    """Returns (sql_fragment, params_list) for product_name IN (...)"""
    if not products:
        return "", []
    placeholders = ",".join(["%s"] * len(products))
    return f" AND {table_alias}.product_name IN ({placeholders})", list(products)


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


# ── Reviews ───────────────────────────────────────────────────────────────────

@app.get("/api/reviews")
def get_reviews(
    category: Optional[str] = None,
    sentiment: Optional[str] = None,
    rating: Optional[str] = None,
    product: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, pf_params = product_filter_sql(products)

            query = """
                SELECT
                    r.review_id, r.asin, r.product_name, r.category,
                    r.rating, r.review, r.title, r.review_date,
                    r.review_url, r.scrape_date,
                    t.sentiment, t.primary_categories, t.sub_tags
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1
            """
            params = []

            query += pf_sql; params.extend(pf_params)

            if sentiment:
                sentiments = sentiment.split(",")
                placeholders = ",".join(["%s"] * len(sentiments))
                query += f" AND t.sentiment IN ({placeholders})"
                params.extend(sentiments)

            if rating:
                ratings_list = [r for r in rating.split(",")]
                placeholders = ",".join(["%s"] * len(ratings_list))
                query += f" AND r.rating IN ({placeholders})"
                params.extend(ratings_list)

            date_parse = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
            if date_from:
                query += f" AND {date_parse} >= %s"; params.append(date_from)
            if date_to:
                query += f" AND {date_parse} <= %s"; params.append(date_to)

            cur.execute(query, params)
            rows = cur.fetchall()

        result = []
        for row in rows:
            row["primary_categories"] = json.loads(row["primary_categories"] or "[]")
            row["sub_tags"] = json.loads(row["sub_tags"] or "[]")
            result.append(row)

        return result
    finally:
        conn.close()


# ── Filters ───────────────────────────────────────────────────────────────────

@app.get("/api/filters")
def get_filters():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT product_name FROM raw_reviews WHERE product_name IS NOT NULL ORDER BY product_name")
            db_products = [r["product_name"] for r in cur.fetchall()]

            cur.execute("SELECT DISTINCT rating FROM raw_reviews WHERE rating IS NOT NULL ORDER BY rating")
            ratings = [r["rating"] for r in cur.fetchall()]

        # Use ASIN_MAP order for products (preserves asins.csv order)
        # Fall back to DB order if product not in map
        map_products = ALL_PRODS if ALL_PRODS else db_products
        products = [p for p in map_products if p in db_products] or db_products

        # Build category tree from CAT_MAP — only include categories that have
        # at least one product present in the DB
        db_product_set = set(db_products)
        tree = {}
        for cat, prods in CAT_MAP.items():
            active = [p for p in prods if p in db_product_set]
            if active:
                tree[cat] = active

        # Products with no category go into an "Other" bucket
        categorised = {p for prods in CAT_MAP.values() for p in prods}
        uncategorised = [p for p in products if p not in categorised]
        if uncategorised:
            tree["Other"] = uncategorised

        return {
            "products": products,
            "ratings":  ratings,
            "tree":     tree,      # { category: [product_name, ...] }
        }
    finally:
        conn.close()


# ── ASINs ────────────────────────────────────────────────────────────────────

@app.get("/api/asins")
def get_asins():
    """Returns ASINs from data/asins.csv"""
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    asins_path = os.path.join(project_root, "data", "asins.csv")
    try:
        with open(asins_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [{"asin": r["asin"], "product_name": r["product_name"], "category": r.get("category", "")} for r in reader]
    except FileNotFoundError:
        return []


class AsinUpsertRequest(BaseModel):
    asin: str
    product_name: str
    category: str


class CategoryRequest(BaseModel):
    category: str


@app.post("/api/asins")
def upsert_asin(req: AsinUpsertRequest):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    asins_path = os.path.join(project_root, "data", "asins.csv")

    asin = (req.asin or "").strip().upper()
    product_name = (req.product_name or "").strip()
    category = (req.category or "").strip()

    if not asin:
        raise HTTPException(status_code=400, detail="asin is required")
    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required")
    if not category:
        raise HTTPException(status_code=400, detail="category is required")

    fieldnames = ["asin", "product_name", "category"]
    rows = []
    found = False
    action = "added"

    if os.path.exists(asins_path):
        with open(asins_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row_asin = (row.get("asin") or "").strip().upper()
                if row_asin == asin:
                    found = True
                    row["asin"] = asin
                    row["product_name"] = product_name
                    row["category"] = category
                    action = "updated"
                rows.append({
                    "asin": row_asin,
                    "product_name": (row.get("product_name") or "").strip(),
                    "category": (row.get("category") or "").strip(),
                })

    if not found:
        rows.append({
            "asin": asin,
            "product_name": product_name,
            "category": category,
        })

    os.makedirs(os.path.dirname(asins_path), exist_ok=True)
    with open(asins_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    _refresh_asin_globals()

    saved = next((r for r in rows if r["asin"] == asin), {"asin": asin, "product_name": product_name, "category": category})
    return {
        "message": f"ASIN {action} successfully",
        "action": action,
        "asin": saved["asin"],
        "product_name": saved["product_name"],
        "category": saved["category"],
    }


@app.get("/api/categories")
def get_categories():
    usage = _category_usage()
    return [
        {
            "name": cat,
            "usage_count": usage.get(cat, 0),
            "can_delete": usage.get(cat, 0) == 0,
        }
        for cat in _load_categories()
    ]


@app.post("/api/categories")
def add_category(req: CategoryRequest):
    category = (req.category or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="category is required")

    categories = _load_categories()
    exists = any(c.lower() == category.lower() for c in categories)
    if not exists:
        categories.append(category)
        _save_categories(categories)
        action = "added"
    else:
        action = "exists"

    final = _load_categories()
    saved = next((c for c in final if c.lower() == category.lower()), category)
    return {
        "message": f"Category {action} successfully",
        "action": action,
        "category": saved,
        "categories": final,
    }


@app.delete("/api/categories/{category_name}")
def delete_category(category_name: str):
    target = category_name.strip()
    if not target:
        raise HTTPException(status_code=400, detail="category is required")

    usage = _category_usage()
    matched_usage_name = next((name for name in usage.keys() if name.lower() == target.lower()), None)
    if matched_usage_name and usage.get(matched_usage_name, 0) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Category is in use by {usage[matched_usage_name]} ASIN(s). Reassign them before deleting."
        )

    existing = _load_categories()
    kept = [cat for cat in existing if cat.lower() != target.lower()]
    if len(kept) == len(existing):
        raise HTTPException(status_code=404, detail="Category not found")

    _save_categories(kept)
    return {
        "message": "Category deleted successfully",
        "category": target,
    }


# ── Pipeline status (read-only — scraper runs via Task Scheduler) ─────────────

@app.get("/api/pipeline/status")
def get_pipeline_status():
    """
    Returns last scrape info derived directly from raw_reviews.
    No dependency on pipeline_runs table or local scraper process.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Last scrape timestamp
            cur.execute("""
                SELECT MAX(scrape_date) as last_scrape, COUNT(*) as total_reviews
                FROM raw_reviews
            """)
            summary_row = cur.fetchone()

            # Reviews scraped in the last 7 days
            cur.execute("""
                SELECT COUNT(*) as recent_count
                FROM raw_reviews
                WHERE scrape_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            """)
            recent = cur.fetchone()

            # Tagged reviews total
            cur.execute("SELECT COUNT(*) as tagged FROM review_tags")
            tagged = cur.fetchone()

            # Per-ASIN last scrape breakdown — inside with block so cursor is open
            cur.execute("""
                SELECT
                    r.asin,
                    MAX(r.product_name) as product_name,
                    MAX(r.scrape_date)  as last_scrape,
                    COUNT(*)            as total_reviews,
                    SUM(CASE WHEN r.scrape_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recent_reviews
                FROM raw_reviews r
                GROUP BY r.asin
                ORDER BY last_scrape DESC
            """)
            asin_rows = cur.fetchall()

        last_scrape = str(summary_row["last_scrape"]) if summary_row and summary_row["last_scrape"] else None

        # Days since last scrape
        days_ago = None
        if last_scrape:
            from datetime import date
            try:
                last_date = date.fromisoformat(last_scrape[:10])
                days_ago = (date.today() - last_date).days
            except Exception:
                pass

        # Build lookup from DB results
        db_lookup = { a["asin"]: a for a in asin_rows }

        # Read all ASINs from asins.csv as the master list
        import csv as _csv
        from datetime import date as _date
        csv_asins = []
        csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "asins.csv")
        try:
            with open(csv_path, newline="", encoding="utf-8") as f:
                for row in _csv.DictReader(f):
                    csv_asins.append({ "asin": row["asin"].strip(), "product_name": row["product_name"].strip() })
        except Exception:
            pass

        # Merge: CSV is source of truth for which ASINs exist
        # Any ASIN in DB but not in CSV is also included
        seen = set()
        merged = []
        for item in csv_asins:
            seen.add(item["asin"])
            db = db_lookup.get(item["asin"])
            merged.append({
                "asin": item["asin"],
                "product_name": item["product_name"],
                "last_scrape": str(db["last_scrape"]) if db and db["last_scrape"] else None,
                "total_reviews": db["total_reviews"] if db else 0,
                "recent_reviews": db["recent_reviews"] if db else 0,
            })
        for asin, db in db_lookup.items():
            if asin not in seen:
                merged.append({
                    "asin": asin,
                    "product_name": db["product_name"],
                    "last_scrape": str(db["last_scrape"]) if db["last_scrape"] else None,
                    "total_reviews": db["total_reviews"] or 0,
                    "recent_reviews": db["recent_reviews"] or 0,
                })

        asin_breakdown = []
        for a in merged:
            a_days_ago = None
            if a["last_scrape"]:
                try:
                    a_days_ago = (_date.today() - _date.fromisoformat(a["last_scrape"][:10])).days
                except Exception:
                    pass
            asin_breakdown.append({ **a, "days_ago": a_days_ago })

        return {
            "last_scrape": last_scrape,
            "days_ago": days_ago,
            "total_reviews": summary_row["total_reviews"] if summary_row else 0,
            "recent_reviews": recent["recent_count"] if recent else 0,
            "tagged_reviews": tagged["tagged"] if tagged else 0,
            "asin_breakdown": asin_breakdown,
        }
    finally:
        conn.close()


from typing import List as TypingList

class PipelineRunRequest(BaseModel):
    days: int = 30
    asins: TypingList[str] = []  # empty = scrape all ASINs in asins.csv


@app.post("/api/pipeline/run")
def run_pipeline(req: PipelineRunRequest = None):
    if req is None:
        req = PipelineRunRequest()
    if req.days < 1 or req.days > 365:
        raise HTTPException(status_code=400, detail="days must be between 1 and 365")

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    start_script = os.path.join(project_root, "pipeline", "start_pipeline.py")

    env = os.environ.copy()
    env["SCRAPE_DAYS_BACK"] = str(req.days)
    # Pass selected ASINs as comma-separated string; empty = all
    if req.asins:
        env["SCRAPE_ASINS"] = ",".join(req.asins)
    else:
        env.pop("SCRAPE_ASINS", None)

    subprocess.Popen(
        ["python", start_script],
        cwd=project_root,
        env=env,
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    asin_msg = f"ASINs: {', '.join(req.asins)}" if req.asins else "all ASINs"
    return {"message": f"Pipeline started — last {req.days} days, {asin_msg}"}


# Keep old /api/pipeline endpoint for backward compatibility
@app.get("/api/pipeline")
def get_pipeline():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, status, message, started_at, finished_at
                FROM pipeline_runs WHERE id = 1
            """)
            row = cur.fetchone()
        if not row:
            return {"status": "UNKNOWN", "message": "", "started_at": None, "finished_at": None}
        for k in ["started_at", "finished_at"]:
            if row[k]:
                row[k] = str(row[k])
        return row
    finally:
        conn.close()


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT sentiment, COUNT(*) as count
                FROM review_tags GROUP BY sentiment
            """)
            sentiment_counts = cur.fetchall()

            cur.execute("""
                SELECT rating, COUNT(*) as count
                FROM raw_reviews WHERE rating IS NOT NULL
                GROUP BY rating ORDER BY rating
            """)
            rating_dist = cur.fetchall()

            cur.execute("SELECT primary_categories FROM review_tags")
            cat_rows = cur.fetchall()

        cat_counts = {}
        for row in cat_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                cat_counts[c] = cat_counts.get(c, 0) + 1

        category_dist = sorted(
            [{"category": k, "count": v} for k, v in cat_counts.items()],
            key=lambda x: x["count"], reverse=True,
        )

        return {
            "sentiment_counts": sentiment_counts,
            "rating_dist": rating_dist,
            "category_dist": category_dist,
        }
    finally:
        conn.close()


# ── Trends ────────────────────────────────────────────────────────────────────

@app.get("/api/trends")
def get_trends(
    product: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    granularity: Optional[str] = "week",
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, base_params = product_filter_sql(products)

            _rd = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
            date_filter = ""
            if date_from:
                date_filter += f" AND {_rd} >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += f" AND {_rd} <= %s"
                base_params.append(date_to)

            fmt = "%%Y-%%u" if granularity == "week" else "%%Y-%%m"

            cur.execute(f"""
                SELECT DATE_FORMAT(r.scrape_date, '{fmt}') as period,
                    t.primary_categories, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY period, t.primary_categories
                ORDER BY period
            """, list(base_params))
            trend_rows = cur.fetchall()

            cur.execute(f"""
                SELECT r.product_name, t.primary_categories, t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.product_name, t.primary_categories, t.sentiment
            """, list(base_params))
            stack_rows = cur.fetchall()

            cur.execute(f"""
                SELECT r.product_name, t.sub_tags, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.product_name, t.sub_tags
            """, list(base_params))
            subtag_rows = cur.fetchall()

            # Rating trend over time
            cur.execute(f"""
                SELECT DATE_FORMAT(r.scrape_date, '{fmt}') as period,
                    ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 2) as avg_rating,
                    COUNT(*) as count
                FROM raw_reviews r
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY period ORDER BY period
            """, list(base_params))
            rating_rows = cur.fetchall()

            # Sentiment over time (for stacked area)
            cur.execute(f"""
                SELECT DATE_FORMAT(r.scrape_date, '{fmt}') as period,
                    t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY period, t.sentiment ORDER BY period
            """, list(base_params))
            sent_time_rows = cur.fetchall()

        # Process category trends
        trend_data = defaultdict(lambda: defaultdict(int))
        all_cats = set()
        for row in trend_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                trend_data[row["period"]][c] += row["count"]
                all_cats.add(c)

        periods = sorted(trend_data.keys())
        category_trend = [
            {"period": p, **{c: trend_data[p].get(c, 0) for c in sorted(all_cats)}}
            for p in periods
        ]

        # Process stacked bar
        product_cat = defaultdict(lambda: defaultdict(int))
        product_neg = defaultdict(lambda: defaultdict(int))
        for row in stack_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                product_cat[row["product_name"]][c] += row["count"]
            product_neg[row["product_name"]][row["sentiment"]] += row["count"]

        stacked_category = [{"product": p, **cats} for p, cats in product_cat.items()]

        # product_sentiment for CXO table: {product, total, negative, positive, neutral, avg_rating, top_issue}
        cat_totals_map = defaultdict(int)
        for row in stack_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            if row.get("sentiment") == "Negative":
                for c in cats:
                    cat_totals_map[c] += row["count"]

        product_sentiment_list = []
        for p, sents in product_neg.items():
            total = sum(sents.values())
            neg = sents.get("Negative", 0)
            top_cats = sorted(
                [(c, cnt) for c, cnt in product_cat[p].items()],
                key=lambda x: -x[1]
            )
            product_sentiment_list.append({
                "product": p,
                "total": total,
                "negative": neg,
                "positive": sents.get("Positive", 0),
                "neutral": sents.get("Neutral", 0),
                "avg_rating": None,  # filled below from rating_rows if available
                "top_issue": top_cats[0][0] if top_cats else None,
            })

        # Merge avg_rating into product_sentiment from stack_rows avg
        # (we don't have per-product rating in stack_rows, use separate approach)
        stacked_sentiment_time = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
        for row in sent_time_rows:
            stacked_sentiment_time[row["period"]][row["sentiment"]] += row["count"]
        stacked_sentiment = [
            {"period": p, **sents}
            for p, sents in sorted(stacked_sentiment_time.items())
        ]

        # category_totals: sorted by negative count
        category_totals = sorted(
            [{"category": c, "count": cnt} for c, cnt in cat_totals_map.items()],
            key=lambda x: -x["count"]
        )

        # rating trend
        rating_trend = [
            {"period": str(r["period"]), "avg_rating": float(r["avg_rating"] or 0)}
            for r in rating_rows
        ]

        # Process heatmap
        heatmap = defaultdict(lambda: defaultdict(int))
        all_subtags = set()
        for row in subtag_rows:
            tags = json.loads(row["sub_tags"] or "[]")
            for t in tags:
                heatmap[row["product_name"]][t] += row["count"]
                all_subtags.add(t)

        heatmap_data = [
            {"product": p, "subtag": s, "count": heatmap[p].get(s, 0)}
            for p in heatmap for s in all_subtags
            if heatmap[p].get(s, 0) > 0
        ]

        return {
            "category_trend": category_trend,
            "all_categories": sorted(all_cats),
            "stacked_category": stacked_category,
            "stacked_sentiment": stacked_sentiment,
            "heatmap": heatmap_data,
            "all_subtags": sorted(all_subtags),
            "rating_trend": rating_trend,
            "category_totals": category_totals,
            "product_sentiment": product_sentiment_list,
        }
    finally:
        conn.close()

# ── CXO Trends (comprehensive daily) ─────────────────────────────────────────

@app.get("/api/trends/cxo")
def get_cxo_trends(
    product: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, base_params = product_filter_sql(products)

            _rd = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
            date_filter = ""
            if date_from:
                date_filter += f" AND {_rd} >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += f" AND {_rd} <= %s"
                base_params.append(date_to)

            # 1. Daily sentiment counts
            cur.execute(f"""
                SELECT DATE_FORMAT({_rd}, '%%Y-%%m-%%d') as day, t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                  AND {_rd} IS NOT NULL
                GROUP BY day, t.sentiment
                ORDER BY day
            """, list(base_params))
            daily_sent_rows = cur.fetchall()

            # 2. Daily avg rating
            cur.execute(f"""
                SELECT r.scrape_date as day,
                    ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 3) as avg_rating,
                    COUNT(*) as total,
                    SUM(CASE WHEN CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1)) < 1.5 THEN 1 ELSE 0 END) as one_star,
                    SUM(CASE WHEN CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1)) >= 4.5 THEN 1 ELSE 0 END) as five_star
                FROM raw_reviews r
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.scrape_date ORDER BY r.scrape_date
            """, list(base_params))
            daily_rating_rows = cur.fetchall()

            # 3. Daily per-product negative rate
            cur.execute(f"""
                SELECT r.scrape_date as day, r.product_name,
                    t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.scrape_date, r.product_name, t.sentiment
                ORDER BY r.scrape_date
            """, list(base_params))
            daily_product_rows = cur.fetchall()

            # 4. Daily category breakdown (negative only)
            cur.execute(f"""
                SELECT r.scrape_date as day, t.primary_categories, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                  AND t.sentiment = 'Negative'
                GROUP BY r.scrape_date, t.primary_categories
                ORDER BY r.scrape_date
            """, list(base_params))
            daily_cat_rows = cur.fetchall()

            # 5. Rating distribution per product (for donut/bar)
            cur.execute(f"""
                SELECT r.product_name,
                    ROUND(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))) as rating,
                    COUNT(*) as count
                FROM raw_reviews r
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.product_name, rating
                ORDER BY r.product_name, r.rating
            """, list(base_params))
            rating_dist_rows = cur.fetchall()

            # 6. Weekly digest — this week vs prior week
            # Strip date params — digest always looks at last 14 days
            digest_params = [p for p in base_params if p not in ([date_from] if date_from else []) + ([date_to] if date_to else [])]
            cur.execute(f"""
                SELECT
                    YEARWEEK(r.scrape_date, 1) as yw,
                    t.sentiment, COUNT(*) as count,
                    ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 2) as avg_rating
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE r.scrape_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                  {pf_sql}
                GROUP BY yw, t.sentiment
                ORDER BY yw
            """, digest_params)
            digest_rows = cur.fetchall()

            # 7. Category momentum — compare first half vs second half of period
            cur.execute(f"""
                SELECT
                    CASE WHEN r.scrape_date < (
                        SELECT DATE_ADD(MIN(r2.scrape_date),
                            INTERVAL DATEDIFF(MAX(r2.scrape_date), MIN(r2.scrape_date))/2 DAY)
                        FROM raw_reviews r2 WHERE 1=1 {pf_sql} {date_filter}
                    ) THEN 'first' ELSE 'second' END as half,
                    t.primary_categories, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                  AND t.sentiment = 'Negative'
                GROUP BY half, t.primary_categories
            """, list(base_params) * 2)
            momentum_rows = cur.fetchall()

            # 8. Per-product avg rating for comparison
            cur.execute(f"""
                SELECT r.product_name,
                    ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 2) as avg_rating,
                    COUNT(*) as total,
                    SUM(CASE WHEN t.sentiment='Negative' THEN 1 ELSE 0 END) as negative,
                    SUM(CASE WHEN t.sentiment='Positive' THEN 1 ELSE 0 END) as positive,
                    SUM(CASE WHEN t.sentiment='Neutral' THEN 1 ELSE 0 END) as neutral
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                GROUP BY r.product_name
            """, list(base_params))
            product_rows = cur.fetchall()

            # 9. Negative issue heatmap by product x category
            cur.execute(f"""
                SELECT r.product_name, t.primary_categories, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql} {date_filter}
                  AND t.sentiment = 'Negative'
                GROUP BY r.product_name, t.primary_categories
            """, list(base_params))
            heatmap_rows = cur.fetchall()

        # ── Process daily sentiment → daily_trend + neg_rate ──
        days_sent = defaultdict(lambda: {"Positive": 0, "Negative": 0, "Neutral": 0})
        for row in daily_sent_rows:
            d = str(row["day"])
            days_sent[d][row["sentiment"]] += row["count"]

        all_days = sorted(days_sent.keys())
        daily_trend = []
        for d in all_days:
            s = days_sent[d]
            total = s["Positive"] + s["Negative"] + s["Neutral"]
            neg_rate = round((s["Negative"] / total * 100), 1) if total else 0
            pos_rate = round((s["Positive"] / total * 100), 1) if total else 0
            daily_trend.append({
                "day": d, "total": total,
                "Positive": s["Positive"], "Negative": s["Negative"], "Neutral": s["Neutral"],
                "neg_rate": neg_rate, "pos_rate": pos_rate,
            })

        # 7-day rolling avg neg_rate
        for i, pt in enumerate(daily_trend):
            window = daily_trend[max(0, i-6):i+1]
            pt["rolling_neg"] = round(sum(w["neg_rate"] for w in window) / len(window), 1)

        # ── Daily rating + rolling ──
        daily_rating = []
        rating_map = {str(r["day"]): r for r in daily_rating_rows}
        for d in all_days:
            r = rating_map.get(d, {})
            daily_rating.append({
                "day": d,
                "avg_rating": float(r.get("avg_rating") or 0),
                "total": int(r.get("total") or 0),
                "one_star": int(r.get("one_star") or 0),
                "five_star": int(r.get("five_star") or 0),
            })
        for i, pt in enumerate(daily_rating):
            window = daily_rating[max(0, i-6):i+1]
            vals = [w["avg_rating"] for w in window if w["avg_rating"] > 0]
            pt["rolling_rating"] = round(sum(vals) / len(vals), 2) if vals else 0

        # ── Per-product daily neg rate ──
        prod_day = defaultdict(lambda: defaultdict(lambda: {"pos": 0, "neg": 0, "neu": 0}))
        for row in daily_product_rows:
            d = str(row["day"]); p = row["product_name"]; s = row["sentiment"]
            if s == "Positive": prod_day[p][d]["pos"] += row["count"]
            elif s == "Negative": prod_day[p][d]["neg"] += row["count"]
            else: prod_day[p][d]["neu"] += row["count"]

        all_products_found = sorted(prod_day.keys())
        product_daily = []
        for d in all_days:
            pt = {"day": d}
            for p in all_products_found:
                s = prod_day[p][d]
                tot = s["pos"] + s["neg"] + s["neu"]
                pt[p] = round(s["neg"] / tot * 100, 1) if tot else None
            product_daily.append(pt)

        # ── Daily category breakdown ──
        day_cats = defaultdict(lambda: defaultdict(int))
        all_cats = set()
        for row in daily_cat_rows:
            d = str(row["day"])
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                day_cats[d][c] += row["count"]
                all_cats.add(c)

        daily_categories = [
            {"day": d, **{c: day_cats[d].get(c, 0) for c in sorted(all_cats)}}
            for d in all_days
        ]

        # ── Rating distribution per product ──
        prod_rating_dist = defaultdict(lambda: defaultdict(int))
        for row in rating_dist_rows:
            try:
                raw_r = str(row["rating"]).strip()
                star = int(float(raw_r.split()[0]))
                prod_rating_dist[row["product_name"]][star] += row["count"]
            except Exception:
                continue

        rating_distribution = [
            {"product": p, **{str(s): prod_rating_dist[p].get(s, 0) for s in range(1, 6)}}
            for p in all_products_found
        ]

        # ── Weekly digest (last 2 weeks) ──
        weeks = sorted(set(str(r["yw"]) for r in digest_rows))
        digest = {}
        for row in digest_rows:
            yw = str(row["yw"])
            if yw not in digest:
                digest[yw] = {"yw": yw, "Positive": 0, "Negative": 0, "Neutral": 0, "avg_rating": 0, "total": 0}
            digest[yw][row["sentiment"]] = digest[yw].get(row["sentiment"], 0) + row["count"]
            digest[yw]["total"] += row["count"]
        weekly_digest = list(digest.values())[-2:]

        # ── Category momentum (rising vs falling) ──
        first_cats = defaultdict(int)
        second_cats = defaultdict(int)
        for row in momentum_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                if row["half"] == "first": first_cats[c] += row["count"]
                else: second_cats[c] += row["count"]

        momentum = []
        all_m_cats = set(list(first_cats.keys()) + list(second_cats.keys()))
        for c in all_m_cats:
            f = first_cats.get(c, 0); s = second_cats.get(c, 0)
            change = s - f
            pct_change = round((change / f * 100)) if f > 0 else (100 if s > 0 else 0)
            momentum.append({"category": c, "first": f, "second": s, "change": change, "pct_change": pct_change})
        momentum.sort(key=lambda x: -abs(x["change"]))

        # ── Product summary ──
        product_summary = [
            {
                "product": r["product_name"],
                "avg_rating": float(r["avg_rating"] or 0),
                "total": int(r["total"] or 0),
                "negative": int(r["negative"] or 0),
                "positive": int(r["positive"] or 0),
                "neutral": int(r["neutral"] or 0),
                "neg_pct": round(int(r["negative"] or 0) / int(r["total"] or 1) * 100, 1),
            }
            for r in product_rows
        ]

        # ── Product x issue heatmap ──
        heatmap_counts = defaultdict(lambda: defaultdict(int))
        cat_totals = defaultdict(int)
        for row in heatmap_rows:
            product_name = row["product_name"]
            cats = json.loads(row["primary_categories"] or "[]")
            for cat in cats:
                heatmap_counts[product_name][cat] += row["count"]
                cat_totals[cat] += row["count"]

        top_heatmap_categories = [
            cat for cat, _ in sorted(cat_totals.items(), key=lambda item: item[1], reverse=True)[:6]
        ]
        issue_heatmap = {
            "products": all_products_found,
            "categories": top_heatmap_categories,
            "rows": [
                {
                    "product": product_name,
                    **{cat: heatmap_counts[product_name].get(cat, 0) for cat in top_heatmap_categories}
                }
                for product_name in all_products_found
            ],
        }

        # ── Period summary KPIs with WoW delta ──
        total_all = sum(pt["total"] for pt in daily_trend)
        total_neg = sum(pt["Negative"] for pt in daily_trend)
        total_pos = sum(pt["Positive"] for pt in daily_trend)
        avg_neg_rate = round(total_neg / total_all * 100, 1) if total_all else 0

        # Last 7d vs prior 7d
        last7 = [pt for pt in daily_trend if pt["day"] >= str(all_days[-7]) ] if len(all_days) >= 7 else daily_trend
        prior7 = [pt for pt in daily_trend if pt["day"] < str(all_days[-7])][-7:] if len(all_days) >= 14 else []
        last7_neg = round(sum(p["neg_rate"] for p in last7) / len(last7), 1) if last7 else 0
        prior7_neg = round(sum(p["neg_rate"] for p in prior7) / len(prior7), 1) if prior7 else None

        return {
            "daily_trend": daily_trend,
            "daily_rating": daily_rating,
            "product_daily": product_daily,
            "daily_categories": daily_categories,
            "all_categories": sorted(all_cats),
            "all_products": all_products_found,
            "rating_distribution": rating_distribution,
            "weekly_digest": weekly_digest,
            "category_momentum": momentum[:10],
            "product_summary": product_summary,
            "issue_heatmap": issue_heatmap,
            "kpi": {
                "total": total_all,
                "neg_pct": avg_neg_rate,
                "pos_pct": round(total_pos / total_all * 100, 1) if total_all else 0,
                "last7_neg_rate": last7_neg,
                "prior7_neg_rate": prior7_neg,
                "wow_delta": round(last7_neg - prior7_neg, 1) if prior7_neg is not None else None,
            },
        }
    finally:
        conn.close()


# ── Word Cloud ────────────────────────────────────────────────────────────────

@app.get("/api/wordcloud")
def get_wordcloud(
    product: Optional[str] = None,
    product_category: Optional[str] = None,   # product group filter (Camera/Dashcam)
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    category: Optional[str] = None,           # taxonomy category drill-down
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, product_category)
            pf_sql, base_params = product_filter_sql(products)

            _rd = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
            date_filter = ""
            if date_from:
                date_filter += f" AND {_rd} >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += f" AND {_rd} <= %s"
                base_params.append(date_to)

            if category:
                cur.execute(f"""
                    SELECT t.sub_tags, t.sentiment
                    FROM raw_reviews r
                    JOIN review_tags t ON r.review_id = t.review_id
                    WHERE 1=1 {pf_sql} {date_filter}
                    AND JSON_CONTAINS(t.primary_categories, %s)
                """, list(base_params) + [json.dumps(category)])
                rows = cur.fetchall()
                cat_rows = []
            else:
                cur.execute(f"""
                    SELECT t.sub_tags, t.sentiment
                    FROM raw_reviews r
                    JOIN review_tags t ON r.review_id = t.review_id
                    WHERE 1=1 {pf_sql} {date_filter}
                """, list(base_params))
                rows = cur.fetchall()

                cur.execute(f"""
                    SELECT t.primary_categories, t.sentiment
                    FROM raw_reviews r
                    JOIN review_tags t ON r.review_id = t.review_id
                    WHERE 1=1 {pf_sql} {date_filter}
                """, list(base_params))
                cat_rows = cur.fetchall()

        # word -> {total, negative, positive, neutral}
        word_counts = defaultdict(lambda: {"total": 0, "Negative": 0, "Positive": 0, "Neutral": 0})

        for row in rows:
            tags = json.loads(row["sub_tags"] or "[]")
            sentiment = row["sentiment"] or "Neutral"
            for tag in tags:
                word_counts[tag]["total"] += 1
                word_counts[tag][sentiment] = word_counts[tag].get(sentiment, 0) + 1

        for row in cat_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            sentiment = row["sentiment"] or "Neutral"
            for cat in cats:
                word_counts[cat]["total"] += 1
                word_counts[cat][sentiment] = word_counts[cat].get(sentiment, 0) + 1

        result = []
        for word, counts in word_counts.items():
            total = counts["total"]
            if total == 0:
                continue
            neg_ratio = counts["Negative"] / total
            pos_ratio = counts["Positive"] / total
            result.append({
                "word": word,
                "count": total,
                "negative": counts["Negative"],
                "positive": counts["Positive"],
                "neutral": counts["Neutral"],
                "neg_ratio": round(neg_ratio, 3),
                "pos_ratio": round(pos_ratio, 3),
            })

        result.sort(key=lambda x: x["count"], reverse=True)
        return result[:80]
    finally:
        conn.close()

# ── Reviews by keyword (for word cloud drill-down) ────────────────────────────

@app.get("/api/reviews/by-keyword")
def get_reviews_by_keyword(
    keyword: str,
    product: Optional[str] = None,
    product_category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Returns all reviews tagged with a given keyword (sub_tag or primary_category).
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, product_category)
            pf_sql, prod_params = product_filter_sql(products)
            base_params = [f'%"{keyword}"%', f'%"{keyword}"%'] + prod_params

            _rd = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
            date_filter = ""
            if date_from:
                date_filter += f" AND {_rd} >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += f" AND {_rd} <= %s"
                base_params.append(date_to)

            cur.execute(f"""
                SELECT
                    r.review_id, r.asin, r.product_name, r.category, r.rating,
                    r.title, r.review, r.review_date, r.review_url, r.scrape_date,
                    t.sentiment, t.primary_categories, t.sub_tags
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE (t.sub_tags LIKE %s OR t.primary_categories LIKE %s)
                {pf_sql} {date_filter}
                ORDER BY {_rd} DESC
                LIMIT 500
            """, base_params)

            rows = cur.fetchall()
            result = []
            for row in rows:
                result.append({
                    **row,
                    "primary_categories": json.loads(row["primary_categories"] or "[]"),
                    "sub_tags": json.loads(row["sub_tags"] or "[]"),
                })
            return result
    finally:
        conn.close()

# ── Analysis ──────────────────────────────────────────────────────────────────

@app.get("/api/analysis")
def get_analysis(
    product: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, base_params = product_filter_sql(products)

            date_filter = ""
            if date_from:
                date_filter += " AND parsed_date >= %s"
            if date_to:
                date_filter += " AND parsed_date <= %s"

            # Parse review_date string → actual date
            date_parse = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"

            # ── KPI counts ──
            kpi_params = list(base_params)
            if date_from: kpi_params.append(date_from)
            if date_to: kpi_params.append(date_to)

            cur.execute(f"""
                SELECT t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql}
                  AND {date_parse} IS NOT NULL
                  {date_filter.replace('parsed_date', date_parse)}
                GROUP BY t.sentiment
            """, kpi_params)
            sentiment_kpi = {row["sentiment"]: row["count"] for row in cur.fetchall()}

            # ── Daily sentiment trend by review_date ──
            trend_params = list(base_params)
            if date_from: trend_params.append(date_from)
            if date_to: trend_params.append(date_to)

            cur.execute(f"""
                SELECT
                    DATE_FORMAT({date_parse}, '%%Y-%%m-%%d') as day,
                    t.sentiment,
                    COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql}
                  AND {date_parse} IS NOT NULL
                  {date_filter.replace('parsed_date', date_parse)}
                GROUP BY day, t.sentiment
                ORDER BY day
            """, trend_params)
            trend_rows = cur.fetchall()

            # Pivot into [{day, Positive, Negative, Neutral}]
            trend_map = {}
            for row in trend_rows:
                d = row["day"]
                if d not in trend_map:
                    trend_map[d] = {"day": d, "Positive": 0, "Negative": 0, "Neutral": 0}
                trend_map[d][row["sentiment"]] = row["count"]
            daily_trend = sorted(trend_map.values(), key=lambda x: x["day"])

            # ── Pie: negative reviews by category ──
            pie_params = list(base_params)
            if date_from: pie_params.append(date_from)
            if date_to: pie_params.append(date_to)

            cur.execute(f"""
                SELECT t.primary_categories, t.sentiment
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql}
                  AND {date_parse} IS NOT NULL
                  {date_filter.replace('parsed_date', date_parse)}
            """, pie_params)
            pie_rows = cur.fetchall()

            neg_cat = defaultdict(int)
            pos_cat = defaultdict(int)
            for row in pie_rows:
                cats = json.loads(row["primary_categories"] or "[]")
                for c in cats:
                    if row["sentiment"] == "Negative":
                        neg_cat[c] += 1
                    else:
                        pos_cat[c] += 1

            neg_pie = sorted([{"category": k, "count": v} for k, v in neg_cat.items()], key=lambda x: -x["count"])[:8]
            pos_pie = sorted([{"category": k, "count": v} for k, v in pos_cat.items()], key=lambda x: -x["count"])[:8]

        return {
            "kpi": {
                "total": sum(sentiment_kpi.values()),
                "negative": sentiment_kpi.get("Negative", 0),
                "positive": sentiment_kpi.get("Positive", 0),
                "neutral": sentiment_kpi.get("Neutral", 0),
            },
            "daily_trend": daily_trend,
            "neg_pie": neg_pie,
            "pos_pie": pos_pie,
        }
    finally:
        conn.close()


# ── Summary (per-ASIN table + delta) ─────────────────────────────────────────

@app.get("/api/summary")
def get_summary(
    product: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    from datetime import date as _date, timedelta

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, base_params = product_filter_sql(products)

            # Determine period length for delta
            if date_from and date_to:
                d_from = _date.fromisoformat(date_from)
                d_to = _date.fromisoformat(date_to)
                period_days = (d_to - d_from).days or 1
                prior_to = d_from - timedelta(days=1)
                prior_from = prior_to - timedelta(days=period_days)
            else:
                period_days = 30
                d_to = _date.today()
                d_from = d_to - timedelta(days=30)
                prior_to = d_from - timedelta(days=1)
                prior_from = prior_to - timedelta(days=30)

            def fetch_period(p_from, p_to):
                params = list(base_params) + [str(p_from), str(p_to)]
                cur.execute(f"""
                    SELECT
                        r.asin,
                        MAX(r.product_name) as product_name,
                        MAX(r.category) as category,
                        ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 1) as avg_rating,
                        COUNT(*) as review_count,
                        SUM(CASE WHEN t.sentiment = 'Negative' THEN 1 ELSE 0 END) as neg_count
                    FROM raw_reviews r
                    JOIN review_tags t ON r.review_id = t.review_id
                    WHERE 1=1 {pf_sql}
                      AND r.scrape_date BETWEEN %s AND %s
                    GROUP BY r.asin
                """, params)
                return {row["asin"]: row for row in cur.fetchall()}

            current = fetch_period(d_from, d_to)
            prior = fetch_period(prior_from, prior_to)

            # Fetch AI summaries — gracefully skip if table missing or no permission
            try:
                cur.execute("SELECT asin, issues, positives, generated_at FROM product_summaries")
                ai_rows = {row["asin"]: row for row in cur.fetchall()}
            except Exception:
                ai_rows = {}

            result = []
            for asin, row in current.items():
                prev = prior.get(asin, {})
                prev_count = prev.get("review_count", 0) or 0
                prev_neg = prev.get("neg_count", 0) or 0
                prev_rating = prev.get("avg_rating") or 0
                curr_count = row["review_count"] or 0
                curr_neg = row["neg_count"] or 0
                curr_rating = float(row["avg_rating"] or 0)
                curr_neg_pct = round((curr_neg / curr_count * 100), 1) if curr_count else 0
                prev_neg_pct = round((prev_neg / prev_count * 100), 1) if prev_count else 0
                ai = ai_rows.get(asin, {})
                result.append({
                    "asin": asin,
                    "product_name": row["product_name"],
                    "avg_rating": curr_rating,
                    "review_count": curr_count,
                    "neg_pct": curr_neg_pct,
                    "delta_reviews": curr_count - prev_count,
                    "delta_rating": round(curr_rating - float(prev_rating), 1),
                    "delta_neg_pct": round(curr_neg_pct - prev_neg_pct, 1),
                    "ai_issues": json.loads(ai.get("issues") or "[]"),
                    "ai_positives": json.loads(ai.get("positives") or "[]"),
                    "ai_generated_at": str(ai["generated_at"]) if ai.get("generated_at") else None,
                })

        return sorted(result, key=lambda x: -x["review_count"])
    finally:
        conn.close()


# ── Generate AI summaries (called by pipeline) ────────────────────────────────

@app.post("/api/summary/generate")
def generate_summaries(product: Optional[str] = None, category: Optional[str] = None):
    import openai, textwrap
    openai.api_key = os.getenv("OPENAI_API_KEY")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, params = product_filter_sql(products)

            cur.execute(f"""
                SELECT r.asin, MAX(r.product_name) as product_name,
                    GROUP_CONCAT(r.review ORDER BY r.scrape_date DESC SEPARATOR ' ||| ') as reviews
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {pf_sql}
                GROUP BY r.asin
            """, params)
            asin_rows = cur.fetchall()

        for row in asin_rows:
            sample = " ||| ".join(row["reviews"].split(" ||| ")[:60]) if row["reviews"] else ""
            prompt = textwrap.dedent(f"""
                You are a product analyst. Analyse these Amazon.in customer reviews for "{row['product_name']}".
                Reviews (sample): {sample[:4000]}

                Return ONLY valid JSON in this exact format, no other text:
                {{
                  "issues": ["issue 1 with specific detail", "issue 2", "issue 3"],
                  "positives": ["positive 1 with specific detail", "positive 2", "positive 3"]
                }}
                Each point should be 1 concise sentence with a specific insight. Max 3 points each.
            """)

            try:
                resp = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=400,
                    temperature=0.3,
                )
                raw = resp.choices[0].message.content.strip()
                parsed = json.loads(raw.replace("```json", "").replace("```", "").strip())
                issues = json.dumps(parsed.get("issues", []))
                positives = json.dumps(parsed.get("positives", []))
            except Exception as e:
                issues = json.dumps([f"Error generating summary: {str(e)}"])
                positives = json.dumps([])

            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO product_summaries (asin, issues, positives)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE issues=%s, positives=%s, generated_at=NOW()
                """, (row["asin"], issues, positives, issues, positives))
                conn.commit()

        return {"message": f"Generated summaries for {len(asin_rows)} products"}
    finally:
        conn.close()


# ── Rating Trends — daily review avg + Amazon overall per product ─────────────

@app.get("/api/trends/rating")
def get_rating_trends(
    product: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Returns per-product daily data for the rating trend chart:
      - daily_avg: avg rating from scraped reviews on that day
      - count: number of reviews that day
      - overall: Amazon overall rating from product_ratings_snapshot
      - total_ratings: total Amazon ratings count from snapshot
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            products = resolve_products(product, category)
            pf_sql, base_params = product_filter_sql(products)

            # Daily avg rating — grouped by scrape_date (when we ran the pipeline).
            # The UI date filter is for review dates, not scrape dates, so we ignore it here.
            # This ensures snapshot + review-avg data always shows regardless of filter state.
            cur.execute(f"""
                SELECT
                    r.scrape_date as day,
                    r.product_name,
                    ROUND(AVG(CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))), 2) as daily_avg,
                    COUNT(*) as review_count
                FROM raw_reviews r
                WHERE 1=1 {pf_sql}
                GROUP BY r.scrape_date, r.product_name
                ORDER BY r.scrape_date
            """, base_params)
            daily_rows = cur.fetchall()

            # Amazon overall ratings — join on ASIN so product_name mismatches don't matter
            # ASIN_MAP is loaded at startup: {asin: {product_name, category}}
            # Build asin→product_name from the global map, filtered to active products
            asin_to_prod = {asin: info["product_name"] for asin, info in ASIN_MAP.items()
                            if products is None or info["product_name"] in products}

            # Snapshot query — no date filter, always return all historical snapshots
            asin_list = list(asin_to_prod.keys())
            if asin_list:
                asin_ph = ",".join(["%s"] * len(asin_list))
                asin_filter = f" AND s.asin IN ({asin_ph})"
            else:
                asin_filter = ""

            cur.execute(f"""
                SELECT
                    s.scraped_date  AS day,
                    s.asin,
                    s.overall_rating,
                    s.total_ratings
                FROM product_ratings_snapshot s
                WHERE 1=1
                  {asin_filter}
                ORDER BY s.scraped_date
            """, asin_list)
            snap_rows_raw = cur.fetchall()

            # Map asin → product_name using ASIN_MAP (reliable, no string-matching)
            snap_rows = [
                {
                    "day":            row["day"],
                    "product_name":   ASIN_MAP.get(row["asin"], {}).get("product_name", row["asin"]),
                    "overall_rating": row["overall_rating"],
                    "total_ratings":  row["total_ratings"],
                }
                for row in snap_rows_raw
            ]

        # Build snapshot lookup: {product_name: {day_str: {overall, total_ratings}}}
        snap_lookup = defaultdict(dict)
        for row in snap_rows:
            d = str(row["day"])
            snap_lookup[row["product_name"]][d] = {
                "overall":       float(row["overall_rating"]) if row["overall_rating"] else None,
                "total_ratings": int(row["total_ratings"])    if row["total_ratings"]   else None,
            }

        # Collect ALL days from both reviews and snapshots
        all_days = set()
        for row in daily_rows:
            all_days.add(str(row["day"]))
        for p_snaps in snap_lookup.values():
            all_days.update(p_snaps.keys())
        sorted_days = sorted(all_days)

        # Raw review data per product per day
        product_daily = defaultdict(dict)
        for row in daily_rows:
            d = str(row["day"])
            product_daily[row["product_name"]][d] = {
                "daily_avg": float(row["daily_avg"]) if row["daily_avg"] else None,
                "count":     int(row["review_count"]),
            }

        # Full product list
        all_product_names = sorted(set(product_daily.keys()) | set(snap_lookup.keys()))
        if products:
            all_product_names = [p for p in all_product_names if p in products]

        # Forward-fill overall rating per product across all days
        product_series = {}
        for p in all_product_names:
            series = []
            last_overall       = None
            last_total_ratings = None
            for d in sorted_days:
                snap = snap_lookup.get(p, {}).get(d)
                if snap:
                    if snap["overall"]       is not None: last_overall       = snap["overall"]
                    if snap["total_ratings"] is not None: last_total_ratings = snap["total_ratings"]
                rev = product_daily.get(p, {}).get(d, {})
                series.append({
                    "day":           d,
                    "daily_avg":     rev.get("daily_avg"),
                    "count":         rev.get("count", 0),
                    "overall":       last_overall,
                    "total_ratings": last_total_ratings,
                })
            product_series[p] = series

        result = []
        for i, d in enumerate(sorted_days):
            result.append({
                "day": d,
                "products": {p: product_series[p][i] for p in all_product_names},
            })

        return {
            "days":     result,
            "products": all_product_names,
        }
    finally:
        conn.close()


# ── Stub endpoints — silence 404s from older frontend versions ────────────────
# These endpoints are called by an older build and can be safely ignored.

@app.get("/api/health-score")
def stub_health_score(): return {}

@app.get("/api/trend")
def stub_trend(): return []

@app.get("/api/pulse")
def stub_pulse(): return {}

@app.get("/api/anomalies")
def stub_anomalies(): return []

@app.get("/api/channels")
def stub_channels(): return []

@app.get("/api/products")
def stub_products(): return []

@app.get("/api/resolution-journey")
def stub_resolution_journey(): return []

@app.get("/api/voc-mismatch")
def stub_voc_mismatch(): return []

@app.get("/api/resolution-codes")
def stub_resolution_codes(): return []

@app.get("/api/firmware-risk")
def stub_firmware_risk(): return []

@app.get("/api/heatmap")
def stub_heatmap(): return []

@app.get("/api/pipeline-status")
def stub_pipeline_status(): return {}

@app.get("/api/replacements")
def stub_replacements(): return []
