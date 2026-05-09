
import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'server'))
import astroberry as raspi
import json

status = raspi.get_status()
print(json.dumps(status, indent=2))
