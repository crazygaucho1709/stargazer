import subprocess
# Try with shell=True and quotes
cmd = "indi_setprop 'Celestron GPS.ON_COORD_SET.SYNC=On'"
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
print("RET:", result.returncode)
print("ERR:", result.stderr)
