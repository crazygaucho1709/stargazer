
import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'server'))
import astroberry as raspi

# Check /tmp/indiserver.log
result = raspi._run("tail -n 100 /tmp/indiserver.log")
print(result.get("stdout"))
