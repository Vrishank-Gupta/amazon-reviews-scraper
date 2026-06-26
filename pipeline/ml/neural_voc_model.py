import json
import os
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report, f1_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MultiLabelBinarizer

from pipeline.ml.voc_model import (
    SENTIMENTS,
    dump_json,
    load_jsonl,
    parse_labels,
    review_text,
)
from pipeline.utils.taxonomy import TAXONOMY


def require_torch_stack():
    try:
        import torch
        from torch import nn
        from torch.utils.data import DataLoader, Dataset
        from transformers import AutoModel, AutoTokenizer
    except ImportError as exc:
        raise RuntimeError(
            "Neural GPU training needs torch and transformers. Install them first, for example:\n"
            "  pip install torch --index-url https://download.pytorch.org/whl/cu121\n"
            "  pip install transformers accelerate"
        ) from exc
    return torch, nn, DataLoader, Dataset, AutoModel, AutoTokenizer


class ReviewDataset:
    def __init__(self, torch, dataset_cls, rows, tokenizer, primary_mlb, subtag_mlb, max_length=256):
        class _Dataset(dataset_cls):
            def __len__(self_inner):
                return len(rows)

            def __getitem__(self_inner, index):
                row = rows[index]
                encoded = tokenizer(
                    review_text(row),
                    truncation=True,
                    max_length=max_length,
                    padding="max_length",
                    return_tensors="pt",
                )
                primary = primary_mlb.transform([[
                    label for label in parse_labels(row, "primary_categories")
                    if label in primary_mlb.classes_
                ]])[0]
                sub_tags = subtag_mlb.transform([[
                    label for label in parse_labels(row, "sub_tags")
                    if label in subtag_mlb.classes_
                ]])[0]
                sentiment = SENTIMENTS.index(row["sentiment"]) if row.get("sentiment") in SENTIMENTS else -1
                has_taxonomy = 1.0 if parse_labels(row, "primary_categories") or parse_labels(row, "sub_tags") else 0.0
                return {
                    "input_ids": encoded["input_ids"].squeeze(0),
                    "attention_mask": encoded["attention_mask"].squeeze(0),
                    "sentiment": torch.tensor(sentiment, dtype=torch.long),
                    "primary": torch.tensor(primary, dtype=torch.float32),
                    "sub_tags": torch.tensor(sub_tags, dtype=torch.float32),
                    "has_taxonomy": torch.tensor(has_taxonomy, dtype=torch.float32),
                }

        self.dataset = _Dataset()


