import os
import time
import logging
import threading
import socket
import base64
import re
import json
import asyncio
import random
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
import astroberry as raspi
import psutil

# Configuration
INDI_HOST = os.getenv("ASTROBERRY_HOST", os.getenv("INDI_HOST", "192.168.178.142"))
INDI_PORT = int(os.getenv("INDI_PORT", "7624"))
STORAGE_PATH = os.getenv("STORAGE_PATH", "/Volumes/Data2/captures")
THUMBNAIL_PATH = os.path.join(STORAGE_PATH, "thumbnails")

# Logger setup part
logging.basicConfig(level=logging.DEBUG)
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
    device: str = "Celestron GPS"

class CaptureRequest(BaseModel):
    exposure: float
    device: str = "Canon DSLR EOS 600D"

class JogRequest(BaseModel):
    direction: str
    state: str = "start"
    device: str = "Celestron GPS"

class RateRequest(BaseModel):
    rate: int
    device: str = "Celestron GPS"

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
# Helper for formatting coordinates
def format_ra(deg):
    # Ensure deg is float
    try:
        deg = float(deg)
    except:
        return "00h 00m 00.0s"
    h = int(deg / 15)
    m = int((deg / 15 - h) * 60)
    s = (deg / 15 - h - m/60) * 3600
    return f"{h:02d}h {m:02d}m {s:04.1f}s"

def format_dec(deg):
    try:
        deg = float(deg)
    except:
        return "+00° 00' 00.0\""
    d = int(abs(deg))
    m = int((abs(deg) - d) * 60)
    s = (abs(deg) - d - m/60) * 3600
    sign = "+" if deg >= 0 else "-"
    return f"{sign}{d:02d}° {m:02d}' {s:04.1f}\""

