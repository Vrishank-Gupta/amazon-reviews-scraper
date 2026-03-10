from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymysql
import pymysql.cursors
import json
import subprocess
import os
from typing import Optional
from dotenv import load_dotenv
from collections import defaultdict

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


# ── Reviews ──────────────────────────────────────────────────────────────────

@app.get("/api/reviews")
def get_reviews(
    category: Optional[str] = None,
    sentiment: Optional[str] = None,
    rating: Optional[str] = None,
    product: Optional[str] = None,
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            query = """
                SELECT
                    r.review_id,
                    r.asin,
                    r.product_name,
                    r.rating,
                    r.review,
                    r.review_url,
                    r.scrape_date,
                    t.sentiment,
                    t.primary_categories,
                    t.sub_tags
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1
            """
            params = []

            if sentiment:
                sentiments = sentiment.split(",")
                placeholders = ",".join(["%s"] * len(sentiments))
                query += f" AND t.sentiment IN ({placeholders})"
                params.extend(sentiments)

            if rating:
                ratings = [int(r) for r in rating.split(",")]
                placeholders = ",".join(["%s"] * len(ratings))
                query += f" AND r.rating IN ({placeholders})"
                params.extend(ratings)

            if product:
                products = product.split("|||")
                placeholders = ",".join(["%s"] * len(products))
                query += f" AND r.product_name IN ({placeholders})"
                params.extend(products)

            cur.execute(query, params)
            rows = cur.fetchall()

        result = []
        for row in rows:
            row["primary_categories"] = json.loads(row["primary_categories"] or "[]")
            row["sub_tags"] = json.loads(row["sub_tags"] or "[]")
            if category and category != "All":
                if category not in row["primary_categories"]:
                    continue
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
            products = [r["product_name"] for r in cur.fetchall()]

            cur.execute("SELECT DISTINCT rating FROM raw_reviews WHERE rating IS NOT NULL ORDER BY rating")
            ratings = [r["rating"] for r in cur.fetchall()]

            cur.execute("SELECT primary_categories FROM review_tags")
            rows = cur.fetchall()

        all_cats = set()
        for row in rows:
            cats = json.loads(row["primary_categories"] or "[]")
            all_cats.update(cats)

        return {
            "products": products,
            "ratings": ratings,
            "categories": sorted(all_cats),
        }
    finally:
        conn.close()


# ── Pipeline ──────────────────────────────────────────────────────────────────

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


@app.post("/api/pipeline/run")
def run_pipeline():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM pipeline_runs WHERE id = 1")
            row = cur.fetchone()
        if row and row["status"] == "RUNNING":
            raise HTTPException(status_code=409, detail="Pipeline already running")
    finally:
        conn.close()

    # project root is one level above backend/
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    start_script = os.path.join(project_root, "pipeline", "start_pipeline.py")

    subprocess.Popen(
        ["python", start_script],
        cwd=project_root,
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    return {"message": "Pipeline started"}


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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    granularity: Optional[str] = "week",
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            product_filter = ""
            base_params = []
            if product:
                products = product.split("|||")
                placeholders = ",".join(["%s"] * len(products))
                product_filter = f" AND r.product_name IN ({placeholders})"
                base_params.extend(products)

            date_filter = ""
            if date_from:
                date_filter += " AND r.scrape_date >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += " AND r.scrape_date <= %s"
                base_params.append(date_to)

            fmt = "%%Y-%%u" if granularity == "week" else "%%Y-%%m"

            cur.execute(f"""
                SELECT DATE_FORMAT(r.scrape_date, '{fmt}') as period,
                    t.primary_categories, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {product_filter} {date_filter}
                GROUP BY period, t.primary_categories
                ORDER BY period
            """, list(base_params))
            trend_rows = cur.fetchall()

            cur.execute(f"""
                SELECT r.product_name, t.primary_categories, t.sentiment, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {product_filter} {date_filter}
                GROUP BY r.product_name, t.primary_categories, t.sentiment
            """, list(base_params))
            stack_rows = cur.fetchall()

            cur.execute(f"""
                SELECT r.product_name, t.sub_tags, COUNT(*) as count
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {product_filter} {date_filter}
                GROUP BY r.product_name, t.sub_tags
            """, list(base_params))
            subtag_rows = cur.fetchall()

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
        product_sentiment = defaultdict(lambda: defaultdict(int))
        for row in stack_rows:
            cats = json.loads(row["primary_categories"] or "[]")
            for c in cats:
                product_cat[row["product_name"]][c] += row["count"]
            product_sentiment[row["product_name"]][row["sentiment"]] += row["count"]

        stacked_category = [{"product": p, **cats} for p, cats in product_cat.items()]
        stacked_sentiment = [{"product": p, **sents} for p, sents in product_sentiment.items()]

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
        }
    finally:
        conn.close()

# ── Word Cloud ────────────────────────────────────────────────────────────────

@app.get("/api/wordcloud")
def get_wordcloud(
    product: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            base_params = []
            product_filter = ""
            if product:
                products = product.split("|||")
                placeholders = ",".join(["%s"] * len(products))
                product_filter = f" AND r.product_name IN ({placeholders})"
                base_params.extend(products)

            date_filter = ""
            if date_from:
                date_filter += " AND r.scrape_date >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += " AND r.scrape_date <= %s"
                base_params.append(date_to)

            # Fetch sub_tags + sentiment for all matching reviews
            cur.execute(f"""
                SELECT t.sub_tags, t.sentiment
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {product_filter} {date_filter}
            """, list(base_params))
            rows = cur.fetchall()

            # Also fetch primary_categories
            cur.execute(f"""
                SELECT t.primary_categories, t.sentiment
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE 1=1 {product_filter} {date_filter}
            """, list(base_params))
            cat_rows = cur.fetchall()

        from collections import defaultdict

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
        return result[:80]  # top 80 tags
    finally:
        conn.close()

# ── Reviews by keyword (for word cloud drill-down) ────────────────────────────

@app.get("/api/reviews/by-keyword")
def get_reviews_by_keyword(
    keyword: str,
    product: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Returns all reviews tagged with a given keyword (sub_tag or primary_category),
    ignoring sentiment/rating sidebar filters — so word cloud counts always match.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            base_params = [f'%"{keyword}"%', f'%"{keyword}"%']
            product_filter = ""
            if product:
                products = product.split("|||")
                placeholders = ",".join(["%s"] * len(products))
                product_filter = f" AND r.product_name IN ({placeholders})"
                base_params.extend(products)

            date_filter = ""
            if date_from:
                date_filter += " AND r.scrape_date >= %s"
                base_params.append(date_from)
            if date_to:
                date_filter += " AND r.scrape_date <= %s"
                base_params.append(date_to)

            cur.execute(f"""
                SELECT
                    r.review_id, r.asin, r.product_name, r.rating,
                    r.title, r.review, r.review_date, r.review_url, r.scrape_date,
                    t.sentiment, t.primary_categories, t.sub_tags
                FROM raw_reviews r
                JOIN review_tags t ON r.review_id = t.review_id
                WHERE (t.sub_tags LIKE %s OR t.primary_categories LIKE %s)
                {product_filter} {date_filter}
                ORDER BY r.scrape_date DESC
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