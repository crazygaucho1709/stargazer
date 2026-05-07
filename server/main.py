import os
import time
import logging
import threading
import socket
import base64
import re
import json
from pathlib import Path
from dotenv import load_dotenv

# Load .env file (server/.env)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import rawpy
import imageio
from datetime import datetime
from astropy.coordinates import SkyCoord, EarthLocation, AltAz
from astropy.time import Time
import astropy.units as u
from starlette.responses import StreamingResponse
import collections

# Configuration
INDI_HOST = os.getenv("INDI_HOST", "192.168.178.142")
INDI_PORT = int(os.getenv("INDI_PORT", "7624"))
STORAGE_PATH = os.getenv("STORAGE_PATH", "/Volumes/Data2/captures")
THUMBNAIL_PATH = os.path.join(STORAGE_PATH, "thumbnails")

# Logger setup part
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stargazer-backend")

# Setup memory log buffer for UI
log_buffer = collections.deque(maxlen=200)
class BufferHandler(logging.Handler):
    def emit(self, record):
        log_entry = self.format(record)
        log_buffer.append(log_entry)

buffer_handler = BufferHandler()
buffer_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%H:%M:%S'))
logger.addHandler(buffer_handler)

# Ensure directories exist with fallback
if not os.path.exists("/Volumes/Data2"):
    logger.warning("External HDD not found, falling back to local storage")
    STORAGE_PATH = os.path.join(os.getcwd(), "captures")
    THUMBNAIL_PATH = os.path.join(STORAGE_PATH, "thumbnails")

Path(STORAGE_PATH).mkdir(parents=True, exist_ok=True)
Path(THUMBNAIL_PATH).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Stargazer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve thumbnails
app.mount("/images", StaticFiles(directory=THUMBNAIL_PATH), name="images")

# --- MODELS ---
class SlewRequest(BaseModel):
    ra: float
    dec: float
    device: str = "Celestron NexStar HC"

class CaptureRequest(BaseModel):
    exposure: float
    device: str = "Canon DSLR EOS 600D"

class JogRequest(BaseModel):
    direction: str
    state: str = "start"
    device: str = "Celestron NexStar HC"

class RateRequest(BaseModel):
    rate: int
    device: str = "Celestron NexStar HC"

class SyncMasterRequest(BaseModel):
    lat: float
    lon: float
    alt: float
    az: float
    device: str = "Celestron GPS"

class CoordsRequest(BaseModel):
    ra: float
    dec: float
    lat: float
    lon: float