class INDIClient:
    def __init__(self, host=None, port=None):
        self.host = host or os.getenv("INDI_HOST", "192.168.178.142")
        self.port = int(port or os.getenv("INDI_PORT", "7624"))
        self.connected = False
        self.mount_connected = False
        self.latest_frame = None
        self.latest_image_path = None
        self.sock = None
        self.socket_lock = threading.Lock()  # Lock for thread-safe socket access
        self.device_mount = "Celestron GPS"
        self.device_ccd = "Canon DSLR EOS 600D"
        self.frame_condition = threading.Condition()
        # Mount telemetry state
        self.mount_ra: float = 0.0
        self.mount_dec: float = 0.0
        self.mount_parked: bool = False
        self.mount_tracking: bool = False
        self.ccd_connected: bool = False
        self.mount_slew_state: str = "Idle"
        self.ccd_exposure_state: str = "Idle"
        self.devices = {} # {device_name: {prop_name: [elements]}}
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
                    # Active heartbeat: if no message for 10s, send getProperties to keep connection alive
                    if time.time() - self.last_received > 10:
                        logger.debug("Sending active heartbeat (getProperties)")
                        self.send('<getProperties version="1.7"/>')
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
        """Try primary host, fallback to localhost and mDNS if primary fails."""
        candidates = [self.host, "localhost", "127.0.0.1", "astroberry.local", "astroberry"]
        for candidate in candidates:
            try:
                socket.getaddrinfo(candidate, self.port, socket.AF_INET, socket.SOCK_STREAM)
                logger.debug(f"Resolved INDI host: {candidate}")
                return candidate
            except socket.gaierror:
                continue
        return None

    def reconnect(self, restart_remote: bool = True):
        """Force a full reconnect of the INDI bridge.

        Closes the local socket and, by default, also asks the Astroberry
        Raspberry Pi to restart its ``indiserver`` process. This is required
        when the local socket is in a stuck or half-open state and the
        upstream INDI server has lost track of devices (e.g. after USB
        broken-pipe errors). Pass ``restart_remote=False`` to skip the SSH
        roundtrip when only a local socket reset is desired.
        """
        logger.info("Manual reconnect triggered from UI")
        self._close_socket()
        self.connected = False
        self.mount_connected = False
        self.ccd_connected = False

        if restart_remote:
            try:
                logger.info("Triggering remote indiserver restart on Astroberry...")
                result = raspi.restart_indi()
                if result.get("success"):
                    logger.info("Remote indiserver restart succeeded; bridge will reconnect on next loop tick")
                else:
                    logger.warning(
                        f"Remote indiserver restart failed: {result.get('error') or result.get('output')}"
                    )
            except Exception as e:
                logger.error(f"Remote indiserver restart raised: {e}")

    def _safe_connect_device(self, device: str):
        """Send the 'Safe Connect' sequence for a single INDI device.

        Order matters here: subscribe to the device's properties, enable
        BLOBs (so image payloads can stream over the same socket), set the
        upload mode to ``UPLOAD_BOTH`` for cameras, and finally toggle the
        ``CONNECTION`` switch to ``CONNECT``. Errors are logged but do not
        abort the rest of the handshake.
        """
        try:
            self.send(f'<getProperties version="1.7" device="{device}"/>')
            self.send(f'<enableBLOB device="{device}">Also</enableBLOB>')
            
            # Optimized Upload Mode for DSLRs
            if any(kw in device for kw in ["Canon", "Nikon", "DSLR"]):
                self.send(
                    f'<newSwitchVector device="{device}" name="UPLOAD_MODE">'
                    f'<oneSwitch name="UPLOAD_CLIENT">On</oneSwitch>'
                    f'</newSwitchVector>'
                )
            
            # Slow down mount polling to avoid serial read timeouts (common with Prolific adapters)
            if any(kw in device for kw in ["Celestron", "GPS", "NexStar", "Mount"]):
                 self.send(f'<newNumberVector device="{device}" name="POLLING_PERIOD"><oneNumber name="PERIOD">2.0</oneNumber></newNumberVector>')
                 # Abort any pending motion to clear serial buffers
                 self.send(f'<newSwitchVector device="{device}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')

            self.send(
                f'<newSwitchVector device="{device}" name="CONNECTION">'
                f'<oneSwitch name="CONNECT">On</oneSwitch>'
                f'<oneSwitch name="DISCONNECT">Off</oneSwitch>'
                f'</newSwitchVector>'
            )
            logger.info(f"Safe-connect sequence sent for device: {device}")
        except Exception as e:
            logger.error(f"Safe-connect failed for {device}: {e}")

    def connect(self):
        # Pre-check: resolve host before attempting TCP connect
        host = self._resolve_host()
        if not host:
            logger.error(f"Connection failed: cannot resolve INDI host (tried {self.host})")
            return

        # Attempt TCP connection
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)

            if hasattr(socket, 'TCP_KEEPIDLE'):
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 10)
            elif hasattr(socket, 'TCP_KEEPALIVE'):  # macOS
                sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPALIVE, 10)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            sock.settimeout(10)
            sock.connect((host, self.port))
            # Switch to short recv timeout for listener thread
            sock.settimeout(1.0)
            with self.socket_lock:
                self.sock = sock
            self.connected = True
            logger.info(f"Connected to INDI at {host}:{self.port}")

            # Initial handshake: ask for the full property tree first so the
            # listener can populate state, then run the per-device "Safe
            # Connect" sequence (BLOBs + UPLOAD_MODE + CONNECT).
            self.send('<getProperties version="1.7"/>')
            time.sleep(1.0)  # Give the server time to enumerate properties

            # Start listener in separate thread BEFORE issuing CONNECT so we
            # don't miss the CONNECTION state response from the driver.
            listener_thread = threading.Thread(target=self.listen, daemon=True)
            listener_thread.start()
            logger.info("INDI listener thread started")

            # Auto-connect both managed devices via the Safe Connect sequence
            # (getProperties + enableBLOB + UPLOAD_MODE for cameras + CONNECT
            # switch). KStars/Ekos is no longer required to bring devices
            # online — the backend now drives the CONNECTION switch directly.
            logger.info("Auto-connecting hardware devices via INDI...")
            for device in (self.device_mount, self.device_ccd):
                if device:
                    self._safe_connect_device(device)
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self._close_socket()
            self.connected = False

    def send(self, xml):
        with self.socket_lock:
            if self.sock and self.connected:
                try:
                    self.sock.sendall((xml + "\r\n").encode())
                    logger.info(f"INDI SEND: {xml}")
                    return True
                except (socket.error, BrokenPipeError, ConnectionResetError) as e:
                    logger.error(f"Send failure (socket error): {e}")
                    self.connected = False
                    self._close_socket()
                    return False
                except Exception as e:
                    logger.error(f"Send error: {e}")
                    # Don't necessarily disconnect on non-socket errors, but log it
                    return False
            else:
                # If we're not connected, try a quick reachability check
                if not self.connected:
                    logger.warning("Socket not available for send, attempting lazy reconnect...")
                return False

    def process_message(self, message):
        """Processes a single complete INDI XML message."""
        try:
            if not message: return
            xml_str = message
            state_match = re.search(r'state="([^"]+)"', xml_str)
            state = state_match.group(1) if state_match else "Unknown"
            dev_match = re.search(r'device="([^"]+)"', xml_str)
            prop_match = re.search(r'name="([^"]+)"', xml_str)
            
            if dev_match and prop_match:
                dev_name = dev_match.group(1)
                prop_name = prop_match.group(1)
                if dev_name not in self.devices:
                    self.devices[dev_name] = {}
                # Extract elements if any
                elements = re.findall(r'name="([^"]+)"[^>]*>([^<]+)<', xml_str)
                if elements:
                    self.devices[dev_name][prop_name] = elements
                else:
                    # Just mark property existence
                    if prop_name not in self.devices[dev_name]:
                        self.devices[dev_name][prop_name] = []
                
                # Log all properties for debugging
                if "CONNECTION" not in prop_name and "COORD" not in prop_name:
                    logger.debug(f"INDI Vector: {dev_name}.{prop_name} (elements={len(elements)})")

            # 1. Connection updates
            if 'name="CONNECTION"' in xml_str:
                dev_match = re.search(r'device="([^"]+)"', xml_str)
                is_connected = 'name="CONNECT">On' in xml_str or 'state="Ok"' in xml_str
                
                if dev_match:
                    dev_name = dev_match.group(1)
                    logger.debug(f"INDI Connection Update: {dev_name} (Connected={is_connected})")
                    if any(kw in dev_name for kw in ["GPS", "Mount", "NexStar", "Telescope"]):
                        self.device_mount = dev_name
                        self.mount_connected = is_connected
                        if is_connected: logger.info(f"✅ Mount Online: {dev_name}")
                    elif any(kw in dev_name for kw in ["CCD", "Camera", "DSLR", "EOS"]):
                        self.device_ccd = dev_name
                        self.ccd_connected = is_connected
                        if is_connected: logger.info(f"✅ Camera Online: {dev_name}")

            # 2. Coordinate updates (RA/DEC)
            if 'EQUATORIAL_EOD_COORD' in xml_str or 'EQUATORIAL_COORD' in xml_str:
                ra_match = re.search(r'name="RA"[^>]*>([\d\.\s\n]+)<', xml_str)
                dec_match = re.search(r'name="DEC"[^>]*>([\d\.\-\s\n]+)<', xml_str)
                if ra_match:
                    try: 
                        # INDI RA is in hours, we store degrees internally (x 15)
                        self.mount_ra = float(ra_match.group(1).strip()) * 15.0
                    except: pass
                if dec_match:
                    try: 
                        self.mount_dec = float(dec_match.group(1).strip())
                    except: pass
                
                # Update slew state based on INDI state
                if state == "Busy": self.mount_slew_state = "Busy"
                elif state == "Ok": self.mount_slew_state = "Idle"
                elif state == "Alert": self.mount_slew_state = "Error"

            # 3. Hardware state updates
            if 'name="TELESCOPE_PARK"' in xml_str:
                self.mount_parked = ('name="PARK">On' in xml_str)
                
            if 'name="TELESCOPE_TRACK_STATE"' in xml_str:
                self.mount_tracking = 'name="TRACK_ON">On' in xml_str

            # 4. Exposure state
            if 'name="CCD_EXPOSURE"' in xml_str:
                if state == "Busy": self.ccd_exposure_state = "Exposing"
                elif state == "Ok": self.ccd_exposure_state = "Idle"
                elif state == "Alert": self.ccd_exposure_state = "Error"

            # Generic Message Logging
            if '<message' in xml_str:
                msg_match = re.search(r'message="([^"]+)"', xml_str)
                if msg_match:
                    msg = msg_match.group(1)
                    if "Alert" in xml_str or "error" in msg.lower():
                        logger.error(f"INDI Hardware Alert: {msg}")
                    else:
                        logger.info(f"INDI: {msg}")

        except Exception as e:
            logger.error(f"INDI Processor Error: {e}")

    def listen(self):
        """Dedicated listener thread - handles all INDI incoming messages with robust buffering."""
        buffer = b""
        self.last_received = time.time()
        
        while self.connected:
            try:
                if not self.sock:
                    break
                
                # Check for heartbeat/stale connection (no data for 20s)
                if time.time() - self.last_received > 20:
                    logger.debug("INDI active heartbeat (20s idle)")
                    self.send('<getProperties version="1.7"/>')
                    self.last_received = time.time()

                try:
                    data = self.sock.recv(65536)
                except socket.timeout:
                    continue
                except socket.error as e:
                    logger.error(f"Socket error during recv: {e}")
                    break
                
                if not data:
                    logger.warning("INDI socket closed by server")
                    break
                
                self.last_received = time.time()
                buffer += data
                
                # Extract and process all complete XML tags
                while True:
                    start_idx = buffer.find(b"<")
                    if start_idx == -1:
                        # No more tags, clear whitespace/noise
                        buffer = b""
                        break
                    
                    # Search for end of tag (simple /> or closing tag </tag>)
                    # We look for the first closing sequence
                    
                    # Identify the tag name to find its specific closing tag
                    name_match = re.match(rb'<([a-zA-Z0-9_]+)', buffer[start_idx:])
                    if not name_match:
                        # Corrupt tag start? Skip it
                        buffer = buffer[start_idx+1:]
                        continue
                        
                    tag_name = name_match.group(1)
                    closing_tag = b"</" + tag_name + b">"
                    
                    # Check both self-closing and explicit closing
                    end_simple = buffer.find(b"/>", start_idx)
                    end_explicit = buffer.find(closing_tag, start_idx)
                    
                    target_end = -1
                    if end_simple != -1 and (end_explicit == -1 or end_simple < end_explicit):
                        # Self-closing is valid and comes first (or only one)
                        # Ensure it's not inside a larger tag (very rare in INDI)
                        first_gt = buffer.find(b">", start_idx)
                        if first_gt != -1 and first_gt == end_simple + 1:
                            target_end = end_simple + 2
                    
                    if target_end == -1 and end_explicit != -1:
                        target_end = end_explicit + len(closing_tag)
                        
                    if target_end != -1:
                        # We have a full tag!
                        xml_tag = buffer[start_idx:target_end]
                        buffer = buffer[target_end:]
                        try:
                            if tag_name == b"setBLOBVector" or tag_name == b"oneBLOB":
                                # Extract property name to identify if it's Live View
                                prop_name = "unknown"
                                prop_match = re.search(rb'name="([^"]+)"', xml_tag)
                                if prop_match:
                                    prop_name = prop_match.group(1).decode('utf-8', errors='ignore')
                                self.process_blobs(xml_tag, prop_name)
                            else:
                                self.process_message(xml_tag.decode('utf-8', errors='ignore'))
                        except Exception as e:
                            logger.error(f"Message Processing Error: {e}")
                    else:
                        # Incomplete tag, keep in buffer and wait for more data
                        # but clean up prefix noise
                        if start_idx > 0: buffer = buffer[start_idx:]
                        break
                        
            except Exception as e:
                logger.error(f"Critical Listener Failure: {e}")
                break
        
        logger.warning("INDI listener stopped")
        self.connected = False
        self.mount_connected = False
        self.ccd_connected = False
        self._close_socket()

    def process_blobs(self, data, prop_name="unknown"):
        """
        Extract image data from INDI <defBLOB> or <setBLOB> elements.
        data: bytes containing a setBLOBVector or oneBLOB
        """
        try:
            # 1. Find the start of the base64 content
            blob_start = data.find(b'<oneBLOB')
            if blob_start == -1: 
                logger.debug(f"BLOB skip: no <oneBLOB tag found in {len(data)} bytes")
                return
            
            content_start_idx = data.find(b'>', blob_start) + 1
            content_end_idx = data.find(b'</oneBLOB>', content_start_idx)
            
            if content_start_idx == 0 or content_end_idx == -1:
                logger.debug(f"BLOB skip: malformed tags (start={content_start_idx}, end={content_end_idx})")
                return

            blob_content = data[content_start_idx:content_end_idx]
            logger.debug(f"BLOB extracting: {len(blob_content)} bytes of base64 data for property {prop_name}")
            
            if not blob_content or len(blob_content) < 100:
                logger.debug(f"BLOB skip: content too small ({len(blob_content)} bytes)")
                return

            # 2. Extract metadata from the tag
            blob_tag = data[blob_start:content_start_idx]
            fmt = "jpg"
            fmt_match = re.search(rb'format="([^"]+)"', blob_tag)
            if fmt_match:
                fmt = fmt_match.group(1).decode('utf-8', errors='ignore').strip('.')
            
            # content_start_idx was calculated above as the byte after the '>' of the opening tag
            # content_end_idx was calculated above as the start of '</oneBLOB>'
            # So blob_content already contains the base64 data.
            
            # Memory efficient cleanup of base64 whitespace
            clean_content = blob_content.replace(b'\n', b'').replace(b'\r', b'')
            try:
                raw_bytes = base64.b64decode(clean_content)
                
                # Update latest frame first for real-time display
                with self.frame_condition:
                    self.latest_frame = raw_bytes
                    self.frame_condition.notify_all()
                
                logger.debug(f"Frame received: {len(raw_bytes)} bytes (Format: {fmt}, Prop: {prop_name})")

                # Robust check for stream frames
                is_viewfinder = (
                    "viewfinder" in prop_name.lower() or 
                    "stream" in prop_name.lower() or 
                    "stream" in fmt.lower() or
                    prop_name == "unknown"
                )
                
                if not is_viewfinder:
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"capture_{ts}.{fmt.lower()}"
                    filepath = os.path.join(STORAGE_PATH, filename)
                    
                    with open(filepath, 'wb') as f:
                        f.write(raw_bytes)
                    
                    logger.info(f"Image saved: {filepath} (Property: {prop_name}, Format: {fmt})")
                    self.generate_thumb(filepath, ts)
                else:
                    # Log stream frame reception occasionally
                    if random.random() < 0.01: # Reduce log spam even more
                        logger.debug(f"Live frame received: {len(raw_bytes)} bytes (Prop: {prop_name}, Fmt: {fmt})")
            except Exception as e:
                logger.error(f"Inner BLOB Error: {e}")
                        
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
        "mount_connected": indi.mount_connected,
        "ccd_connected": indi.ccd_connected,
        "ra": format_ra(indi.mount_ra),
        "dec": format_dec(indi.mount_dec),
        "ra_raw": indi.mount_ra,
        "dec_raw": indi.mount_dec,
        "device_mount": indi.device_mount,
        "device_ccd": indi.device_ccd,
        "latest_frame_size": len(indi.latest_frame) if indi.latest_frame else 0
    }

