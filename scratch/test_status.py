import os
from dotenv import load_dotenv
import astroberry

# Load .env
env_path = "/Users/matt/dev/project/web/stargazer/server/.env"
load_dotenv(dotenv_path=env_path)

status = astroberry.get_status()
print(f"Status: {status}")
