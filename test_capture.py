import socket
import time

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(("192.168.178.142", 7624))
s.sendall(b'<getProperties version="1.7"/>\r\n')
print("Connected. Setting Exposure...")
xml = '<newNumberVector device="Canon DSLR EOS 600D" name="CCD_EXPOSURE"><oneNumber name="CCD_EXPOSURE_VALUE">0.5</oneNumber></newNumberVector>\r\n'
s.sendall(xml.encode())
print("Sent exposure command.")
time.sleep(2)
s.close()
