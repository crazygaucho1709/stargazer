import socket
import time

def test_slew():
    host = "192.168.178.142"
    port = 7624
    device = "Celestron GPS"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        print(f"Connected to {host}:{port}")
        
        # 1. First, make sure we are NOT parked
        print("Unparking...")
        s.sendall(f'<newSwitchVector device="{device}" name="TELESCOPE_PARK"><oneSwitch name="UNPARK">On</oneSwitch></newSwitchVector>\r\n'.encode())
        time.sleep(1)
        
        # 2. Get current coords (optional but good for log)
        s.sendall(b'<getProperties version="1.7"/>\r\n')
        
        # 3. Try to slew (Goto)
        # We need to send coordinates AND the SLEW/TRACK switch
        ra = 10.0 # 10 hours
        dec = 45.0 # 45 degrees
        
        print(f"Sending Slew to RA={ra}, DEC={dec}...")
        # Most drivers use EQUATORIAL_EOD_COORD
        xml_coords = f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{ra}</oneNumber><oneNumber name="DEC">{dec}</oneNumber></newNumberVector>\r\n'
        s.sendall(xml_coords.encode())
        
        # Set to TRACK (Goto and track)
        xml_track = f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="TRACK">On</oneSwitch></newSwitchVector>\r\n'
        s.sendall(xml_track.encode())
        
        print("Sent slew commands. Listening for responses...")
        
        start_time = time.time()
        while time.time() - start_time < 10:
            try:
                data = s.recv(16384)
                if not data: break
                text = data.decode('utf-8', errors='ignore')
                if f'device="{device}"' in text:
                    if 'name="EQUATORIAL_EOD_COORD"' in text and 'state="' in text:
                        state_match = re.search(r'state="([^"]+)"', text)
                        if state_match:
                            print(f"Slew state: {state_match.group(1)}")
                    if 'message="' in text:
                        msg_match = re.search(r'message="([^"]+)"', text)
                        if msg_match:
                            print(f"INDI MESSAGE: {msg_match.group(1)}")
            except socket.timeout:
                break
        
        s.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    import re
    test_slew()
