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
import shlex
import os
import json

app = Flask(__name__)
CORS(app)

DEVICE_MOUNT = "Celestron NexStar HC"
DEVICE_CCD = "Canon DSLR EOS 600D"

latest_frame = None

def indi_cmd(args, type_flag=None):
    try:
        # Use explicit host and port
        cmd_args = [args[0], "-h", "127.0.0.1"]
        if args[0] == "indi_setprop" and type_flag:
            cmd_args.append(type_flag)
        cmd_args.extend(args[1:])
        
        print(f"Running command: {cmd_args}", flush=True)
        result = subprocess.run(cmd_args, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            print(f"Command failed: {result.stderr}", flush=True)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        print(f"Command exception: {e}", flush=True)
        return False, "", str(e)

def find_mount_device():
    # Try to find which device has EQUATORIAL_EOD_COORD
    ok, out, err = indi_cmd(["indi_getprop"])
    if not ok: return "Celestron GPS" # Fallback
    
    for line in out.splitlines():
        line = line.strip()
        if ".EQUATORIAL_EOD_COORD.RA=" in line:
            dev = line.split(".")[0].strip()
            print(f"Found mount device: {repr(dev)}", flush=True)
            return dev
    return "Celestron GPS"

@app.route("/debug/indi")
def debug_indi():
    ok, out, err = indi_cmd(["indi_getprop"])
    return jsonify({"success": ok, "output": out, "error": err})

CONFIG_FILE = os.path.expanduser("~/stargazer_config.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_config(config):
    try:
        current = load_config()
        current.update(config)
        with open(CONFIG_FILE, 'w') as f:
            json.dump(current, f)
        return True
    except:
        return False

@app.route("/config", methods=["GET", "POST"])
def manage_config():
    if request.method == "POST":
        data = request.json
        if save_config(data):
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Could not save config"}), 500
    else:
        return jsonify(load_config())

@app.route("/health")
def health():
    device = find_mount_device()
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "3", device + ".CONNECTION.CONNECT"])
    connected = "On" in out if ok else False
    return jsonify({"status": "ok", "mount_connected": connected, "mount_device": device})

@app.route("/server/status")
def server_status():
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "3", DEVICE_MOUNT + ".CONNECTION.CONNECT"])
    connected = "On" in out if ok else False
    return jsonify([{"status": "True" if connected else "False"}])

def run_jog(device, prop, val, duration):
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=On"])
    time.sleep(duration)
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=Off"])

@app.route("/mount/jog", methods=["POST"])
def mount_jog():
    data = request.json
    direction = data.get("direction", "up")
    duration = float(data.get("duration", 0.5))
    device = find_mount_device()
    
    if direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val = "MOTION_NORTH" if direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val = "MOTION_WEST" if direction == "left" else "MOTION_EAST"
    
    # Run jog in a separate thread to avoid blocking Flask
    import threading
    thread = threading.Thread(target=run_jog, args=(device, prop, val, duration))
    thread.daemon = True
    thread.start()
    
    return jsonify({"success": True, "direction": direction, "message": "Jog started"})

@app.route("/mount/stop", methods=["POST"])
def mount_stop():
    data = request.json
    direction = data.get("direction", "up")
    device = find_mount_device()
    
    # To stop, we just turn off BOTH directions on both axes to be safe
    indi_cmd(["indi_setprop", f"{device}.TELESCOPE_MOTION_NS.MOTION_NORTH=Off"])
    indi_cmd(["indi_setprop", f"{device}.TELESCOPE_MOTION_NS.MOTION_SOUTH=Off"])
    indi_cmd(["indi_setprop", f"{device}.TELESCOPE_MOTION_WE.MOTION_WEST=Off"])
    indi_cmd(["indi_setprop", f"{device}.TELESCOPE_MOTION_WE.MOTION_EAST=Off"])
    
    return jsonify({"success": True, "message": "All motion stopped"})

@app.route("/mount/slew", methods=["POST"])
def mount_slew():
    data = request.json
    ra = data.get("ra", 0)
    dec = data.get("dec", 0)
    
    ok_ra, _, err_ra = indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.RA={ra}"])
    ok_dec, _, err_dec = indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.DEC={dec}"])
    
    ok = ok_ra and ok_dec
    err = err_ra if err_ra else err_dec
    
    return jsonify({"success": ok, "ra": ra, "dec": dec, "error": err if not ok else ""})

