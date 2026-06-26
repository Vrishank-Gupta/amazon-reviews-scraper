import json
import re
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer

from pipeline.utils.taxonomy import TAXONOMY


SENTIMENTS = ["Negative", "Neutral", "Positive"]


def load_jsonl(path):
    rows = []
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.startswith("mysql:"):
            continue
        rows.append(json.loads(line))
    return rows


def dump_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def rating_number(value):
    try:
        return float(str(value).split()[0])
    except Exception:
        return 0.0


def review_text(row):
    parts = [
        row.get("product_category"),
        row.get("product_name"),
        row.get("variant_label"),
        f"rating_{int(round(rating_number(row.get('rating'))))}",
        row.get("title"),
        row.get("review") or row.get("text"),
    ]
    return normalize_space(" ".join(str(part or "") for part in parts))


def build_features(rows, vectorizers=None, fit=False):
    texts = [review_text(row) for row in rows]
    ratings = np.array([[rating_number(row.get("rating"))] for row in rows], dtype=np.float32)
    ratings = sparse.csr_matrix(ratings / 5.0)

    if fit:
        vectorizers = {
            "word": TfidfVectorizer(
                analyzer="word",
                ngram_range=(1, 2),
                min_df=2,
                max_df=0.92,
                sublinear_tf=True,
                strip_accents="unicode",
            ),
            "char": TfidfVectorizer(
                analyzer="char_wb",
                ngram_range=(3, 5),
                min_df=2,
                max_df=0.95,
                sublinear_tf=True,
                strip_accents="unicode",
            ),
        }
        word = vectorizers["word"].fit_transform(texts)
        char = vectorizers["char"].fit_transform(texts)
    else:
        word = vectorizers["word"].transform(texts)
        char = vectorizers["char"].transform(texts)

    return sparse.hstack([word, char, ratings], format="csr"), vectorizers


def classifier(max_iter=2000):
    return LogisticRegression(
        solver="liblinear",
        class_weight="balanced",
        max_iter=max_iter,
    )


def sentiment_classifier(max_iter=2000):
    return LogisticRegression(
        solver="lbfgs",
        class_weight="balanced",
        max_iter=max_iter,
    )


def multilabel_classifier(max_iter=2000):
    return OneVsRestClassifier(classifier(max_iter=max_iter))


def parse_labels(row, key):
    value = row.get(key) or []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            value = []
    return [normalize_space(item) for item in value if normalize_space(item)]


def top_labels(rows, key, min_support):
    counts = Counter(label for row in rows for label in parse_labels(row, key))
    labels = sorted(label for label, count in counts.items() if count >= min_support)
    return labels, counts


def threshold_multilabel(proba, thresholds):
    y_pred = np.zeros_like(proba, dtype=int)
    for index, threshold in enumerate(thresholds):
        y_pred[:, index] = proba[:, index] >= threshold
    return y_pred


def selected_multilabel_labels(proba_row, labels, thresholds, fallback_top=False):
    selected = []
    for index, label in enumerate(labels):
        score = float(proba_row[index])
        if score >= thresholds[index]:
            selected.append((label, score))
    if not selected and fallback_top and len(labels):
        index = int(np.argmax(proba_row))
        selected.append((labels[index], float(proba_row[index])))
    return sorted(selected, key=lambda item: item[1], reverse=True)


def choose_thresholds(y_true, proba):
    thresholds = []
    for index in range(y_true.shape[1]):
        best_threshold = 0.35
        best_f1 = -1.0
        for threshold in np.arange(0.15, 0.71, 0.05):
            pred = (proba[:, index] >= threshold).astype(int)
            score = f1_score(y_true[:, index], pred, zero_division=0)
            if score > best_f1:
                best_f1 = score
                best_threshold = float(round(threshold, 2))
        thresholds.append(best_threshold)
    return thresholds


def train_category_subtag_models(train_rows, x_train, min_subtag_support):
    models = {}
    for category, allowed_tags in TAXONOMY.items():
        row_indices = [
            index for index, row in enumerate(train_rows)
            if category in parse_labels(row, "primary_categories")
        ]
        if len(row_indices) < 12:
            continue

        allowed = set(allowed_tags)
        row_label_sets = []
        counts = Counter()
        for index in row_indices:
            labels = [tag for tag in parse_labels(train_rows[index], "sub_tags") if tag in allowed]
            row_label_sets.append(labels)
            counts.update(labels)

        labels = [
            tag for tag in allowed_tags
            if min_subtag_support <= counts[tag] < len(row_indices)
        ]
        if not labels:
            continue

        mlb = MultiLabelBinarizer(classes=labels)
        y = mlb.fit_transform([[tag for tag in row_tags if tag in labels] for row_tags in row_label_sets])
        if not y.any():
            continue

        model = multilabel_classifier()
        model.fit(x_train[row_indices], y)
        train_proba = model.predict_proba(x_train[row_indices])
        models[category] = {
            "model": model,
            "mlb": mlb,
            "thresholds": choose_thresholds(y, train_proba),
            "train_rows": len(row_indices),
            "label_support": {tag: int(counts[tag]) for tag in labels},
        }
    return models


