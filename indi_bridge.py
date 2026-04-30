#!/usr/bin/env python3
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import subprocess
import time
import base64
import socket
import datetime
from astropy.coordinates import SkyCoord, EarthLocation, AltAz
from astropy.time import Time
import astropy.units as u
import os
import json
import threading

app = Flask(__name__)
CORS(app)

# Fallback names, will be detected dynamically
DEVICE_MOUNT = "Celestron NexStar HC"
DEVICE_CCD = "Canon DSLR EOS 600D"

latest_frame = None

def indi_cmd(args, type_flag=None):
    try:
        cmd_args = [args[0], "-h", "127.0.0.1"]
        if args[0] == "indi_setprop" and type_flag:
            cmd_args.append(type_flag)
        cmd_args.extend(args[1:])
        
        print(f"Running command: {cmd_args}", flush=True)
        result = subprocess.run(cmd_args, capture_output=True, text=True, timeout=5)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return False, "", str(e)

def find_devices():
    global DEVICE_MOUNT, DEVICE_CCD
    ok, out, _ = indi_cmd(["indi_getprop"])
    if not ok: return
    
    for line in out.splitlines():
        if ".EQUATORIAL_EOD_COORD.RA=" in line:
            DEVICE_MOUNT = line.split(".")[0].strip()
        if ".CCD_EXPOSURE.CCD_EXPOSURE_VALUE=" in line:
            DEVICE_CCD = line.split(".")[0].strip()
    print(f"Detected Devices -> Mount: {DEVICE_MOUNT}, CCD: {DEVICE_CCD}", flush=True)

@app.route("/health")
def health():
    find_devices()
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "1", DEVICE_MOUNT + ".CONNECTION.CONNECT"])
    return jsonify({"status": "ok", "mount": DEVICE_MOUNT, "ccd": DEVICE_CCD, "connected": "On" in out})

# --- MOUNT CONTROL ---

def run_jog(device, prop, val, duration):
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=On"])
    time.sleep(duration)
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=Off"])

@app.route("/mount/jog", methods=["POST"])
def mount_jog():
    find_devices()
    data = request.json
    direction = data.get("direction", "up")
    duration = float(data.get("duration", 0.5))
    
    if direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val = "MOTION_NORTH" if direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val = "MOTION_WEST" if direction == "left" else "MOTION_EAST"
    
    thread = threading.Thread(target=run_jog, args=(DEVICE_MOUNT, prop, val, duration))
    thread.daemon = True
    thread.start()
    return jsonify({"success": True, "msg": "Jogging"})

@app.route("/mount/stop", methods=["POST"])
def mount_stop():
    find_devices()
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_NS.MOTION_NORTH=Off"])
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_NS.MOTION_SOUTH=Off"])
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_WE.MOTION_WEST=Off"])
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_WE.MOTION_EAST=Off"])
    return jsonify({"success": True})

@app.route("/mount/slew", methods=["POST"])
def mount_slew():
    find_devices()
    data = request.json
    ra, dec = data.get("ra", 0), data.get("dec", 0)
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.RA={ra}"])
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.DEC={dec}"])
    return jsonify({"success": True})

@app.route("/mount/sync_master", methods=["POST"])
def mount_sync_master():
    find_devices()
    data = request.json
    lat, lon, alt, az = float(data.get("lat", 0)), float(data.get("lon", 0)), float(data.get("alt", 0)), float(data.get("az", 180))
    now_utc = datetime.datetime.utcnow()
    
    # Sync GPS and Time
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.GEOGRAPHIC_COORD.LAT={lat}"], type_flag="-n")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.GEOGRAPHIC_COORD.LONG={lon}"], type_flag="-n")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TIME_UTC.UTC={now_utc.strftime('%Y-%m-%dT%H:%M:%S')}"], type_flag="-x")
    
    # Calculate RA/Dec
    observatory = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=0*u.m)
    altaz = SkyCoord(alt=alt*u.deg, az=az*u.deg, frame='altaz', obstime=Time(now_utc), location=observatory)
    eq = altaz.transform_to('icrs')
    
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.ON_COORD_SET.SYNC=On"], type_flag="-s")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.RA={eq.ra.hour}"], type_flag="-n")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.DEC={eq.dec.deg}"], type_flag="-n")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.ON_COORD_SET.TRACK=On"], type_flag="-s")
    
    return jsonify({"success": True})

# --- CCD CONTROL ---

@app.route("/ccd/stream/start", methods=["POST"])
def ccd_stream_start():
    find_devices()
    # For Canon, we often need to force Video mode
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_VIDEO_STREAM.STREAM_ON=On"])
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_STREAM_ENCODER.MJPEG=On"])
    return jsonify({"success": True})

@app.route("/ccd/stream/stop", methods=["POST"])
def ccd_stream_stop():
    find_devices()
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_VIDEO_STREAM.STREAM_OFF=On"])
    return jsonify({"success": True})

@app.route("/ccd/latest")
def ccd_latest():
    global latest_frame
    if latest_frame:
        return Response(latest_frame, mimetype='image/jpeg')
    return Response(b'', status=404)

@app.route("/ccd/stream")
def ccd_stream():
    def generate():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(('127.0.0.1', 7624))
            s.sendall(f'<getProperties version="1.7" device="{DEVICE_CCD}"/>\r\n'.encode())
            s.sendall(f'<enableBLOB device="{DEVICE_CCD}">Also</enableBLOB>\r\n'.encode())
            
            buffer = ""
            in_blob = False
            blob_data = []
            
            while True:
                time.sleep(0.2) # Throttle for Pi 3 B+
                chunk = s.recv(65536).decode('ascii', errors='ignore')
                if not chunk: break
                buffer += chunk
                while True:
                    if not in_blob:
                        start_idx = buffer.find("<oneBLOB")
                        if start_idx == -1:
                            buffer = buffer[-200:]; break
                        end_tag_idx = buffer.find(">", start_idx)
                        if end_tag_idx == -1: break
                        in_blob = True
                        buffer = buffer[end_tag_idx+1:]
                        blob_data = []
                    if in_blob:
                        end_blob_idx = buffer.find("</oneBLOB>")
                        if end_blob_idx == -1:
                            blob_data.append(buffer); buffer = ""; break
                        else:
                            blob_data.append(buffer[:end_blob_idx])
                            buffer = buffer[end_blob_idx+10:]
                            in_blob = False
                            try:
                                image_bytes = base64.b64decode("".join(blob_data).replace("\n","").replace("\r",""))
                                global latest_frame
                                latest_frame = image_bytes
                                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + image_bytes + b'\r\n')
                            except: pass
        except Exception as e:
            print(f"Stream error: {e}")
        finally:
            if 's' in locals(): s.close()
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=--frame')

@app.route("/astro/coords", methods=["POST"])
def get_astro_coords():
    data = request.json
    ra, dec, lat, lon = float(data.get("ra",0)), float(data.get("dec",0)), float(data.get("lat",0)), float(data.get("lon",0))
    obs = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=0*u.m)
    time = Time(datetime.datetime.utcnow())
    target = SkyCoord(ra=ra*u.hourangle, dec=dec*u.deg, frame='icrs')
    altaz = target.transform_to(AltAz(obstime=time, location=obs))
    return jsonify({"success": True, "alt": altaz.alt.deg, "az": altaz.az.deg})

if __name__ == "__main__":
    find_devices()
    app.run(host="0.0.0.0", port=5005, threaded=True)
