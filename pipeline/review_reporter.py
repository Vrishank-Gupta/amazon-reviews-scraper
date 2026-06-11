import argparse
import csv
import io
import json
import os
import smtplib
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from html import escape

import pymysql
import pymysql.cursors

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()


DEFAULT_TO = "vrishank.gupta@heroelectronix.com"
DEFAULT_CATEGORIES = ["Camera"]
CATEGORY_ALIASES = {
    "cameras": "Camera",
    "camera": "Camera",
    "dashcams": "Dashcam",
    "dashcam": "Dashcam",
    "vdbs": "VDB",
    "vdb": "VDB",
    "locks": "Locks",
    "lock": "Locks",
    "tracker": "Auto",
    "trackers": "Auto",
    "auto": "Auto",
}
CATEGORY_LABELS = {
    "Camera": "Cameras",
    "Dashcam": "Dashcams",
    "VDB": "VDBs",
    "Locks": "Locks",
    "Auto": "Tracker",
}


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def parse_categories(value):
    if not value:
        return list(DEFAULT_CATEGORIES)
    parts = [part.strip() for part in value.split(",") if part.strip()]
    categories = []
    for part in parts:
        canonical = CATEGORY_ALIASES.get(part.lower(), part)
        if canonical not in categories:
            categories.append(canonical)
    return categories or list(DEFAULT_CATEGORIES)


def parse_json(value):
    try:
        return json.loads(value or "[]")
    except Exception:
        return []


def percent(num, den):
    return round(num / den * 100, 1) if den else 0


def html(value):
    return escape(str(value or ""))


def short_text(value, limit=230):
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "..."


def color_for_rating(value):
    return "#b91c1c" if value < 3 else "#d97706" if value < 4 else "#15803d"


def color_for_negative(value):
    return "#b91c1c" if value >= 70 else "#d97706" if value >= 40 else "#15803d"


def category_label(category):
    return CATEGORY_LABELS.get(category, category)


def clean_set_name(row):
    label = (row.get("variant_label") or "").strip()
    product = (row.get("product_name") or "").strip()
    source = label or product
    low = source.lower()

    if "baby" in low:
        return "Baby Monitor"
    if "outdoor" in low or "bullet" in low:
        return "Outdoor 3MP Bullet"
    if "4mp ultra" in low:
        return "4MP Ultra 2K"
    if "4mp 360" in low or "360 pro 4mp" in low or "smart cam 360 pro" in low:
        return "Smart Cam 360 Pro 4MP"
    if "pack of 2" in low and "3mp" in low:
        return "3MP Pack of 2"
    if "3mp 2026" in low:
        return "3MP 2026"
    if "smart 360" in low and "3mp" in low:
        return "Smart 360 3MP"
    if "dashcam pro x" in low:
        return "Dashcam Pro X"
    if "dashcam pro" in low:
        return "Dashcam Pro"
    if "dashcam" in low:
        return "Dashcam"
    if "smart video doorbell" in low or "vdb" in low or "doorbell" in low:
        return "Video Doorbell"
    if "lock" in low:
        return "Smart Lock"
    if "gps" in low or "tracker" in low:
        return "Tracker"
    if label:
        return label[:48]
    return product[:48] or "Unknown set"


