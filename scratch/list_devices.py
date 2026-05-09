import socket
import re
import time

def list_devices():
    host = "192.168.178.142"
    port = 7624
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        
        # Ask for all properties
        sock.sendall(b'<getProperties version="1.7"/>\r\n')
        
        devices = set()
        start_time = time.time()
        while time.time() - start_time < 5:
            try:
                data = sock.recv(4096).decode('utf-8', errors='ignore')
                if not data: break
                
                # Look for device="..."
                found = re.findall(r'device="([^"]+)"', data)
                for d in found:
                    devices.add(d)
            except socket.timeout:
                break
        
        print(f"Found devices: {list(devices)}")
        sock.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_devices()