@app.route("/mount/rate", methods=["POST"])
def mount_rate():
    data = request.json
    rate = data.get("rate", 5)
    rate = max(1, min(9, int(rate)))
    
    ok, out, err = indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_SLEW_RATE.{rate}x=On"])
    return jsonify({"success": ok, "rate": rate, "error": err if not ok else ""})

@app.route("/mount/jog", methods=["POST"])
def mount_jog():
    data = request.json
    direction = data.get("direction", "up")
    duration = data.get("duration", 0.5)
    
    if direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val = "MOTION_NORTH" if direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val = "MOTION_WEST" if direction == "left" else "MOTION_EAST"
    
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_MOUNT + "." + prop + "." + val + "=On"])
    time.sleep(duration)
    indi_cmd(["indi_setprop", DEVICE_MOUNT + "." + prop + "." + val + "=Off"])
    
    return jsonify({"success": ok, "direction": direction, "error": err if not ok else ""})

@app.route("/mount/sync_master", methods=["POST"])
def mount_sync_master():
    data = request.json
    lat = float(data.get("lat", 0))
    lon = float(data.get("lon", 0))
    elev = float(data.get("elev", 0))
    alt = float(data.get("alt", 0))
    az = float(data.get("az", 180)) # South by default

    # Dynamically find the mount device name
    device = find_mount_device()

    try:
        # 1. Update Geographic Location and Time in INDI
        # Format time for INDI TIME_UTC: 2026-04-29T04:30:03
        now_utc = datetime.datetime.utcnow()
        indi_time_str = now_utc.strftime("%Y-%m-%dT%H:%M:%S")
        
        indi_cmd(["indi_setprop", f"{device}.GEOGRAPHIC_COORD.LAT={lat}"], type_flag="-n")
        indi_cmd(["indi_setprop", f"{device}.GEOGRAPHIC_COORD.LONG={lon}"], type_flag="-n")
        indi_cmd(["indi_setprop", f"{device}.GEOGRAPHIC_COORD.ELEV={elev}"], type_flag="-n")
        indi_cmd(["indi_setprop", f"{device}.TIME_UTC.UTC={indi_time_str}"], type_flag="-x")

        # 2. Calculate RA/Dec using astropy
        observatory = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=elev*u.m)
        obs_time = Time(now_utc)
        
        # Define the AltAz coordinate
        altaz = SkyCoord(alt=alt*u.deg, az=az*u.deg, frame='altaz', obstime=obs_time, location=observatory)
        
        # Convert to ICRS (Equatorial)
        eq = altaz.transform_to('icrs')
        ra_hours = eq.ra.hour
        dec_deg = eq.dec.deg

        # 3. Enable SYNC mode and set coords
        indi_cmd(["indi_setprop", f"{device}.ON_COORD_SET.SYNC=On"], type_flag="-s")
        time.sleep(0.5)
        indi_cmd(["indi_setprop", f"{device}.ON_COORD_SET.TRACK=Off"], type_flag="-s")
        time.sleep(0.5)
        
        # The NexStar driver accepts RA in hours (0-24) and Dec in degrees (-90 to +90)
        # Use separate calls to avoid parsing issues with multiple assignments
        ra_ok, _, ra_err = indi_cmd(["indi_setprop", f"{device}.EQUATORIAL_EOD_COORD.RA={ra_hours}"], type_flag="-n")
        time.sleep(0.5)
        dec_ok, _, dec_err = indi_cmd(["indi_setprop", f"{device}.EQUATORIAL_EOD_COORD.DEC={dec_deg}"], type_flag="-n")

        # 4. Restore TRACK mode
        time.sleep(0.5)
        indi_cmd(["indi_setprop", f"{device}.ON_COORD_SET.TRACK=On"], type_flag="-s")

        if ra_ok and dec_ok:
            return jsonify({
                "success": True, 
                "calculated_ra": ra_hours, 
                "calculated_dec": dec_deg,
                "msg": "Master sync complete"
            })
        else:
            return jsonify({"success": False, "error": f"{ra_err} {dec_err}"})
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/astro/coords", methods=["POST"])
def get_altaz():
    data = request.json
    ra = float(data.get("ra", 0))
    dec = float(data.get("dec", 0))
    lat = float(data.get("lat", 0))
    lon = float(data.get("lon", 0))
    elev = float(data.get("elev", 0))
    
    try:
        observatory = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=elev*u.m)
        obs_time = Time(datetime.datetime.utcnow())
        
        # Equatorial coordinate
        target = SkyCoord(ra=ra*u.hourangle, dec=dec*u.deg, frame='icrs')
        
        # Convert to AltAz
        altaz = target.transform_to(AltAz(obstime=obs_time, location=observatory))
        
        return jsonify({
            "success": True,
            "alt": altaz.alt.deg,
            "az": altaz.az.deg
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/ccd/connect", methods=["POST"])
def ccd_connect():
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_CCD + ".CONNECTION.CONNECT=On"])
    return jsonify({"success": ok, "error": err if not ok else ""})

