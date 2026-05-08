import socket
import time
import re

def check_mount_connection():
    host = "192.168.178.142"
    port = 7624
    device = "Celestron GPS"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        print(f"Connected to {host}:{port}")
        s.sendall(b'<getProperties version="1.7"/>\r\n')
        
        start_time = time.time()
        while time.time() - start_time < 5:
            data = s.recv(16384)
            if not data: break
            text = data.decode('utf-8', errors='ignore')
            if f'device="{device}"' in text:
                # print(text)
                if 'name="CONNECTION"' in text:
                    # Extract the whole SwitchVector
                    match = re.search(rf'<(?:set|def|new)SwitchVector[^>]*device="{device}"[^>]*name="CONNECTION"[^>]*state="([^"]+)"', text)
                    if match:
                        state = match.group(1)
                        print(f"Mount {device} CONNECTION state: {state}")
                        if 'name="CONNECT">On' in text:
                            print("Mount is explicitly CONNECTED (On).")
                        elif 'name="DISCONNECT">On' in text:
                            print("Mount is explicitly DISCONNECTED (Off).")
                
                if 'name="TELESCOPE_PARK"' in text:
                    match = re.search(r'name="PARK">([^<]+)<', text)
                    if match:
                        print(f"Mount PARK status: {match.group(1)}")

        s.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    check_mount_connection()