def hierarchical_subtag_predictions(category_models, x_rows, predicted_primary_labels):
    all_labels = sorted({
        label
        for payload in category_models.values()
        for label in payload["mlb"].classes_
    })
    label_to_index = {label: index for index, label in enumerate(all_labels)}
    y_pred = np.zeros((x_rows.shape[0], len(all_labels)), dtype=int)
    scores_by_row = []

    for row_index, categories in enumerate(predicted_primary_labels):
        tag_scores = {}
        for category in categories:
            payload = category_models.get(category)
            if not payload:
                continue
            proba = payload["model"].predict_proba(x_rows[row_index])
            selected = selected_multilabel_labels(
                proba[0],
                list(payload["mlb"].classes_),
                payload["thresholds"],
            )
            for tag, score in selected:
                tag_scores[tag] = max(tag_scores.get(tag, 0.0), score)
        for tag in tag_scores:
            if tag in label_to_index:
                y_pred[row_index, label_to_index[tag]] = 1
        scores_by_row.append(tag_scores)

    return all_labels, y_pred, scores_by_row


def metrics_for_multilabel(y_true, proba, thresholds, labels):
    pred = threshold_multilabel(proba, thresholds)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        pred,
        average=None,
        zero_division=0,
    )
    by_label = []
    for index, label in enumerate(labels):
        by_label.append({
            "label": label,
            "support": int(support[index]),
            "threshold": thresholds[index],
            "precision": round(float(precision[index]), 4),
            "recall": round(float(recall[index]), 4),
            "f1": round(float(f1[index]), 4),
        })
    return {
        "micro_f1": round(float(f1_score(y_true, pred, average="micro", zero_division=0)), 4),
        "macro_f1": round(float(f1_score(y_true, pred, average="macro", zero_division=0)), 4),
        "labels": by_label,
    }


