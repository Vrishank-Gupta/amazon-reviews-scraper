# Amazon VOC Dashboard (Amazon.in Reviews → Insights)

A local **Voice of Customer** dashboard for Amazon.in products.

- **Scrape** latest reviews from Amazon.in (Selenium + Chrome)
- **Tag** each review with **Sentiment**, **Primary categories**, and **Sub-tags** (OpenAI `gpt-4o-mini` + your taxonomy)
- **Explore**: executive overview, product deep-dives, tagged reviews table, trends, word cloud drill-down

> This repo is optimized for **Windows** + **MySQL** + **Vite (React)** + **FastAPI**.

## What’s inside

```text
amazon-reviews-scraper/
├── .env                         # one env file for backend + pipeline
├── data/
│   └── asins.csv                # ASIN + product_name list
├── backend/                     # FastAPI API layer (reads from MySQL)
│   ├── main.py
│   └── requirements.txt
├── pipeline/                    # scrape + tag jobs (writes to MySQL)
│   ├── start_pipeline.py        # spawned by backend (keeps console open briefly)
│   ├── run_pipeline.py          # orchestration + pipeline_runs status
│   ├── scraper.py               # scrape logic (no DB)
│   ├── scraper_runner.py        # reads asins.csv → inserts raw_reviews
│   ├── tagger.py                # raw_reviews → review_tags via OpenAI + taxonomy
│   ├── requirements.txt
│   └── utils/taxonomy.py        # your VOC taxonomy
└── frontend/                    # React dashboard (Vite proxy → backend)
    ├── vite.config.js           # proxies /api → http://localhost:8000
    ├── package.json
    └── src/
        ├── App.jsx              # tabs: Overview / Products / Reviews / Trends
        ├── api.js               # typed-ish API wrappers
        └── components/...
```

## Quickstart (local)

### 1) Prereqs

- **Python 3.10+**
- **Node 18+**
- **MySQL 8+** (or MariaDB with JSON/text compatibility)
- **Google Chrome** installed (Selenium uses your Chrome profile for login/cookies)

### 2) Create `.env` (repo root)

Create a file named `.env` in the project root (same level as `backend/`):

```env
# --- MySQL ---
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=voc

# --- OpenAI ---
OPENAI_API_KEY=sk-...

# --- Optional: CORS (backend) ---
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# --- Optional: Selenium/Chrome ---
# If empty, Selenium Manager auto-downloads a matching chromedriver (recommended).
CHROMEDRIVER_PATH=
# Chrome user profile directory (lets you stay logged in to Amazon).
CHROME_PROFILE=C:\amazon_profile
```

### 3) Add products to scrape

Edit `data/asins.csv`:

```csv
asin,product_name
B0CYGYCRH8,Cam360 3MP
B0XXXXXXXX,Another Product
```

### 4) Create the database tables (MySQL)

This project expects (at minimum) these tables:

- `raw_reviews` (scraped data)
- `review_tags` (AI tags)
- `pipeline_runs` (single row with `id=1` used as a status flag)

If you don’t already have them, use this starter schema and adjust as needed:

```sql
CREATE TABLE IF NOT EXISTS raw_reviews (
  review_id   VARCHAR(32) PRIMARY KEY,
  asin        VARCHAR(20) NOT NULL,
  product_name VARCHAR(255),
  rating      VARCHAR(32),
  title       TEXT,
  review      TEXT,
  review_date VARCHAR(255),
  review_url  TEXT,
  scrape_date DATE,
  INDEX idx_asin (asin),
  INDEX idx_scrape_date (scrape_date)
);

CREATE TABLE IF NOT EXISTS review_tags (
  review_id          VARCHAR(32) PRIMARY KEY,
  asin               VARCHAR(20),
  sentiment          VARCHAR(16),
  primary_categories JSON,
  sub_tags           JSON,
  INDEX idx_sentiment (sentiment)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id          INT PRIMARY KEY,
  status      VARCHAR(16),
  message     TEXT,
  started_at  DATETIME NULL,
  finished_at DATETIME NULL
);

INSERT IGNORE INTO pipeline_runs (id, status, message) VALUES (1, 'IDLE', 'Ready');

-- Optional: AI per-product bullet summaries (used by /api/summary)
CREATE TABLE IF NOT EXISTS product_summaries (
  asin         VARCHAR(20) PRIMARY KEY,
  issues       JSON,
  positives    JSON,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5) Install dependencies

In PowerShell from repo root:

```powershell
py -m pip install -r .\backend\requirements.txt
py -m pip install -r .\pipeline\requirements.txt

cd .\frontend
npm install
```

### 6) Run the backend (FastAPI)

From repo root:

```powershell
cd .\backend
uvicorn main:app --reload --port 8000
```

### 7) Run the frontend (Vite)

In a second terminal:

```powershell
cd .\frontend
npm run dev
```

Open the dashboard at `http://localhost:5173`.

