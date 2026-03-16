# Amazon VOC Dashboard

Voice of Customer analytics for Amazon.in products.

This repo does four things:

- scrapes Amazon reviews with Selenium + Chrome
- tags each review with sentiment, primary categories, and sub-tags
- stores analytics data in MySQL
- exposes a React dashboard for CXO and analyst use

## Recommended deployment architecture

Use 4 separate parts in production:

1. Frontend
- host as a static site on Netlify
- serves:
  - `/`
  - `/pipeline-console.html`

2. Backend API
- host on a Linux VM
- run with Docker
- serves `/api/*`

3. MySQL
- managed or VM-hosted remote MySQL
- stores all analytics data and pipeline queue state

4. Scraping machine
- Windows machine with Chrome and Amazon login
- either:
  - analyst runs the pipeline manually from the laptop, or
  - a Windows worker runs `pipeline/worker.py`

This keeps the frontend cheap and static, while the backend remains simple to operate on one VM.

## Who uses what

- CXO:
  - open the main dashboard only
- Analyst:
  - use the dashboard
  - click the `Pipeline` button in the header when they need to run or manage pipeline operations
- Admin / you:
  - deploy the frontend
  - deploy the backend
  - configure MySQL
  - set up the Windows scraping machine if you want click-to-run from production

## Frontend / backend split

The frontend is now explicitly separated from the backend:

- frontend talks to the backend using `VITE_API_BASE_URL`
- backend enables CORS using `ALLOWED_ORIGINS`
- frontend no longer assumes `/api` is on the same host in production

### Production hostnames

Recommended:

- frontend: `https://voc.yourcompany.com`
- backend: `https://voc-api.yourcompany.com`

Set:

- frontend env: `VITE_API_BASE_URL=https://voc-api.yourcompany.com`
- backend env: `ALLOWED_ORIGINS=https://voc.yourcompany.com`

Networking note:

- for LAN testing, use the machine's real local network IP, not Docker / WSL / virtual adapter IPs
- for production, backend HTTPS must be reachable from the frontend host and intended client devices

## Pipeline entry point

The dashboard header now includes a `Pipeline` button.

That button opens:

- `pipeline-console.html`

This keeps the main dashboard clean, but makes pipeline operations reachable from the frontend without exposing controls inline in every dashboard page.

## Repo structure

```text
amazon-reviews-scraper/
|-- .env
|-- .env.backend.production
|-- .env.worker.production
|-- docker-compose.local.yml
|-- docker-compose.backend.yml
|-- netlify.toml
|-- data/
|   |-- asins.csv
|   `-- categories.json
|-- backend/
|   |-- main.py
|   |-- requirements.txt
|   `-- Dockerfile
|-- frontend/
|   |-- .env.production
|   |-- index.html
|   |-- pipeline-console.html
|   |-- weekly-run.html
|   |-- package.json
|   |-- vite.config.js
|   `-- src/
|-- ops/
|   |-- mysql/
|   |   |-- deployment.sql
|   |   `-- mysql_setup.sql
|   |-- deploy/
|   |   |-- deployment-options-cto.md
|   |   |-- local-docker.md
|   |   `-- production.md
|   `-- windows/
|       |-- start_pipeline_worker.ps1
|       `-- register_pipeline_worker_task.ps1
|-- pipeline/
|   |-- run_pipeline.py
|   |-- scraper_runner.py
|   |-- tagger.py
|   |-- worker.py
|   `-- requirements.txt
`-- shared/
    `-- env.py
```

## SQL deployment file

Use this file for deployment-time DB setup:

- `ops/mysql/deployment.sql`

It creates:

- database `world`
- app user `llm_reader`
- all required tables
- worker queue tables
- seed row for `pipeline_runs`

Keep `ops/mysql/mysql_setup.sql` only as the older compatibility script. For new deployments, use `ops/mysql/deployment.sql`.

## Environment variables

### Local Python / worker

Uses:

- `.env`

Important values:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `OPENAI_API_KEY`
- `CHROME_PROFILE`
- `PIPELINE_EXECUTION_MODE`

### Backend VM

Uses:

- `.env.backend.production`

Current file is already tracked with placeholders. Fill it and deploy.

Important values:

- `DB_HOST`
- `DB_USER=llm_reader`
- `DB_PASSWORD`
- `DB_NAME=world`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS`
- `PIPELINE_EXECUTION_MODE=worker`
- `PIPELINE_WORKER_TIMEOUT_SECONDS`

### Windows worker machine

Uses:

- `.env.worker.production`

Current file is already tracked with placeholders. Fill it if you are using hosted worker mode.

Important values:

- `DB_HOST`
- `DB_USER=llm_reader`
- `DB_PASSWORD`
- `DB_NAME=world`
- `OPENAI_API_KEY`
- `CHROME_PROFILE`
- `CHROMEDRIVER_PATH`
- `SCRAPER_PAUSE`
- `PIPELINE_WORKER_ID`
- `PIPELINE_WORKER_POLL_SECONDS`
- `PIPELINE_WORKER_HEARTBEAT_SECONDS`

### Frontend static host

Tracked frontend production env file:

- `frontend/.env.production`

If using Netlify, set the same value in the hosting environment:

- `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

