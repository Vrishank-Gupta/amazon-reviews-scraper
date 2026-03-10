# Amazon VOC Dashboard

Voice of Customer intelligence system for Amazon.in product listings.

## Project Structure

```
SCRAPER/
├── .env                        ← Single credentials file for everything
├── data/
│   └── asins.csv               ← Your ASINs + product names
├── backend/
│   ├── main.py                 ← FastAPI server
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── components/
│   │       ├── Charts.jsx
│   │       ├── PipelineWidget.jsx
│   │       ├── ReviewsTable.jsx
│   │       ├── Sidebar.jsx
│   │       ├── StatCard.jsx
│   │       └── TrendsPage.jsx
│   ├── index.html
│   └── package.json
└── pipeline/
    ├── start_pipeline.py       ← Entry point called by FastAPI button
    ├── run_pipeline.py         ← Orchestrator: scrape → tag → update DB status
    ├── scraper.py              ← Selenium scraping logic (pure, no DB)
    ├── scraper_runner.py       ← Reads asins.csv, runs scraper, writes to DB
    ├── tagger.py               ← GPT-4o-mini batch tagging
    ├── requirements.txt
    └── utils/
        └── taxonomy.py         ← Your issue categories + sub-tags
```

## Setup

### 1. Fill in credentials

Edit `.env` in the project root:

```env
DB_HOST=localhost
DB_USER=llm_reader
DB_PASSWORD=your_password
DB_NAME=world
OPENAI_API_KEY=sk-...
```

### 2. Add your ASINs

Edit `data/asins.csv`:

```csv
asin,product_name
B0CYGYCRH8,Cam360 3MP
B0XXXXXXXX,Your Other Product
```

### 3. Update your taxonomy

Edit `pipeline/utils/taxonomy.py` to match your actual product issues.

### 4. Install dependencies

```bash
# Backend
pip install -r backend/requirements.txt

# Pipeline
pip install -r pipeline/requirements.txt
```

### 5. Run the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 6. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open → http://localhost:5173

## How it works

1. Dashboard loads — shows all tagged reviews with filters
2. Click **Run Pipeline** → triggers scrape + tag in background
3. Scraper opens Chrome, reads ASINs from `data/asins.csv`, scrapes Amazon.in
4. Tagger picks up untagged reviews, sends to GPT-4o-mini, writes tags to DB
5. Pipeline status (RUNNING / SUCCESS / FAILED) shown live in sidebar
