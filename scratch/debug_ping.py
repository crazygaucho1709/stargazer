import os
import sys
from dotenv import load_dotenv

# Add server to path
sys.path.append(os.path.join(os.getcwd(), 'server'))

load_dotenv(dotenv_path='server/.env')
import astroberry as raspi

print(f"ASTROBERRY_HOST: {raspi.ASTROBERRY_HOST}")
print(f"Ping result: {raspi.ping()}")
print(f"Ping SSH result: {raspi.ping_ssh()}")
try:
    status = raspi.get_status()
    print(f"Status reachable: {status.get('reachable')}")
except Exception as e:
    print(f"Status error: {e}")
