# Deployment Options for CTO Review

This document compares the two practical deployment models for this Amazon VOC system.

It is written for decision-making, not day-to-day operations.

## Executive Summary

There are two realistic ways to operate this product today:

1. Manual analyst-run pipeline with hosted dashboard
2. Hosted dashboard with separate always-on Windows worker

Both models use the same core stack:

- React frontend
- FastAPI backend
- remote MySQL
- Selenium + Chrome scraping

The main difference is how scraping is triggered and how much operational reliability is required.

## Shared Constraints

The scraper is not a pure server-side job. It currently depends on:

- a Windows environment
- Chrome installed locally
- a reusable Chrome profile
- a valid Amazon login session

Because of that, scraping should not be treated as a normal Linux web-server background task.

This is the reason the architecture separates:

- hosted dashboard and API
- browser-capable scraping runtime

## Common Components

Both deployment models use these components:

### 1. Remote MySQL

This is the system of record.

It stores:

- raw reviews
- review tags
- rating snapshots
- product summaries
- pipeline run status
- optional worker queue and heartbeat data

### 2. Hosted Dashboard

This is the read-only web application used by CXO and analysts.

It serves:

- `/`
- `/pipeline-console.html`
- `/api/*`

Recommended hosting model:

- one small Linux VM
- Docker Compose

### 3. Windows Scraping Runtime

This is the machine that actually opens Chrome and performs scraping.

It can be:

- an analyst laptop
- an admin laptop
- a dedicated office PC
- a Windows VM

The difference between the two deployment approaches is how that Windows machine is used.

---

## Option A: Manual Analyst-Run Pipeline

### Description

In this model:

- dashboard is hosted
- MySQL is hosted
- analyst runs the scraping script manually from a Windows laptop every Monday or on demand

The laptop is not a continuously running worker.

It is used only when a refresh is needed.

### Process Flow

1. Dashboard is hosted on Linux
2. MySQL is hosted remotely
3. Analyst opens their Windows laptop
4. Analyst runs the pipeline locally from the repo
5. Laptop scrapes Amazon using local Chrome profile
6. Laptop writes results directly into remote MySQL
7. Hosted dashboard reads fresh data from MySQL

### What the analyst needs

- Windows laptop
- Python installed
- Chrome installed
- repo available locally
- access to remote MySQL
- `.env` configured for remote MySQL
- valid Amazon login in the configured Chrome profile

### What the analyst does not need

- MySQL installed locally
- Docker
- backend or frontend running locally

### Example operating command

```powershell
py .\pipeline\run_pipeline.py
```

### Advantages

- lowest cost
- lowest infrastructure complexity
- no always-on Windows machine required
- easy to start with
- good fit if refresh cadence is weekly and predictable

### Disadvantages

- manual process
- dependent on analyst discipline
- dependent on analyst laptop being correctly configured
- no one-click hosted run from browser
- operational continuity depends on a person
- no guaranteed run if analyst is absent or laptop is unavailable

### Best fit

Use this model if:

- weekly refresh is acceptable
- real-time or on-demand refresh is not required
- minimizing infrastructure cost is the priority
- you are comfortable with a human-operated weekly refresh process

### CTO view

This is the most economical model and likely the best starting point if the organization is still validating internal value before investing in operational automation.

---

## Option B: Hosted Dashboard + Always-On Windows Worker

### Description

In this model:

- dashboard is hosted
- MySQL is hosted
- a Windows machine runs `pipeline/worker.py`
- analysts use the hosted `pipeline-console.html`
- backend queues jobs in MySQL
- worker claims and executes them

This is the semi-automated operational model.

### Process Flow

1. Analyst opens hosted `pipeline-console.html`
2. Analyst clicks Run
3. Hosted backend writes a job into `pipeline_jobs`
4. Windows worker polls MySQL and sees the queued job
5. Worker claims the job
6. Worker runs scraper and tagger locally
7. Worker writes results back to MySQL
8. Dashboard reflects updated data

### Worker machine requirements

