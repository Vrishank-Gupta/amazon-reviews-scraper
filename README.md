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
| Frontend | React + Vite SPA | Netlify (static) |
| Backend API | FastAPI + uvicorn | Linux VM (Docker) |
| Database | MySQL 8 | Managed or VM |
| Scraper | Selenium + Chrome | Windows machine |

---

## Repo structure

```
amazon-reviews/
├── .env                          # local secrets (gitignored)
├── .env.backend.production       # backend VM template
├── .env.worker.production        # Windows worker template
├── docker-compose.local.yml      # local dev with Docker
├── docker-compose.backend.yml    # backend-only VM deploy
├── netlify.toml                  # Netlify frontend config
├── data/
│   ├── asins.csv                 # products to scrape
│   └── categories.json
├── backend/
│   ├── main.py                   # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── pipeline-console.html
│   ├── vite.config.js
│   └── Dockerfile
├── pipeline/
│   ├── run_pipeline.py           # entry point (scrape → tag)
│   ├── scraper_runner.py         # Selenium scraper
│   ├── scraper.py                # scraping logic
│   ├── tagger.py                 # AI tagger
│   ├── worker.py                 # Windows background worker
│   ├── requirements.txt          # Windows worker deps (includes selenium)
│   └── requirements.backend.txt  # Docker backend deps (no selenium)
├── shared/
│   └── env.py                    # .env loader
└── ops/
    ├── mysql/
    │   └── deployment.sql        # DB setup
    ├── deploy/                   # full deployment guides
    └── windows/                  # Windows worker scripts
```

---

## Local development

### Prerequisites

- Python 3.11+
- Node 20+
- MySQL 8 running locally
- Chrome + chromedriver (for scraping)

### 1. Set up `.env`

```
DB_HOST=localhost
DB_USER=llm_reader
DB_PASSWORD=your_password
DB_NAME=world
OPENAI_API_KEY=sk-...
```

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

- Dashboard: `http://localhost:5173`
- Pipeline console: `http://localhost:5173/pipeline-console.html`
- API: `http://localhost:8000`

`npm install` runs automatically on first launch if `node_modules` is missing.

### 5. Run the scraper (Windows)

```powershell
cd pipeline
pip install -r requirements.txt
py run_pipeline.py
```

On first run, Chrome opens and asks you to log in to Amazon. After that the session is saved to `chrome-profile/` in the repo root — no re-login needed on future runs.

---

## VM deployment

### What you need

- 1 Linux VM (2 vCPU, 2–4 GB RAM) with Docker + Docker Compose
- Remote MySQL 8 instance
- Netlify account for the frontend
- Windows machine for scraping (your laptop or a Windows VM)

### Step 1 — Set up the database

Run on your MySQL instance:

```bash
mysql -u root -p < ops/mysql/deployment.sql
```

### Step 2 — Deploy the backend on the VM

Copy the repo to the VM. Fill in `.env.backend.production`:

```
DB_HOST=your-mysql-host
DB_USER=llm_reader
DB_PASSWORD=your_password
DB_NAME=world
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://your-frontend-domain.com
PIPELINE_EXECUTION_MODE=worker
PIPELINE_WORKER_TIMEOUT_SECONDS=180
```

Start the backend:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

The backend runs on port `8000`. Put a reverse proxy (nginx, Caddy) in front of it with HTTPS.

### Step 3 — Deploy the frontend on Netlify

Connect the repo on Netlify with:

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://your-backend-domain.com`

### Step 4 — Configure the scraping machine (Windows)

Fill in `.env.worker.production` on the Windows machine:

```
DB_HOST=your-mysql-host
DB_USER=llm_reader
DB_PASSWORD=your_password
DB_NAME=world
OPENAI_API_KEY=sk-...
PIPELINE_EXECUTION_MODE=worker
```

**Option A — manual scraping** (simpler): analyst runs:

```powershell
py pipeline\run_pipeline.py
```

**Option B — background worker** (click-to-run from the dashboard): run the worker service:

```powershell
powershell -ExecutionPolicy Bypass -File ops\windows\start_pipeline_worker.ps1
```

Analysts then use the Pipeline button in the dashboard to trigger a run without touching the terminal.

---

## Chrome profile

The scraper stores the Chrome session at `chrome-profile/` inside the repo root (auto-created, gitignored). Login once, all future runs reuse the session.

To use a custom location, set `CHROME_PROFILE=C:\your\path` in `.env`.

---

## Key environment variables

| Variable | Used by | Description |
|---|---|---|
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | all | MySQL connection |
| `OPENAI_API_KEY` | backend, tagger | GPT-4o-mini tagging + summaries |
| `ALLOWED_ORIGINS` | backend | CORS — set to your frontend URL |
| `PIPELINE_EXECUTION_MODE` | backend | `worker` = queue to MySQL; omit for direct |
| `CHROME_PROFILE` | Windows worker | Chrome session path (defaults to `chrome-profile/`) |
| `CHROMEDRIVER_PATH` | Windows worker | Leave empty if chromedriver is on PATH |
| `VITE_API_BASE_URL` | frontend build | Backend API URL for production builds |

---

## Dashboard

Three tabs:

- **Overview** — KPI tiles, Amazon rating trend, top issues, top positives, sentiment over time
- **Trends** — week-on-week digest, emerging issues, brand health score, problem rate by product, issue pressure over time, rating distribution
- **Reviews** — full review table with filters and CSV export

All charts and issue widgets have per-widget product dropdowns that respect the global filter bar.

---

## Full deployment docs

- `ops/deploy/production.md` — step-by-step production setup
- `ops/deploy/deployment-options-cto.md` — Model A vs Model B comparison
- `ops/deploy/devops-complete-handoff.md` — full DevOps handoff guide
- `ops/mysql/deployment.sql` — database schema and seed data
