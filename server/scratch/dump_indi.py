import socket
import sys
import time

def dump_indi(host, port, duration=10):
    print(f"Connecting to {host}:{port}...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        print("Connected. Requesting properties...")
        sock.sendall(b'<getProperties version="1.7"/>\n')
        
        start_time = time.time()
        while time.time() - start_time < duration:
            try:
                data = sock.recv(4096)
                if not data:
                    break
                print(data.decode('utf-8', errors='replace'))
            except socket.timeout:
                continue
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    dump_indi("192.168.178.142", 7624)
