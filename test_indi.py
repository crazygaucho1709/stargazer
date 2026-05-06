import socket
import time

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
try:
    s.connect(('192.168.178.142', 7624))
    s.sendall(b'<getProperties version="1.7"/>\n')
    s.sendall(b'<newSwitchVector device="Celestron GPS" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>\n')
    s.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>\n')
    
    data = b""
    start = time.time()
    while time.time() - start < 4:
        try:
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
        except socket.timeout:
            break
            
    with open('indi_props.xml', 'wb') as f:
        f.write(data)
    print("Done. Saved to indi_props.xml")
except Exception as e:
    print(f"Error: {e}")
finally:
    s.close()
