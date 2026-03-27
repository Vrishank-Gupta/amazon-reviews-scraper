# Production Deployment

This document describes the recommended production setup:

- frontend on the Linux VM in Docker
- backend on the same Linux VM in Docker
- MySQL hosted remotely
- optional Windows worker for click-to-run pipeline execution

## Recommended architecture

### Backend

Host on:

- one Linux VM, alongside the frontend

Run with:

- Docker Compose

Use:

- `docker-compose.production.yml`
- `.env.production`

Start:

```bash
docker compose -f docker-compose.production.yml up -d --build
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

## VM deployment

1. Copy the repo to the VM.
2. Install Docker and Docker Compose plugin.
3. Fill `.env.production`.
4. Start the full stack:

```bash
docker compose -f docker-compose.production.yml up -d --build
```

Useful commands:

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d --build
```

This exposes the frontend on port 80. The frontend nginx proxies `/api/` and `/health` to the backend container on the internal Docker network.

## Frontend on the same VM

The frontend is built with the repo's Dockerfile and served by nginx inside the `frontend` container.

Serves:

- `/`
- `/pipeline-console.html`
- `/api/...` via nginx proxy to the backend container

## Backend env file

Use:

- `.env.production`

Important values:

- `DB_HOST`
- `DB_USER=llm_reader`
- `DB_PASSWORD`
- `DB_NAME=world`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS=http://your-server-ip,http://your-domain`
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

- frontend + API: `voc.yourcompany.com`

If you later put a reverse proxy or load balancer in front, it should route the same host to this VM. The frontend already proxies API traffic internally, so the browser only needs one public origin.

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

- dashboard: `http://your-server-ip/` or `https://voc.yourcompany.com/`
- pipeline page: `http://your-server-ip/pipeline-console.html` or `https://voc.yourcompany.com/pipeline-console.html`

The dashboard header includes a `Pipeline` button that links to the pipeline page.