- Windows
- Chrome installed
- stable Chrome profile path
- valid Amazon login session
- repo deployed locally
- Python dependencies installed
- continuous or scheduled worker process

### Recommended worker types

Preferred:

- dedicated office Windows PC
- always-on Windows mini PC
- Windows VM

Acceptable but less reliable:

- analyst laptop

### Advantages

- browser-triggered runs from hosted UI
- analysts do not need to use terminals
- cleaner operating experience
- better separation between dashboard and scraping responsibilities
- more scalable operationally than manual weekly runs

### Disadvantages

- more moving parts
- requires queue tables and DB permissions
- requires worker installation and monitoring
- still dependent on Windows browser environment
- slightly higher operating cost

### Best fit

Use this model if:

- analysts should be able to trigger runs from the hosted app
- manual script execution is undesirable
- a somewhat more professional operations model is needed
- one additional Windows runtime is acceptable

### CTO view

This is the better medium-term operating model. It gives cleaner separation of concerns and removes manual terminal work from analysts, while still respecting the browser/login constraints of the scraper.

---

## Architectural Comparison

| Area | Option A: Manual Analyst Run | Option B: Hosted UI + Worker |
|---|---|---|
| Dashboard hosting | Linux VM | Linux VM |
| Database hosting | Remote MySQL | Remote MySQL |
| Scraping runtime | Analyst laptop, manual | Windows worker, persistent |
| Analyst UX | Run local script | Use hosted pipeline console |
| Terminal required | Yes | No, after worker setup |
| Operational reliability | Lower | Higher |
| Infrastructure cost | Lowest | Low to medium |
| Setup complexity | Low | Medium |
| Suitable for weekly refresh | Yes | Yes |
| Suitable for on-demand internal refresh | Weak | Good |
| Suitable for unattended operation | No | Partially |

---

## Cost Perspective

### Option A

Typical cost profile:

- Linux VM for dashboard
- remote MySQL
- no dedicated Windows infrastructure

This is the cheapest model.

### Option B

Typical cost profile:

- Linux VM for dashboard
- remote MySQL
- one Windows machine or VM kept available

This is still low-cost compared to a fully engineered automation platform, but higher cost than Option A.

---

## Operational Risk Comparison

### Option A Risks

- weekly refresh missed because analyst forgets
- laptop environment drifts
- Amazon login expires before run
- refresh depends on one individual being available

### Option B Risks

- worker machine goes offline
- queue permissions not provisioned correctly
- worker service stops or loses session
- Amazon login expires on worker machine

### Shared Risks

- Amazon anti-automation friction
- Chrome profile/session invalidation
- taxonomy or tagger failures
- DB connectivity issues

---

## Recommended Decision Logic

### Choose Option A if:

- the business only needs weekly refresh
- cost minimization is more important than operational polish
- the organization accepts a manual analyst step

### Choose Option B if:

- analysts should operate from the hosted UI only
- there is value in reducing manual technical steps
- a cleaner internal operating model is needed
- the team can support one always-on Windows runtime

---

## Practical Recommendation

For current maturity, the recommended phased approach is:

### Phase 1

Start with Option A.

Reason:

- lowest cost
- fastest path to production use
- very little infrastructure overhead

### Phase 2

Move to Option B once:

- refresh frequency increases
- analyst self-service from the hosted UI becomes important
- reliability expectations rise

This avoids over-investing in operations before usage patterns are proven.

---

## What DevOps / Infra Needs To Support

Regardless of option:

- provision remote MySQL
- run `ops/mysql/mysql_setup.sql`
- ensure `llm_reader` has access to all tables, including:
  - `pipeline_jobs`
  - `pipeline_workers`
- deploy Linux Docker app

Additional for Option B:

- provision and maintain a Windows worker machine
- ensure repo + Python + Chrome + profile are configured there

---

## Final Recommendation

If the requirement is:

"A weekly Monday refresh is enough and cost should stay minimal"

then Option A is the correct operational choice now.

If the requirement becomes:

"Analysts should trigger refreshes from the hosted product without touching terminals"

then Option B is the correct next step.
