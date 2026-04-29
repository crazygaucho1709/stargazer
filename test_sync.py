import subprocess
DEVICE_MOUNT = "Celestron GPS"
ra_hours = 5.35
dec_deg = 32.11
args = [
    "indi_setprop", 
    f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.RA={ra_hours}",
    f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.DEC={dec_deg}"
]
result = subprocess.run(args, capture_output=True, text=True)
print("RET:", result.returncode)
print("OUT:", result.stdout)
print("ERR:", result.stderr)
