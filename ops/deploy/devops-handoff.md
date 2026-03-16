# DevOps Handoff

## What to deploy

Deploy 3 things:

1. Frontend
- static hosting
- recommended: Netlify

2. Backend API
- Linux VM
- Docker Compose

3. MySQL
- remote MySQL instance

Optional:

4. Windows worker machine
- only if hosted click-to-run pipeline execution is required

## Frontend requirements

Use:

- `netlify.toml`
- `frontend/.env.production`

Set:

- base directory: `frontend`
- build command: `npm run build`
- publish directory: `dist`
- env:
  - `VITE_API_BASE_URL=https://voc-api.yourcompany.com`

## Backend requirements

Use:

- `docker-compose.backend.yml`
- `.env.backend.production`

Run:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

Backend VM must be able to reach:

- remote MySQL
- OpenAI API

## MySQL requirements

Run:

- `ops/mysql/deployment.sql`

This must create and grant access for:

- database: `world`
- user: `llm_reader`
- queue tables:
  - `pipeline_jobs`
  - `pipeline_workers`

## DNS / SSL

Provision:

- frontend domain, for example:
  - `voc.yourcompany.com`
- backend API domain, for example:
  - `voc-api.yourcompany.com`

Backend must be exposed over HTTPS and must allow the frontend origin in:

- `ALLOWED_ORIGINS`

## Backend environment values

Set in `.env.backend.production`:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS=https://voc.yourcompany.com`
- `PIPELINE_EXECUTION_MODE=worker`

## Optional Windows worker

If required:

- Windows machine with Chrome
- Amazon login in the configured Chrome profile
- repo cloned
- `.env.worker.production` pointing to the same remote MySQL
- run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1
```

Without this worker, analysts can still run the pipeline manually from a Windows laptop using:

```powershell
py .\pipeline\run_pipeline.py
```
