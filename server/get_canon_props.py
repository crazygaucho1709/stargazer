import socket

INDI_HOST = "192.168.178.142"
INDI_PORT = 7624

def get_props():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((INDI_HOST, INDI_PORT))
        
        # Connect to camera first
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>\n')
        
        # Request properties
        sock.sendall(b'<getProperties version="1.7" device="Canon DSLR EOS 600D"/>\n')
        
        data = b""
        import time
        start = time.time()
        while time.time() - start < 3:
            try:
                chunk = sock.recv(8192)
                if not chunk: break
                data += chunk
            except socket.timeout:
                break
                
        with open("canon_props.xml", "wb") as f:
            f.write(data)
            
        print("Done. Wrote to canon_props.xml")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    get_props()
