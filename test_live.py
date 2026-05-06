import socket
import time
s = socket.socket()
s.connect(("192.168.178.142", 7624))
xml1 = '<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>\r\n'
xml2 = '<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>\r\n'
s.sendall(xml1.encode())
time.sleep(1)
s.sendall(xml2.encode())
print("Sent STREAM_ON and MJPEG.")
s.close()
