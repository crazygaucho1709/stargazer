import socket

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('127.0.0.1', 7624))
s.sendall(b'<getProperties version="1.7" device="Canon DSLR EOS 600D"/>\r\n')
s.sendall(b'<enableBLOB device="Canon DSLR EOS 600D">Also</enableBLOB>\r\n')
s.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>\r\n')

import time
s.settimeout(2.0)
try:
    while True:
        data = s.recv(4096)
        print("Received", len(data), "bytes")
        if b'<setBLOB' in data:
            print("GOT BLOB!")
            break
except socket.timeout:
    print("Timeout")
