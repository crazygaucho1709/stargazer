import socket
import sys
import time

def test_indi():
    host = "192.168.178.142"
    port = 7624
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        print(f"Connected to {host}:{port}")
        s.sendall(b'<getProperties version="1.7"/>\r\n')
        
        # Read data for a few seconds to see all devices
        start_time = time.time()
        devices = set()
        while time.time() - start_time < 5:
            try:
                data = s.recv(16384)
                if not data: break
                text = data.decode('utf-8', errors='ignore')
                import re
                matches = re.findall(r'device="([^"]+)"', text)
                for m in matches:
                    devices.add(m)
            except socket.timeout:
                break
        print(f"Found devices: {', '.join(devices)}")
        s.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    test_indi()