def fetch_report_rows(categories, start_date, end_date):
    date_sql = "STR_TO_DATE(REGEXP_REPLACE(r.review_date, 'Reviewed in India on ', ''), '%%d %%M %%Y')"
    rating_sql = "CAST(SUBSTRING_INDEX(r.rating, ' ', 1) AS DECIMAL(3,1))"
    placeholders = ",".join(["%s"] * len(categories))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    r.review_id, r.asin, r.variant_asin, r.variant_label, r.variant_dimension,
                    r.product_name, r.category, r.rating, {rating_sql} AS rating_num,
                    r.title, r.review, r.review_date, r.review_url, r.scrape_date,
                    DATE_FORMAT({date_sql}, '%%Y-%%m-%%d') AS parsed_date,
                    t.sentiment, t.primary_categories, t.sub_tags
                FROM raw_reviews r
                LEFT JOIN review_tags t ON r.review_id = t.review_id
                WHERE r.category IN ({placeholders})
                  AND {date_sql} BETWEEN %s AND %s
                ORDER BY r.category, {date_sql} DESC, r.product_name
                """,
                [*categories, start_date, end_date],
            )
            rows = cur.fetchall()

            cur.execute(
                """
                SELECT s.product_name, s.asin, s.overall_rating, s.total_ratings, s.scraped_date
                FROM product_ratings_snapshot s
                JOIN (
                    SELECT asin, MAX(scraped_date) scraped_date
                    FROM product_ratings_snapshot
                    GROUP BY asin
                ) latest ON latest.asin = s.asin AND latest.scraped_date = s.scraped_date
                """
            )
            snapshots = cur.fetchall()

    for row in rows:
        row["rating_num"] = float(row.get("rating_num") or 0)
        row["primary_categories"] = parse_json(row.get("primary_categories"))
        row["sub_tags"] = parse_json(row.get("sub_tags"))
        row["set_name"] = clean_set_name(row)
    return rows, snapshots


def summarize_group(rows):
    total = len(rows)
    rating_dist = {star: sum(1 for row in rows if round(row["rating_num"]) == star) for star in range(1, 6)}
    sentiment = {
        name: sum(1 for row in rows if row.get("sentiment") == name)
        for name in ["Positive", "Neutral", "Negative"]
    }
    primary = Counter()
    primary_sent = defaultdict(Counter)
    sub_tags = Counter()
    sub_sent = defaultdict(Counter)
    for row in rows:
        sent = row.get("sentiment") or "Unknown"
        for theme in row["primary_categories"]:
            primary[theme] += 1
            primary_sent[theme][sent] += 1
        for tag in row["sub_tags"]:
            sub_tags[tag] += 1
            sub_sent[tag][sent] += 1
    return {
        "reviews": total,
        "avg_rating": round(sum(row["rating_num"] for row in rows) / total, 2) if total else 0,
        "rating_dist": rating_dist,
        "sentiment": sentiment,
        "negative_pct": percent(sentiment["Negative"], total),
        "bad_pct": percent(rating_dist[1] + rating_dist[2], total),
        "primary": primary,
        "primary_sent": primary_sent,
        "sub_tags": sub_tags,
        "sub_sent": sub_sent,
    }


def summarize_sets(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row["category"], row["set_name"])].append(row)

    summaries = []
    for (category, set_name), items in grouped.items():
        summary = summarize_group(items)
        neg_theme_parts = []
        for theme, count in summary["primary"].most_common(5):
            negative = summary["primary_sent"][theme]["Negative"]
            if negative:
                neg_theme_parts.append(f"{theme}: {count} mentions, {negative} negative")
            else:
                neg_theme_parts.append(f"{theme}: {count} mentions")

        positive_parts = []
        for tag, _ in summary["sub_tags"].most_common(12):
            positive = summary["sub_sent"][tag]["Positive"]
            if positive:
                positive_parts.append(f"{tag}: {positive} positive")
            if len(positive_parts) >= 4:
                break

        examples = sorted(
            [
                row for row in items
                if row.get("sentiment") == "Negative" and (row.get("review") or row.get("title"))
            ],
            key=lambda row: len((row.get("review") or "") + (row.get("title") or "")),
            reverse=True,
        )
        example = None
        if examples:
            row = examples[0]
            example = {
                "rating": row["rating_num"],
                "date": row.get("parsed_date"),
                "text": short_text(f"{row.get('title') or ''} {row.get('review') or ''}", 260),
            }

        summaries.append({
            "category": category,
            "category_label": category_label(category),
            "set": set_name,
            "summary": summary,
            "negative_themes": neg_theme_parts,
            "positive_notes": positive_parts,
            "example": example,
        })

    return sorted(
        summaries,
        key=lambda item: (
            item["category_label"],
            -item["summary"]["reviews"],
            -item["summary"]["negative_pct"],
        ),
    )


def make_csv(rows):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=[
        "review_id", "review_date", "scrape_date", "category", "set_name",
        "product_name", "asin", "variant_asin", "rating", "rating_num",
        "sentiment", "primary_categories", "sub_tags", "title", "review", "review_url",
    ])
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "review_id": row.get("review_id"),
            "review_date": row.get("parsed_date"),
            "scrape_date": row.get("scrape_date"),
            "category": category_label(row.get("category")),
            "set_name": row.get("set_name"),
            "product_name": row.get("product_name"),
            "asin": row.get("asin"),
            "variant_asin": row.get("variant_asin"),
            "rating": row.get("rating"),
            "rating_num": row.get("rating_num"),
            "sentiment": row.get("sentiment"),
            "primary_categories": "; ".join(row.get("primary_categories") or []),
            "sub_tags": "; ".join(row.get("sub_tags") or []),
            "title": row.get("title"),
            "review": row.get("review"),
            "review_url": row.get("review_url"),
        })
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def render_table_header(columns):
    return "".join(
        f'<th align="{align}" style="padding:10px;background:#f8fafc;color:#64748b;'
        f'text-transform:uppercase;font-size:11px;letter-spacing:.06em;border-bottom:1px solid #e5e7eb">{html(label)}</th>'
        for label, align in columns
    )


def render_email(rows, snapshots, categories, start_date, end_date, report_date):
    overall = summarize_group(rows)
    set_summaries = summarize_sets(rows)
    category_groups = defaultdict(list)
    for row in rows:
        category_groups[row["category"]].append(row)

    latest_review_date = max((row.get("parsed_date") for row in rows if row.get("parsed_date")), default=end_date)
    earliest_review_date = min((row.get("parsed_date") for row in rows if row.get("parsed_date")), default=start_date)
    last_scraped = max((str(row.get("scrape_date")) for row in rows if row.get("scrape_date")), default="not available")
    category_title = ", ".join(category_label(category) for category in categories)

    category_rows = ""
    for category in categories:
        cat_rows = category_groups.get(category, [])
        if not cat_rows:
            category_rows += (
                f'<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:700">'
                f'{html(category_label(category))}</td><td colspan="5" style="padding:10px;border-bottom:1px solid #e5e7eb;color:#64748b">'
                f'No reviews found in this report window.</td></tr>'
            )
            continue
        summary = summarize_group(cat_rows)
        themes = "<br>".join(
            html(f"{theme}: {count} mentions, {summary['primary_sent'][theme]['Negative']} negative")
            for theme, count in summary["primary"].most_common(3)
        )
        category_rows += f"""
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:#111827">{html(category_label(category))}</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb">{summary['reviews']}</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:{color_for_rating(summary['avg_rating'])}">{summary['avg_rating']}★</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb">{summary['rating_dist'][1] + summary['rating_dist'][2]}</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:{color_for_negative(summary['negative_pct'])}">{summary['negative_pct']}%</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#334155;line-height:1.4">{themes or 'No dominant tagged theme'}</td>
        </tr>
        """

    set_rows = ""
    for item in set_summaries:
        summary = item["summary"]
        themes = "<br>".join(html(text) for text in item["negative_themes"][:3]) or '<span style="color:#94a3b8">No dominant tagged theme</span>'
        positives = "<br>".join(html(text) for text in item["positive_notes"][:2]) or '<span style="color:#94a3b8">Limited positive notes in this window</span>'
        set_rows += f"""
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#64748b;font-weight:700">{html(item['category_label'])}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:#111827">{html(item['set'])}</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb">{summary['reviews']}</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:{color_for_rating(summary['avg_rating'])}">{summary['avg_rating']}★</td>
          <td align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:800;color:{color_for_negative(summary['negative_pct'])}">{summary['negative_pct']}%</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#334155;line-height:1.4">{themes}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#334155;line-height:1.4">{positives}</td>
        </tr>
        """

    detail_blocks = ""
    for item in set_summaries[:18]:
        summary = item["summary"]
        dist = " · ".join(f"{star}★ {summary['rating_dist'][star]}" for star in range(1, 6))
        negative_items = "".join(f"<li>{html(text)}</li>" for text in item["negative_themes"][:5]) or "<li>No dominant tagged theme in this window.</li>"
        positive_items = "".join(f"<li>{html(text)}</li>" for text in item["positive_notes"][:4]) or "<li>Limited positive theme volume in this window.</li>"
        example = ""
        if item["example"]:
            ex = item["example"]
            example = f"""
            <div style="margin-top:8px;background:#f8fafc;border-left:4px solid #94a3b8;border-radius:8px;padding:9px 11px">
              <div style="font-size:12px;color:#64748b;font-weight:700">Example customer wording · {ex['rating']:.0f}★ · {html(ex['date'])}</div>
              <div style="font-size:13px;color:#334155;line-height:1.45;margin-top:4px">“{html(ex['text'])}”</div>
            </div>
            """
        detail_blocks += f"""
        <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin:10px 0;background:#ffffff">
          <div style="font-size:12px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.06em">{html(item['category_label'])}</div>
          <div style="font-size:16px;font-weight:800;color:#111827;margin-top:3px">{html(item['set'])}</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">{summary['reviews']} reviews · 30-day avg {summary['avg_rating']}★ · {summary['negative_pct']}% tagged negative · Rating mix: {html(dist)}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px"><tr>
            <td valign="top" style="width:50%;padding-right:10px"><div style="font-size:12px;font-weight:800;color:#b91c1c;margin-bottom:4px">What customers are highlighting</div><ul style="margin:0;padding-left:17px;color:#334155;font-size:13px;line-height:1.45">{negative_items}</ul></td>
            <td valign="top" style="width:50%;padding-left:10px"><div style="font-size:12px;font-weight:800;color:#15803d;margin-bottom:4px">Positive notes in same window</div><ul style="margin:0;padding-left:17px;color:#334155;font-size:13px;line-height:1.45">{positive_items}</ul></td>
          </tr></table>
          {example}
        </div>
        """

    theme_rows = ""
    for theme, count in overall["primary"].most_common(10):
        theme_rows += f"""
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827">{html(theme)}</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb">{count}</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-weight:700">{overall['primary_sent'][theme]['Negative']}</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#15803d;font-weight:700">{overall['primary_sent'][theme]['Positive']}</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#d97706;font-weight:700">{overall['primary_sent'][theme]['Neutral']}</td>
        </tr>
        """

    snapshot_rows = ""
    product_names = {row.get("product_name") for row in rows}
    seen_snapshots = set()
    for snap in snapshots:
        if snap.get("product_name") not in product_names:
            continue
        set_name = clean_set_name({"product_name": snap.get("product_name")})
        key = (set_name, snap.get("asin"))
        if key in seen_snapshots:
            continue
        seen_snapshots.add(key)
        rating = float(snap["overall_rating"]) if snap.get("overall_rating") is not None else None
        total_ratings = int(snap["total_ratings"]) if snap.get("total_ratings") is not None else 0
        snapshot_rows += f"""
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827">{html(set_name)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#64748b">{html(snap.get('asin'))}</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;font-weight:800">{rating if rating is not None else '-'}★</td>
          <td align="right" style="padding:9px 10px;border-bottom:1px solid #e5e7eb">{total_ratings:,}</td>
        </tr>
        """

    rating_bar = "".join(
        f'<td style="width:{max(2, percent(overall["rating_dist"][star], overall["reviews"]))}%;background:'
        f'{"#b91c1c" if star <= 2 else "#d97706" if star == 3 else "#15803d"};height:11px"></td>'
        for star in range(1, 6)
    )
    rating_legend = " &nbsp; ".join(
        f'<span>{star}★: <b>{overall["rating_dist"][star]}</b></span>'
        for star in range(1, 6)
    )

    subject = f"{category_title} Reviews | Last 30 days ({start_date} to {end_date}) | {overall['reviews']} reviews"
    html_body = f"""<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <div style="display:none;max-height:0;overflow:hidden">{category_title} reviews report for {start_date} to {end_date}: {overall['reviews']} reviews.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="880" cellspacing="0" cellpadding="0" style="max-width:880px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb">
      <tr><td style="background:#111827;padding:24px 30px;color:#ffffff">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#93c5fd;font-weight:800">Amazon customer reviews report</div>
        <div style="font-size:26px;font-weight:800;line-height:1.15;margin-top:8px">{html(category_title)} reviews · last 30 days</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:10px">Report date: {report_date} · Review posted dates: {start_date} to {end_date} · Production data last scraped: {html(last_scraped)}</div>
      </td></tr>
      <tr><td style="padding:18px 28px 4px 28px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:14px 0"><tr>
          <td style="width:25%;padding:7px"><div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px;background:#fff"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Reviews in report</div><div style="font-size:28px;font-weight:800;color:#111827">{overall['reviews']}</div><div style="font-size:12px;color:#64748b">posted {html(earliest_review_date)} to {html(latest_review_date)}</div></div></td>
          <td style="width:25%;padding:7px"><div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px;background:#fff"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">30-day review avg</div><div style="font-size:28px;font-weight:800;color:{color_for_rating(overall['avg_rating'])}">{overall['avg_rating']}★</div><div style="font-size:12px;color:#64748b">only reviews in this report</div></div></td>
          <td style="width:25%;padding:7px"><div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px;background:#fff"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">1-2★ reviews</div><div style="font-size:28px;font-weight:800;color:#b91c1c">{overall['rating_dist'][1] + overall['rating_dist'][2]}</div><div style="font-size:12px;color:#64748b">{overall['bad_pct']}% of report reviews</div></div></td>
          <td style="width:25%;padding:7px"><div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px;background:#fff"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Tagged negative</div><div style="font-size:28px;font-weight:800;color:#b91c1c">{overall['sentiment']['Negative']}</div><div style="font-size:12px;color:#64748b">{overall['negative_pct']}% of report reviews</div></div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 36px 18px 36px">
        <div style="font-size:13px;color:#334155;line-height:1.55;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px">
          <b>How to read this report:</b> “30-day review avg” and all set-wise ratings below are calculated only from Amazon reviews posted between {start_date} and {end_date}. “Amazon listing snapshot” is the broader product-page rating displayed on Amazon during the latest scrape and is shown separately for context.
        </div>
      </td></tr>
      <tr><td style="padding:0 36px 22px 36px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:4px 0"><tr>{rating_bar}</tr></table>
        <div style="font-size:12px;color:#64748b;line-height:1.6">30-day rating distribution: {rating_legend}</div>
      </td></tr>
      <tr><td style="padding:0 36px 24px 36px">
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">Category summary</div>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px">
          <tr>{render_table_header([('Category', 'left'), ('Reviews', 'right'), ('30-day avg', 'right'), ('1-2★', 'right'), ('Neg %', 'right'), ('Most mentioned themes', 'left')])}</tr>
          {category_rows}
        </table>
      </td></tr>
      <tr><td style="padding:0 36px 24px 36px">
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">Set-wise review themes</div>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px">
          <tr>{render_table_header([('Category', 'left'), ('Set / model', 'left'), ('Reviews', 'right'), ('Avg', 'right'), ('Neg %', 'right'), ('Themes customers mention', 'left'), ('Positive notes', 'left')])}</tr>
          {set_rows}
        </table>
      </td></tr>
      <tr><td style="padding:0 36px 24px 36px">
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">Model-level detail</div>
        {detail_blocks}
      </td></tr>
      <tr><td style="padding:0 36px 24px 36px">
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">Theme concentration across all included reviews</div>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px">
          <tr>{render_table_header([('Theme', 'left'), ('Mentions', 'right'), ('Negative', 'right'), ('Positive', 'right'), ('Neutral', 'right')])}</tr>
          {theme_rows}
        </table>
      </td></tr>
      <tr><td style="padding:0 36px 24px 36px">
        <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:8px">Amazon listing snapshot for context</div>
        <div style="font-size:13px;color:#334155;line-height:1.55;margin-bottom:8px">These are Amazon product-page ratings from the latest listing scrape. They are separate from the 30-day review metrics above.</div>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px">
          <tr>{render_table_header([('Listing / set', 'left'), ('ASIN', 'left'), ('Amazon rating', 'right'), ('Total ratings', 'right')])}</tr>
          {snapshot_rows or '<tr><td colspan="4" style="padding:10px;color:#64748b">No listing snapshots found for included products.</td></tr>'}
        </table>
      </td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:14px 30px;font-size:12px;color:#64748b;line-height:1.5">
        CSV attached: all {overall['reviews']} reviews used in this report, including rating, tagged sentiment, themes, sub-tags, review text and review URL.
      </td></tr>
    </table></td></tr></table></body></html>"""

    plain_body = (
        f"{category_title} reviews - last 30 days\n"
        f"Report date: {report_date}\n"
        f"Review posted dates: {start_date} to {end_date}\n"
        f"Reviews: {overall['reviews']}\n"
        f"30-day review average: {overall['avg_rating']} stars\n"
        f"1-2 star reviews: {overall['rating_dist'][1] + overall['rating_dist'][2]} ({overall['bad_pct']}%)\n"
        f"Tagged negative reviews: {overall['sentiment']['Negative']} ({overall['negative_pct']}%)\n\n"
        "CSV attached with all referenced reviews.\n"
    )
    return subject, plain_body, html_body


def send_email(to_email, subject, plain_body, html_body, attachment_bytes, attachment_name):
    sender = os.getenv("SMTP_SENDER", "")
    sender_name = os.getenv("SMTP_SENDER_NAME", "")
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = formataddr((sender_name, sender)) if sender_name else sender
    msg["To"] = to_email

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    attachment = MIMEBase("text", "csv")
    attachment.set_payload(attachment_bytes)
    encoders.encode_base64(attachment)
    attachment.add_header("Content-Disposition", "attachment", filename=attachment_name)
    attachment.add_header("Content-Type", "text/csv; charset=utf-8")
    msg.attach(attachment)

    with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT", "587")), timeout=30) as server:
        server.starttls()
        server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD"))
        server.sendmail(sender, [to_email], msg.as_string())


def send_review_report(categories=None, to_email=None, days=None, end_date=None):
    categories = categories or parse_categories(os.getenv("REVIEW_REPORT_CATEGORIES", "Camera"))
    to_email = to_email or os.getenv("REVIEW_REPORT_TO", DEFAULT_TO)
    days = int(days or os.getenv("REVIEW_REPORT_DAYS", "30"))
    end = datetime.fromisoformat(end_date).date() if end_date else date.today()
    start = end - timedelta(days=days)
    start_s = start.isoformat()
    end_s = end.isoformat()
    report_date = end_s

    rows, snapshots = fetch_report_rows(categories, start_s, end_s)
    if not rows:
        return {"sent": False, "reason": "No reviews found", "categories": categories, "start": start_s, "end": end_s}

    subject, plain_body, html_body = render_email(rows, snapshots, categories, start_s, end_s, report_date)
    attachment = make_csv(rows)
    safe_categories = "_".join(category_label(category).lower().replace(" ", "_") for category in categories)
    attachment_name = f"reviews_{safe_categories}_{start_s}_to_{end_s}.csv"
    send_email(to_email, subject, plain_body, html_body, attachment, attachment_name)
    return {
        "sent": True,
        "to": to_email,
        "subject": subject,
        "attachment": attachment_name,
        "reviews": len(rows),
        "categories": categories,
        "start": start_s,
        "end": end_s,
    }


def main():
    parser = argparse.ArgumentParser(description="Send executive Amazon review report email.")
    parser.add_argument("--categories", default=os.getenv("REVIEW_REPORT_CATEGORIES", "Camera"))
    parser.add_argument("--to", default=os.getenv("REVIEW_REPORT_TO", DEFAULT_TO))
    parser.add_argument("--days", type=int, default=int(os.getenv("REVIEW_REPORT_DAYS", "30")))
    parser.add_argument("--end-date", default=os.getenv("REVIEW_REPORT_END_DATE", ""))
    args = parser.parse_args()

    result = send_review_report(
        categories=parse_categories(args.categories),
        to_email=args.to,
        days=args.days,
        end_date=args.end_date or None,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
