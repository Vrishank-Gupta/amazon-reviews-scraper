# Pipeline Commands Reference

All commands run from the project root:
```
C:\Users\Vrishank Gupta\OneDrive - Hero Electronix Pvt. Ltd\Downloads\scraper_refactored\amazon-reviews-scraper
```

---

## 1. Prerequisites — SSH Tunnel

The DB lives on EC2 and only accepts local connections. You must open the tunnel before running any script that touches the DB.

```powershell
# Open tunnel (run once per session, keep terminal open or use -f to background)
ssh -i "C:\Users\Vrishank Gupta\.ssh\analytics-report-key.pem" `
    -L 3306:127.0.0.1:3306 -N -f `
    -o StrictHostKeyChecking=no `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=10 `
    ec2-user@ec2-15-207-57-132.ap-south-1.compute.amazonaws.com

# Verify tunnel is active
netstat -ano | findstr ":3306"
# Should show: TCP  127.0.0.1:3306  LISTENING
```

If you get "Connection refused" from any script, the tunnel has dropped — re-run the ssh command above.

---

## 2. Full Pipeline (Scrape + Tag)

Runs scraper then OpenAI tagger back-to-back. Updates `pipeline_runs` status in DB.

```powershell
# All ASINs in data/asins.csv
python pipeline\run_pipeline.py

# Specific ASINs only
python pipeline\run_pipeline.py B0GJ4LZTBW B0F243ZNYL

# Override OpenAI key for this run only (without editing .env)
$env:OPENAI_API_KEY="sk-...newkey..."; python pipeline\run_pipeline.py
```

---

## 3. Scraper Only

Scrapes reviews and writes to `raw_reviews` table. Does NOT tag. Safe to run weekly — uses `INSERT IGNORE` so duplicates are skipped automatically. Smart cutoff: per-ASIN it checks the latest review date already in DB and only fetches newer reviews.

```powershell
# All ASINs
python pipeline\scraper_runner.py

# One ASIN
python pipeline\scraper_runner.py B0GJ4LZTBW

# Multiple ASINs
python pipeline\scraper_runner.py B0GJ4LZTBW B0F243ZNYL B0CGQXY29P

# Slow down if getting rate-limited by Amazon (default is 8s between ASINs)
$env:SCRAPER_PAUSE="15"; python pipeline\scraper_runner.py

# Change how far back to scrape for first-time ASINs (default 90 days)
$env:SCRAPE_DAYS_BACK="30"; python pipeline\scraper_runner.py
```

---

## 4. Tagger Only (OpenAI)

Tags all untagged reviews currently in DB. Reads directly from DB — no JSON files needed. Safe to run any time; uses `INSERT IGNORE` so already-tagged reviews are skipped.

```powershell
python pipeline\tagger.py

# Override key for this run
$env:OPENAI_API_KEY="sk-...newkey..."; python pipeline\tagger.py
```

---

## 5. Manual Tagging Workflow (Claude instead of OpenAI)

Use this when you want Claude Code to do the tagging instead of the OpenAI API.

```powershell
# Step 1 — dump untagged reviews to JSON
python pipeline\fetch_untagged.py
# Output: pipeline/untagged_reviews.json

# Step 2 — Claude reads untagged_reviews.json and writes tagged_reviews.json
# (done interactively in this Claude Code session)

# Step 3 — push tags to DB
python pipeline\insert_tags.py
# Reads: pipeline/tagged_reviews.json
# Output: inserts into review_tags table, prints "inserted X, skipped Y"
```

---

## 6. Recommended Weekly / Monthly Schedule

```
Every week:
  1. Open SSH tunnel
  2. python pipeline\scraper_runner.py   ← fetches only new reviews per ASIN

Every month (or when you want to update the dashboard tags):
  3. python pipeline\tagger.py           ← tags everything untagged in one shot
```

---

## 7. Production Deployment

After code changes on this machine, push to prod:

```powershell
# 1. Git pull on EC2
ssh -i "C:\Users\Vrishank Gupta\.ssh\analytics-report-key.pem" `
    ec2-user@ec2-15-207-57-132.ap-south-1.compute.amazonaws.com `
    "cd /home/ec2-user/amazon-reviews && git pull --ff-only"

# 2. Rebuild and restart Docker containers on EC2
ssh -i "C:\Users\Vrishank Gupta\.ssh\analytics-report-key.pem" `
    ec2-user@ec2-15-207-57-132.ap-south-1.compute.amazonaws.com `
    "cd /home/ec2-user/amazon-reviews && docker compose -f docker-compose.production.yml up -d --build"
```

Note: The dashboard reads from the DB in real-time, so scraped/tagged data is visible immediately without a redeploy.

---

## 8. Key .env Settings

| Variable | Default | What it does |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | Must be `127.0.0.1` when using SSH tunnel |
| `SCRAPE_DAYS_BACK` | `90` | Fallback lookback for ASINs with no prior DB data |
| `SCRAPER_PAUSE` | `8` | Seconds between ASINs (increase if rate-limited) |
| `CHROME_PROFILE` | set in .env | Path to Chrome profile logged in to Amazon |
| `OPENAI_API_KEY` | set in .env | Key for tagger.py — update here to change permanently |

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't connect to MySQL server on 127.0.0.1` | SSH tunnel is down — re-run Step 1 |
| `0 new rows inserted` for an ASIN | Normal — no new reviews since last scrape |
| ASIN timed out (300s) | Amazon blocked/slow — retry with `python scraper_runner.py <ASIN>` later |
| `ChromeDriver not found` | Ensure Chrome is installed; set `CHROMEDRIVER_PATH` in .env if needed |
| `UnicodeEncodeError` | Run with `$env:PYTHONUTF8="1"` prefix |
