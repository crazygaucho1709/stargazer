import psutil
import json
import os

procs = []
for p in psutil.process_iter(['pid', 'name']):
    try:
        procs.append(p.info)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        pass

# Ensure scratch dir exists
os.makedirs('/Users/matt/dev/project/web/stargazer/scratch', exist_ok=True)

with open('/Users/matt/dev/project/web/stargazer/scratch/processes.json', 'w') as f:
    json.dump(procs, f, indent=2)
