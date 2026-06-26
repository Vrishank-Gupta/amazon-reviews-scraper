# Local VOC Tagging Model

This folder contains the local ML replacement path for the LLM tagger.

The supervised source of truth is Qubo production tagging data exported to:

```powershell
data\ml\voc_labeled_reviews.jsonl
```

Train the model:

```powershell
python pipeline\train_voc_model.py
```

`--backend auto` is the default. It uses the neural CUDA backend when PyTorch
can see a GPU, otherwise it falls back to the scikit-learn backend.

Train with GPU-backed transformer fine-tuning:

```powershell
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install transformers accelerate
python pipeline\train_voc_model.py --backend neural --epochs 4 --batch-size 8
```

The neural backend uses CUDA automatically when PyTorch sees an NVIDIA GPU. On
smaller 6 GB GPUs, keep `--batch-size 4` or `--batch-size 8` and reduce
`--max-length` if memory is tight.

Predict tags:

```powershell
python pipeline\predict_voc_tags.py --input data\ml\voc_labeled_reviews.jsonl --limit 5
```

Optional external Amazon review sentiment data:

```powershell
python pipeline\fetch_external_amazon_reviews.py --max-rows 10000
python pipeline\train_voc_model.py --external-sentiment data\ml\external_amazon_sentiment.jsonl
```

External Amazon review datasets are useful for review-language and rating/sentiment
learning. They should not be treated as ground truth for `primary_categories` or
`sub_tags`, because those labels are specific to the Qubo VOC taxonomy.

Current model shape:

- sentiment: single-label classifier
- primary categories: multi-label classifier
- sub-tags: hierarchical multi-label classifiers, one head per parent category
- features: word TF-IDF + character TF-IDF + numeric rating

Sub-tag prediction is parent-first: the model predicts primary categories, then
only runs the sub-tag heads for those selected parent categories. This prevents
cross-taxonomy outputs such as a dashcam-only sub-tag appearing under a support
or installation review.

The trained artifact is written to `models/voc_tagger.joblib`, and evaluation is
written to `models/voc_tagger_report.json`.
