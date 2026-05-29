"""
self_tag_reviews.py

Local deterministic review tagger. It does not call OpenAI or any external API.
It assigns sentiment/categories/sub_tags from rating, title, review text, product
type, and explicit keyword rules mapped to the existing taxonomy.

Run:
  python pipeline/self_tag_reviews.py --dry-run
  python pipeline/self_tag_reviews.py --apply
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

import pymysql

from utils.taxonomy import TAXONOMY

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

TAG_TO_CATEGORIES = defaultdict(list)
for category, tags in TAXONOMY.items():
    for tag in tags:
        TAG_TO_CATEGORIES[tag].append(category)

NEGATIVE_ONLY_CATEGORIES = {"False / Excessive Alerts"}


def norm(text):
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def star_num(rating):
    try:
        return int(round(float(str(rating).split()[0])))
    except Exception:
        return None


def is_dashcam(product):
    product = norm(product)
    return any(token in product for token in ["dashcam", "starvis", "front", "rear", "3 channel", "4k", "2.7k"])


def is_home_camera(product):
    product = norm(product)
    return any(token in product for token in ["camera", "cam", "3mp", "4mp", "ptz", "bullet", "360"]) and not is_dashcam(product)


def has_any(text, patterns):
    return any(pattern in text for pattern in patterns)


def add(found, tag):
    for category in TAG_TO_CATEGORIES.get(tag, []):
        found[category].append(tag)


NEGATIVE_TEXT = [
    "worst", "waste", "bad", "poor", "not working", "does not work", "doesn't work", "stopped working",
    "not detecting", "not connecting", "unable", "return", "refund", "replacement", "defective", "faulty",
    "broken", "damaged", "issue", "problem", "pathetic", "useless", "disappointed", "avoid", "fake",
]
POSITIVE_TEXT = [
    "good", "great", "excellent", "best", "satisfied", "happy", "worth", "value for money",
    "clear", "easy", "smooth", "working well", "works well", "reliable", "recommended", "perfect",
]


RULES = [
    ("Video Quality — Daytime", "Blurry or low resolution", ["blurry", "blur", "low resolution", "not clear", "unclear", "poor clarity", "quality is poor", "video is not clear"]),
    ("Video Quality — Daytime", "Faces or number plates not readable", ["face not", "faces not", "number plate not", "number plates not", "plate not readable", "cannot read", "can't record number plate", "cannot record number plate"]),
    ("Video Quality — Daytime", "Clear and sharp daytime footage", ["clear video", "video clear", "video quality", "camera quality", "sharp", "crisp", "day video", "daytime", "picture quality good"]),
    ("Video Quality — Daytime", "Number plates clearly visible", ["number plate visible", "plates visible", "number plates clear"]),
    ("Video Quality — Daytime", "Wide angle covers full road / room", ["wide angle", "full road", "covers full", "full coverage"]),

    ("Video Quality — Night & Low Light", "Poor night vision", ["poor night", "night vision poor", "night vision is poor", "night not clear", "low light poor"]),
    ("Video Quality — Night & Low Light", "Cannot see faces or details at night", ["cannot see", "can't see", "not visible at night", "faces at night"]),
    ("Video Quality — Night & Low Light", "Excellent night vision", ["excellent night", "night vision clear", "night vision is clear", "clear at night", "night vision good"]),
    ("Video Quality — Night & Low Light", "Clear footage at night (streetlights, signboards visible)", ["night footage", "night recording", "low light clear"]),

    ("Audio Quality", "Speaker too weak or inaudible", ["speaker", "inaudible", "low sound", "sound low", "can't hear", "cannot hear"]),
    ("Audio Quality", "Microphone not picking up sound", ["mic not", "microphone not", "audio not recording", "no audio"]),
    ("Audio Quality", "Good two-way talk audio", ["two way", "2 way", "talk back", "audio clear", "sound clear"]),

    ("App Performance", "App crashes or freezes frequently", ["app crash", "app crashes", "app freeze", "app freezes", "app closes"]),
    ("App Performance", "Live view lags or buffers", ["live view lag", "lag", "buffer", "delay in live"]),
    ("App Performance", "App slow to load", ["app slow", "slow app", "takes time"]),
    ("App Performance", "Footage playback freezes or unavailable", ["playback", "footage unavailable", "video not playing"]),
    ("App Performance", "App smooth and responsive", ["app smooth", "smooth app", "app is good", "responsive app"]),

    ("App Features", "Notifications not working or delayed", ["notification not", "notifications not", "no notification", "alert not received", "delayed notification"]),
    ("App Features", "Recording / timeline navigation confusing", ["timeline", "navigation", "recording confusing"]),
    ("App Features", "Easy footage access and download", ["download", "access footage", "footage easily", "transfer"]),
    ("App Features", "Good notification system", ["notification", "notifications", "alerts on phone", "get notifications"]),
    ("App Features", "Accurate person / motion alerts", ["accurate alert", "accurate person", "person detection", "motion alert", "motion alerts"]),
    ("App Features", "Motion detection well-calibrated", ["motion detection works", "motion detection good", "detects motion"]),

    ("Wi-Fi Setup", "QR code does not scan during setup", ["qr", "scan"]),
    ("Wi-Fi Setup", "Cannot connect to Wi-Fi at all", ["cannot connect", "can't connect", "wifi not connect", "wi-fi not connect", "connection failed"]),
    ("Wi-Fi Setup", "Only supports 2.4GHz — incompatible with Jio / Airtel 5G-only routers", ["2.4", "5g", "5 ghz", "jio", "airtel"]),
    ("Wi-Fi Setup", "Difficult first-time setup", ["setup difficult", "difficult setup", "installation difficult", "complex to connect", "not a plug and play", "plug and play"]),
    ("Wi-Fi Setup", "Quick and easy first-time setup", ["easy setup", "setup easy", "quick setup", "easy to connect"]),

    ("Wi-Fi Stability", "Keeps disconnecting from Wi-Fi randomly", ["disconnect", "offline", "connection lost", "wifi issue", "wi-fi issue"]),
    ("Wi-Fi Stability", "Requires daily manual reset to reconnect", ["reset", "restart router", "manual reset"]),
    ("Wi-Fi Stability", "Stable Wi-Fi connection over months", ["stable wifi", "stable wi-fi", "stable connection", "no disconnect"]),

    ("Hardware Reliability", "Dead on arrival (DOA)", ["dead on arrival", "doa", "not powering", "did not start"]),
    ("Hardware Reliability", "Stopped working within first month", ["stopped working", "stops working", "not working", "dead", "failed"]),
    ("Hardware Reliability", "SD card slot stops detecting card", ["sd card", "memory card"]),
    ("Hardware Reliability", "Camera does not power on", ["power on", "does not turn on", "won't turn on", "not start"]),
    ("Hardware Reliability", "Device restarts or hangs randomly", ["restart", "reboot", "hang", "hangs"]),
    ("Hardware Reliability", "Missing component in box", ["missing", "not in box", "component"]),
    ("Hardware Reliability", "Durable and reliable over months of use", ["reliable", "durable", "working well", "long term"]),

    ("Overheating", "Stops working in Indian summer heat (40°C+)", ["heat", "hot", "summer", "temperature"]),
    ("Overheating", "Dashcam shuts off in direct sunlight", ["sunlight", "shuts off", "shutdown"]),
    ("Overheating", "No overheating issues after long drives", ["no overheating", "handles heat"]),

    ("Recording Reliability", "Recording pauses or stops mid-drive", ["recording stops", "recording stop", "stops recording", "pause recording"]),
    ("Recording Reliability", "Frozen frames in footage", ["frozen", "freeze frame"]),
    ("Recording Reliability", "Loop recording not working", ["loop recording"]),
    ("Recording Reliability", "Footage missing at critical moments", ["missing footage", "footage missing", "not recorded"]),
    ("Recording Reliability", "Continuous recording without drops", ["continuous recording", "records continuously"]),

    ("False / Excessive Alerts", "Alerts triggered constantly with nothing in frame", ["false alert", "false alerts", "nothing in frame"]),
    ("False / Excessive Alerts", "Motion detection too sensitive", ["too sensitive", "motion detection issue", "motion detect problem"]),
    ("False / Excessive Alerts", "False person detection", ["false person", "wrong person detection"]),
    ("False / Excessive Alerts", "Notification spam making phone unusable", ["too many notification", "too many alerts", "notification spam", "alert spam"]),

    ("Customer Support & Service", "No response from support team", ["no response", "support not", "customer care not", "customer support not", "not responding", "worst service", "customer representatives never call"]),
    ("Customer Support & Service", "Support asks for same videos / proof repeatedly with no resolution", ["same video", "proof", "no resolution"]),
    ("Customer Support & Service", "Warranty claim rejected without valid reason", ["warranty", "claim rejected", "warranty rejected"]),
    ("Customer Support & Service", "Refund or replacement refused or delayed", ["refund", "replacement", "replace"]),
    ("Customer Support & Service", "Service centre not available outside metro cities", ["service center", "service centre"]),
    ("Customer Support & Service", "Support resolved issue quickly", ["support resolved", "prompt response", "customer care support", "support is good", "customer service", "service was very good", "great service"]),

    ("Installation Experience", "Hardwire kit not included (extra purchase required)", ["hardwire", "hard wire"]),
    ("Installation Experience", "Installer did not know the product", ["installer did not", "technician did not", "installer not"]),
    ("Installation Experience", "Qubo installation service did not contact / show up", ["installation service did not", "did not contact", "not show", "no installation"]),
    ("Installation Experience", "Easy DIY installation", ["easy install", "easy to install", "diy", "self installation", "hassle free installation"]),
    ("Installation Experience", "Professional and clean installation by Qubo technician", ["professional installation", "clean installation", "technician", "installation person", "installed", "installation was", "installation done", "fix perfect", "fixed perfect"]),
    ("Installation Experience", "Installer punctual and efficient", ["punctual", "on time", "prompt"]),

    ("Windshield Glare", "Reflections and glare visible in footage", ["glare", "reflection", "reflections"]),
    ("Windshield Glare", "Needs CPL filter for usable footage (not included in box)", ["cpl"]),
    ("Windshield Glare", "No glare or reflection issues", ["no glare"]),

    ("Dashcam Features", "No GPS or speed overlay", ["no gps", "speed overlay", "speed not", "gps missing"]),
    ("Dashcam Features", "GPS inaccurate or not updating", ["gps inaccurate", "gps not", "location not"]),
    ("Dashcam Features", "Parking mode missing or not functional", ["parking mode", "parking"]),
    ("Dashcam Features", "Rear camera not syncing with front", ["rear camera", "back camera"]),
    ("Dashcam Features", "GPS tracking accurate", ["gps tracking", "gps accurate", "live tracking"]),
    ("Dashcam Features", "Parking mode reliable", ["parking mode reliable"]),
    ("Dashcam Features", "Wide angle covers full road width", ["wide angle", "road width"]),

    ("Home Camera Features", "360 pan / tilt motor making noise while rotating", ["motor noise", "rotation noise", "pan tilt noise"]),
    ("Home Camera Features", "Camera drifts or faces ceiling after power cut / reset", ["faces ceiling", "after power cut", "drifts"]),
    ("Home Camera Features", "Motion tracking not following subject correctly", ["motion tracking not", "not tracking", "tracking issue"]),
    ("Home Camera Features", "Two-way talk delay or echo", ["echo", "talk delay"]),
    ("Home Camera Features", "Siren alarm too quiet", ["siren", "alarm too quiet"]),
    ("Home Camera Features", "360 coverage replaces multiple cameras", ["360", "full room", "complete room"]),
    ("Home Camera Features", "Motion tracking works well", ["motion tracking works", "tracking works"]),
    ("Home Camera Features", "Works well for elderly / baby / pet monitoring", ["baby", "pet", "elderly", "monitoring"]),
    ("Home Camera Features", "Good night vision for indoor use", ["indoor", "room", "night vision"]),

    ("Subscription & Paywall", "More than 2 simultaneous users requires paid plan", ["paid plan", "simultaneous users", "multiple users"]),
    ("Subscription & Paywall", "Cloud storage too expensive", ["cloud storage", "cloud expensive"]),
    ("Subscription & Paywall", "Features locked behind subscription unexpectedly", ["subscription", "paywall", "paid subscription"]),
    ("Subscription & Paywall", "SD card as free alternative to cloud appreciated", ["sd card", "without cloud"]),

    ("Product Value & Competition", "Overpriced for features offered", ["overpriced", "too costly", "expensive", "price high"]),
    ("Product Value & Competition", "Better alternatives at same price (Tapo / IMOU / Mi / CP Plus)", ["tapo", "imou", "cp plus", "mi camera", "alternative"]),
    ("Product Value & Competition", "Features not as advertised", ["not as advertised", "misleading", "false claim", "not worth"]),
    ("Product Value & Competition", "Good value for money", ["value for money", "worth", "budget", "price point", "bang for buck", "good product", "nice product", "great product", "excellent product", "perfect", "useful", "helpful product", "user friendly"]),
    ("Product Value & Competition", "Best in segment at this price point", ["best", "recommended", "recommend", "highly recommended"]),

    ("Delivery & Packaging", "Broken seal on delivery", ["seal broken", "broken seal"]),
    ("Delivery & Packaging", "Damaged product on arrival", ["damaged", "damage", "broken on arrival"]),
    ("Delivery & Packaging", "Wrong product delivered", ["wrong product"]),
    ("Delivery & Packaging", "Missing items in package", ["missing item", "missing items", "missing in package"]),
    ("Delivery & Packaging", "Fast delivery", ["fast delivery", "delivered quickly", "one day delivery"]),
    ("Delivery & Packaging", "Well-packaged and protected", ["packaging good", "well packaged", "packed well"]),
]


def classify(row):
    star = star_num(row.get("rating"))
    text = norm(" ".join([row.get("product_name") or "", row.get("title") or "", row.get("review") or ""]))
    review_only = norm(" ".join([row.get("title") or "", row.get("review") or ""]))

    neg_hits = sum(1 for token in NEGATIVE_TEXT if token in review_only)
    pos_hits = sum(1 for token in POSITIVE_TEXT if token in review_only)

    if star in {1, 2}:
        sentiment = "Negative"
    elif star == 3:
        sentiment = "Neutral"
    elif star in {4, 5}:
        sentiment = "Negative" if neg_hits >= 2 and neg_hits > pos_hits else "Positive"
    else:
        sentiment = "Negative" if neg_hits > pos_hits else "Positive" if pos_hits > neg_hits else "Neutral"

    found = defaultdict(list)
    for _, tag, patterns in RULES:
        if has_any(text, patterns):
            add(found, tag)

    if is_dashcam(row.get("product_name")):
        for blocked in ["Home Camera Features", "False / Excessive Alerts"]:
            found.pop(blocked, None)
    elif is_home_camera(row.get("product_name")):
        for blocked in ["Dashcam Features", "Windshield Glare"]:
            found.pop(blocked, None)

    if sentiment != "Negative":
        for blocked in NEGATIVE_ONLY_CATEGORIES:
            found.pop(blocked, None)

    categories = []
    tags = []
    for category, category_tags in found.items():
        if category not in categories:
            categories.append(category)
        for tag in category_tags:
            if tag not in tags:
                tags.append(tag)

    if sentiment == "Negative":
        negative_priority = [
            "Hardware Reliability", "Customer Support & Service", "False / Excessive Alerts",
            "App Performance", "Recording Reliability", "Video Quality — Daytime",
            "Video Quality — Night & Low Light", "Product Value & Competition",
        ]
        categories.sort(key=lambda item: negative_priority.index(item) if item in negative_priority else 99)

    return {
        "sentiment": sentiment,
        "primary_categories": categories[:4],
        "sub_tags": tags[:6],
    }


def main():
    parser = argparse.ArgumentParser(description="Tag reviews locally without any AI/API call.")
    parser.add_argument("--apply", action="store_true", help="Write tags to review_tags.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write; print distribution only.")
    parser.add_argument("--fill-empty-only", action="store_true", help="Only fill rows whose existing primary_categories are empty.")
    parser.add_argument("--limit", type=int, default=0, help="Optional max rows to process.")
    args = parser.parse_args()

    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    r.review_id, r.asin, r.product_name, r.rating, r.title, r.review,
                    t.sentiment AS existing_sentiment,
                    t.primary_categories AS existing_primary_categories,
                    t.sub_tags AS existing_sub_tags
                FROM raw_reviews r
                LEFT JOIN review_tags t ON r.review_id = t.review_id
                ORDER BY r.review_id
            """)
            rows = cur.fetchall()
            if args.limit:
                rows = rows[:args.limit]

            sentiment_counts = Counter()
            category_counts = Counter()
            empty_categories = 0
            skipped_existing = 0
            filled_empty = 0

            for row in rows:
                result = classify(row)
                existing_categories = json.loads(row.get("existing_primary_categories") or "[]")
                existing_sub_tags = json.loads(row.get("existing_sub_tags") or "[]")
                if args.fill_empty_only:
                    if existing_categories:
                        skipped_existing += 1
                        result = {
                            "sentiment": row.get("existing_sentiment") or result["sentiment"],
                            "primary_categories": existing_categories,
                            "sub_tags": existing_sub_tags,
                        }
                    elif result["primary_categories"]:
                        filled_empty += 1
                    else:
                        result = {
                            "sentiment": row.get("existing_sentiment") or result["sentiment"],
                            "primary_categories": [],
                            "sub_tags": existing_sub_tags,
                        }
                sentiment_counts[result["sentiment"]] += 1
                category_counts.update(result["primary_categories"])
                if not result["primary_categories"]:
                    empty_categories += 1
                if args.apply:
                    cur.execute(
                        """
                        INSERT INTO review_tags
                            (review_id, asin, sentiment, primary_categories, sub_tags)
                        VALUES (%s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            asin=VALUES(asin),
                            sentiment=VALUES(sentiment),
                            primary_categories=VALUES(primary_categories),
                            sub_tags=VALUES(sub_tags)
                        """,
                        (
                            row["review_id"],
                            row["asin"],
                            result["sentiment"],
                            json.dumps(result["primary_categories"], ensure_ascii=False),
                            json.dumps(result["sub_tags"], ensure_ascii=False),
                        ),
                    )
            if args.apply:
                conn.commit()

        print(json.dumps({
            "rows": len(rows),
            "applied": bool(args.apply),
            "fill_empty_only": bool(args.fill_empty_only),
            "skipped_existing": skipped_existing,
            "filled_empty": filled_empty,
            "sentiment": dict(sentiment_counts),
            "empty_categories": empty_categories,
            "top_categories": category_counts.most_common(20),
        }, indent=2, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
