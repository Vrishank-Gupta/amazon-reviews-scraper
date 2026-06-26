"""
Train the local VOC review tagger from exported production labels.

Run:
  python pipeline/train_voc_model.py
"""
import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from pipeline.ml.voc_model import dump_json, load_jsonl, save_artifact, train_full_model


def cuda_training_available():
    try:
        import torch
    except Exception:
        return False
    return bool(torch.cuda.is_available())


def main():
    parser = argparse.ArgumentParser(description="Train local ML VOC tagger.")
    parser.add_argument("--backend", choices=["auto", "sklearn", "neural"], default="auto")
    parser.add_argument("--input", default="data/ml/voc_labeled_reviews.jsonl")
    parser.add_argument("--model-out", default="models/voc_tagger.joblib")
    parser.add_argument("--report-out", default="models/voc_tagger_report.json")
    parser.add_argument("--external-sentiment", default="", help="Optional external JSONL with rating-derived sentiment labels.")
    parser.add_argument("--min-primary-support", type=int, default=20)
    parser.add_argument("--min-subtag-support", type=int, default=5)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--neural-output-dir", default="models/voc_tagger_neural")
    parser.add_argument("--base-model", default="distilbert-base-uncased")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=256)
    args = parser.parse_args()

    rows = load_jsonl(args.input)
    external_rows = load_jsonl(args.external_sentiment) if args.external_sentiment else []
    backend = args.backend
    if backend == "auto":
        backend = "neural" if cuda_training_available() else "sklearn"
        print(f"auto backend selected: {backend}")

    if backend == "neural":
        from pipeline.ml.neural_voc_model import train_neural_model

        report = train_neural_model(
            rows,
            external_sentiment_rows=external_rows,
            output_dir=args.neural_output_dir,
            base_model=args.base_model,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.learning_rate,
            max_length=args.max_length,
            min_primary_support=args.min_primary_support,
            min_subtag_support=args.min_subtag_support,
            test_size=args.test_size,
            seed=args.seed,
        )
        report["trained_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        report["input"] = str(Path(args.input))
        if args.external_sentiment:
            report["external_sentiment_input"] = str(Path(args.external_sentiment))
        dump_json(Path(args.neural_output_dir) / "report.json", report)
        print(f"trained neural rows={report['rows']} output_dir={args.neural_output_dir}")
        print(f"device={report['device']} cuda_device={report['cuda_device']}")
        print(f"sentiment accuracy={report['sentiment']['accuracy']}")
        print(f"primary micro_f1={report['primary_categories']['micro_f1']} labels={report['primary_categories']['trained_labels']}")
        print(f"subtag micro_f1={report['sub_tags']['micro_f1']} labels={report['sub_tags']['trained_labels']}")
        return

    artifact, report = train_full_model(
        rows,
        external_sentiment_rows=external_rows,
        min_primary_support=args.min_primary_support,
        min_subtag_support=args.min_subtag_support,
        test_size=args.test_size,
        seed=args.seed,
    )
    report["trained_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    report["input"] = str(Path(args.input))
    if args.external_sentiment:
        report["external_sentiment_input"] = str(Path(args.external_sentiment))
    save_artifact(args.model_out, artifact)
    dump_json(args.report_out, report)
    print(f"trained rows={report['rows']} model={args.model_out} report={args.report_out}")
    print(f"sentiment accuracy={report['sentiment']['accuracy']}")
    print(f"primary micro_f1={report['primary_categories']['micro_f1']} labels={report['primary_categories']['trained_labels']}")
    print(f"subtag micro_f1={report['sub_tags']['micro_f1']} labels={report['sub_tags']['trained_labels']}")


if __name__ == "__main__":
    main()