class ModelFactory:
    @staticmethod
    def build(nn, AutoModel, base_model, primary_count, subtag_count, dropout=0.2):
        class MultiTaskVocModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = AutoModel.from_pretrained(base_model)
                hidden = self.encoder.config.hidden_size
                self.dropout = nn.Dropout(dropout)
                self.sentiment_head = nn.Linear(hidden, len(SENTIMENTS))
                self.primary_head = nn.Linear(hidden, primary_count)
                self.subtag_head = nn.Linear(hidden, subtag_count)

            def forward(self, input_ids, attention_mask):
                outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
                if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                    pooled = outputs.pooler_output
                else:
                    mask = attention_mask.unsqueeze(-1)
                    pooled = (outputs.last_hidden_state * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
                pooled = self.dropout(pooled)
                return {
                    "sentiment": self.sentiment_head(pooled),
                    "primary": self.primary_head(pooled),
                    "sub_tags": self.subtag_head(pooled),
                }

        return MultiTaskVocModel()


def multilabel_metrics(y_true, y_score, threshold=0.35, labels=None):
    y_pred = (y_score >= threshold).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        average=None,
        zero_division=0,
    )
    return {
        "micro_f1": round(float(f1_score(y_true, y_pred, average="micro", zero_division=0)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "threshold": threshold,
        "labels": [
            {
                "label": label,
                "support": int(support[index]),
                "precision": round(float(precision[index]), 4),
                "recall": round(float(recall[index]), 4),
                "f1": round(float(f1[index]), 4),
            }
            for index, label in enumerate(labels or [])
        ],
    }


def mask_subtag_scores_by_primary(subtag_score, primary_score, primary_labels, subtag_labels, threshold=0.35):
    primary_pred = primary_score >= threshold
    masked = np.zeros_like(subtag_score)
    tag_to_parents = {
        tag: [category for category, tags in TAXONOMY.items() if tag in tags]
        for tag in subtag_labels
    }
    primary_index = {label: index for index, label in enumerate(primary_labels)}
    for row_index in range(subtag_score.shape[0]):
        for tag_index, tag in enumerate(subtag_labels):
            parents = tag_to_parents.get(tag, [])
            if any(parent in primary_index and primary_pred[row_index, primary_index[parent]] for parent in parents):
                masked[row_index, tag_index] = subtag_score[row_index, tag_index]
    return masked


def train_neural_model(
    rows,
    external_sentiment_rows=None,
    output_dir="models/voc_tagger_neural",
    base_model="distilbert-base-uncased",
    epochs=4,
    batch_size=8,
    learning_rate=2e-5,
    max_length=256,
    min_primary_support=20,
    min_subtag_support=5,
    test_size=0.2,
    seed=42,
):
    torch, nn, DataLoader, Dataset, AutoModel, AutoTokenizer = require_torch_stack()
    torch.manual_seed(seed)
    np.random.seed(seed)

    labeled = [row for row in rows if row.get("sentiment") in SENTIMENTS]
    external = [row for row in (external_sentiment_rows or []) if row.get("sentiment") in SENTIMENTS]
    train_rows, test_rows = train_test_split(
        labeled,
        test_size=test_size,
        random_state=seed,
        stratify=[row["sentiment"] for row in labeled],
    )
    sentiment_train_rows = train_rows + external

    primary_counts = Counter(label for row in train_rows for label in parse_labels(row, "primary_categories"))
    primary_labels = sorted(label for label, count in primary_counts.items() if count >= min_primary_support)
    subtag_counts = Counter(label for row in train_rows for label in parse_labels(row, "sub_tags"))
    subtag_labels = sorted(label for label, count in subtag_counts.items() if count >= min_subtag_support)
    primary_mlb = MultiLabelBinarizer(classes=primary_labels)
    primary_mlb.fit([[]])
    subtag_mlb = MultiLabelBinarizer(classes=subtag_labels)
    subtag_mlb.fit([[]])

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    train_dataset = ReviewDataset(torch, Dataset, sentiment_train_rows, tokenizer, primary_mlb, subtag_mlb, max_length).dataset
    test_dataset = ReviewDataset(torch, Dataset, test_rows, tokenizer, primary_mlb, subtag_mlb, max_length).dataset
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ModelFactory.build(nn, AutoModel, base_model, len(primary_labels), len(subtag_labels)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    sentiment_loss_fn = nn.CrossEntropyLoss()
    multilabel_loss_fn = nn.BCEWithLogitsLoss()

    history = []
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            outputs = model(input_ids, attention_mask)

            sentiment = batch["sentiment"].to(device)
            loss = sentiment_loss_fn(outputs["sentiment"], sentiment)

            has_taxonomy = batch["has_taxonomy"].to(device)
            taxonomy_indices = has_taxonomy > 0
            if taxonomy_indices.any():
                primary = batch["primary"].to(device)
                sub_tags = batch["sub_tags"].to(device)
                loss = loss + multilabel_loss_fn(outputs["primary"][taxonomy_indices], primary[taxonomy_indices])
                loss = loss + multilabel_loss_fn(outputs["sub_tags"][taxonomy_indices], sub_tags[taxonomy_indices])

            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().cpu())
        history.append({"epoch": epoch, "loss": round(total_loss / max(1, len(train_loader)), 4)})

    model.eval()
    sentiment_true = []
    sentiment_pred = []
    primary_true = []
    primary_score = []
    subtag_true = []
    subtag_score = []
    with torch.no_grad():
        for batch in test_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            outputs = model(input_ids, attention_mask)
            sentiment_true.extend(batch["sentiment"].cpu().numpy().tolist())
            sentiment_pred.extend(outputs["sentiment"].argmax(dim=1).cpu().numpy().tolist())
            primary_true.append(batch["primary"].numpy())
            primary_score.append(torch.sigmoid(outputs["primary"]).cpu().numpy())
            subtag_true.append(batch["sub_tags"].numpy())
            subtag_score.append(torch.sigmoid(outputs["sub_tags"]).cpu().numpy())

    primary_true = np.vstack(primary_true)
    primary_score = np.vstack(primary_score)
    subtag_true = np.vstack(subtag_true)
    subtag_score = np.vstack(subtag_score)
    subtag_score = mask_subtag_scores_by_primary(
        subtag_score,
        primary_score,
        primary_labels,
        subtag_labels,
    )

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(output_path / "encoder")
    tokenizer.save_pretrained(output_path / "encoder")
    torch.save({
        "state_dict": model.state_dict(),
        "base_model": base_model,
        "primary_labels": primary_labels,
        "subtag_labels": subtag_labels,
        "sentiments": SENTIMENTS,
        "max_length": max_length,
    }, output_path / "voc_neural_model.pt")

    report = {
        "backend": "neural",
        "device": str(device),
        "cuda_device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "",
        "base_model": base_model,
        "rows": len(labeled),
        "external_sentiment_rows": len(external),
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "epochs": epochs,
        "batch_size": batch_size,
        "history": history,
        "sentiment": {
            "accuracy": round(float(np.mean(np.array(sentiment_true) == np.array(sentiment_pred))), 4),
            "classification_report": classification_report(
                [SENTIMENTS[index] for index in sentiment_true],
                [SENTIMENTS[index] for index in sentiment_pred],
                labels=SENTIMENTS,
                zero_division=0,
                output_dict=True,
            ),
        },
        "primary_categories": {
            "trained_labels": len(primary_labels),
            "ignored_low_support_labels": {
                label: count for label, count in sorted(primary_counts.items()) if count < min_primary_support
            },
            **multilabel_metrics(primary_true, primary_score, labels=primary_labels),
        },
        "sub_tags": {
            "trained_labels": len(subtag_labels),
            "ignored_low_support_labels": {
                label: count for label, count in sorted(subtag_counts.items()) if count < min_subtag_support
            },
            **multilabel_metrics(subtag_true, subtag_score, labels=subtag_labels),
        },
    }
    dump_json(output_path / "report.json", report)
    return report
