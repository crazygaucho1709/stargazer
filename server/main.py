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
import math
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
import cv2
import numpy as np
from datetime import datetime, timezone
from astropy.coordinates import SkyCoord, EarthLocation, AltAz
from astropy.time import Time
import astropy.units as u
from starlette.responses import StreamingResponse, PlainTextResponse
import collections
import astroberry as raspi
import psutil
from concurrent.futures import ThreadPoolExecutor

from log_config import setup_logging, JSONFormatter
from metrics import metrics

# --- CACHE ---
cached_astroberry_status = {"reachable": False, "error": "Initializing..."}
status_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=2)

BACKEND_VERSION = "2026-05-17-V1"
BACKEND_START_TIME = datetime.now(timezone.utc)

# Configuration
INDI_HOST = os.getenv("ASTROBERRY_HOST", os.getenv("INDI_HOST", "astroberry.local"))
INDI_PORT = int(os.getenv("INDI_PORT", "7624"))
STORAGE_PATH = os.getenv("STORAGE_PATH", "/Volumes/Data2/captures")
THUMBNAIL_PATH = os.path.join(STORAGE_PATH, "thumbnails")

# Structured JSON logger
logger = setup_logging()

# Setup memory log buffer for UI (keeps plain text for compat)
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

# Import and include framing WebSocket router
try:
    from framing import router as framing_router
    app.include_router(framing_router)
    logger.info("Framing WebSocket router loaded")
