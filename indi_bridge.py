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
import collections

app = Flask(__name__)
CORS(app)

# Configuration from Environment or defaults
# Note: ASTROBERRY_HOST is used for ping/ssh, INDI_HOST for INDI communication
ASTROBERRY_HOST = os.getenv("ASTROBERRY_HOST", "192.168.178.142")
INDI_HOST = os.getenv("INDI_HOST", ASTROBERRY_HOST)
INDI_PORT = int(os.getenv("INDI_PORT", "7624"))
DEVICE_MOUNT = os.getenv("DEVICE_MOUNT", "Celestron NexStar HC")
DEVICE_CCD = os.getenv("DEVICE_CCD", "Canon DSLR EOS 600D")
EKOS_PROFILE = os.getenv("EKOS_PROFILE", "Nexstar4SE")

# Logger / Log Buffer for UI
log_buffer = collections.deque(maxlen=100)

latest_frame = None

def log_msg(msg, level="INFO"):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    entry = f"{ts} - {level} - {msg}"
    print(entry, flush=True)
    log_buffer.append(entry)

def ping_host(host):
    try:
        # -c 1: one packet, -W 1: 1 second timeout
        result = subprocess.run(["ping", "-c", "1", "-W", "1", host], capture_output=True)
        return result.returncode == 0
    except:
        return False

def indi_cmd(args, type_flag=None):
    try:
        # Check connectivity first
        if not ping_host(INDI_HOST) and INDI_HOST != "127.0.0.1":
            return False, "", f"Host {INDI_HOST} is unreachable"

        cmd_args = [args[0], "-h", INDI_HOST]
        if args[0] == "indi_setprop" and type_flag:
            cmd_args.append(type_flag)
        cmd_args.extend(args[1:])
        
        log_msg(f"Running: {' '.join(cmd_args)}", "DEBUG")
        result = subprocess.run(cmd_args, capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            log_msg(f"Command failed: {result.stderr.strip()}", "ERROR")
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        log_msg(f"Command timeout: {args[0]}", "ERROR")
        return False, "", "Timeout"
    except Exception as e:
        log_msg(f"Exception running command: {e}", "ERROR")
        return False, "", str(e)

def find_devices():
    global DEVICE_MOUNT, DEVICE_CCD
    ok, out, _ = indi_cmd(["indi_getprop"])
    if not ok: return
    
    found_mount = False
    found_ccd = False
    for line in out.splitlines():
        if ".EQUATORIAL_EOD_COORD.RA=" in line:
            DEVICE_MOUNT = line.split(".")[0].strip()
            found_mount = True
        if ".CCD_EXPOSURE.CCD_EXPOSURE_VALUE=" in line:
            DEVICE_CCD = line.split(".")[0].strip()
            found_ccd = True
    
    if found_mount or found_ccd:
        log_msg(f"Detected Devices -> Mount: {DEVICE_MOUNT}, CCD: {DEVICE_CCD}")

@app.route("/health")
def health():
    # Fast check: ping
    is_up = ping_host(ASTROBERRY_HOST)
    
    # Try getting mount connection status
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "1", DEVICE_MOUNT + ".CONNECTION.CONNECT"])
    
    return jsonify({
        "status": "ok" if is_up else "offline",
        "mount": DEVICE_MOUNT,
        "ccd": DEVICE_CCD,
        "connected": "On" in out if ok else False,
        "indi_host": INDI_HOST,
        "astroberry_up": is_up
    })

@app.route("/logs")
def get_logs():
    return jsonify({"logs": list(log_buffer)})

# --- MOUNT CONTROL ---

def run_jog(device, prop, val, duration):
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=On"], type_flag="-s")
    time.sleep(duration)
    indi_cmd(["indi_setprop", f"{device}.{prop}.{val}=Off"], type_flag="-s")

@app.route("/mount/jog", methods=["POST"])
def mount_jog():
    find_devices()
    data = request.json or {}
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
    return jsonify({"success": True, "msg": f"Jogging {direction}"})

@app.route("/mount/stop", methods=["POST"])
def mount_stop():
    find_devices()
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_NS.MOTION_NORTH=Off"], type_flag="-s")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_NS.MOTION_SOUTH=Off"], type_flag="-s")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_WE.MOTION_WEST=Off"], type_flag="-s")
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_MOTION_WE.MOTION_EAST=Off"], type_flag="-s")
    return jsonify({"success": True})

@app.route("/mount/slew", methods=["POST"])
def mount_slew():
    find_devices()
    data = request.json or {}
    ra, dec = data.get("ra", 0), data.get("dec", 0)
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.EQUATORIAL_EOD_COORD.RA={ra};DEC={dec}"], type_flag="-n")
    return jsonify({"success": True})

@app.route("/mount/park", methods=["POST"])
def mount_park():
    find_devices()
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_PARK.PARK=On"], type_flag="-s")
    return jsonify({"success": True})

@app.route("/mount/unpark", methods=["POST"])
def mount_unpark():
    find_devices()
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_PARK.UNPARK=On"], type_flag="-s")
    return jsonify({"success": True})

@app.route("/mount/abort", methods=["POST"])
def mount_abort():
    find_devices()
    log_msg("!!! ABORT ALL COMMAND RECEIVED !!!", "WARNING")
    # Attempt specific abort for telescope
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_ABORT.ABORT=On"], type_flag="-s")
    # Stop any motion NS/WE
    mount_stop()
    # If CCD is capturing, abort exposure
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_ABORT_EXPOSURE.ABORT=On"], type_flag="-s")
    return jsonify({"success": True, "message": "Emergency abort signal sent to all devices"})

