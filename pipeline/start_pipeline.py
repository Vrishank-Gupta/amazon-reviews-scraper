import subprocess
import os
import time

# Always run from project root so all relative paths work
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
run_script = os.path.join(project_root, "pipeline", "run_pipeline.py")

print("Starting pipeline...")
subprocess.Popen(
    ["python", run_script],
    cwd=project_root,
)

print("Pipeline process spawned. Keeping console open...")
time.sleep(15)
