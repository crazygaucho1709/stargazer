
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'server'))
import astroberry as raspi
import json

print("Checking Astroberry connectivity...")
status = raspi.get_status()
print(f"Status: {json.dumps(status, indent=2)}")

if status.get("reachable"):
    print("\nListing USB devices on Astroberry...")
    usb_list = raspi._run("lsusb")
    print(usb_list.get("stdout"))

    print("\nChecking /dev/tty* devices...")
    tty_list = raspi._run("ls /dev/ttyUSB* /dev/ttyACM*")
    print(tty_list.get("stdout"))

    print("\nChecking dmesg for USB errors...")
    dmesg = raspi._run("dmesg | grep -i usb | tail -n 20")
    print(dmesg.get("stdout"))

    print("\nChecking indiserver logs (journalctl)...")
    logs = raspi.get_indi_logs(lines=100)
    print(logs)
else:
    print("Astroberry is NOT reachable via SSH.")