@app.route("/mount/track", methods=["POST"])
def mount_track():
    find_devices()
    data = request.json or {}
    state = "On" if data.get("track", True) else "Off"
    indi_cmd(["indi_setprop", f"{DEVICE_MOUNT}.TELESCOPE_TRACK_STATE.TRACK_ON={state}"], type_flag="-s")
    return jsonify({"success": True})

@app.route("/command", methods=["POST"])
def generic_command():
    find_devices()
    data = request.json or {}
    action = data.get("action")
    device = data.get("device", DEVICE_MOUNT)
    prop = data.get("property")
    values = data.get("values", {})
    
    if action == "syncLocation" or prop == "GEOGRAPHIC_COORD":
        lat = values.get("LAT")
        lon = values.get("LONG")
        elev = values.get("ELEV", 0)
        if lat is not None and lon is not None:
            log_msg(f"Syncing location to {lat}, {lon}")
            indi_cmd(["indi_setprop", f"{device}.GEOGRAPHIC_COORD.LAT={lat};LONG={lon};ELEV={elev}"], type_flag="-n")
            return jsonify({"success": True})
    
    return jsonify({"success": False, "error": f"Unknown or invalid command: {action}"})

# --- SYSTEM CONTROL ---

@app.route("/reconnect", methods=["POST"])
def reconnect_indi():
    log_msg("Reconnecting INDI Bridge...")
    find_devices()
    return jsonify({"success": True, "message": "Bridge synchronized with INDI server"})

@app.route("/restart_kstars", methods=["POST"])
def restart_kstars():
    log_msg(f"Restarting KStars (Profile: {EKOS_PROFILE})...", "WARNING")
    try:
        # Hard kill KStars
        subprocess.run(["killall", "-9", "KStars"], capture_output=True)
        time.sleep(2)
        
        # On macOS, use 'open' to launch the app
        # If running on Linux/Astroberry, use 'kstars' directly
        if os.path.exists("/Applications/KStars.app"):
            subprocess.Popen(["open", "-a", "KStars", "--args", "--ekos-profile", EKOS_PROFILE])
        else:
            subprocess.Popen(["kstars", "--ekos-profile", EKOS_PROFILE])
            
        return jsonify({"success": True, "message": f"KStars restart initiated with profile '{EKOS_PROFILE}'"})
    except Exception as e:
        log_msg(f"Restart failed: {e}", "ERROR")
        return jsonify({"success": False, "error": str(e)})

# --- CCD CONTROL ---

@app.route("/ccd/capture", methods=["POST"])
def ccd_capture():
    find_devices()
    data = request.json or {}
    exposure = data.get("exposure", 1.0)
    log_msg(f"Capturing exposure: {exposure}s")
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_EXPOSURE.CCD_EXPOSURE_VALUE={exposure}"], type_flag="-n")
    return jsonify({"success": True})

@app.route("/ccd/stream/start", methods=["POST"])
def ccd_stream_start():
    find_devices()
    log_msg("Starting CCD Live Stream...")
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_VIDEO_STREAM.STREAM_ON=On"], type_flag="-s")
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_STREAM_ENCODER.MJPEG=On"], type_flag="-s")
    return jsonify({"success": True})

@app.route("/ccd/stream/stop", methods=["POST"])
def ccd_stream_stop():
    find_devices()
    log_msg("Stopping CCD Live Stream...")
    indi_cmd(["indi_setprop", f"{DEVICE_CCD}.CCD_VIDEO_STREAM.STREAM_OFF=On"], type_flag="-s")
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
            s.settimeout(5)
            s.connect((INDI_HOST, 7624))
            s.sendall(f'<getProperties version="1.7" device="{DEVICE_CCD}"/>\r\n'.encode())
            s.sendall(f'<enableBLOB device="{DEVICE_CCD}">Also</enableBLOB>\r\n'.encode())
            
            buffer = ""
            in_blob = False
            blob_data = []
            
            while True:
                time.sleep(0.1)
                try:
                    chunk = s.recv(65536).decode('ascii', errors='ignore')
                except socket.timeout:
                    continue
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
            log_msg(f"Stream error: {e}", "ERROR")
        finally:
            if 's' in locals(): s.close()
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=--frame')

@app.route("/astro/coords", methods=["POST"])
def get_astro_coords():
    data = request.json or {}
    try:
        ra, dec, lat, lon = float(data.get("ra",0)), float(data.get("dec",0)), float(data.get("lat",0)), float(data.get("lon",0))
        obs = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=0*u.m)
        time_now = Time(datetime.datetime.utcnow())
        target = SkyCoord(ra=ra*u.hourangle, dec=dec*u.deg, frame='icrs')
        altaz = target.transform_to(AltAz(obstime=time_now, location=obs))
        return jsonify({"success": True, "alt": altaz.alt.deg, "az": altaz.az.deg})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == "__main__":
    host = os.getenv("BRIDGE_HOST", "0.0.0.0")
    port = int(os.getenv("BRIDGE_PORT", 5005))
    log_msg(f"--- STARGAZER INDI BRIDGE V2.0 ---")
    log_msg(f"Local Proxy: {host}:{port}")
    log_msg(f"Target INDI Server: {INDI_HOST}:{INDI_PORT}")
    log_msg(f"Target Astroberry: {ASTROBERRY_HOST}")
    
    find_devices()
    app.run(host=host, port=port, threaded=True)