@app.route("/ccd/disconnect", methods=["POST"])
def ccd_disconnect():
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_CCD + ".CONNECTION.DISCONNECT=On"])
    return jsonify({"success": ok, "error": err if not ok else ""})

@app.route("/ccd/stream/start", methods=["POST"])
def ccd_stream_start():
    ok1, _, err1 = indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_VIDEO_STREAM.STREAM_ON=On"])
    ok2, _, err2 = indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_STREAM_ENCODER.MJPEG=On"])
    
    ok = ok1 and ok2
    err = err1 if err1 else err2
    
    return jsonify({"success": ok, "error": err if not ok else ""})

@app.route("/ccd/stream/stop", methods=["POST"])
def ccd_stream_stop():
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_VIDEO_STREAM.STREAM_OFF=On"])
    return jsonify({"success": ok, "error": err if not ok else ""})

@app.route("/ccd/capture", methods=["POST"])
def ccd_capture():
    data = request.json
    exposure = data.get("exposure", 1)
    
    ok, out, err = indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_EXPOSURE.CCD_EXPOSURE_VALUE={exposure}"])
    if not ok:
        return jsonify({"success": False, "error": err})
    
    time.sleep(exposure + 0.5)
    
    return jsonify({"success": True, "exposure": exposure})

@app.route("/ccd/stream")
def ccd_stream():
    def generate():
        try:
            # Connect directly to INDI server to read the stream efficiently
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(('127.0.0.1', 7624))
            s.sendall(f'<getProperties version="1.7" device="{DEVICE_CCD}"/>\r\n'.encode())
            s.sendall(f'<enableBLOB device="{DEVICE_CCD}">Also</enableBLOB>\r\n'.encode())
            s.sendall(f'<newSwitchVector device="{DEVICE_CCD}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>\r\n'.encode())
            s.sendall(f'<newSwitchVector device="{DEVICE_CCD}" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>\r\n'.encode())
            
            buffer = ""
            in_blob = False
            blob_data = []
            
            while True:
                chunk = s.recv(65536 * 4).decode('ascii', errors='ignore')
                if not chunk: break
                buffer += chunk
                
                while True:
                    if not in_blob:
                        start_idx = buffer.find("<oneBLOB")
                        if start_idx == -1:
                            buffer = buffer[-200:] # keep a small tail
                            break
                        
                        end_tag_idx = buffer.find(">", start_idx)
                        if end_tag_idx == -1:
                            break # wait for more data to complete tag
                        
                        in_blob = True
                        buffer = buffer[end_tag_idx+1:]
                        blob_data = []
                    
                    if in_blob:
                        end_blob_idx = buffer.find("</oneBLOB>")
                        if end_blob_idx == -1:
                            blob_data.append(buffer)
                            buffer = ""
                            break
                        else:
                            blob_data.append(buffer[:end_blob_idx])
                            buffer = buffer[end_blob_idx+10:]
                            in_blob = False
                            
                            full_b64 = "".join(blob_data).replace("\n", "").replace("\r", "")
                            try:
                                image_bytes = base64.b64decode(full_b64)
                                global latest_frame
                                latest_frame = image_bytes
                                yield (b'--frame\r\n'
                                       b'Content-Type: image/jpeg\r\n'
                                       b'Content-Length: ' + str(len(image_bytes)).encode() + b'\r\n\r\n' +
                                       image_bytes + b'\r\n')
                            except Exception as e:
                                print(f"Base64 decode error: {e}")
                                
        except GeneratorExit:
            # Clean up when client disconnects
            try:
                indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_VIDEO_STREAM.STREAM_OFF=On"])
                if 's' in locals(): s.close()
            except: pass
        except Exception as e:
            print(f"Stream error: {e}")
            try:
                if 's' in locals(): s.close()
            except: pass
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=--frame')

@app.route("/ccd/latest")
def ccd_latest():
    global latest_frame
    if latest_frame:
        return Response(latest_frame, mimetype='image/jpeg')
    return Response(b'', status=404)

if __name__ == "__main__":
    print("INDI Bridge on port 5005...")
    app.run(host="0.0.0.0", port=5005)
