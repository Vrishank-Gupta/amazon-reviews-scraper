# Local Docker Run

This mode runs the dashboard stack locally with Docker while still using your existing `.env` credentials.

## What it does

- builds and runs frontend + backend locally
- uses your existing `.env`
- overrides `DB_HOST` to `host.docker.internal` by default so Docker can reach MySQL on your Windows host
- keeps `data/` mounted so local ASIN/category edits persist
- keeps pipeline operations on the separate analyst URLs

## Start

From repo root:

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

URLs:

- Dashboard: `http://localhost:8080`
- Pipeline Console: `http://localhost:8080/pipeline-console.html`

## Stop

```powershell
docker compose -f docker-compose.local.yml down
```

## Rebuild after code changes

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

## Database host behavior

The local Docker compose file uses:

```text
DB_HOST=host.docker.internal
```

inside the backend container by default.

If your MySQL is remote, set `DOCKER_DB_HOST` before starting:

```powershell
$env:DOCKER_DB_HOST="your-remote-mysql-host"
docker compose -f docker-compose.local.yml up -d --build
```

## Pipeline behavior in local Docker

The Linux Docker backend is usually in worker mode, not direct mode.

That means:

- the analyst pages still work
- the queue/status UI still works
- actual scraping requires either:
  - a separate Windows worker, or
  - running the app in plain local Windows mode with `uvicorn` + `npm run dev`

If you want click-to-run from the Docker-hosted analyst pages, start the Windows worker from the same repo on the Windows host:

```powershell
py .\pipeline\worker.py
```

or:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1
```

## Scraping without the worker

If you do not want the worker in local Docker, run scraping manually outside Docker:

```powershell
py .\pipeline\scraper_runner.py
py .\pipeline\tagger.py
```

or:

```powershell
py .\pipeline\run_pipeline.py
```
