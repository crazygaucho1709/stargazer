import subprocess
# Try with quotes inside the string
args = ["indi_setprop", '"Celestron GPS".ON_COORD_SET.SYNC=On']
result = subprocess.run(args, capture_output=True, text=True)
print("RET:", result.returncode)
print("ERR:", result.stderr)
