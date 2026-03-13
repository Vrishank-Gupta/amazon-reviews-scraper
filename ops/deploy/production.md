# Production Deployment

This repo is packaged for a cheap production setup with a separate Windows scraping worker.

## Target architecture

- one Linux VM for dashboard + backend
- one remote MySQL instance
- one Windows machine for Selenium scraping

The Linux VM serves:

- `/`
- `/pipeline-console.html`
- `/api/*`

The Windows machine runs:

- `pipeline/worker.py`

## Why the worker exists

The production Docker app can serve the UI and queue jobs, but the Amazon scraper still needs:

- Windows
- Chrome
- a local Chrome profile
- an interactive Amazon login session

The worker solves that by polling MySQL for queued jobs and running the pipeline on the Windows machine.

## Environment selection

- `docker-compose.prod.yml` injects `.env.production`
- it sets `APP_ENV=production`
- production should use `PIPELINE_EXECUTION_MODE=worker`
- the Windows worker should usually use `.env` with the same remote MySQL values
- if needed, override with `APP_ENV_FILE=/absolute/path/to/envfile`

## Deploy the Linux VM

1. Copy the repo to the VM.
2. Install Docker and Docker Compose plugin.
3. Fill in `.env.production`.
4. Start:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Useful commands:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

## Configure the Windows worker

1. Clone the same repo on the Windows machine.
2. Fill `.env` so it points to the same remote MySQL used by production.
3. Set `CHROME_PROFILE` to the local Windows Chrome profile path.
4. Confirm Amazon is logged in in that profile.
5. Install Python dependencies.
6. Start the worker.

Manual start:

```powershell
py .\pipeline\worker.py
```

Helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1
```

Scheduled task at user logon:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\register_pipeline_worker_task.ps1
```

## What analysts do

Analysts use:

- `http://<server-ip>/pipeline-console.html`

When they click run:

- backend writes a job to `pipeline_jobs`
- worker claims the job
- worker runs `pipeline/run_pipeline.py`
- worker updates job status and heartbeat

No terminal is required for the analyst once the worker is installed and kept running.

## Persistent app-managed files

The backend writes to:

- `data/asins.csv`
- `data/categories.json`

Those stay persistent via:

```yaml
volumes:
  - ./data:/app/data
```

## Database tables required for worker mode

These are included in `ops/mysql/mysql_setup.sql`:

- `pipeline_jobs`
- `pipeline_workers`

## Notes

- the executive dashboard stays pipeline-free
- the pipeline console is the analyst entry point
- if the pipeline console says no worker is connected, the Windows worker is not heartbeating into MySQL
