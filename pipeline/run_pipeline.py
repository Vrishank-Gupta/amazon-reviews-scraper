import subprocess
import sys
import os
import pymysql
from dotenv import load_dotenv

# Load .env from project root
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(project_root, ".env"))


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
    )


conn = get_conn()
cur = conn.cursor()


def update_status(status, message=None):
    cur.execute(
        """
        UPDATE pipeline_runs
        SET status=%s,
            message=%s,
            started_at=IF(%s='RUNNING', NOW(), started_at),
            finished_at=IF(%s IN ('SUCCESS','FAILED'), NOW(), finished_at)
        WHERE id=1
        """,
        (status, message, status, status),
    )
    conn.commit()


try:
    update_status("RUNNING", "Pipeline started")

    pipeline_dir = os.path.join(project_root, "pipeline")

    print("Step 1/2: Scraping reviews...")
    subprocess.check_call(
        ["python", os.path.join(pipeline_dir, "scraper_runner.py")],
        cwd=pipeline_dir,  # run from pipeline/ so local imports resolve
    )

    print("Step 2/2: Tagging reviews...")
    subprocess.check_call(
        ["python", os.path.join(pipeline_dir, "tagger.py")],
        cwd=pipeline_dir,  # run from pipeline/ so local imports resolve
    )

    update_status("SUCCESS", "Pipeline completed successfully")
    print("Pipeline finished successfully.")

except Exception as e:
    print(f"Pipeline failed: {e}")
    update_status("FAILED", str(e))
    sys.exit(1)

finally:
    conn.close()