# --- INDI CLIENT ---
class INDIClient:
    def __init__(self):
        self.connected = False
        self.mount_connected = False
        self.latest_frame = None
        self.latest_image_path = None
        self.sock = None
        self.socket_lock = threading.Lock()  # Lock for thread-safe socket access
        self.device_mount = "Celestron GPS"
        self.device_ccd = "Canon DSLR EOS 600D"
        # Mount telemetry state
        self.mount_ra: float = 0.0
        self.mount_dec: float = 0.0
        self.mount_parked: bool = False
        self.mount_tracking: bool = False
        self.ccd_connected: bool = False
        self.thread = threading.Thread(target=self.run_loop)
        self.thread.daemon = True
        self.thread.start()

    def run_loop(self):
        """Main reconnection loop with exponential backoff."""
        retry_delay = 5      # initial delay in seconds
        max_delay    = 60    # cap at 60s
        while True:
            try:
                if not self.connected:
                    self.connect()
                    if self.connected:
                        retry_delay = 5  # reset on success
                    else:
                        time.sleep(retry_delay)
                        retry_delay = min(retry_delay * 2, max_delay)
                else:
                    time.sleep(5)
            except Exception as e:
                logger.error(f"INDI Loop error: {e}")
                self._close_socket()
                self.connected = False
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)

    def _close_socket(self):
        """Thread-safe socket cleanup."""
        with self.socket_lock:
            if self.sock:
                try:
                    self.sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self.sock.close()
                except Exception:
                    pass
                self.sock = None

    def _resolve_host(self):
        """Try primary IP, fallback to mDNS hostname."""
        candidates = [INDI_HOST, "localhost", "127.0.0.1", "astroberry.local", "astroberry"]
        for host in candidates:
            try:
                socket.getaddrinfo(host, INDI_PORT, socket.AF_INET, socket.SOCK_STREAM)
                logger.debug(f"Resolved INDI host: {host}")
                return host
            except socket.gaierror:
                continue
        return None

    def reconnect(self):
        logger.info("Manual reconnect triggered from UI")
        self._close_socket()
        self.connected = False
        self.mount_connected = False

    def connect(self):
        # Pre-check: resolve host before attempting TCP connect
        host = self._resolve_host()
        if not host:
            logger.error(f"Connection failed: cannot resolve INDI host (tried {INDI_HOST}, astroberry.local)")
            return
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            if hasattr(socket, 'TCP_KEEPIDLE'):
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 10)
            elif hasattr(socket, 'TCP_KEEPALIVE'):  # macOS
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPALIVE, 10)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            sock.settimeout(10)
            sock.connect((host, INDI_PORT))
            # Switch to short recv timeout for listener thread
            sock.settimeout(1.0)
            with self.socket_lock:
                self.sock = sock
            self.connected = True
            logger.info(f"Connected to INDI at {host}:{INDI_PORT}")

            # Initial handshake
            self.send('<getProperties version="1.7"/>')
            time.sleep(0.5)
            self.send(f'<enableBLOB device="{self.device_ccd}">Also</enableBLOB>')

            # Start listener in separate thread
            listener_thread = threading.Thread(target=self.listen, daemon=True)
            listener_thread.start()
            logger.info("INDI listener thread started")
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self._close_socket()
            self.connected = False

    def send(self, xml):
        with self.socket_lock:
            
            if self.sock and self.connected:
                try:
                    self.sock.sendall((xml + "\r\n").encode())
                    logger.debug(f"Sent: {xml[:50]}...")
                    return True
                except Exception as e:
                    logger.error(f"Send error: {e}")
                    self.connected = False
                    return False
            else:
                logger.warning("Socket not available for send")
                return False

    def listen(self):
        """Dedicated listener thread - handles all INDI incoming messages"""
        buffer = b""
        while self.connected:
            try:
                if not self.sock:
                    break
                try:
                    data = self.sock.recv(65536)
                except socket.timeout:
                    # Normal timeout, continue loop
                    continue
                
                if not data:
                    logger.warning("INDI socket closed by server")
                    break
                buffer += data
                
                # Check for connection state updates
                if b'CONNECTION' in data and b'Celestron GPS' in data:
                    chunk_str = data.decode('utf-8', errors='ignore')
                    logger.info(f"INDI CONNECTION update: {chunk_str[:200]}")
                    
                    # Parse connection state
                    if ('name="CONNECT"' in chunk_str and '>On<' in chunk_str) or ('name="CONNECTION"' in chunk_str and 'state="Ok"' in chunk_str):
                        if not self.mount_connected:
                            self.mount_connected = True
                            logger.info("✅ Mount connected")
                    elif ('name="DISCONNECT"' in chunk_str and '>On<' in chunk_str) or ('name="CONNECTION"' in chunk_str and 'state="Alert"' in chunk_str):
                        if self.mount_connected:
                            self.mount_connected = False
                            logger.info("❌ Mount disconnected")

                # Check for BLOBs (images)
                if b"<oneBLOB" in buffer:
                    # Find complete BLOB
                    end_blob_idx = buffer.find(b"</oneBLOB>")
                    if end_blob_idx != -1:
                        self.process_blobs(buffer[:end_blob_idx + 10])
                        buffer = buffer[end_blob_idx + 10:]
                    elif len(buffer) > 50_000_000:  # Max 50MB buffer
                        logger.warning("Buffer overflow, clearing")
                        buffer = b""
                else:
                    # Prevent buffer from growing infinitely and causing O(N^2) CPU slowdown on 'in' checks
                    if len(buffer) > 10000:
                        buffer = buffer[-5000:]
                        
            except socket.timeout:
                continue
            except Exception as e:
                logger.error(f"Listener error: {e}")
                break
        
        logger.warning("INDI listener stopped")
        self.connected = False

    def process_blobs(self, data):
        try:
            start_idx = data.find(b'<oneBLOB')
            if start_idx == -1: return
            end_idx = data.find(b'</oneBLOB>', start_idx)
            if end_idx == -1: return
            
            blob_tag = data[start_idx:end_idx]
            
            # Find format
            fmt = "jpg"
            fmt_start = blob_tag.find(b'format="')
            if fmt_start != -1:
                fmt_end = blob_tag.find(b'"', fmt_start + 8)
                if fmt_end != -1:
                    fmt = blob_tag[fmt_start+8:fmt_end].decode('utf-8', errors='ignore')
            
            # Find content
            content_start = blob_tag.find(b'>')
            if content_start != -1:
                blob_content = blob_tag[content_start+1:]
                blob_content = blob_content.replace(b'\n', b'').replace(b'\r', b'')
                raw_bytes = base64.b64decode(blob_content)
                
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"capture_{ts}.{fmt.lower()}"
                filepath = os.path.join(STORAGE_PATH, filename)
                
                with open(filepath, 'wb') as f:
                    f.write(raw_bytes)
                
                logger.info(f"Image saved: {filepath}")
                self.latest_frame = raw_bytes
                self.generate_thumb(filepath, ts)
        except Exception as e:
            logger.error(f"Blob error: {e}")

    def generate_thumb(self, path, ts):
        thumb_name = f"thumb_{ts}.jpg"
        thumb_path = os.path.join(THUMBNAIL_PATH, thumb_name)
        try:
            if path.lower().endswith(".cr2") or path.lower().endswith(".cr3"):
                with rawpy.imread(path) as raw:
                    rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=True, bright=1.0)
                    imageio.imsave(thumb_path, rgb)
            else:
                # Basic copy if it's already a JPG or similar
                with open(path, 'rb') as src, open(thumb_path, 'wb') as dst:
                    dst.write(src.read())
            self.latest_image_path = thumb_name
        except Exception as e:
            logger.error(f"Thumb error: {e}")