@app.get("/debug/indi")
async def debug_indi():
    return {
        "connected": indi.connected,
        "mount_connected": indi.mount_connected,
        "device_mount": indi.device_mount,
        "device_ccd": indi.device_ccd,
        "ccd_connected": indi.ccd_connected,
        "mount_parked": indi.mount_parked,
        "mount_tracking": indi.mount_tracking,
        "mount_ra": format_ra(indi.mount_ra), # RA for UI display (HMS)
        "mount_dec": format_dec(indi.mount_dec), # DEC for UI display (DMS)
        "mount_ra_raw": indi.mount_ra,
        "mount_dec_raw": indi.mount_dec,
        "latest_frame_size": len(indi.latest_frame) if indi.latest_frame else 0,
        "host": [indi.host, indi.port],
        "candidates": [os.getenv("ASTROBERRY_HOST"), os.getenv("INDI_HOST"), "localhost", "127.0.0.1", "192.168.178.142"]
    }

@app.get("/debug/properties")
async def debug_properties():
    return {
        "devices": list(indi.devices.keys()) if hasattr(indi, "devices") else [],
        "properties": indi.devices if hasattr(indi, "devices") else {}
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

async def mount_slew_internal(device: str, ra: float, dec: float, sync: bool = False):
    """
    Unified slew/sync logic for INDI mounts (especially Celestron NexStar).
    Expects RA and DEC in degrees from frontend.
    """
    if not device or device == "":
        device = indi.device_mount

    if not indi.connected:
        logger.error("Slew failed: INDI not connected")
        return {"success": False, "error": "Hardware offline"}

    # Coordinates from frontend are already in decimal hours for RA and degrees for DEC
    ra_hours = ra
    
    logger.info(f"{'Syncing' if sync else 'Slewing'} {device} to RA={ra} hours, DEC={dec} deg")

    if indi.mount_parked and not sync:
        logger.warning(f"Mount {device} is parked. Attempting to unpark before slew.")
        indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_PARK"><oneSwitch name="UNPARK">On</oneSwitch></newSwitchVector>')
        await asyncio.sleep(1.0) # More time for unparking mechanics

    try:
        # 1. Set ON_COORD_SET mode FIRST
        # SLEW mode is for moving to a new target.
        mode = "SYNC" if sync else "SLEW"
        indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="{mode}">On</oneSwitch></newSwitchVector>')
        
        # Small delay for the driver to acknowledge the mode change
        await asyncio.sleep(0.2)

        # 2. Send RA and DEC to BOTH common property names for maximum compatibility
        # Standard property
        indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{ra}</oneNumber><oneNumber name="DEC">{dec}</oneNumber></newNumberVector>')
        
        # Fallback property
        indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_COORD"><oneNumber name="RA">{ra}</oneNumber><oneNumber name="DEC">{dec}</oneNumber></newNumberVector>')
        
        if not sync:
            indi.mount_slew_state = "Busy"

        return {"success": True, "message": f"{'Sync' if sync else 'Slew'} initiated to {ra}, {dec}", "state": "Busy"}
    except Exception as e:
        logger.error(f"Slew internal error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/mount/slew")
async def mount_slew(req: SlewRequest):
    return await mount_slew_internal(req.device, req.ra, req.dec)

@app.post("/mount/goto")
async def mount_goto(req: SlewRequest):
    return await mount_slew_internal(req.device, req.ra, req.dec)

@app.post("/mount/sync")
async def mount_sync(req: SlewRequest):
    return await mount_slew_internal(req.device, req.ra, req.dec, sync=True)

@app.post("/command")
async def handle_generic_command(req: Request):
    """Handle generic INDI commands from the frontend."""
    try:
        body = await req.body()
        data = json.loads(body) if body else {}
        action = data.get("action")
        device = data.get("device")
        
        # Robust action detection (case-insensitive and fallback to endpoint)
        if action:
            action = str(action).lower()
        
        if not action:
            # Fallback for legacy calls
            action = data.get("endpoint", "").split("/")[-1].lower()
            if not action:
                # Try to infer from body fields
                if data.get("exposure") is not None: action = "capture"
                elif data.get("direction") is not None: action = "focus"
                elif data.get("ra") is not None and data.get("dec") is not None: action = "slew"
                elif "abort" in str(req.url.path).lower(): action = "abort"

        logger.info(f"GENERIC COMMAND -> Action: '{action}', Device: '{device}', Data: {data}")
        
        if not action:
            logger.warning(f"Failed to identify action in body: {data}")
            return {"success": False, "error": f"Unknown action: {action}. Please specify 'action' in body."}

        if not indi.connected:
            if not indi.connect():
                return {"success": False, "error": "Hardware offline"}

        if action == "synclocation":
            vals = data.get("values", {})
            lat, lon = vals.get("LAT"), vals.get("LONG")
            elev = vals.get("ELEV", 0)
            if lat is None or lon is None:
                return {"success": False, "error": "Missing LAT/LONG"}
            indi.send(f'<newNumberVector device="{device}" name="GEOGRAPHIC_COORD"><oneNumber name="LAT">{lat}</oneNumber><oneNumber name="LONG">{lon}</oneNumber><oneNumber name="ELEV">{elev}</oneNumber></newNumberVector>')
            return {"success": True}

        if action in ["capture", "ccd_capture"]:
            return await ccd_capture_internal(device or indi.device_ccd, data.get("exposure", 1.0))

        if action in ["focus", "ccd_focus"]:
            return await ccd_focus_internal(device or indi.device_ccd, data.get("direction", "IN"), data.get("steps", 50))

        if action in ["slew", "goto"]:
            return await mount_slew_internal(device or indi.device_mount, data.get("ra"), data.get("dec"))

        if action in ["abort_all", "abort"]:
            indi.send(f'<newSwitchVector device="{indi.device_mount}" name="ABORT_PROCESS"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
            indi.send(f'<newSwitchVector device="{indi.device_mount}" name="ABORT"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
            return {"success": True, "message": "Abort sent"}

        return {"success": False, "error": f"Unsupported action: {action}"}
    except Exception as e:
        logger.error(f"Command error: {e}")
        return {"success": False, "error": str(e)}

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
    """Legacy/Alternate slew endpoint."""
    return await mount_slew_internal(req.device, req.ra, req.dec)

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
        ["mdfind", "kMDItemDisplayName == 'KStars' || kMDItemCFBundleIdentifier == 'org.kde.kstars'"],
        capture_output=True, text=True
    )
    for app_path in spotlight.stdout.strip().splitlines():
        if app_path.endswith(".app"):
            binary = os.path.join(app_path, "Contents/MacOS/KStars")
            if os.path.exists(binary):
                kstars_bin = binary
                break

    # 3. Fallback list (expanded for case-sensitivity and common locations)
    if not kstars_bin:
        for candidate in [
            "/Applications/KStars.app/Contents/MacOS/KStars",
            "/Applications/KStars.app/Contents/MacOS/kstars",
            "/Applications/kstars.app/Contents/MacOS/kstars",
            os.path.expanduser("~/Applications/KStars.app/Contents/MacOS/KStars"),
            os.path.expanduser("~/Applications/KStars.app/Contents/MacOS/kstars"),
            "/opt/homebrew/bin/kstars",
            "/usr/local/bin/kstars",
            "/opt/kstars/bin/kstars",
            "/Applications/Astronomy/KStars.app/Contents/MacOS/KStars",
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



async def ccd_capture_internal(device: str, exposure: float):
    # Common mapping for Canon DSLR
    if "Canon" in device: 
        device = "Canon DSLR EOS 600D"
    
    if not indi.connected:
        return {"success": False, "error": "Hardware offline"}

    logger.info(f"EXEC CAPTURE -> {device} | Exp: {exposure}s")
    
    # 1. Ensure BLOBs are enabled for this specific device
    indi.send(f'<enableBLOB device="{device}">Also</enableBLOB>')
    
    # 2. Set UPLOAD MODE to Both (Client + Local)
    # This ensures the driver stores it locally AND sends it to us
    indi.send(f'<newSwitchVector device="{device}" name="UPLOAD_MODE"><oneSwitch name="UPLOAD_BOTH">On</oneSwitch></newSwitchVector>')
    
    # 3. Ensure target is RAM for fast transfer on Astroberry
    # Some drivers use CCD_CAPTURE_TARGET, others UPLOAD_SETTINGS
    indi.send(f'<newSwitchVector device="{device}" name="CCD_CAPTURE_TARGET"><oneSwitch name="CCD_CAPTURE_RAM">On</oneSwitch></newSwitchVector>')
    
    # 4. Small wait to ensure settings are applied
    await asyncio.sleep(0.3)
    
    # 5. Trigger exposure
    indi.ccd_exposure_state = "Busy"
    indi.send(f'<newNumberVector device="{device}" name="CCD_EXPOSURE"><oneNumber name="CCD_EXPOSURE_VALUE">{exposure}</oneNumber></newNumberVector>')
    
    return {"success": True, "message": f"Exposure of {exposure}s started on {device}", "state": "Busy"}

async def ccd_focus_internal(device: str, direction: str, steps: int):
    logger.info(f"Focusing {device}: {direction} {steps} steps")
    # Mapping for Canon focusing
    # Most INDI drivers use FOCUS_MOTION and FOCUS_TIMER or FOCUS_RELATIVE_STEPS
    indi.send(f'<newSwitchVector device="{device}" name="FOCUS_MOTION"><oneSwitch name="FOCUS_{direction.upper()}">On</oneSwitch></newSwitchVector>')
    indi.send(f'<newNumberVector device="{device}" name="FOCUS_TIMER"><oneNumber name="FOCUS_TIMER_VALUE">{steps/1000.0}</oneNumber></newNumberVector>')
    return {"success": True}

@app.post("/ccd/capture")
async def ccd_capture(req: CaptureRequest):
    return await ccd_capture_internal(req.device, req.exposure)

@app.post("/ccd/focus")
async def ccd_focus(req: Request):
    data = await req.json()
    device = data.get("device", indi.device_ccd)
    direction = data.get("direction", "IN")
    steps = data.get("steps", 50)
    return await ccd_focus_internal(device, direction, steps)

@app.get("/ccd/latest")
async def ccd_latest():
    if indi.latest_frame:
        return Response(indi.latest_frame, media_type="image/jpeg")
    # No frame yet (camera not connected, no exposure taken). Return 204 so
    # the polling LiveView doesn't spam the browser console with 404 errors.
    return Response(status_code=204)

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
        "mount_connected": indi.mount_connected,
        "mount_slew_state": indi.mount_slew_state,
        "ccd_exposure_state": indi.ccd_exposure_state
    }

# --- STREAMING ---
def mjpeg_generator():
    """Yield frames from the global INDI client latest_frame."""
    last_frame_time = 0
    while True:
        with indi.frame_condition:
            # Wait for a new frame or timeout
            if not indi.frame_condition.wait(timeout=2.0):
                # If timeout, maybe send the last frame again or wait
                if not indi.connected:
                    break
                continue
            
            frame = indi.latest_frame
            
        if frame:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        
        # Small sleep to prevent CPU hogging if frames come too fast
        time.sleep(0.01)

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/ccd/stream/start")
async def ccd_stream_start(device: str = "Canon DSLR EOS 600D"):
    # Ensure it's connected first just in case
    indi.send(f'<newSwitchVector device="{device}" name="CONNECTION"><oneSwitch name="CONNECT">On</oneSwitch></newSwitchVector>')
    # Give it a tiny bit of time to connect if it wasn't
    time.sleep(0.5)
    # Enable live view (mirror up) - viewfinder0 is "On" (Live View)
    indi.send(f'<newSwitchVector device="{device}" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>')
    time.sleep(1)
    # Set MJPEG encoder which is often required for live view stream on DSLR
    indi.send(f'<newSwitchVector device="{device}" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>')
    # Turn on live stream
    indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>')
    return {"success": True}

@app.post("/ccd/stream/stop")
async def ccd_stream_stop(device: str = "Canon DSLR EOS 600D"):
    # Turn off live stream first
    indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
    # Disable live view (mirror down) - viewfinder1 is "Off" (Viewfinder)
    indi.send(f'<newSwitchVector device="{device}" name="viewfinder"><oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
    return {"success": True}

# ── NEW ENDPOINTS ────────────────────────────────────────────────────────────

# --- INFRASTRUCTURE ---

class MountActionRequest(BaseModel):
    confirm: str = ""

class TrackRequest(BaseModel):
    enabled: bool

@app.get("/api/indi/health-full")
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

    # --- Astroberry (SSH) ---
    pi_status = raspi.get_status()

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


@app.post("/indi/reconnect")
async def indi_reconnect():
    """Force a full disconnect and reconnect of the INDI bridge."""
    logger.warning("User requested INDI reconnection")
    indi.connected = False
    if indi.sock:
        try:
            indi.sock.close()
        except:
            pass
    
    # Wait for listener to stop
    await asyncio.sleep(1.0)
    
    # Reconnect
    success = indi.connect()
    return {"success": success, "message": "INDI reconnection " + ("successful" if success else "failed")}

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
    logger.warning(f"ABORT MOTION sent to mount: {indi.device_mount}")
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
    return {"success": True, "message": "Abort motion command sent to mount"}


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
        "slew_state": indi.mount_slew_state,
        "ccd_state": indi.ccd_exposure_state
    }


# --- Astroberry endpoints ---

@app.get("/astroberry/status")
async def astroberry_status():
    return raspi.get_status()


@app.get("/astroberry/indi/logs")
async def astroberry_indi_logs(lines: int = 50):
    logs = raspi.get_indi_logs(lines=lines)
    return {"logs": logs}


@app.post("/reconnect")
async def reconnect_indi():
    logger.info("Force reconnecting INDI bridge and remote server...")
    # 1. Restart remote indiserver
    raspi.restart_indi()
    time.sleep(3)
    # 2. Reconnect local client
    indi.reconnect()
    return {"success": True, "message": "Full hardware stack reconnection triggered"}


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
