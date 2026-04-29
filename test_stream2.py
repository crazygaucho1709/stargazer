import socket
import time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('127.0.0.1', 7624))
s.sendall(b'<getProperties version="1.7" device="Canon DSLR EOS 600D"/>\r\n')
s.sendall(b'<enableBLOB device="Canon DSLR EOS 600D">Also</enableBLOB>\r\n')
s.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>\r\n')
s.settimeout(2.0)
buffer = ""
try:
    while True:
        data = s.recv(4096)
        buffer += data.decode('ascii', errors='ignore')
        if "<setBLOB" in buffer:
            idx = buffer.find("<setBLOB")
            print("FOUND BLOB AT", idx)
            print("Snippet:", buffer[idx:idx+200])
            break
except socket.timeout:
    print("Timeout")