indi = INDIClient()

# --- ROUTES ---

@app.get("/health")
async def health():
    return {
        "status": "ok", 
        "indi_connected": indi.connected,
        "mount_connected": indi.mount_connected
    }

@app.post("/mount/jog")
async def mount_jog(req: JogRequest):
    device = req.device
    
    if req.direction in ["up", "down"]:
        prop = "TELESCOPE_MOTION_NS"
        val_on = "MOTION_NORTH" if req.direction == "up" else "MOTION_SOUTH"
    else:
        prop = "TELESCOPE_MOTION_WE"
        val_on = "MOTION_WEST" if req.direction == "left" else "MOTION_EAST"
    
    if req.state == "stop":
        logger.info(f"Jogging {device} {req.direction} -> STOP")
        indi.send(f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val_on}">Off</oneSwitch></newSwitchVector>')
        return {"success": True}

    xml = f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val_on}">On</oneSwitch></newSwitchVector>'
    logger.info(f"Jogging {device} {req.direction} -> start")
    indi.send(xml)
    return {"success": True}

@app.post("/mount/rate")
async def mount_rate(req: RateRequest):
    device = req.device
    rate_val = max(1, min(9, req.rate))
    rate_name = f"{rate_val}x"
    logger.info(f"Setting slew rate on {device} to {rate_name}")
    indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_SLEW_RATE"><oneSwitch name="{rate_name}">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/mount/slew")
async def mount_slew(req: SlewRequest):
    device = req.device
    logger.info(f"Slewing {device} to RA={req.ra}, DEC={req.dec}")
    indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{req.ra}</oneNumber><oneNumber name="DEC">{req.dec}</oneNumber></newNumberVector>')
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="SLEW">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/mount/goto")
async def mount_goto(req: SlewRequest):
    return await mount_slew(req)

@app.post("/mount/abort")
async def mount_abort(req: Request):
    body = await req.json()
    device = body.get("device", "Celestron GPS")
    logger.info(f"Aborting motion for {device}")
    indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/mount/sync")
