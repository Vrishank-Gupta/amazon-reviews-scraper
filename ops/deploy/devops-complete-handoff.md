# DevOps Complete Handoff

This document is the step-by-step deployment handoff for the Amazon VOC Dashboard system.

It covers:

- what infrastructure is needed
- what credentials and access are needed
- what cloud / VM resources to provision
- what to deploy where
- what commands to run
- what still requires business-side input

## 1. Target architecture

Deploy the system as 4 separate parts:

1. Frontend
- static hosting
- recommended: Netlify

2. Backend API
- one Linux VM
- Docker Compose

3. Database
- remote MySQL

4. Scraping runtime
- one Windows machine with Chrome
- either:
  - analyst runs pipeline manually from laptop, or
  - Windows worker runs continuously for click-to-run pipeline from the hosted frontend

## 2. What DevOps needs from the business / product team

Before deployment, DevOps needs the following:

### A. OpenAI API key

Needed for:

- review tagging
- AI-generated summaries

Ask for:

- one production OpenAI API key

Where it goes:

- backend environment file

Variable:

- `OPENAI_API_KEY`

### B. Amazon account for scraping

Needed for:

- logging into Amazon in the Chrome profile used by Selenium

Ask for:

- one Amazon account dedicated for scraping
- login email / phone
- password
- any MFA / OTP process that may be needed

Important:

- this is not used in backend env vars
- this is used only on the Windows scraping machine inside Chrome
- someone must log into Amazon once on that Windows machine in the configured Chrome profile

### C. MySQL connection details

If DevOps is also provisioning MySQL, they can create this themselves.
If not, they need:

- MySQL host
- MySQL port
- MySQL admin access for bootstrap

### D. Domain names

Recommended:

- frontend: `voc.yourcompany.com`
- backend: `voc-api.yourcompany.com`

### E. Deployment ownership decision

DevOps should confirm which pipeline model is being used:

1. Manual analyst-run model
- cheapest
- analyst runs pipeline from Windows laptop manually
- no always-on worker needed

2. Windows worker model
- smoother UX
- analysts can trigger runs from the hosted frontend
- requires a Windows machine that stays available

## 3. Infrastructure to provision

### Frontend

Provision:

- one static site hosting service

Recommended:

- Netlify

Why:

- frontend is pure static output
- no server-side rendering needed
- cheap and easy to operate

### Backend

Provision:

- one Linux VM

Recommended minimum:

- 2 vCPU
- 4 GB RAM
- Ubuntu 22.04 or similar

This VM will host:

- FastAPI backend
- Docker container

### Database

Provision:

- one remote MySQL instance

Recommended:

- MySQL 8.x

Minimum practical version:

- MySQL 5.7+

### Optional Windows worker machine

Only if using hosted click-to-run pipeline.

Provision:

- one Windows machine or Windows VM

It needs:

- Chrome installed
- repo cloned
- Python installed
- access to the same remote MySQL
- Amazon account logged into Chrome profile

## 4. Files DevOps should use

### SQL bootstrap

Use:

- [ops/mysql/deployment.sql](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\ops\mysql\deployment.sql)

This is the main DB setup file for deployment.

### Backend deployment

Use:

- [docker-compose.backend.yml](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\docker-compose.backend.yml)
- [.env.backend.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\.env.backend.production)
- [backend/Dockerfile](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\backend\Dockerfile)

### Frontend deployment

Use:

- [netlify.toml](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\netlify.toml)
- [frontend/.env.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\frontend\.env.production)

### Windows worker

Use:

- [pipeline/worker.py](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\pipeline\worker.py)
- [.env.worker.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\.env.worker.production)
- [ops/windows/start_pipeline_worker.ps1](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\ops\windows\start_pipeline_worker.ps1)
- [ops/windows/register_pipeline_worker_task.ps1](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\ops\windows\register_pipeline_worker_task.ps1)

## 5. Step-by-step deployment

### Step 1. Provision MySQL

DevOps should:

1. create or select a MySQL instance
2. connect with admin credentials
3. run:

```sql
SOURCE ops/mysql/deployment.sql;
```

Or equivalently:

```bash
mysql -u <admin-user> -p < ops/mysql/deployment.sql
```

Expected result:

- database `world` created
- app user `llm_reader` created
- all application tables created
- queue tables created:
  - `pipeline_jobs`
  - `pipeline_workers`

### Step 2. Provision backend VM

DevOps should:

1. create one Linux VM
2. install:
   - Docker
   - Docker Compose plugin
3. clone or copy this repo to the VM
4. fill:
   - [.env.backend.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\.env.backend.production)

Required values:

- `DB_HOST`
- `DB_USER=llm_reader`
- `DB_PASSWORD`
- `DB_NAME=world`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS=https://voc.yourcompany.com`
- `PIPELINE_EXECUTION_MODE=worker`

### Step 3. Start backend on the VM

From repo root on the VM:

```bash
docker compose -f docker-compose.backend.yml up -d --build
```

Verify:

```bash
docker compose -f docker-compose.backend.yml ps
docker compose -f docker-compose.backend.yml logs -f
```

Backend should expose:

- port `8000`

### Step 4. Configure backend HTTPS / DNS

DevOps should:

1. assign a DNS name to the VM, for example:
   - `voc-api.yourcompany.com`
2. terminate HTTPS via:
   - reverse proxy, load balancer, or VM-level proxy
3. route HTTPS traffic to backend container port `8000`

Backend base URL example:

