
import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'server'))
import astroberry as raspi

logs = raspi.get_indi_logs(lines=100)
print(logs)
