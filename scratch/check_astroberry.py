import os
import sys

# Add the server directory to path so we can import astroberry
sys.path.append('/Users/matt/dev/project/web/stargazer/server')

import astroberry
from dotenv import load_dotenv

# Load env from the server directory
load_dotenv('/Users/matt/dev/project/web/stargazer/server/.env')

print("Checking Astroberry status...")
status = astroberry.get_status()
print(f"Status: {status}")

if not status.get('indi_running'):
    print("INDI not running. Attempting restart...")
    restart_res = astroberry.restart_indi()
    print(f"Restart result: {restart_res}")
    
    # Check again
    status_after = astroberry.get_status()
    print(f"Status after restart: {status_after}")
else:
    print("INDI is already running.")
