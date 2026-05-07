import paramiko
import os
import sys

host = "192.168.178.142"
user = "astroberry"
password = "astroberry"

print(f"Connecting to {user}@{host}...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(
        hostname=host,
        port=22,
        username=user,
        password=password,
        timeout=8,
        look_for_keys=False,
        allow_agent=False,
    )
    print("SUCCESS: Connected!")
    _, stdout, stderr = client.exec_command("uptime")
    print(f"Uptime: {stdout.read().decode().strip()}")
except Exception as e:
    print(f"FAILED: {e}")
finally:
    client.close()
