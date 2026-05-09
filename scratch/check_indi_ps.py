
import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'server'))
import astroberry as raspi

result = raspi._run("ps aux | grep indiserver")
print(result.get("stdout"))
