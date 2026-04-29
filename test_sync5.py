import subprocess
args = ["indi_setprop", "Celestron GPS.ON_COORD_SET.SYNC=On"]
result = subprocess.run(args, capture_output=True, text=True)
print("LIST_RET:", result.returncode)
print("LIST_ERR:", result.stderr)

cmd = "indi_setprop 'Celestron GPS.ON_COORD_SET.SYNC=On'"
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
print("SHELL_RET:", result.returncode)
print("SHELL_ERR:", result.stderr)
