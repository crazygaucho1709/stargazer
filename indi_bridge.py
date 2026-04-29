#!/usr/bin/env python3
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import subprocess
import time
import base64
import socket

app = Flask(__name__)
CORS(app)

DEVICE_MOUNT = "Celestron NexStar HC"
DEVICE_CCD = "Canon DSLR EOS 600D"

def indi_cmd(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return False, "", str(e)

@app.route("/health")
def health():
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "3", DEVICE_MOUNT + ".CONNECTION.CONNECT"])
    connected = "On" in out if ok else False
    return jsonify({"status": "ok", "mount_connected": connected})

@app.route("/server/status")
def server_status():
    ok, out, _ = indi_cmd(["indi_getprop", "-t", "3", DEVICE_MOUNT + ".CONNECTION.CONNECT"])
    connected = "On" in out if ok else False
    return jsonify([{"status": "True" if connected else "False"}])

@app.route("/mount/start", methods=["POST"])
def mount_start():
    data = request.json
    direction = data.get("direction", "up")
    
    if direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val = "MOTION_NORTH" if direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val = "MOTION_WEST" if direction == "left" else "MOTION_EAST"
    
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_MOUNT + "." + prop + "." + val + "=On"])
    return jsonify({"success": ok, "direction": direction, "action": "start", "error": err if not ok else ""})

@app.route("/mount/stop", methods=["POST"])
def mount_stop():
    data = request.json
    direction = data.get("direction", "up")
    
    if direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val = "MOTION_NORTH" if direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val = "MOTION_WEST" if direction == "left" else "MOTION_EAST"
    
    ok, out, err = indi_cmd(["indi_setprop", DEVICE_MOUNT + "." + prop + "." + val + "=Off"])
    return jsonify({"success": ok, "direction": direction, "action": "stop", "error": err if not ok else ""})

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
    # Attempt to get the latest Live View frame
    ok, out, err = indi_cmd(["indi_getprop", f"{DEVICE_CCD}.CCD1.CCD1"])
    if ok and "=" in out:
        try:
            b64_data = out.split("=", 1)[1].strip()
            image_data = base64.b64decode(b64_data)
            return Response(image_data, mimetype='image/jpeg')
        except:
            pass
    return Response(b'', status=404)

if __name__ == "__main__":
    print("INDI Bridge on port 5000...")
    app.run(host="0.0.0.0", port=5000)
