import socket
import time

HOST = "192.168.178.142"
PORT = 7624

def test_indi():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect((HOST, PORT))
    s.sendall(b'<getProperties version="1.7" device="Celestron GPS" name="TELESCOPE_PARK"/>\r\n')
    
    start_time = time.time()
    all_data = ""
    while time.time() - start_time < 2:
        try:
            chunk = s.recv(4096).decode('utf-8', errors='ignore')
            if not chunk: break
            all_data += chunk
        except socket.timeout:
            break
    
    print(all_data)
    s.close()

if __name__ == "__main__":
    test_indi()