except Exception as e:
    logger.warning(f"Framing router not loaded: {e}")

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    metrics.inc_active()
    metrics.inc_request(method, path)
    start = time.time()

    try:
        response = await call_next(request)
        latency = time.time() - start
        metrics.observe_latency(method, path, latency)

        response.headers["X-Backend-Version"] = BACKEND_VERSION

        extra = {"path": path, "method": method, "latency_ms": round(latency * 1000, 1), "status_code": response.status_code}
        logger.info(f"{method} {path} {response.status_code} in {latency*1000:.0f}ms", extra=extra)
        return response
    except Exception as exc:
        latency = time.time() - start
        metrics.inc_error(method, path)
        metrics.observe_latency(method, path, latency)

        extra = {"path": path, "method": method, "latency_ms": round(latency * 1000, 1), "status_code": 500}
        logger.error(f"{method} {path} ERROR: {exc}", extra=extra, exc_info=True)
        return Response(content=f"Internal Server Error: {str(exc)}", status_code=500)
    finally:
        metrics.dec_active()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    metrics.inc_error(request.method, request.url.path)
    extra = {"path": request.url.path, "method": request.method}
    logger.error(f"GLOBAL ERROR: {str(exc)}", extra=extra, exc_info=True)
    return Response(content=f"Global Error: {str(exc)}", status_code=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Serve thumbnails
app.mount("/images", StaticFiles(directory=THUMBNAIL_PATH), name="images")

# --- MODELS ---

# --- CONFIG SERVICE IMPORT ---
from services.config_service import ConfigService, AppConfig

# Endpoint to get configuration
@app.get("/api/config")
async def get_config():
    return ConfigService.load_config()

# Endpoint to save configuration
@app.post("/api/config")
async def save_config(config: AppConfig):
    ConfigService.save_config(config)
    return {"status": "success", "message": "Session parameters saved"}
class SlewRequest(BaseModel):
    ra: float
    dec: float
    device: str = "Celestron GPS"

class CaptureRequest(BaseModel):
    exposure: float
    device: str = None # Default to currently discovered device

class JogRequest(BaseModel):
    direction: str
    state: str = "start"
    device: str = "Celestron GPS"
    duration: float = 0.5

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
    ra: float = 0.0
    dec: float = 0.0
    lat: float = -17.6333
    lon: float = -149.6000

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
        self.host = host or os.getenv("INDI_HOST", "astroberry.local")
        self.port = int(port or os.getenv("INDI_PORT", "7624"))
        self.connected = False
        self.mount_connected = False
        self.latest_frame = None
        self.frame_count = 0
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
        self.lat: float = -17.6333 # Tahiti default
        self.lon: float = -149.6000 # Tahiti default
        self.devices = {} # {device_name: {prop_name: [elements]}}
        self.discovery_time = {} # {device_name: first_seen_timestamp}
        self.thread = threading.Thread(target=self.run_loop)
        self.thread.daemon = True
        self.thread.start()
        
        # Start background status loop if not already running
        self._start_status_loop()

    def _start_status_loop(self):
        """Start the background Astroberry status poller."""
        def run_status_loop():
            global cached_astroberry_status
            logger.info("Starting background Astroberry status poller")
            while True:
                try:
                    # Perform blocking status fetch in background
                    status = raspi.get_status()
                    status["last_update"] = datetime.now().isoformat()
                    with status_lock:
                        cached_astroberry_status = status
                    logger.debug("Astroberry status cache updated")
                except Exception as e:
                    logger.error(f"Status loop error: {e}")
                
                # Poll every 30 seconds
                time.sleep(30)

        # Only start one thread
        if not hasattr(self, '_status_thread_started'):
            self._status_thread_started = True
            t = threading.Thread(target=run_status_loop, daemon=True)
            t.start()

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
                    # Active heartbeat: if no message for 30s, send getProperties to keep connection alive
                    now = time.time()
                    if now - self.last_received > 30:
                        logger.debug("Sending active heartbeat (getProperties)")
                        self.send('<getProperties version="1.7"/>')
                    
                    # Periodic Auto-Recovery: Every 30s, if mount or camera is offline, try re-connecting it
                    # This handles cases where hardware was power-cycled but INDI server stayed up
                    if not hasattr(self, '_last_recovery_check'): self._last_recovery_check = 0
                    if now - self._last_recovery_check > 30:
                        self._last_recovery_check = now
                        if not self.mount_connected and self.device_mount:
                            logger.info(f"Auto-Recovery: Re-triggering connect for Mount ({self.device_mount})")
                            self._safe_connect_device(self.device_mount)
                        if not self.ccd_connected and self.device_ccd:
                            logger.info(f"Auto-Recovery: Re-triggering connect for Camera ({self.device_ccd})")
                            self._safe_connect_device(self.device_ccd)
                            
                    time.sleep(10)
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
        """Probe candidates with a short TCP connect (DNS + route + port 7624 open)."""
        raw = [self.host, "astroberry.local", "astroberry", "localhost", "127.0.0.1"]
        candidates: list[str] = []
        for c in raw:
            if c and c not in candidates:
                candidates.append(c)
        last_exc: BaseException | None = None
        for candidate in candidates:
            try:
                with socket.create_connection((candidate, self.port), timeout=2):
                    logger.info(f"INDI host reachable: {candidate}:{self.port}")
                    return candidate
            except Exception as e:
                last_exc = e
                logger.warning(f"INDI TCP probe failed {candidate}:{self.port} — {e!r}")
                continue
        logger.error(
            "No INDI server reachable on port %s (tried %s). Last error: %s — "
            "set INDI_HOST / ASTROBERRY_HOST to the Pi’s current IP or astroberry.local",
            self.port,
            candidates,
            repr(last_exc) if last_exc else "unknown",
        )
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
                 # Aggressive slowdown: 10s polling for RA/DEC to keep serial buffer clear
                 self.send(f'<newNumberVector device="{device}" name="POLLING_PERIOD"><oneNumber name="PERIOD">10.0</oneNumber></newNumberVector>')
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
            logger.error(
                "INDI connect aborted: no candidate answered on port %s (configured host=%r). "
                "Ekos on the Pi does not fix this: the Mac bridge must reach indiserver (7624) on the LAN.",
                self.port,
                self.host,
            )
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
                # Robustly check for On/Off values which may have newlines/whitespace
                is_connected = re.search(r'name="CONNECT"[^>]*>\s*On\s*<', xml_str) is not None or 'state="Ok"' in xml_str
                
                if dev_match:
                    dev_name = dev_match.group(1)
                    logger.debug(f"INDI Connection Update: {dev_name} (Connected={is_connected})")
                    if any(kw in dev_name for kw in ["GPS", "Mount", "NexStar", "Telescope"]):
                        self.device_mount = dev_name
                        self.mount_connected = is_connected
                        if is_connected: logger.info(f"✅ Mount Online: {dev_name}")
                    elif any(kw in dev_name for kw in ["CCD", "Camera", "DSLR", "EOS"]):
                        if self.device_ccd != dev_name:
                            logger.info(f"Detected new CCD device name: {dev_name}")
                            self.device_ccd = dev_name
                            # Autoconnect discovered camera once
                            if not is_connected:
                                self._safe_connect_device(dev_name)
                        
                        self.ccd_connected = is_connected
                        if is_connected: logger.info(f"✅ Camera Online: {dev_name}")
                        elif not is_connected and dev_name not in self.discovery_time:
                            # Also try connecting if we just saw it for the first time
                            self.discovery_time[dev_name] = time.time()
                            self._safe_connect_device(dev_name)

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

            # 2.5 GPS / Geographic updates
            if 'GEOGRAPHIC_COORD' in xml_str:
                lat_match = re.search(r'name="LAT"[^>]*>([\d\.\-\s\n]+)<', xml_str)
                lon_match = re.search(r'name="LONG"[^>]*>([\d\.\-\s\n]+)<', xml_str)
                if lat_match:
                    try: self.lat = float(lat_match.group(1).strip())
                    except: pass
                if lon_match:
                    try: self.lon = float(lon_match.group(1).strip())
                    except: pass

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
                        # If mount reports not aligned, update state
                        if "not aligned" in msg.lower():
                            self.mount_slew_state = "Not Aligned"
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
                    self.frame_count += 1
                    self.frame_condition.notify_all()
                
                logger.debug(f"Frame received: {len(raw_bytes)} bytes (Format: {fmt}, Prop: {prop_name})")

                # Robust check for stream frames
                is_viewfinder = (
                    "viewfinder" in prop_name.lower() or 
                    "stream" in prop_name.lower() or 
                    "stream" in fmt.lower() or
                    "ccd_force_blob" in prop_name.lower() or
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

def _extract_prop_value(device_name: str, vector_name: str, element_name: str) -> str:
    """Pull a single element value from the parsed INDI devices cache."""
    try:
        for vec, elements in indi.devices.get(device_name, {}).items():
            if vec == vector_name:
                for el in elements:
                    if len(el) >= 2 and el[0] == element_name:
                        return el[1].strip()
    except Exception:
        pass
    return ""


def _device_summary() -> dict:
    """Build a concise per-device summary (connection + port) for diagnostics."""
    summary = {}
    for dev, props in indi.devices.items():
        connect = "unknown"
        port = ""
        for vec, elements in props.items():
            if vec == "CONNECTION":
                for el in elements:
                    if len(el) >= 2 and el[0] == "CONNECT":
                        connect = "On" if "On" in el[1] else "Off"
            if vec == "DEVICE_PORT":
                for el in elements:
                    if len(el) >= 2 and el[0] == "PORT":
                        port = el[1].strip()
        summary[dev] = {"connected": connect, "port": port}
    return summary


@app.get("/health")
async def health():
    ccd_port = _extract_prop_value(indi.device_ccd, "DEVICE_PORT", "PORT") if hasattr(indi, "device_ccd") else ""
    mem = psutil.virtual_memory()
    uptime_seconds = (datetime.now(timezone.utc) - BACKEND_START_TIME).total_seconds()
    return {
        "status": "ok",
        "version": BACKEND_VERSION,
        "uptime_seconds": uptime_seconds,
        "uptime_human": f"{int(uptime_seconds // 3600)}h{int((uptime_seconds % 3600) // 60)}m",
        "indi_connected": indi.connected if hasattr(indi, "connected") else False,
        "mount_connected": indi.mount_connected if hasattr(indi, "mount_connected") else False,
        "ccd_connected": indi.ccd_connected if hasattr(indi, "ccd_connected") else False,
        "ra": format_ra(indi.mount_ra) if hasattr(indi, "mount_ra") else "0h",
        "dec": format_dec(indi.mount_dec) if hasattr(indi, "mount_dec") else "0°",
        "lat": indi.lat if hasattr(indi, "lat") else 0.0,
        "lon": indi.lon if hasattr(indi, "lon") else 0.0,
        "device_mount": indi.device_mount if hasattr(indi, "device_mount") else "",
        "device_ccd": indi.device_ccd if hasattr(indi, "device_ccd") else "",
        "ccd_port": ccd_port,
        "latest_frame_size": len(indi.latest_frame) if (hasattr(indi, "latest_frame") and indi.latest_frame) else 0,
        "memory_percent": round(mem.percent, 1),
        "memory_used_gb": round(mem.used / (1024**3), 1),
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "process_count": len(psutil.pids()),
        "total_requests": sum(metrics._requests_total.values()),
        "total_errors": sum(metrics._errors_total.values()),
        "active_requests": metrics._active_requests,
    }

@app.get("/metrics")
async def prometheus_metrics():
    return PlainTextResponse(metrics.generate_prometheus(), media_type="text/plain")

@app.get("/debug/indi")
async def debug_indi():
    ccd_port = _extract_prop_value(indi.device_ccd, "DEVICE_PORT", "PORT")
    return {
        "connected": indi.connected,
        "mount_connected": indi.mount_connected,
        "device_mount": indi.device_mount,
        "device_ccd": indi.device_ccd,
        "ccd_connected": indi.ccd_connected,
        "ccd_port": ccd_port,
        "mount_parked": indi.mount_parked,
        "mount_tracking": indi.mount_tracking,
        "mount_ra": format_ra(indi.mount_ra), # RA for UI display (HMS)
        "mount_dec": format_dec(indi.mount_dec), # DEC for UI display (DMS)
        "mount_ra_raw": indi.mount_ra,
        "mount_dec_raw": indi.mount_dec,
        "latest_frame_size": len(indi.latest_frame) if indi.latest_frame else 0,
        "host": [indi.host, indi.port],
        "candidates": [os.getenv("ASTROBERRY_HOST"), os.getenv("INDI_HOST"), "astroberry.local", "localhost", "127.0.0.1"],
        "devices_summary": _device_summary()
    }

@app.get("/debug/properties")
async def debug_properties():
    return {
        "devices": list(indi.devices.keys()) if hasattr(indi, "devices") else [],
        "properties": indi.devices if hasattr(indi, "devices") else {}
    }

@app.post("/mount/jog")
async def mount_jog(req: JogRequest):
    global indi
    try:
        device = indi.device_mount if (indi and indi.device_mount) else "Celestron GPS"
        if not indi or not indi.connected:
            return {"success": False, "error": "Matériel déconnecté"}

        xmls = []
        if req.state == "stop":
            # Send stop vectors for both axes. Set all switches to Off to ensure it stops.
            xmls.append(f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_NS"><oneSwitch name="MOTION_NORTH">Off</oneSwitch><oneSwitch name="MOTION_SOUTH">Off</oneSwitch></newSwitchVector>')
            xmls.append(f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_WE"><oneSwitch name="MOTION_EAST">Off</oneSwitch><oneSwitch name="MOTION_WEST">Off</oneSwitch></newSwitchVector>')
        else:
            # Split direction to support diagonals (e.g. "up-left")
            directions = req.direction.split("-")
            for d in directions:
                # Logic: FOV control (stars move in the direction of the arrow)
                if d == "up":
                    prop, val = "TELESCOPE_MOTION_NS", "MOTION_SOUTH"
                elif d == "down":
                    prop, val = "TELESCOPE_MOTION_NS", "MOTION_NORTH"
                elif d == "left":
                    prop, val = "TELESCOPE_MOTION_WE", "MOTION_EAST"
                elif d == "right":
                    prop, val = "TELESCOPE_MOTION_WE", "MOTION_WEST"
                else:
                    continue
                    
                # To be compliant with INDI rules, when starting, turn on the direction we want, and turn off the opposite direction switch
                # This ensures the AtMostOne rule is explicitly handled.
                if prop == "TELESCOPE_MOTION_NS":
                    opposite_val = "MOTION_NORTH" if val == "MOTION_SOUTH" else "MOTION_SOUTH"
                    xml = f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val}">On</oneSwitch><oneSwitch name="{opposite_val}">Off</oneSwitch></newSwitchVector>'
                else: # TELESCOPE_MOTION_WE
                    opposite_val = "MOTION_EAST" if val == "MOTION_WEST" else "MOTION_WEST"
                    xml = f'<newSwitchVector device="{device}" name="{prop}"><oneSwitch name="{val}">On</oneSwitch><oneSwitch name="{opposite_val}">Off</oneSwitch></newSwitchVector>'
                xmls.append(xml)

        if not xmls:
            return {"success": False, "error": f"Invalid direction: {req.direction}"}
            
        all_ok = True
        for xml in xmls:
            ok = indi.send(xml)
            if not ok:
                all_ok = False
                
        if not all_ok:
            return {"success": False, "error": "INDI send failed"}
            
        return {"success": True}
    except Exception as e:
        logger.error(f"Jog error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/mount/rate")
async def mount_rate(req: RateRequest):
    device = req.device
    if device == "Celestron GPS" and indi.device_mount and indi.device_mount != "Celestron GPS":
        device = indi.device_mount
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}

    rate_val = max(1, min(9, req.rate))
    rate_name = f"{rate_val}x"
    logger.info(f"Setting slew rate on {device} to {rate_name}")
    ok = indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_SLEW_RATE"><oneSwitch name="{rate_name}">On</oneSwitch></newSwitchVector>')
    if not ok:
        return {"success": False, "error": "INDI send failed"}
    return {"success": True}

async def mount_slew_internal(device: str, ra: float, dec: float, sync: bool = False):
    """
    Unified slew/sync logic for INDI mounts (especially Celestron NexStar).
    RA in decimal hours, DEC in decimal degrees from the Next.js proxy.
    
    IMPORTANT: Notifies framing system to pause live view during slew
    to avoid blocking the USB/INDI bus.
    """
    if not device or device == "":
        device = indi.device_mount

    if not indi.connected:
        logger.error("Slew failed: INDI not connected")
        return {"success": False, "error": "Hardware offline"}

    # RA is now always in decimal hours from the Next.js proxy (/api/indi/mount converts deg→hours).
    # This ensures we don't double-convert.
    ra_hours = ra
    
    logger.info(f"{'Syncing' if sync else 'Slewing'} {device} to RA={ra} deg ({ra_hours:.4f}h), DEC={dec} deg")
    
    # === CRITICAL: Notify framing system that slew started ===
    # This prevents live view from blocking the USB bus during movement
    try:
        from framing import framing_state
        framing_state.set_slewing(True)
        logger.info("Framing system notified: slew START")
    except ImportError:
        pass  # Framing module not loaded - that's OK

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
        indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{ra_hours}</oneNumber><oneNumber name="DEC">{dec}</oneNumber></newNumberVector>')
        
        # Fallback property
        indi.send(f'<newNumberVector device="{device}" name="EQUATORIAL_COORD"><oneNumber name="RA">{ra_hours}</oneNumber><oneNumber name="DEC">{dec}</oneNumber></newNumberVector>')
        
        if not sync:
            indi.mount_slew_state = "Busy"
        else:
            # CRITICAL: After SYNC, restore TRACK mode so the mount resumes
            # sidereal tracking and the next GoTo works correctly.
            await asyncio.sleep(0.3)
            indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="TRACK">On</oneSwitch></newSwitchVector>')
            logger.info(f"Mount SYNC complete — ON_COORD_SET restored to TRACK")

        # === CRITICAL: Notify framing system that slew is complete ===
        # Live view can resume after 2 second settle time
        try:
            from framing import framing_state
            framing_state.set_slewing(False)
            logger.info("Framing system notified: slew END")
        except ImportError:
            pass

        return {"success": True, "message": f"{'Sync' if sync else 'Slew'} initiated to {ra}, {dec}", "state": "Busy"}
    except Exception as e:
        logger.error(f"Slew internal error: {e}")
        
        # Always clear slew state on error
        try:
            from framing import framing_state
            framing_state.set_slewing(False)
        except ImportError:
            pass
            
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
    return {"success": True}
@app.post("/slew")
async def slew_telescope(req: SlewRequest):
    """Legacy/Alternate slew endpoint."""
    return await mount_slew_internal(req.device, req.ra, req.dec)

@app.get("/logs")
def get_logs():
    return {"logs": list(log_buffer)}

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
    # Use detected device if provided one is generic or empty
    if not device or device == "Canon" or device == "Canon DSLR EOS 600D": 
        device = indi.device_ccd or "Canon DSLR EOS 600D"
    
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

@app.get("/ccd/focus-metric")
async def ccd_focus_metric():
    if not indi.latest_frame:
        return {"success": False, "metric": 0}
    try:
        nparr = np.frombuffer(indi.latest_frame, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"success": False, "metric": 0}
        variance = cv2.Laplacian(img, cv2.CV_64F).var()
        # Scale to match roughly what we expected (0-10 or so). FWHM is typically 1-10. 
        # Laplace variance goes from ~100 out of focus to ~5000 in focus. Let's return raw variance.
        return {"success": True, "metric": variance}
    except Exception as e:
        logger.error(f"Error computing focus metric: {e}")
        return {"success": False, "metric": 0, "error": str(e)}

@app.post("/astro/coords")
async def get_astro_coords(req: CoordsRequest):
    try:
        lat = req.lat
        lon = req.lon
        if math.isnan(lat) or math.isinf(lat):
            lat = -17.6333
        if math.isnan(lon) or math.isinf(lon):
            lon = -149.6000
        obs = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=0*u.m)
        time = Time(datetime.utcnow())
        
        ra = req.ra
        dec = req.dec
        if math.isnan(ra) or math.isinf(ra):
            ra = 0.0
        if math.isnan(dec) or math.isinf(dec):
            dec = 0.0
            
        target = SkyCoord(ra=ra*u.hourangle, dec=dec*u.deg, frame='icrs')
        altaz = target.transform_to(AltAz(obstime=time, location=obs))
        return {"success": True, "alt": float(altaz.alt.deg), "az": float(altaz.az.deg)}
    except Exception as e:
        logger.error(f"Error in get_astro_coords: {e}")
        return {"success": False, "error": str(e), "alt": 0.0, "az": 0.0}


class AltAzToRaDecRequest(BaseModel):
    alt: float = 0.0   # altitude in degrees (above horizon)
    az:  float = 0.0   # azimuth in degrees (N=0, E=90)
    lat: float = -17.6333   # observer latitude
    lon: float = -149.6000   # observer longitude
    height: float = 0.0  # altitude above sea level in metres


@app.post("/astro/altaz_to_radec")
async def altaz_to_radec(req: AltAzToRaDecRequest):
    """Inverse of /astro/coords — convert local Alt/Az to equatorial RA/Dec.

    Uses the observer's position and the current UTC time to determine the
    Local Sidereal Time, then transforms into the ICRS frame.
    Returns RA in decimal *hours* (0–24) and Dec in decimal *degrees*.
    """
    try:
        lat = req.lat
        lon = req.lon
        if math.isnan(lat) or math.isinf(lat):
            lat = -17.6333
        if math.isnan(lon) or math.isinf(lon):
            lon = -149.6000
        obs = EarthLocation(lat=lat*u.deg, lon=lon*u.deg, height=req.height*u.m)
        time = Time(datetime.utcnow())
        altaz_frame = AltAz(obstime=time, location=obs)
        
        alt = req.alt
        az = req.az
        if math.isnan(alt) or math.isinf(alt):
            alt = 0.0
        if math.isnan(az) or math.isinf(az):
            az = 0.0
            
        coord = SkyCoord(alt=alt*u.deg, az=az*u.deg, frame=altaz_frame)
        icrs  = coord.transform_to('icrs')
        logger.info(f"AltAz→RaDec: Alt={alt:.1f}° Az={az:.1f}° → RA={icrs.ra.hour:.4f}h Dec={icrs.dec.deg:.4f}°")
        return {
            "success": True,
            "ra":  float(icrs.ra.hour),   # decimal hours
            "dec": float(icrs.dec.deg),   # decimal degrees
        }
    except Exception as e:
        logger.error(f"Error in altaz_to_radec: {e}")
        return {"success": False, "error": str(e), "ra": 0.0, "dec": 0.0}


@app.post("/mount/sync_current")
async def mount_sync_current():
    """Sync the mount to its current reported position. Often clears 'Not Aligned' state."""
    if not indi.mount_connected:
        return {"success": False, "error": "Mount offline"}
    
    # Send SYNC command for current RA/DEC
    # First ensure ON_COORD_SET is SYNC
    indi.send(f'<newSwitchVector device="{indi.device_mount}" name="ON_COORD_SET"><oneSwitch name="SYNC">On</oneSwitch></newSwitchVector>')
    
    # Then send the current coords back as a Sync target
    ra_h = indi.mount_ra / 15.0
    dec_d = indi.mount_dec
    indi.send(f'<newNumberVector device="{indi.device_mount}" name="EQUATORIAL_EOD_COORD"><oneNumber name="RA">{ra_h}</oneNumber><oneNumber name="DEC">{dec_d}</oneNumber></newNumberVector>')
    
    logger.info(f"Mount SYNC sent for RA={ra_h:.4f}h DEC={dec_d:.4f}d")
    return {"success": True, "message": "Mount sync triggered"}

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
async def mjpeg_generator():
    """Yield frames from the global INDI client latest_frame."""
    last_frame_count = -1
    
    while True:
        if not indi.connected:
            break
            
        frame = indi.latest_frame
        
        # We check if it's a new frame by comparing the frame_count
        if frame and indi.frame_count != last_frame_count:
            last_frame_count = indi.frame_count
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        
        # Async sleep allows the event loop to breathe and naturally drops frames 
        # if the stream is generated faster than the network can send them.
        # We limit the loop to 10 FPS (0.1s) to prevent the browser from queuing frames
        # and causing massive latency on slow connections.
        await asyncio.sleep(0.1)

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/ccd/stream/start")
async def ccd_stream_start():
    dev = (indi.device_ccd or "Canon DSLR EOS 600D").strip()
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}
    
    # 1. Force HIGH QUALITY and proper compression
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_COMPRESSION"><oneSwitch name="OFF">On</oneSwitch></newSwitchVector>')
    
    # 2. Set UPLOAD MODE to CLIENT (Crucial for streaming)
    indi.send(f'<newSwitchVector device="{dev}" name="UPLOAD_MODE"><oneSwitch name="UPLOAD_CLIENT">On</oneSwitch></newSwitchVector>')

    # 2.5 Force stream encoder to MJPEG format (required for browser rendering)
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>')

    # 2.7 Raise preview FPS limit to 30 FPS (default is 10 in the driver)
    indi.send(f'<newNumberVector device="{dev}" name="LIMITS"><oneNumber name="LIMITS_PREVIEW_FPS">30</oneNumber></newNumberVector>')

    # 3. Enable viewfinder (mirror up) - This is the DSLR specific live view trigger
    # Using BOTH common ways to ensure compatibility
    indi.send(f'<newSwitchVector device="{dev}" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>')
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>')
    
    # 4. Request fast stream if available
    indi.send(f'<newNumberVector device="{dev}" name="CCD_STREAM_FRAME"><oneNumber name="CCD_STREAM_FRAME_DIVIDER">1</oneNumber></newNumberVector>')
    
    logger.info(f"LIVE VIEW STARTED on {dev}")
    return {"success": True}

