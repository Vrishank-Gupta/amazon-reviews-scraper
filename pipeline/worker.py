import json
import os
import socket
import subprocess
import sys
import time

import pymysql
import pymysql.cursors

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from shared.env import load_project_env

load_project_env()

WORKER_ID = os.getenv("PIPELINE_WORKER_ID", f"{socket.gethostname()}-worker").strip() or f"{socket.gethostname()}-worker"
HOST_NAME = socket.gethostname()
POLL_SECONDS = max(5, int(os.getenv("PIPELINE_WORKER_POLL_SECONDS", "15")))
HEARTBEAT_SECONDS = max(15, int(os.getenv("PIPELINE_WORKER_HEARTBEAT_SECONDS", "30")))

PIPELINE_JOB_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  days INT NOT NULL,
  asins_json JSON DEFAULT NULL,
  requested_via VARCHAR(32) NOT NULL DEFAULT 'ui',
  requested_by VARCHAR(255) DEFAULT NULL,
  worker_id VARCHAR(255) DEFAULT NULL,
  message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_pipeline_jobs_status_created (status, created_at),
  KEY idx_pipeline_jobs_worker (worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

PIPELINE_WORKER_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS pipeline_workers (
  worker_id VARCHAR(255) NOT NULL,
  host_name VARCHAR(255) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'IDLE',
  message TEXT,
  capabilities_json JSON DEFAULT NULL,
  last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id),
  KEY idx_pipeline_workers_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def ensure_queue_tables(conn):
    with conn.cursor() as cur:
        cur.execute(PIPELINE_JOB_TABLE_SQL)
        cur.execute(PIPELINE_WORKER_TABLE_SQL)
    conn.commit()


def heartbeat(conn, status="IDLE", message=None):
    ensure_queue_tables(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pipeline_workers (worker_id, host_name, status, message, capabilities_json, last_heartbeat, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                host_name = VALUES(host_name),
                status = VALUES(status),
                message = VALUES(message),
                capabilities_json = VALUES(capabilities_json),
                last_heartbeat = NOW(),
                updated_at = NOW()
            """,
            (
                WORKER_ID,
                HOST_NAME,
                status,
                message,
                json.dumps({"chrome_profile": os.getenv("CHROME_PROFILE", "")}),
            ),
        )
    conn.commit()


def claim_next_job(conn):
    ensure_queue_tables(conn)
    with conn.cursor() as cur:
        cur.execute("START TRANSACTION")
        cur.execute(
            """
            SELECT id, days, asins_json
            FROM pipeline_jobs
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """
        )
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None

        cur.execute(
            """
            UPDATE pipeline_jobs
            SET status = 'CLAIMED',
                worker_id = %s,
                claimed_at = NOW(),
                message = %s
            WHERE id = %s
            """,
            (WORKER_ID, f"Claimed by {WORKER_ID}", row["id"]),
        )
    conn.commit()
    row["asins"] = json.loads(row.get("asins_json") or "[]")
    return row


def update_job(conn, job_id, status, message=None, started=False, finished=False):
    with conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE pipeline_jobs
            SET status = %s,
                worker_id = %s,
                message = %s,
                started_at = { 'IFNULL(started_at, NOW())' if started else 'started_at' },
                finished_at = { 'NOW()' if finished else 'finished_at' }
            WHERE id = %s
            """,
            (status, WORKER_ID, message, job_id),
        )
    conn.commit()


def run_job(job):
    conn = get_conn()
    try:
        update_job(conn, job["id"], "RUNNING", f"Running on {WORKER_ID}", started=True, finished=False)
        heartbeat(conn, status="RUNNING", message=f"Job {job['id']} running")
    finally:
        conn.close()

    env = os.environ.copy()
    env["SCRAPE_DAYS_BACK"] = str(job["days"])
    if job["asins"]:
      env["SCRAPE_ASINS"] = ",".join(job["asins"])
    else:
      env.pop("SCRAPE_ASINS", None)

    run_script = os.path.join(project_root, "pipeline", "run_pipeline.py")
    proc = subprocess.Popen([sys.executable, run_script], cwd=project_root, env=env)

    last_heartbeat = 0
    while True:
        code = proc.poll()
        now = time.time()
        if now - last_heartbeat >= HEARTBEAT_SECONDS:
            conn = get_conn()
            try:
                heartbeat(conn, status="RUNNING", message=f"Job {job['id']} running")
            finally:
                conn.close()
            last_heartbeat = now
        if code is not None:
            break
        time.sleep(5)

    conn = get_conn()
    try:
        if code == 0:
            update_job(conn, job["id"], "SUCCESS", "Completed successfully", finished=True)
            heartbeat(conn, status="IDLE", message="Idle")
        else:
            update_job(conn, job["id"], "FAILED", f"run_pipeline.py exited with code {code}", finished=True)
            heartbeat(conn, status="IDLE", message=f"Job {job['id']} failed")
    finally:
        conn.close()


def main():
    if os.name != "nt":
        print("pipeline/worker.py is intended to run on a Windows worker machine.")

    print(f"Pipeline worker started: {WORKER_ID}")
    while True:
        conn = get_conn()
        try:
            heartbeat(conn, status="IDLE", message="Idle")
            job = claim_next_job(conn)
        finally:
            conn.close()

        if not job:
            time.sleep(POLL_SECONDS)
            continue

        print(f"Claimed job {job['id']} for {job['days']} days")
        run_job(job)


if __name__ == "__main__":
    main()