- `https://voc-api.yourcompany.com`

Networking note:

- for local or pre-production LAN testing, use the machine's real LAN IP, not Docker, WSL, or virtual adapter IPs
- for production, ensure VM firewall / security group / reverse proxy allows inbound HTTPS to the backend domain
- if frontend and backend are tested from separate devices, confirm those devices can reach the exposed host and port

### Step 5. Deploy frontend

Recommended host:

- Netlify

DevOps should:

1. connect the repo to Netlify
2. use:
   - base directory: `frontend`
   - build command: `npm run build`
   - publish directory: `dist`
3. set frontend env:

```text
VITE_API_BASE_URL=https://voc-api.yourcompany.com
```

Tracked fallback file:

- [frontend/.env.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\frontend\.env.production)

4. assign frontend domain:

- `https://voc.yourcompany.com`

### Step 6. Configure backend CORS

Backend environment must allow the frontend domain:

```text
ALLOWED_ORIGINS=https://voc.yourcompany.com
```

If multiple frontends are needed:

```text
ALLOWED_ORIGINS=https://voc.yourcompany.com,https://staging-voc.yourcompany.com
```

### Step 7. Choose pipeline operating model

DevOps and product team should choose one of the following.

## 6. Pipeline operating model A: manual analyst-run

Use this if:

- cost must stay minimal
- weekly manual run is acceptable
- no click-to-run from hosted frontend is required

How it works:

1. frontend and backend are hosted
2. analyst uses a Windows laptop
3. analyst runs:

```powershell
py .\pipeline\run_pipeline.py
```

4. laptop scrapes Amazon locally
5. laptop writes data into remote MySQL
6. hosted dashboard reads updated data

Requirements on analyst laptop:

- Python installed
- Chrome installed
- repo cloned
- `.env` pointing to remote MySQL
- `CHROME_PROFILE` set
- Amazon account logged into that Chrome profile

MySQL is not needed locally on the laptop.

## 7. Pipeline operating model B: Windows worker

Use this if:

- analysts should trigger runs from the hosted frontend
- you want smoother operations
- a Windows machine can be kept available

How it works:

1. analyst opens:
   - `https://voc.yourcompany.com/pipeline-console.html`
2. analyst clicks run
3. backend writes a job into:
   - `pipeline_jobs`
4. Windows worker reads the job
5. Windows worker runs scraper + tagger
6. worker writes status back to MySQL
7. dashboard reflects updated data

### Windows worker setup steps

On the Windows machine:

1. install Python
2. install Chrome
3. clone the repo
4. fill [.env.worker.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\.env.worker.production) with the same remote MySQL values
5. set:

```text
CHROME_PROFILE=C:\path\to\chrome-profile
```

6. open Chrome with that profile
7. log into Amazon manually once
8. install dependencies:

```powershell
py -m pip install -r .\backend\requirements.txt
py -m pip install -r .\pipeline\requirements.txt
```

9. start worker:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\start_pipeline_worker.ps1
```

Optional auto-start:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\windows\register_pipeline_worker_task.ps1
```

## 8. Credentials and secrets summary

DevOps needs:

- MySQL admin access for initial bootstrap
- final MySQL app password for `llm_reader`
- OpenAI API key
- frontend and backend domain names

Business / operations team must provide:

- Amazon account credentials for the scraping browser session
- MFA / OTP support if Amazon asks for it

Important:

- Amazon credentials should not be stored in backend env files
- they are only used interactively on the Windows scraping machine

## 9. Post-deployment verification

DevOps should verify:

### Frontend

- dashboard loads at:
  - `https://voc.yourcompany.com`
- pipeline page loads at:
  - `https://voc.yourcompany.com/pipeline-console.html`

### Backend

- API responds at:
  - `https://voc-api.yourcompany.com/api/filters`
  - `https://voc-api.yourcompany.com/api/pipeline/status`

### MySQL

- tables exist:
  - `raw_reviews`
  - `review_tags`
  - `pipeline_runs`
  - `pipeline_jobs`
  - `pipeline_workers`
  - `product_summaries`
  - `product_ratings_snapshot`

### Worker mode, if enabled

- `pipeline-console.html` shows worker connected
- queued runs move through statuses correctly

## 10. What to ask DevOps directly

You can send DevOps this exact ask:

1. Provision one Linux VM for the backend.
2. Provision or connect one remote MySQL instance.
3. Run [ops/mysql/deployment.sql](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\ops\mysql\deployment.sql).
4. Deploy backend with [docker-compose.backend.yml](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\docker-compose.backend.yml).
5. Fill [.env.backend.production](C:\Users\User\OneDrive - Hero Electronix Pvt. Ltd\Desktop\Amazon Scraper\amazon-reviews-scraper\.env.backend.production) with production values.
6. Expose backend on HTTPS under a domain like `voc-api.yourcompany.com`.
7. Deploy frontend statically, preferably on Netlify, with `VITE_API_BASE_URL` pointing to that backend domain.
8. Configure CORS on backend so frontend domain is allowed.
9. Confirm whether we are using:
   - manual analyst-run pipeline, or
   - Windows worker mode
10. If using worker mode, provision or approve one Windows machine with Chrome and allow Amazon login there.

## 11. Final recommendation

If cost is the main driver:

- deploy frontend + backend + MySQL
- keep pipeline manual from analyst Windows laptop

If convenience is the main driver:

- deploy frontend + backend + MySQL
- add Windows worker

Both models are supported by the current codebase.
