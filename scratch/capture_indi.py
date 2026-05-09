import socket
import time

def capture():
    host = "192.168.178.142"
    port = 7624
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    sock.sendall(b'<getProperties version="1.7"/>\n')
    
    print(f"Capturing all INDI traffic from {host}:{port} for 5s...")
    start_time = time.time()
    try:
        while time.time() - start_time < 5:
            data = sock.recv(65536)
            if not data: break
            print(data.decode('utf-8', errors='ignore'))
    except KeyboardInterrupt:
        pass
    finally:
        sock.close()

if __name__ == "__main__":
    capture()