def train_full_model(rows, external_sentiment_rows=None, min_primary_support=20, min_subtag_support=5, test_size=0.2, seed=42):
    usable = [row for row in rows if row.get("sentiment") in SENTIMENTS]
    external_sentiment_rows = [
        row for row in (external_sentiment_rows or [])
        if row.get("sentiment") in SENTIMENTS
    ]
    train_rows, test_rows = train_test_split(
        usable,
        test_size=test_size,
        random_state=seed,
        stratify=[row["sentiment"] for row in usable],
    )

    vectorizer_fit_rows = train_rows + external_sentiment_rows
    x_train, vectorizers = build_features(vectorizer_fit_rows, fit=True)
    x_internal_train = x_train[:len(train_rows)]
    x_external = x_train[len(train_rows):]
    x_test, _ = build_features(test_rows, vectorizers=vectorizers)

    sentiment_y_train = [row["sentiment"] for row in train_rows] + [
        row["sentiment"] for row in external_sentiment_rows
    ]
    sentiment_y_test = [row["sentiment"] for row in test_rows]
    sentiment_model = sentiment_classifier()
    sentiment_x_train = sparse.vstack([x_internal_train, x_external], format="csr")
    sentiment_model.fit(sentiment_x_train, sentiment_y_train)
    sentiment_pred = sentiment_model.predict(x_test)

    primary_labels, primary_counts = top_labels(train_rows, "primary_categories", min_primary_support)
    primary_mlb = MultiLabelBinarizer(classes=primary_labels)
    y_primary_train = primary_mlb.fit_transform([
        [label for label in parse_labels(row, "primary_categories") if label in primary_labels]
        for row in train_rows
    ])
    y_primary_test = primary_mlb.transform([
        [label for label in parse_labels(row, "primary_categories") if label in primary_labels]
        for row in test_rows
    ])
    primary_model = multilabel_classifier()
    primary_model.fit(x_internal_train, y_primary_train)
    primary_proba = primary_model.predict_proba(x_test)
    primary_thresholds = choose_thresholds(y_primary_test, primary_proba)

    category_subtag_models = train_category_subtag_models(train_rows, x_internal_train, min_subtag_support)
    predicted_primary_labels = []
    for row_index in range(primary_proba.shape[0]):
        selected = selected_multilabel_labels(
            primary_proba[row_index],
            primary_labels,
            primary_thresholds,
            fallback_top=True,
        )
        predicted_primary_labels.append([label for label, _ in selected])

    subtag_labels, y_subtag_pred, _ = hierarchical_subtag_predictions(
        category_subtag_models,
        x_test,
        predicted_primary_labels,
    )
    subtag_counts = Counter(label for row in train_rows for label in parse_labels(row, "sub_tags"))
    subtag_mlb = MultiLabelBinarizer(classes=subtag_labels)
    y_subtag_test = subtag_mlb.fit_transform([
        [label for label in parse_labels(row, "sub_tags") if label in subtag_labels]
        for row in test_rows
    ])

    artifact = {
        "vectorizers": vectorizers,
        "sentiment_model": sentiment_model,
        "primary_model": primary_model,
        "primary_mlb": primary_mlb,
        "primary_thresholds": primary_thresholds,
        "category_subtag_models": category_subtag_models,
        "subtag_labels": subtag_labels,
        "config": {
            "min_primary_support": min_primary_support,
            "min_subtag_support": min_subtag_support,
            "test_size": test_size,
            "seed": seed,
        },
    }

    report = {
        "rows": len(usable),
        "external_sentiment_rows": len(external_sentiment_rows),
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "sentiment": {
            "accuracy": round(float(np.mean(np.array(sentiment_pred) == np.array(sentiment_y_test))), 4),
            "classification_report": classification_report(
                sentiment_y_test,
                sentiment_pred,
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
            **metrics_for_multilabel(y_primary_test, primary_proba, primary_thresholds, primary_labels),
        },
        "sub_tags": {
            "trained_labels": len(subtag_labels),
            "trained_parent_categories": len(category_subtag_models),
            "ignored_low_support_labels": {
                label: count for label, count in sorted(subtag_counts.items()) if count < min_subtag_support
            },
            "micro_f1": round(float(f1_score(y_subtag_test, y_subtag_pred, average="micro", zero_division=0)), 4),
            "macro_f1": round(float(f1_score(y_subtag_test, y_subtag_pred, average="macro", zero_division=0)), 4),
            "labels": [],
            "parent_categories": {
                category: {
                    "train_rows": payload["train_rows"],
                    "trained_labels": len(payload["mlb"].classes_),
                    "label_support": payload["label_support"],
                }
                for category, payload in category_subtag_models.items()
            },
        },
    }
    for index, label in enumerate(subtag_labels):
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_subtag_test[:, index],
            y_subtag_pred[:, index],
            average="binary",
            zero_division=0,
        )
        report["sub_tags"]["labels"].append({
            "label": label,
            "support": int(y_subtag_test[:, index].sum()),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
        })
    return artifact, report


def save_artifact(path, artifact):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, path)


def load_artifact(path):
    return joblib.load(path)


def predict_rows(artifact, rows, top_k_primary=4, top_k_subtags=6):
    x, _ = build_features(rows, vectorizers=artifact["vectorizers"])
    sentiment_proba = artifact["sentiment_model"].predict_proba(x)
    sentiment_classes = list(artifact["sentiment_model"].classes_)
    primary_proba = artifact["primary_model"].predict_proba(x)
    primary_score_rows = []
    primary_label_rows = []
    for row_index in range(primary_proba.shape[0]):
        selected = selected_multilabel_labels(
            primary_proba[row_index],
            list(artifact["primary_mlb"].classes_),
            artifact["primary_thresholds"],
            fallback_top=True,
        )
        primary_score_rows.append(selected)
        primary_label_rows.append([label for label, _ in selected[:top_k_primary]])
    _, _, subtag_score_rows = hierarchical_subtag_predictions(
        artifact["category_subtag_models"],
        x,
        primary_label_rows,
    )

    results = []
    for row_index, row in enumerate(rows):
        sent_index = int(np.argmax(sentiment_proba[row_index]))
        primary = primary_score_rows[row_index]
        subtags = sorted(subtag_score_rows[row_index].items(), key=lambda item: item[1], reverse=True)

        results.append({
            "id": row.get("review_id") or row.get("id"),
            "sentiment": sentiment_classes[sent_index],
            "sentiment_confidence": round(float(sentiment_proba[row_index, sent_index]), 4),
            "primary_categories": [label for label, _ in primary[:top_k_primary]],
            "primary_category_scores": {label: round(score, 4) for label, score in primary[:top_k_primary]},
            "sub_tags": [label for label, _ in subtags[:top_k_subtags]],
            "sub_tag_scores": {label: round(score, 4) for label, score in subtags[:top_k_subtags]},
        })
    return results