async def mount_sync(req: SlewRequest):
    device = req.device
    logger.info(f"Syncing {device} to RA={req.ra}, DEC={req.dec}")
    indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{req.ra}</oneNumber><oneNumber name="DEC">{req.dec}</oneNumber></newNumberVector>')
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="SYNC">On</oneSwitch></newSwitchVector>')
    # Revert to Track mode after sync
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="TRACK">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/mount/sync_master")
async def mount_sync_master(req: SyncMasterRequest):
    device = req.device
    now_utc = datetime.utcnow()
    logger.info(f"Master sync for {device} at {req.lat}, {req.lon}")
    # Sync GPS and Time
    indi.send(f'<newNumberVector device="{device}" name="GEOGRAPHIC_COORD"><oneNumber name="LAT">{req.lat}</oneNumber><oneNumber name="LONG">{req.lon}</oneNumber></newNumberVector>')
    indi.send(f'<newTextVector device="{device}" name="TIME_UTC"><oneText name="UTC">{now_utc.strftime("%Y-%m-%dT%H:%M:%S")}</oneText></newTextVector>')
    
    # Calculate RA/Dec from Alt/Az
    observatory = EarthLocation(lat=req.lat*u.deg, lon=req.lon*u.deg, height=0*u.m)
    altaz = SkyCoord(alt=req.alt*u.deg, az=req.az*u.deg, frame='altaz', obstime=Time(now_utc), location=observatory)
    eq = altaz.transform_to('icrs')
    
    indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{eq.ra.hour}</oneNumber><oneNumber name="DEC">{eq.dec.deg}</oneNumber></newNumberVector>')
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="SYNC">On</oneSwitch></newSwitchVector>')
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="TRACK">On</oneSwitch></newSwitchVector>')
    
    return {"success": True}

@app.post("/slew")
async def slew_telescope(req: SlewRequest):
    # Log incoming request to verify format
    logger.info(f"Slew request: RA={req.ra}, DEC={req.dec}")
    
    device = req.device
    if device == "Celestron GPS":
        device = "Celestron NexStar HC"
        
    if not indi.connected:
        return {"success": False, "error": "INDI not connected"}

    # Calculate actual J2000 coordinates from AltAz/Local for safety
    # But here we assume UI sends J2000 direct
    eq = SkyCoord(ra=req.ra*u.deg, dec=req.dec*u.deg, frame='icrs')
    
    # 1. Sync TIME and LOCATION first (NexStar requires this for precise goto)
    now_utc = datetime.utcnow()
    # We send dummy lat/lon if not provided, or better, we should have a global state.
    # We will let Ekos handle GPS, just send the Goto.
    
    # 2. Set ON_COORD_SET to TRACK (meaning GOTO)
    indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="TRACK">On</oneSwitch></newSwitchVector>')
    time.sleep(0.1)
    
    # 3. Send RA/DEC GOTO
    indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{eq.ra.hour}</oneNumber><oneNumber name="DEC">{eq.dec.deg}</oneNumber></newNumberVector>')
    
    return {"success": True, "message": "Slew initiated"}

@app.get("/logs")
def get_logs():
    return {"logs": list(log_buffer)}

@app.post("/reconnect")
def reconnect_indi():
    logger.info("Force reconnecting INDI bridge...")
    indi.reconnect()
    return {"success": True, "message": "Reconnection triggered"}

EKOS_PROFILE = os.getenv("EKOS_PROFILE", "Nexstar4SE")

