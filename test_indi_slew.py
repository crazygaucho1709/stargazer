import socket
s = socket.socket()
s.connect(("192.168.178.142", 7624))
s.sendall(b'<getProperties version="1.7"/>\r\n')
print("Connected. Setting RA/DEC...")
# test slew
xml = '<newNumberVector device="Celestron GPS" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">10.5</oneNumber><oneNumber name="DEC">50.0</oneNumber></newNumberVector>\r\n'
s.sendall(xml.encode())
xml2 = '<newSwitchVector device="Celestron GPS" name="ON_COORD_SET"><oneSwitch name="SLEW">On</oneSwitch></newSwitchVector>\r\n'
s.sendall(xml2.encode())
print("Sent slew command.")
s.close()