@app.post("/ccd/stream/stop")
async def ccd_stream_stop():
    dev = (indi.device_ccd or "Canon DSLR EOS 600D").strip()
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}
    # Turn off live stream first
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
    # Disable live view (mirror down) - viewfinder1 is "Off" (Viewfinder)
    indi.send(f'<newSwitchVector device="{dev}" name="viewfinder"><oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
    return {"success": True}

class StackRequest(BaseModel):
    folder: str
    darks: str | None = None
    flats: str | None = None
    lights_prefix: str = "capture"

@app.post("/ccd/stack")
async def ccd_stack(req: StackRequest):
    """Run Siril stacking pipeline on a folder of captures."""
    import subprocess
    
    target_dir = os.path.abspath(os.path.join(STORAGE_PATH, req.folder))
    if not os.path.exists(target_dir):
        return {"success": False, "error": f"Directory not found: {req.folder}"}
        
    script_path = os.path.join(target_dir, "stack.ssf")
    script_content = f"""requires 1.2.0
cd "{target_dir}"
convert "{req.lights_prefix}" -out=process
cd process
register {req.lights_prefix}
stack r_{req.lights_prefix} rej 3 3 -nonorm -out=../result.fit
close
"""
    
    with open(script_path, "w") as f:
        f.write(script_content)
        
    # Run siril-cli asynchronously to avoid blocking the backend
    def run_siril():
        try:
            logger.info(f"Starting Siril stack in {target_dir}")
            process = subprocess.Popen(
                ["siril-cli", "-s", script_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(timeout=600)
            if process.returncode == 0:
                logger.info(f"Siril stacking completed successfully in {req.folder}")
            else:
                logger.error(f"Siril stacking failed in {req.folder}: {stderr}")
        except Exception as e:
            logger.error(f"Error running Siril: {e}")
            
    threading.Thread(target=run_siril, daemon=True).start()
    
    return {"success": True, "message": "Stacking job submitted"}

# ── NEW ENDPOINTS ────────────────────────────────────────────────────────────

# --- INFRASTRUCTURE ---

class MountActionRequest(BaseModel):
    confirm: str = ""

class TrackRequest(BaseModel):
    enabled: bool

def _get_pm2_bin() -> str:
    """Find the absolute path of the pm2 binary, with fallback options."""
    import shutil
    pm2_bin = shutil.which("pm2")
    if pm2_bin:
        return pm2_bin
    import glob
    home = os.path.expanduser("~")
    fallbacks = [
        "/opt/homebrew/bin/pm2",
        "/usr/local/bin/pm2",
    ]
    nvm_paths = glob.glob(os.path.join(home, ".nvm/versions/node/*/bin/pm2"))
    if nvm_paths:
        fallbacks.extend(nvm_paths)
    for f in fallbacks:
        if os.path.exists(f):
            return f
    return "pm2"


@app.get("/api/indi/health-full")
@app.get("/health/full")
async def health_full():
    """Complete infrastructure health report."""
    import subprocess

    # --- Mac Mini stats ---
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    pm2_apps = []
    try:
        pm2_bin = _get_pm2_bin()
        pm2_result = subprocess.run(
            [pm2_bin, "jlist"], capture_output=True, text=True
        )
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
    except Exception as e:
        logger.warning(f"Failed to query PM2 status: {e}")

    # --- KStars ---
    kstars_running = any(
        p.name() == "KStars" for p in psutil.process_iter(['name'])
    )

    # --- Astroberry (SSH - CACHED) ---
    with status_lock:
        pi_status = cached_astroberry_status.copy()

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


import json
import os

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

@app.get("/config")
def get_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading config: {e}")
    return {}

@app.post("/config")
def save_config(config: dict):
    try:
        existing = {}
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    existing = json.load(f)
            except:
                pass
        existing.update(config)
        with open(CONFIG_FILE, "w") as f:
            json.dump(existing, f, indent=2)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return {"success": False, "error": str(e)}


# --- Astroberry endpoints ---

@app.get("/astroberry/status")
async def astroberry_status():
    with status_lock:
        return cached_astroberry_status


@app.get("/astroberry/indi/logs")
async def astroberry_indi_logs(lines: int = 50):
    loop = asyncio.get_event_loop()
    logs = await loop.run_in_executor(executor, raspi.get_indi_logs, lines)
    return {"logs": logs}


@app.post("/launch_ekos")
async def launch_ekos():
    logger.info("Triggering Ekos/KStars launch on remote...")
    loop = asyncio.get_event_loop()
    # KStars usually needs a bit of time to start its INDI server
    await loop.run_in_executor(executor, raspi.start_indi)
    return {"success": True, "message": "Ekos launch sequence triggered"}

@app.post("/restart_kstars")
async def restart_kstars():
    logger.info("Restarting KStars on remote...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, raspi.restart_indi)
    return {"success": True, "message": "KStars restart triggered"}

@app.post("/reconnect")
async def reconnect_indi():
    logger.info("User requested full INDI/Hardware stack reconnection")
    # 1. Close local socket
    indi.connected = False
    if indi.sock:
        try: indi.sock.close()
        except: pass
    
    # 2. Restart remote services
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, raspi.restart_indi)
    
    # 3. Wait and reconnect local bridge
    await asyncio.sleep(2.0)
    success = await loop.run_in_executor(executor, indi.connect)
    return {"success": success, "message": "Full stack reconnection " + ("successful" if success else "failed")}

@app.post("/hardware/connect")
async def hardware_connect():
    """Manually trigger connection for all known hardware devices."""
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected to server"}
    
    logger.info("Manual hardware connect triggered")
    # Send a broad getProperties first to discover everything
    indi.send('<getProperties version="1.7"/>')
    await asyncio.sleep(0.5)
    
    indi._safe_connect_device(indi.device_mount)
    indi._safe_connect_device(indi.device_ccd)
    return {"success": True, "message": "Connection commands sent"}


@app.post("/astroberry/indi/restart")
async def astroberry_indi_restart():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, raspi.restart_indi)

@app.post("/astroberry/reboot")
async def astroberry_reboot(req: MountActionRequest):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, raspi.reboot, req.confirm)


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


# ── AUTO-ALIGN / PLATE SOLVE ────────────────────────────────────────────────

class AutoAlignSolveRequest(BaseModel):
    image_b64: str          # JPEG image encoded as base64
    scale_low: float = 0.1  # field width lower bound in degrees
    scale_high: float = 5.0 # field width upper bound in degrees

@app.post("/autoalign/solve")
async def autoalign_solve(req: AutoAlignSolveRequest):
    """
    Plate-solve a JPEG image using solve-field (astrometry.net CLI) on Astroberry.
    Receives the image as a base64-encoded JPEG blob, copies it to Astroberry via
    SSH, invokes solve-field, parses the WCS result, and returns RA/DEC in decimal.

    Returns:
        { success: True, ra: float (decimal hours), dec: float (decimal degrees) }
        { success: False, error: str }
    """
    import subprocess, tempfile, struct

    astroberry_host = INDI_HOST  # e.g. "astroberry.local"
    ssh_user = os.getenv("ASTROBERRY_USER", "astroberry")
    ssh_key  = os.getenv("ASTROBERRY_SSH_KEY", "")   # optional path to private key

    try:
        # --- 1. Decode the incoming JPEG ---
        try:
            img_bytes = base64.b64decode(req.image_b64)
        except Exception as e:
            return {"success": False, "error": f"base64 decode failed: {e}"}

        if len(img_bytes) < 100:
            return {"success": False, "error": "Image too small — capture may have failed"}

        # --- 2. Write image to a local temp file ---
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(img_bytes)
            local_path = tmp.name

        remote_dir  = "/tmp/stargazer_solve"
        remote_img  = f"{remote_dir}/solve_input.jpg"
        remote_wcs  = f"{remote_dir}/solve_input.wcs"
        remote_base = f"{remote_dir}/solve_input"

        ssh_base = ["ssh", "-o", "StrictHostKeyChecking=no",
                    "-o", "ConnectTimeout=10"]
        if ssh_key:
            ssh_base += ["-i", ssh_key]
        ssh_base.append(f"{ssh_user}@{astroberry_host}")

        # --- 3. Ensure remote directory exists ---
        subprocess.run(ssh_base + [f"mkdir -p {remote_dir}"], timeout=10, check=True)

        # --- 4. Upload the image ---
        scp_cmd = ["scp", "-o", "StrictHostKeyChecking=no",
                   "-o", "ConnectTimeout=10"]
        if ssh_key:
            scp_cmd += ["-i", ssh_key]
        scp_cmd += [local_path, f"{ssh_user}@{astroberry_host}:{remote_img}"]
        subprocess.run(scp_cmd, timeout=15, check=True)

        # --- 5. Check that solve-field is installed ---
        check = subprocess.run(
            ssh_base + ["which solve-field"],
            capture_output=True, text=True, timeout=10
        )
        if check.returncode != 0:
            logger.warning("solve-field not found on Astroberry — plate solve unavailable")
            return {"success": False, "error": "solve-field not installed on Astroberry. Install astrometry.net: sudo apt-get install astrometry.net"}

        # --- 6. Run solve-field ---
        solve_cmd = (
            f"solve-field --no-plots --overwrite "
            f"--scale-units degwidth "
            f"--scale-low {req.scale_low} --scale-high {req.scale_high} "
            f"--dir {remote_dir} "
            f"--out solve_input "
            f"{remote_img} "
            f"2>&1"
        )
        logger.info(f"Running solve-field on Astroberry: {solve_cmd}")
        result = subprocess.run(
            ssh_base + [solve_cmd],
            capture_output=True, text=True, timeout=120
        )
        logger.info(f"solve-field stdout: {result.stdout[-2000:]}")

        if "Field center: (RA H:M:S, Dec D:M:S)" not in result.stdout \
                and "Field center: (RA,Dec) = " not in result.stdout:
            logger.warning(f"solve-field failed or timed out. Output: {result.stdout[-500:]}")
            return {"success": False, "error": "solve-field could not find a solution. Check star visibility and scale bounds."}

        # --- 7. Parse RA/DEC from stdout ---
        ra_deg, dec_deg = None, None

        # Pattern: "Field center: (RA,Dec) = (123.456, -45.678) deg."
        m = re.search(r"Field center.*?RA,Dec\).*?\(([+-]?\d+\.?\d*),\s*([+-]?\d+\.?\d*)\)", result.stdout)
        if m:
            ra_deg  = float(m.group(1))
            dec_deg = float(m.group(2))

        if ra_deg is None:
            # Pattern: "Field center: (RA H:M:S, Dec D:M:S) = (06:23:45.67, -52:41:23.4)"
            m2 = re.search(
                r"Field center.*?RA H:M:S.*?=\s*\((\d+):(\d+):([\d.]+),\s*([+-]?\d+):(\d+):([\d.]+)\)",
                result.stdout
            )
            if m2:
                ra_deg = (float(m2.group(1)) + float(m2.group(2))/60 + float(m2.group(3))/3600) * 15
                sign   = -1 if result.stdout[m2.start():m2.end()].find('-') >= 0 else 1
                dec_deg = sign * (float(m2.group(4).lstrip('-')) + float(m2.group(5))/60 + float(m2.group(6))/3600)

        if ra_deg is None:
            return {"success": False, "error": "Solved but could not parse RA/DEC from solve-field output"}

        ra_hours = ra_deg / 15.0
        logger.info(f"Plate solve SUCCESS: RA={ra_hours:.5f}h DEC={dec_deg:.5f}°")
        return {"success": True, "ra": ra_hours, "dec": dec_deg}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "solve-field timed out (>120s). Try shorter exposure or brighter field."}
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"SSH/SCP command failed: {e}"}
    except Exception as e:
        logger.error(f"autoalign_solve error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
    finally:
        try:
            os.unlink(local_path)
        except Exception:
            pass


# --- Backend self-restart ---

@app.post("/backend/restart")
async def backend_restart():
    """Restart the PM2 backend process (triggers PM2 autorestart)."""
    import subprocess, threading
    logger.warning("Backend self-restart requested via API")
    def _restart():
        time.sleep(1)
        try:
            pm2_bin = _get_pm2_bin()
            subprocess.run([pm2_bin, "restart", "stargazer-backend"], capture_output=True)
        except Exception as e:
            logger.error(f"Failed to trigger self-restart: {e}")
    threading.Thread(target=_restart, daemon=True).start()
    return {"success": True, "message": "Backend restarting in 1s..."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5005)
