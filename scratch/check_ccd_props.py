import socket
import re
import time

def list_ccd_properties():
    host = "192.168.178.142"
    port = 7624
    device = "Canon DSLR EOS 600D"
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        
        # Ask for camera properties
        sock.sendall(f'<getProperties version="1.7" device="{device}"/>\r\n'.encode())
        
        properties = []
        start_time = time.time()
        while time.time() - start_time < 5:
            try:
                data = sock.recv(8192).decode('utf-8', errors='ignore')
                if not data: break
                
                # Look for name="..." in tags
                found = re.findall(r'name="([^"]+)"', data)
                for p in found:
                    if p not in properties:
                        properties.append(p)
            except socket.timeout:
                break
        
        print(f"Properties for {device}: {properties}")
        sock.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_ccd_properties()
