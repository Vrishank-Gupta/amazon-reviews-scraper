import argparse
import json
import urllib.request
from pathlib import Path


DEFAULT_CONFIGS = [
    "Electronics",
    "Automotive",
    "Tools_and_Home_Improvement",
    "Home_and_Kitchen",
]

BASE_URL = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/review_categories/{category}.jsonl"


def sentiment_from_rating(rating):
    rating = float(rating or 0)
    if rating <= 2:
        return "Negative"
    if rating == 3:
        return "Neutral"
    return "Positive"


def main():
    parser = argparse.ArgumentParser(description="Sample external Amazon reviews for sentiment training.")
    parser.add_argument("--configs", default=",".join(DEFAULT_CONFIGS))
    parser.add_argument("--max-rows", type=int, default=10000)
    parser.add_argument("--output", default="data/ml/external_amazon_sentiment.jsonl")
    args = parser.parse_args()

    configs = [item.strip() for item in args.configs.split(",") if item.strip()]
    per_config = max(1, args.max_rows // max(1, len(configs)))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    written = 0
    with open(args.output, "w", encoding="utf-8") as out:
        for config in configs:
            url = BASE_URL.format(category=config)
            with urllib.request.urlopen(url, timeout=60) as response:
                lines = response
                for index, raw_line in enumerate(lines):
                    if index >= per_config:
                        break
                    row = json.loads(raw_line.decode("utf-8"))
                    rating = row.get("rating") or row.get("overall")
                    payload = {
                        "review_id": f"{config}:{index}",
                        "asin": row.get("asin", "") or row.get("parent_asin", ""),
                        "product_category": config.replace("_", " "),
                        "product_name": "",
                        "rating": str(rating or ""),
                        "title": row.get("title", ""),
                        "review": row.get("text", ""),
                        "sentiment": sentiment_from_rating(rating),
                        "primary_categories": [],
                        "sub_tags": [],
                        "source": "amazon_reviews_2023",
                    }
                    out.write(json.dumps(payload, ensure_ascii=False) + "\n")
                    written += 1
    print(f"wrote {written} rows to {args.output}")


if __name__ == "__main__":
    main()