## Using the dashboard

### Tabs

- **Overview**: portfolio KPIs + top issues + sentiment trend
- **Products**: per-product table + deltas + AI brief + category pies + keyword drill-down
- **Reviews**: sortable tagged reviews table + CSV export
- **Trends**: CXO daily trends (sentiment, rating, category watchlist, product head-to-head)

### Run the pipeline from the UI

Click **Pipeline** → choose:

- **Days back** (1–365): sets `SCRAPE_DAYS_BACK`
- **Products** (optional): sets `SCRAPE_ASINS` (comma-separated)

Then click **RUN NOW**. The backend spawns `pipeline/start_pipeline.py`, which launches `pipeline/run_pipeline.py` in a separate console.

## How the pipeline works (data flow)

```mermaid
flowchart LR
  A[data/asins.csv] --> B[pipeline/scraper_runner.py]
  B -->|Selenium + Chrome| C[Amazon.in reviews]
  B --> D[(MySQL: raw_reviews)]
  D --> E[pipeline/tagger.py]
  E -->|OpenAI gpt-4o-mini + taxonomy| F[(MySQL: review_tags)]
  D --> G[backend/main.py]
  F --> G
  G --> H[frontend (React/Vite)]
```

## Backend API (FastAPI)

The frontend calls these endpoints (all under `/api`):

- **Reviews**: `GET /api/reviews` (filters: `category`, `sentiment`, `rating`, `product`, `date_from`, `date_to`)
- **Filters**: `GET /api/filters`
- **Stats**: `GET /api/stats`
- **Overview**: `GET /api/analysis`
- **Products**: `GET /api/summary`
- **Trends**: `GET /api/trends/cxo` (used by Trends tab)
- **Word cloud**: `GET /api/wordcloud`
- **Keyword drill-down**: `GET /api/reviews/by-keyword`
- **Pipeline (status)**: `GET /api/pipeline/status` (derived from `raw_reviews` + `review_tags`)
- **Pipeline (legacy status)**: `GET /api/pipeline` (reads `pipeline_runs` id=1)
- **Pipeline (run)**: `POST /api/pipeline/run` body `{ "days": 30, "asins": ["B0..."] }`

## Configuration reference

### Environment variables

- **DB_HOST / DB_USER / DB_PASSWORD / DB_NAME**: MySQL connection (backend + pipeline)
- **OPENAI_API_KEY**: required for `pipeline/tagger.py` and `/api/summary/generate`
- **ALLOWED_ORIGINS**: comma-separated list for CORS (default includes `http://localhost:5173`)
- **CHROME_PROFILE**: Chrome user data directory used by Selenium (helps keep Amazon logged in)
- **CHROMEDRIVER_PATH**: optional explicit chromedriver path (otherwise Selenium Manager is used)
- **SCRAPE_DAYS_BACK**: runtime override set by the UI (default 30)
- **SCRAPE_ASINS**: runtime override set by the UI (comma-separated); empty means “all in `asins.csv`”

### Taxonomy

Edit `pipeline/utils/taxonomy.py` to match your product + business needs. The tagger will only emit:

- `sentiment`: `Positive | Neutral | Negative`
- `primary_categories`: list of taxonomy keys
- `sub_tags`: list of strings under the selected categories

## Troubleshooting

### Scraper opens Chrome but inserts 0 reviews

- **You may be blocked / not logged in**: open the Chrome window Selenium launches and ensure Amazon.in loads normally.
- **Profile path**: set `CHROME_PROFILE` to a writable folder (e.g. `C:\amazon_profile`) and re-run.
- **Slow page load**: Amazon sometimes loads reviews slowly; the scraper currently uses fixed sleeps.

### Selenium / chromedriver errors

- Leave `CHROMEDRIVER_PATH` empty to use Selenium Manager (recommended).
- Make sure your **Chrome version** is up to date.

### Tagger runs but nothing gets tagged

- Ensure `review_tags.review_id` is the primary key and matches `raw_reviews.review_id`.
- The tagger only tags **untagged** rows (left join where `review_tags` is missing).

### Ratings look wrong in the UI

The scraper stores rating text like `"4.0 out of 5 stars"`. Some backend queries parse the numeric part using MySQL `SUBSTRING_INDEX(...)`. Keep rating as that Amazon string or adjust parsing if you change it.

## Notes & cautions

- **Amazon scraping**: obey Amazon’s terms and rate limits. Using a real Chrome profile reduces friction but does not eliminate bot detection.
- **Costs**: tagging uses OpenAI; batch size is 5 in `pipeline/tagger.py`.
- **Data model**: `pipeline_runs` is treated as a single status row (`id=1`) by `pipeline/run_pipeline.py`.
