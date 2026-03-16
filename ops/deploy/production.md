# Production Deployment

This document describes the recommended production setup:

- frontend on a static host
- backend on a Linux VM
- MySQL hosted remotely
- optional Windows worker for click-to-run pipeline execution

## Recommended architecture

### Frontend

Host on:

- Netlify

Serves:

- `/`
- `/pipeline-console.html`

Set frontend env:

- `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

Tracked file:

- `frontend/.env.production`

### Backend

Host on:

- one Linux VM

Run with:

- Docker Compose

Use:

- `docker-compose.backend.yml`
- `.env.backend.production`

Start:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

### Database

Use:

- remote MySQL

Run:

- `ops/mysql/deployment.sql`

### Optional worker

If you want pipeline runs from the hosted frontend without asking the analyst to run a local script:

- use one Windows machine
- run `pipeline/worker.py`

If you do not need that, the analyst can run `py .\pipeline\run_pipeline.py` manually from a Windows laptop against the same remote DB.

## Backend VM deployment

1. Copy the repo to the VM.
2. Install Docker and Docker Compose plugin.
3. Fill `.env.backend.production`.
4. Start the backend:

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

## Frontend deployment

Use the root `netlify.toml`.

Ask the frontend host to:

- use repo base `frontend`
- run `npm run build`
- publish `dist`
- set:
  - `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

## Backend env file

Use:

- `.env.backend.production`

Important values:

- `DB_HOST`
- `DB_USER=llm_reader`
- `DB_PASSWORD`
- `DB_NAME=world`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS=https://voc.yourcompany.com`
- `PIPELINE_EXECUTION_MODE=worker`

## MySQL requirements

Run:

- `ops/mysql/deployment.sql`

This creates:

- database `world`
- app user `llm_reader`
- all core tables
- queue tables:
  - `pipeline_jobs`
  - `pipeline_workers`

## DNS / routing

Recommended:

- frontend: `voc.yourcompany.com`
- backend: `voc-api.yourcompany.com`

The backend API must be reachable from the frontend over HTTPS.

## Windows worker setup

Only needed if you want click-to-run pipeline execution from the hosted frontend.

1. Clone the repo on a Windows machine.
2. Fill `.env.worker.production` so it points to the same remote MySQL.
3. Set `CHROME_PROFILE`.
4. Confirm Amazon is logged in in that Chrome profile.
5. Install Python dependencies.
6. Start the worker:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1
```

Or register at logon:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\register_pipeline_worker_task.ps1
```

## What analysts use

- dashboard: `https://voc.yourcompany.com`
- pipeline page: `https://voc.yourcompany.com/pipeline-console.html`

The dashboard header includes a `Pipeline` button that links to the pipeline page.
