import os
import sys
sys.path.append('/Users/matt/dev/project/web/stargazer/server')
import astroberry
from dotenv import load_dotenv

load_dotenv(dotenv_path='/Users/matt/dev/project/web/stargazer/server/.env')

print(f"ASTROBERRY_HOST: {astroberry.ASTROBERRY_HOST}")
print(f"Ping: {astroberry.ping()}")
print(f"Status: {astroberry.get_status()}")
