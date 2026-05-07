import os
import paramiko
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../server/.env'))

host = os.getenv("ASTROBERRY_HOST")
user = os.getenv("ASTROBERRY_USER", "astroberry")
pwd = os.getenv("ASTROBERRY_PASS", "astroberry")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pwd)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip()

all_props = run("indi_getprop")
for line in all_props.splitlines():
    if "CONNECTION" in line:
        print(line)

print("\nChecking states...")
print("Mount state:", run("indi_getprop 'Celestron GPS'.CONNECTION._STATE"))
print("CCD state:", run("indi_getprop 'Canon DSLR EOS 600D'.CONNECTION._STATE"))

ssh.close()
