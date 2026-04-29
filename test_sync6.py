import subprocess
# Try with type flags
args = ["indi_setprop", "-s", "Celestron GPS.ON_COORD_SET.SYNC=On"]
result = subprocess.run(args, capture_output=True, text=True)
print("SYNC_RET:", result.returncode)
print("SYNC_ERR:", result.stderr)

args = ["indi_setprop", "-n", "Celestron GPS.EQUATORIAL_EOD_COORD.RA=5.35"]
result = subprocess.run(args, capture_output=True, text=True)
print("RA_RET:", result.returncode)
print("RA_ERR:", result.stderr)
