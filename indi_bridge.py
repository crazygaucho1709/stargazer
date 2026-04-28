#!/usr/bin/env python3
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import subprocess
import time

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
            indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_VIDEO_STREAM.STREAM_ON=On"])
            indi_cmd(["indi_setprop", DEVICE_CCD + ".CCD_STREAM_ENCODER.MJPEG=On"])
            
            while True:
                # Placeholder frame - in production, fetch actual frames from INDI
                frame = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x03\x02\x02\x03\x02\x02\x03\x03\x03\x03\x04\x03\x03\x04\x05\x08\x05\x05\x04\x04\x05\n\x07\x07\x06\x08\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\xff\xc0\x00\n\x08\x00\x01\x00\x01\x01\x01\n\x00\xff\xc4\x00\n\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\n\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\n\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\n\xff\xda\x00\x08\x01\x01\x00\x00?\x00\n\xff\xd9'
                
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n'
                       b'Content-Length: ' + str(len(frame)).encode() + b'\r\n\r\n' +
                       frame + b'\r\n')
                
                time.sleep(0.1)
        except GeneratorExit:
            pass
        except Exception as e:
            print(f"Stream error: {e}")
    
    return Response(generate(),
                    mimetype='multipart/x-mixed-replace; boundary=--frame')

if __name__ == "__main__":
    print("INDI Bridge on port 5000...")
    app.run(host="0.0.0.0", port=5000)
