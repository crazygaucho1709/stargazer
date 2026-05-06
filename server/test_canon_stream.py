import socket
import time

INDI_HOST = "192.168.178.142"
INDI_PORT = 7624

def test_stream():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((INDI_HOST, INDI_PORT))
        
        # Connect
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>\n')
        time.sleep(1)
        
        # Enable viewfinder
        print("Enabling viewfinder...")
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>\n')
        time.sleep(2)
        
        # Turn on video stream
        print("Enabling video stream...")
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>\n')
        time.sleep(2)
        
        print("Check if shutter clicked!")
        
        # Turn off video stream
        print("Disabling video stream...")
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>\n')
        time.sleep(1)
        
        # Disable viewfinder
        print("Disabling viewfinder...")
        sock.sendall(b'<newSwitchVector device="Canon DSLR EOS 600D" name="viewfinder"><oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>\n')
        time.sleep(1)
        
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    test_stream()
