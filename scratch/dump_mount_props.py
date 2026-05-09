import socket
import time
import re

def dump_mount_properties():
    host = "192.168.178.142"
    port = 7624
    device = "Celestron GPS"
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        
        sock.sendall(f'<getProperties version="1.7" device="{device}" name="EQUATORIAL_EOD_COORD"/>\r\n'.encode())
        
        buffer = ""
        start_time = time.time()
        while time.time() - start_time < 2:
            try:
                data = sock.recv(16384).decode('utf-8', errors='ignore')
                if not data: break
                buffer += data
            except socket.timeout:
                break
        
        print("Buffer received:")
        print(buffer)
        
        # Extract RA/DEC
        ra = re.search(r'name="RA"[^>]*>([\d\.]+)<', buffer)
        dec = re.search(r'name="DEC"[^>]*>([\d\.\-]+)<', buffer)
        
        if ra: print(f"RA: {ra.group(1)}")
        if dec: print(f"DEC: {dec.group(1)}")
        
        sock.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_mount_properties()
