import os
from dotenv import load_dotenv
import paramiko

# Load .env
env_path = "/Users/matt/dev/project/web/stargazer/server/.env"
load_dotenv(dotenv_path=env_path)

host = os.getenv("ASTROBERRY_HOST")
user = os.getenv("ASTROBERRY_USER")
pwd = os.getenv("ASTROBERRY_PASS")
port = int(os.getenv("ASTROBERRY_PORT", 22))

print(f"Connecting to {user}@{host}:{port}...")

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=port,
        username=user,
        password=pwd,
        timeout=10,
        look_for_keys=False,
        allow_agent=False,
    )
    print("✅ SSH Connection Successful!")
    
    stdin, stdout, stderr = client.exec_command("uptime")
    print(f"Uptime: {stdout.read().decode().strip()}")
    
    stdin, stdout, stderr = client.exec_command("pgrep -x indiserver || echo 'INDI NOT RUNNING'")
    print(f"INDI status: {stdout.read().decode().strip()}")
    
    client.close()
except Exception as e:
    print(f"❌ SSH Connection Failed: {e}")
