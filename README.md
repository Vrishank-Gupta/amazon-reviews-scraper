# Amazon VOC Dashboard

Voice of Customer analytics for Amazon.in products — scrapes reviews, tags them with AI, and shows them in a React dashboard.

## What it does

1. Scrapes Amazon.in reviews with Selenium + Chrome (Windows)
2. Tags each review with sentiment, issue categories, and sub-tags via GPT-4o-mini
3. Stores everything in MySQL
4. Serves a React dashboard with trends, issue analysis, and product comparisons

## Architecture

| Part | What it is | Where it runs |
|---|---|---|
| Frontend | React + Vite SPA | Docker (nginx) or Netlify |
| Backend API | FastAPI + uvicorn (4 workers) | Docker on Linux VM |
| Database | MySQL 8 | Managed or VM |
| Scraper | Selenium + Chrome | Windows machine (manual `py` command) |

---

## Repo structure

```
amazon-reviews/
├── .env                          # local secrets (gitignored) — copy from .env.example
├── .env.example                  # canonical reference for all env vars
├── .env.backend.production       # backend VM config (gitignored)
├── .env.worker.production        # Windows scraper config (gitignored)
├── docker-compose.local.yml      # local dev: backend + frontend in Docker
├── docker-compose.backend.yml    # production: backend only
├── data/
│   ├── asins.csv                 # products to scrape (ASIN, product_name, category)
│   └── categories.json
├── backend/
│   ├── main.py                   # FastAPI app (connection-pooled, 4 workers)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── nginx.conf                # production nginx (rate limiting, security headers)
│   ├── vite.config.js
│   └── Dockerfile
├── pipeline/
│   ├── run_pipeline.py           # entry point: scrape → tag
│   ├── scraper_runner.py         # Selenium scraper
│   ├── tagger.py                 # GPT-4o-mini tagger
│   ├── worker.py                 # background worker (polls DB job queue)
│   ├── requirements.txt          # Windows worker deps (includes selenium)
│   └── requirements.backend.txt  # Docker backend deps (no selenium)
├── shared/
│   └── env.py                    # .env loader
├── dev.py                        # local dev launcher (backend + frontend together)
└── ops/
    ├── mysql/
    │   └── deployment.sql        # DB schema + seed
    ├── deploy/                   # production deployment guides
    └── windows/                  # Windows worker scripts
```

---

## Local development (no Docker)

The fastest way to run locally — just Python + Node, no Docker needed.

### Prerequisites

- Python 3.11+
- Node 20+
- MySQL 8 running locally

### 1. Copy and fill `.env`

```bash
cp .env.example .env
```

Edit `.env` with your local MySQL credentials and OpenAI key.

### 2. Set up the database

```bash
mysql -u root -p < ops/mysql/deployment.sql
```

### 3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Start everything

```bash
py dev.py
```

This starts backend + frontend together and streams their logs side by side. Ctrl+C stops both.

| URL | What |
|---|---|
| `http://localhost:5173` | Dashboard |
| `http://localhost:5173/pipeline-console.html` | Pipeline console |
| `http://localhost:8000` | API |
| `http://localhost:8000/health` | Health check |

`npm install` runs automatically on first launch if `node_modules` is missing.

---

## Local development (Docker)

Runs the full stack in containers — useful to test the production nginx setup locally.

### Prerequisites

- Docker + Docker Compose

### 1. Copy and fill `.env`

```bash
cp .env.example .env
```

### 2. Build and start

```bash
docker compose -f docker-compose.local.yml up --build
```

| URL | What |
|---|---|
| `http://localhost:8080` | Dashboard (served by nginx) |
| `http://localhost:8080/api/...` | API (proxied through nginx) |

---

## Run the scraper (Windows, manual)

The pipeline runs manually on a Windows machine with Chrome.

```powershell
cd pipeline
pip install -r requirements.txt
py run_pipeline.py
```

On first run, Chrome opens and prompts you to log in to Amazon. The session is saved to `chrome-profile/` (gitignored) — no re-login needed on future runs.

To run with a specific set of ASINs or date range, edit `data/asins.csv` then run again.

---

## VM deployment

### What you need

- 1 Linux VM (2 vCPU, 2–4 GB RAM) with Docker + Docker Compose
- Remote MySQL 8 instance
- Windows machine for scraping

### Step 1 — Set up the database

```bash
mysql -u root -p < ops/mysql/deployment.sql
```

### Step 2 — Deploy the backend

Copy the repo to the VM. Create `.env.backend.production` (see `.env.example`):

```
DB_HOST=your-mysql-host
DB_USER=llm_reader
DB_PASSWORD=your_strong_password
DB_NAME=amazon_reviews
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://your-frontend-domain.com
PIPELINE_EXECUTION_MODE=worker
PIPELINE_WORKER_TIMEOUT_SECONDS=180
```

Start it:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

The backend is only accessible within Docker's network — put nginx or Caddy in front with HTTPS. The frontend's nginx container handles proxying `/api/` requests to the backend.

### Step 3 — Deploy the frontend

**Option A — Docker (same VM):**

The frontend container in `docker-compose.local.yml` can also be used in production. It includes nginx with rate limiting and security headers.

**Option B — Netlify (static):**

Connect the repo on Netlify:

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://your-backend-domain.com`

### Step 4 — Configure the scraping machine (Windows)

Create `.env.worker.production` from `.env.example`. Set:

```
CHROME_PROFILE=C:\path\to\chrome-amazon-profile
PIPELINE_EXECUTION_MODE=worker
```

Run the scraper manually whenever needed:

```powershell
py pipeline\run_pipeline.py
```

---

## Key environment variables

See `.env.example` for the full annotated list.

| Variable | Used by | Description |
|---|---|---|
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | all | MySQL connection |
| `OPENAI_API_KEY` | backend, tagger | GPT-4o-mini tagging + AI summaries |
| `ALLOWED_ORIGINS` | backend | CORS — comma-separated frontend URLs |
| `PIPELINE_EXECUTION_MODE` | backend | `worker` = queue jobs via DB; omit for direct trigger |
| `CHROME_PROFILE` | Windows scraper | Chrome session path (auto-created if missing) |
| `CHROMEDRIVER_PATH` | Windows scraper | Leave empty if chromedriver is on PATH |
| `VITE_API_BASE_URL` | frontend build | Backend URL (baked in at build time) |

---

## Dashboard tabs

- **Overview** — KPI tiles, Amazon rating trend, top issues, top positives, sentiment over time. Every widget has a per-product dropdown.
- **Products** — Sortable product table with health scores, AI brief, category pies, and keyword cloud drill-down.
- **Trends** — Week-on-week digest, emerging issues, brand health score, problem rate by product, rating distribution.
- **Reviews** — Full review table with search, sort, filters, and CSV export.

---

## Full deployment docs

- `ops/deploy/production.md` — step-by-step production setup
- `ops/deploy/deployment-options-cto.md` — architecture options comparison
- `ops/deploy/devops-complete-handoff.md` — full DevOps handoff guide
- `ops/mysql/deployment.sql` — database schema
