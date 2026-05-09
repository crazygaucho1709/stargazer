import socket
import time

def dump_ccd_properties():
    host = "192.168.178.142"
    port = 7624
    device = "Canon DSLR EOS 600D"
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        
        sock.sendall(f'<getProperties version="1.7" device="{device}"/>\r\n'.encode())
        
        buffer = ""
        start_time = time.time()
        while time.time() - start_time < 5:
            try:
                data = sock.recv(16384).decode('utf-8', errors='ignore')
                if not data: break
                buffer += data
            except socket.timeout:
                break
        
        print(f"Captured {len(buffer)} bytes")
        # Find all switch names
        import re
        switches = re.findall(r'<defSwitchVector[^>]*name="([^"]+)"', buffer)
        print(f"Switches: {switches}")
        
        # Check for viewfinder specifically
        if "viewfinder" in buffer:
            print("Found 'viewfinder' in XML!")
            # Extract the whole tag
            vf_match = re.search(r'<defSwitchVector[^>]*name="viewfinder".*?</defSwitchVector>', buffer, re.DOTALL)
            if vf_match:
                print(vf_match.group(0))
        else:
            print("'viewfinder' NOT found.")
            
        sock.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_ccd_properties()
