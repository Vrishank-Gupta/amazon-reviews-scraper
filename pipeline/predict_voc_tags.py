"""
Predict VOC tags locally from a trained model.

Run:
  python pipeline/predict_voc_tags.py --input data/ml/voc_labeled_reviews.jsonl --limit 5
"""
import argparse
import json
import os
import sys

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from pipeline.ml.voc_model import load_artifact, load_jsonl, predict_rows


def main():
    parser = argparse.ArgumentParser(description="Predict VOC tags with local ML model.")
    parser.add_argument("--model", default="models/voc_tagger.joblib")
    parser.add_argument("--input", required=True, help="JSONL rows with review_id/id, product fields, rating, title, review/text.")
    parser.add_argument("--output", default="", help="Optional JSONL output path.")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    rows = load_jsonl(args.input)
    if args.limit:
        rows = rows[:args.limit]
    artifact = load_artifact(args.model)
    results = predict_rows(artifact, rows)

    lines = [json.dumps(item, ensure_ascii=False) for item in results]
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    else:
        print("\n".join(lines))


if __name__ == "__main__":
    main()

