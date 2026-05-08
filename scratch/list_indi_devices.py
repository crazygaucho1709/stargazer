import socket
import time
import re

INDI_HOST = "192.168.178.142"
INDI_PORT = 7624

def get_indi_devices():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((INDI_HOST, INDI_PORT))
        s.sendall(b'<getProperties version="1.7"/>\n')
        
        time.sleep(2)
        data = s.recv(65536).decode('utf-8', errors='ignore')
        s.close()
        
        devices = set(re.findall(r'device="([^"]+)"', data))
        return list(devices)
    except Exception as e:
        return [f"Error: {e}"]

if __name__ == "__main__":
    print(f"Devices on {INDI_HOST}:{INDI_PORT}:")
    devices = get_indi_devices()
    for d in devices:
        print(f" - {d}")