Do not include a trailing slash.

## Local run

### Option 1: normal local development

Backend:

```powershell
cd .\backend
uvicorn main:app --reload --port 8000
```

Frontend:

```powershell
cd .\frontend
npm run dev
```

URLs:

- dashboard: `http://localhost:5173`
- pipeline console: `http://localhost:5173/pipeline-console.html`

This is the best local mode if you want to scrape from the same Windows machine.

### Option 2: local Docker

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

URLs:

- dashboard: `http://localhost:8080`
- pipeline console: `http://localhost:8080/pipeline-console.html`

This is mainly for local packaging / deployment verification. Real Selenium scraping is still best run directly on Windows.

Stop:

```powershell
docker compose -f docker-compose.local.yml down
```

## Production deployment

### Frontend

Recommended host:

- Netlify

Why:

- static site only
- simple multipage support
- cheap
- no need to run frontend in Docker on the VM

Netlify config already exists at:

- `netlify.toml`

Frontend deploy settings:

- base directory: `frontend`
- build command: `npm run build`
- publish directory: `dist`
- env:
  - `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

### Backend

Recommended host:

- one Linux VM

Recommended runtime:

- Docker Compose

Backend deploy command:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

Useful commands:

```bash
docker compose -f docker-compose.backend.yml ps
docker compose -f docker-compose.backend.yml logs -f
docker compose -f docker-compose.backend.yml down
docker compose -f docker-compose.backend.yml up -d --build
```

Backend env file:

- `.env.backend.production`

Worker env file:

- `.env.worker.production`

### MySQL

Run:

- `ops/mysql/deployment.sql`

### Production URLs

Example:

- frontend dashboard: `https://voc.yourcompany.com`
- frontend pipeline page: `https://voc.yourcompany.com/pipeline-console.html`
- backend API: `https://voc-api.yourcompany.com`

## How pipeline works in production

You have 2 valid models.

### Model A: cheapest manual model

- frontend is hosted
- backend is hosted
- MySQL is hosted
- analyst runs pipeline manually from a Windows laptop

Analyst laptop needs:

- Python
- Chrome
- repo code
- `.env` pointing to remote MySQL
- Amazon login in the configured Chrome profile

Command:

```powershell
py .\pipeline\run_pipeline.py
```

This is the cheapest model and does not need an always-on worker.

### Model B: click-to-run worker model

- frontend is hosted
- backend is hosted
- MySQL is hosted
- Windows worker runs `pipeline/worker.py`

Analyst uses:

- `https://voc.yourcompany.com/pipeline-console.html`

Backend queues a job in MySQL.
Windows worker picks it up and runs scraping.

This is smoother operationally, but requires a Windows machine to stay available.

## What DevOps needs to deploy

Ask DevOps for:

1. Frontend static hosting
- Netlify site connected to this repo
- build base: `frontend`
- build command: `npm run build`
- publish dir: `dist`
- env:
  - `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

2. Backend VM
- one Linux VM
- Docker installed
- Docker Compose plugin installed
- repo copied or pulled onto the VM
- `.env.backend.production` filled
- backend started with:
  - `docker compose -f docker-compose.backend.yml up -d --build`

3. Backend domain / routing
- one DNS name for backend, for example `voc-api.yourcompany.com`
- reverse proxy or firewall rule exposing backend on HTTPS
- route that forwards traffic to VM port `8000`

4. MySQL
- remote MySQL instance
- run:
  - `ops/mysql/deployment.sql`
- confirm app user exists:
  - `llm_reader`
- confirm access exists for:
  - `pipeline_jobs`
  - `pipeline_workers`

5. Network and secrets
- backend VM must be able to reach:
  - MySQL
  - OpenAI API
- set backend secrets in `.env.backend.production`

6. CORS
- backend `ALLOWED_ORIGINS` must include the frontend domain

7. Optional Windows worker
- if you want click-to-run from production:
  - one Windows machine
  - Chrome
  - Amazon login session
  - repo cloned
  - `.env.worker.production` filled
  - worker started with:
    - `powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1`

## Dashboard behavior at larger portfolio size

- tables show the full product list
- product-heavy charts focus on the top products by default when no specific product filter is applied
- explicit product filters override that default

## Deployment references

- CTO comparison: `ops/deploy/deployment-options-cto.md`
- DevOps full handoff: `ops/deploy/devops-complete-handoff.md`
- DevOps quick handoff: `ops/deploy/devops-handoff.md`
- production deployment: `ops/deploy/production.md`
- local Docker notes: `ops/deploy/local-docker.md`