@app.post("/restart_kstars")
def restart_kstars():
    import subprocess
    logger.warning(f"Restarting KStars + Ekos (profile: {EKOS_PROFILE})...")

    # 1. Kill any running KStars instance
    subprocess.run(["killall", "-9", "KStars"], capture_output=True)
    time.sleep(3)

    # 2. Locate KStars via Spotlight (most reliable on macOS)
    kstars_bin = None
    spotlight = subprocess.run(
        ["mdfind", "kMDItemCFBundleIdentifier == 'org.kde.kstars'"],
        capture_output=True, text=True
    )
    for app_path in spotlight.stdout.strip().splitlines():
        binary = os.path.join(app_path, "Contents/MacOS/KStars")
        if os.path.exists(binary):
            kstars_bin = binary
            break

    # 3. Fallback list
    if not kstars_bin:
        for candidate in [
            "/Applications/KStars.app/Contents/MacOS/KStars",
            os.path.expanduser("~/Applications/KStars.app/Contents/MacOS/KStars"),
            "/usr/local/bin/kstars",
            "/opt/homebrew/bin/kstars",
        ]:
            if os.path.exists(candidate):
                kstars_bin = candidate
                break

    if kstars_bin:
        logger.info(f"KStars binary found: {kstars_bin}")
        # --ekos-profile selects the observatory profile
        # Ekos auto-starts when a profile is specified at launch
        proc = subprocess.Popen(
            [kstars_bin, "--ekos-profile", EKOS_PROFILE],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        logger.info(f"KStars PID {proc.pid} started with profile '{EKOS_PROFILE}'")
        # Give KStars time to load, then send Ekos connect via AppleScript
        def _connect_ekos_after_delay():
            time.sleep(8)
            _trigger_ekos_connect()
        threading.Thread(target=_connect_ekos_after_delay, daemon=True).start()
    else:
        # Last resort: open without profile, trigger Ekos via AppleScript
        logger.warning("KStars binary not found via Spotlight, falling back to open -a")
        subprocess.Popen(["open", "-a", "KStars"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def _open_ekos_after_delay():
            time.sleep(10)
            _trigger_ekos_connect()
        threading.Thread(target=_open_ekos_after_delay, daemon=True).start()

    return {"success": True, "message": f"KStars restarting with Ekos profile '{EKOS_PROFILE}'"}


def _trigger_ekos_connect():
    """Open Ekos panel and click Start (connect all devices) via AppleScript."""
    import subprocess
    applescript = f'''
    tell application "KStars"
        activate
    end tell
    delay 2
    tell application "System Events"
        tell process "KStars"
            -- Open Ekos via Tools menu if not already open
            try
                click menu item "Ekos..." of menu "Tools" of menu bar 1
                delay 3
            end try
            -- Click the Start button (connects all Ekos devices for the profile)
            try
                click button "Start" of window 1
            end try
        end tell
    end tell
    '''
    result = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True)
    if result.returncode == 0:
        logger.info("Ekos connect triggered via AppleScript")
    else:
        logger.warning(f"Ekos AppleScript trigger failed: {result.stderr.strip()}")


@app.post("/launch_ekos")
def launch_ekos():
    """Trigger Ekos connect without restarting KStars (if KStars is already running)."""
    import threading
    threading.Thread(target=_trigger_ekos_connect, daemon=True).start()
    return {"success": True, "message": "Ekos connect triggered"}



@app.post("/ccd/capture")
async def ccd_capture(req: CaptureRequest):
    device = req.device
    # Common mapping for Canon DSLR
    if "Canon" in device: device = "Canon DSLR EOS 600D"
    
    logger.info(f"Capturing on {device} with exposure {req.exposure}s")
    # Force Upload Client to handle image on Mac
    indi.send(f'<newSwitchVector device="{device}" name="UPLOAD_MODE"><oneSwitch name="UPLOAD_CLIENT">On</oneSwitch></newSwitchVector>')
    indi.send(f'<newNumberVector device="{device}" name="CCD_EXPOSURE"><oneNumber name="CCD_EXPOSURE_VALUE">{req.exposure}</oneNumber></newNumberVector>')
    return {"success": True}

@app.get("/ccd/latest")
async def ccd_latest():
    if indi.latest_frame:
        return Response(indi.latest_frame, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="No image available")

@app.post("/astro/coords")
async def get_astro_coords(req: CoordsRequest):
    obs = EarthLocation(lat=req.lat*u.deg, lon=req.lon*u.deg, height=0*u.m)
    time = Time(datetime.utcnow())
    target = SkyCoord(ra=req.ra*u.hourangle, dec=req.dec*u.deg, frame='icrs')
    altaz = target.transform_to(AltAz(obstime=time, location=obs))
    return {"success": True, "alt": altaz.alt.deg, "az": altaz.az.deg}

@app.get("/status")
async def get_status():
    return {
        "connected": indi.connected,
        "latest_image": indi.latest_image_path,
        "storage": STORAGE_PATH,
        "mount": indi.device_mount,
        "ccd": indi.device_ccd,
        "mount_connected": indi.mount_connected
    }

# --- STREAMING ---
def mjpeg_generator():
    # Dedicated MJPEG socket listener
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((INDI_HOST, INDI_PORT))
        s.sendall(f'<getProperties version="1.7" device="{indi.device_ccd}"/>\r\n'.encode())
        s.sendall(f'<enableBLOB device="{indi.device_ccd}">Also</enableBLOB>\r\n'.encode())
        
        buffer = b""
        while True:
            data = s.recv(65536)
            if not data: break
            buffer += data
            
            if b"<oneBLOB" in buffer and b"</oneBLOB>" in buffer:
                match = re.search(b'format="([^"]+)"[^>]*>([^<]+)</oneBLOB>', buffer, re.DOTALL)
                if match:
                    blob_content = match.group(2).decode().replace('\n', '').replace('\r', '')
                    raw_bytes = base64.b64decode(blob_content)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + raw_bytes + b'\r\n')
                buffer = b""
    except Exception as e:
        logger.error(f"MJPEG error: {e}")
    finally:
        s.close()

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/ccd/stream/start")
async def ccd_stream_start(device: str = "Canon DSLR EOS 600D"):
    # Ensure it's connected first just in case
    indi.send(f'<newSwitchVector device="{device}" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>')
    # Give it a tiny bit of time to connect if it wasn't
    time.sleep(0.5)
    # Enable viewfinder (flips the mirror)
    indi.send(f'<newSwitchVector device="{device}" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>')
    time.sleep(1)
    # Set MJPEG encoder which is often required for live view stream on DSLR
    indi.send(f'<newSwitchVector device="{device}" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>')
    # Turn on live stream
    indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/ccd/stream/stop")
async def ccd_stream_stop(device: str = "Canon DSLR EOS 600D"):
    indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
    # Also turn off viewfinder
    indi.send(f'<newSwitchVector device="{device}" name="viewfinder"><oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
    return {"success": True}

# ── NEW ENDPOINTS ────────────────────────────────────────────────────────────

import astroberry as raspi
import psutil

class MountActionRequest(BaseModel):
    confirm: str = ""

class TrackRequest(BaseModel):
    enabled: bool

@app.get("/health/full")
async def health_full():
    """Complete infrastructure health report."""
    import subprocess

    # --- Mac Mini stats ---
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    pm2_result = subprocess.run(
        ["pm2", "jlist"], capture_output=True, text=True
    )
    pm2_apps = []
    try:
        apps = json.loads(pm2_result.stdout)
        for a in apps:
            pm2_apps.append({
                "name": a.get("name"),
                "status": a.get("pm2_env", {}).get("status"),
                "uptime": a.get("pm2_env", {}).get("pm_uptime"),
                "restarts": a.get("pm2_env", {}).get("restart_time"),
                "cpu": a.get("monit", {}).get("cpu"),
                "memory": a.get("monit", {}).get("memory"),
            })
    except Exception:
        pass

    # --- KStars ---
    kstars_running = any(
        p.name() == "KStars" for p in psutil.process_iter(['name'])
    )

    # --- Astroberry (SSH, async) ---
    pi_reachable = raspi.ping()
    pi_status = raspi.get_status() if pi_reachable else {"reachable": False}

    return {
        "mac_mini": {
            "cpu_percent": cpu,
            "memory_used_gb": round(mem.used / 1e9, 2),
            "memory_total_gb": round(mem.total / 1e9, 2),
            "memory_percent": mem.percent,
            "disk_used_gb": round(disk.used / 1e9, 1),
            "disk_total_gb": round(disk.total / 1e9, 1),
            "disk_percent": disk.percent,
            "pm2_apps": pm2_apps,
        },
        "kstars": {
            "running": kstars_running,
            "ekos_profile": EKOS_PROFILE,
        },
        "indi_bridge": {
            "connected": indi.connected,
            "mount_connected": indi.mount_connected,
            "ccd_connected": indi.ccd_connected,
            "host": INDI_HOST,
            "port": INDI_PORT,
        },
        "mount": {
            "connected": indi.mount_connected,
            "ra": indi.mount_ra,
            "dec": indi.mount_dec,
            "parked": indi.mount_parked,
            "tracking": indi.mount_tracking,
            "device": indi.device_mount,
        },
        "camera": {
            "connected": indi.ccd_connected,
            "device": indi.device_ccd,
        },
        "astroberry": pi_status,
    }


@app.post("/mount/park")
def mount_park():
    if not indi.mount_connected:
        raise HTTPException(status_code=503, detail="Mount not connected")
    logger.info("Parking mount...")
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="TELESCOPE_PARK"><oneSwitch name="PARK">On</oneSwitch></newSwitchVector>')
    return {"success": True, "message": "Park command sent"}


@app.post("/mount/unpark")
def mount_unpark():
    if not indi.mount_connected:
        raise HTTPException(status_code=503, detail="Mount not connected")
    logger.info("Unparking mount...")
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="TELESCOPE_PARK"><oneSwitch name="UNPARK">On</oneSwitch></newSwitchVector>')
    return {"success": True, "message": "Unpark command sent"}


@app.post("/mount/abort")
def mount_abort():
    logger.warning("ABORT MOTION sent to mount")
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
    return {"success": True, "message": "Abort sent"}


@app.post("/mount/track")
def mount_track(req: TrackRequest):
    mode = "On" if req.enabled else "Off"
    logger.info(f"Mount tracking: {mode}")
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="TELESCOPE_TRACK_STATE"><oneSwitch name="TRACK_{mode.upper()}">On</oneSwitch></newSwitchVector>')
    return {"success": True, "tracking": req.enabled}


@app.get("/mount/status")
def mount_status():
    return {
        "connected": indi.mount_connected,
        "ra": indi.mount_ra,
        "dec": indi.mount_dec,
        "parked": indi.mount_parked,
        "tracking": indi.mount_tracking,
    }


# --- Astroberry endpoints ---

@app.get("/astroberry/status")
async def astroberry_status():
    if not raspi.ping():
        return {"reachable": False, "error": "SSH port not reachable"}
    return raspi.get_status()


@app.get("/astroberry/indi/logs")
async def astroberry_indi_logs(lines: int = 50):
    if not raspi.ping():
        raise HTTPException(status_code=503, detail="Astroberry unreachable")
    logs = raspi.get_indi_logs(lines=lines)
    return {"logs": logs}


@app.post("/astroberry/indi/restart")
async def astroberry_indi_restart():
    logger.info("Remote restart of indiserver on Astroberry")
    result = raspi.restart_indi()
    # After restarting indiserver, trigger INDI bridge reconnect
    if result["success"]:
        time.sleep(3)
        indi.reconnect()
        logger.info("INDI bridge reconnect triggered after indiserver restart")
    return result


@app.post("/astroberry/reboot")
async def astroberry_reboot(req: MountActionRequest):
    return raspi.reboot(req.confirm)


# --- Log stream (SSE) ---

@app.get("/logs/stream")
async def logs_stream():
    """Server-Sent Events stream of all logs (backend + astroberry poll)."""
    async def event_generator():
        last_idx = len(log_buffer)
        while True:
            current = list(log_buffer)
            new_entries = current[last_idx:]
            if new_entries:
                for entry in new_entries:
                    yield f"data: {json.dumps({'source': 'backend', 'message': entry})}\n\n"
                last_idx = len(current)
            await asyncio.sleep(1)

    from fastapi.responses import StreamingResponse as SR
    import asyncio
    return SR(event_generator(), media_type="text/event-stream",
              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --- Backend self-restart ---

@app.post("/backend/restart")
async def backend_restart():
    """Restart the PM2 backend process (triggers PM2 autorestart)."""
    import subprocess, threading
    logger.warning("Backend self-restart requested via API")
    def _restart():
        time.sleep(1)
        subprocess.run(["pm2", "restart", "stargazer-backend"], capture_output=True)
    threading.Thread(target=_restart, daemon=True).start()
    return {"success": True, "message": "Backend restarting in 1s..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5005)
