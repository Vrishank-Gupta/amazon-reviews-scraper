"""
dev.py — Start backend + frontend together for local development.

Usage:
    py dev.py

Stops both processes cleanly on Ctrl+C.
"""

import os
import subprocess
import sys
import signal
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
FRONTEND_DIR = os.path.join(ROOT, "frontend")

def tag(label, color):
    codes = {"cyan": "\033[36m", "green": "\033[32m", "red": "\033[31m", "reset": "\033[0m"}
    return f"{codes.get(color,'')}{label}{codes['reset']}"

def stream(proc, label, color):
    """Forward a process stream to stdout with a coloured label prefix."""
    for line in iter(proc.stdout.readline, b""):
        text = f"  {tag(label, color)}  {line.decode(errors='replace')}"
        try:
            sys.stdout.write(text)
        except UnicodeEncodeError:
            sys.stdout.buffer.write(text.encode(sys.stdout.encoding or 'utf-8', errors='replace'))
        sys.stdout.flush()

def check_node_modules():
    nm = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.isdir(nm):
        print("  Installing frontend dependencies...")
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, check=True, shell=True)

def check_env():
    env_path = os.path.join(ROOT, ".env")
    if not os.path.exists(env_path):
        print(f"\n  {tag('WARNING', 'red')}  .env not found at {env_path}")
        print("  Create it with DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, OPENAI_API_KEY\n")

def main():
    check_env()
    check_node_modules()

    print(f"\n  {tag('backend', 'cyan')}   http://localhost:8000")
    print(f"  {tag('frontend', 'green')}  http://localhost:5173")
    print(f"  {tag('pipeline', 'cyan')}   http://localhost:5173/pipeline-console.html")
    print(f"\n  Press Ctrl+C to stop both\n")

    # Start backend
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Start frontend
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
    )

    # Stream output from both in background threads
    threading.Thread(target=stream, args=(backend,  "backend ", "cyan"),  daemon=True).start()
    threading.Thread(target=stream, args=(frontend, "frontend", "green"), daemon=True).start()

    def shutdown(sig=None, frame=None):
        print(f"\n  Stopping...")
        for p in (backend, frontend):
            try:
                p.terminate()
            except Exception:
                pass
        for p in (backend, frontend):
            try:
                p.wait(timeout=5)
            except Exception:
                pass
        print("  Done.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        if backend.poll() is not None:
            print(f"\n  {tag('backend', 'cyan')} exited — stopping all")
            shutdown()
        if frontend.poll() is not None:
            print(f"\n  {tag('frontend', 'green')} exited — stopping all")
            shutdown()
        threading.Event().wait(1)


if __name__ == "__main__":
    main()
