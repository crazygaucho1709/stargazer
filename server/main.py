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
from fastapi import FastAPI, HTTPException, Response, Request, WebSocket, WebSocketDisconnect
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
from astropy.utils.iers import conf
conf.auto_max_age = None
conf.auto_download = False  # Pas de téléchargement IERS — évite le timeout 9s sur LAN sans internet
from starlette.responses import StreamingResponse, PlainTextResponse
import collections
from typing import Optional
import astroberry as raspi
import psutil
from concurrent.futures import ThreadPoolExecutor

from log_config import setup_logging, JSONFormatter
from metrics import metrics
import mount_safety

class _MemStats:
    __slots__ = ("total", "used", "percent")
    def __init__(self, total: int, used: int, percent: float):
        self.total, self.used, self.percent = total, used, percent

def _safe_virtual_memory() -> _MemStats:
    """psutil.virtual_memory() panique sur ce Mac Mini M4 (Python 3.13/macOS) avec
    RuntimeError host_statistics64(HOST_VM_INFO64): (ipc/mig) array not large enough —
    incompatibilité connue entre le binding C psutil et la taille de struct macOS récente.
    Repli sur `vm_stat` (page size fixe, toujours dispo sur macOS) pour ne jamais faire
    échouer /health à cause d'une métrique secondaire."""
    try:
        mem = psutil.virtual_memory()
        return _MemStats(mem.total, mem.used, mem.percent)
    except RuntimeError:
        import subprocess as _sp
        out = _sp.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
        page_size = 16384
        m = re.search(r"page size of (\d+) bytes", out)
        if m:
            page_size = int(m.group(1))
        pages = {k: int(v) for k, v in re.findall(r"Pages (\w[\w ]*?):\s+(\d+)\.", out)}
        total = int(_sp.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5).stdout.strip() or 0)
        used_pages = pages.get("active", 0) + pages.get("wired down", 0) + pages.get("occupied by compressor", 0)
        used = used_pages * page_size
        percent = round(used / total * 100, 1) if total else 0.0
        return _MemStats(total, used, percent)

# --- CACHE ---
cached_astroberry_status = {"reachable": False, "error": "Initializing..."}
status_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=2)

# --- JOG STATE ---
# Simple watchdog: fires if no heartbeat for 1.5s (safety stop).
# No asyncio lock — indi.send() is already thread-safe via socket_lock.
_jog_wd_lock = threading.Lock()
_jog_wd_timer: Optional[threading.Timer] = None
_jog_current_dir: Optional[str] = None
_last_stop_time: float = 0.0
_last_stop_dir: Optional[str] = None
_stopped_jog_ids: set[str] = set()
_jog_active_id: Optional[str] = None

BACKEND_VERSION = "2026-05-17-V1"
BACKEND_START_TIME = datetime.now(timezone.utc)

# Configuration
INDI_HOST = os.getenv("ASTROBERRY_HOST", os.getenv("INDI_HOST", "astroberry.local"))
INDI_PORT = int(os.getenv("INDI_PORT", "7624"))

# Noms de monture reconnus, tous drivers confondus. "AUX" et "Celestron" sont
# indispensables depuis la bascule vers indi_celestron_aux ("Celestron AUX").
MOUNT_DEVICE_KEYWORDS = ("GPS", "Mount", "NexStar", "Telescope", "AUX", "Celestron")
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


@app.on_event("startup")
async def purge_thumbnails_on_start():
    """Purge des thumbnails > 14 jours pour ne pas surcharger le stockage."""
    threading.Thread(target=lambda: _purge_old_thumbnails(14), daemon=True).start()


@app.on_event("startup")
async def disable_gvfs_gphoto_on_pi():
    """Kill and permanently disable gvfs-gphoto2-volume-monitor on the Pi at backend startup.

    This daemon grabs an exclusive libgphoto2 lock on the Canon as soon as it
    detects the USB device, preventing the INDI gphoto driver from connecting.
    We disable its GNOME autostart entry so it never respawns after a pkill.
    Safe: has no effect if Astroberry is unreachable (SSH failure is silently swallowed).
    """
    def _run():
        try:
            result = raspi._run(
                # 1. Kill any running instance
                "pkill -9 gvfs-gphoto2-volume-monitor 2>/dev/null || true; "
                "pkill -9 gvfsd-gphoto2 2>/dev/null || true; "
                # 2. Permanently hide the autostart entry so GNOME never relaunches it
                "mkdir -p ~/.config/autostart && "
                "printf '[Desktop Entry]\\nType=Application\\nHidden=true\\n' "
                "> ~/.config/autostart/gvfs-gphoto2-volume-monitor.desktop; "
                "echo OK",
                timeout=10,
            )
            if result.get("exit_code") == -1:
                logger.warning(f"[Startup] gvfs disable: SSH unreachable — {result.get('stderr', '')[:80]}")
            else:
                logger.info("[Startup] gvfs-gphoto2 killed and disabled on Astroberry")
        except Exception as exc:
            logger.warning(f"[Startup] gvfs disable raised: {exc}")

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _run)
    indi._event_loop = loop


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
        # Endpoints de polling/streaming haute fréquence : silencieux sauf erreur
        # ou lenteur anormale. Évite de noyer les logs utiles (mutations, erreurs).
        is_routine = method == "GET" and any(
            path.startswith(p) for p in (
                "/health", "/coords", "/metrics", "/video_feed", "/logs",
                "/phone-sensor", "/debug", "/ai/auth", "/api/config",
            )
        )
        if is_routine and response.status_code < 400 and latency < 1.0:
            pass  # routine OK et rapide → pas de log
        else:
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

# NOTE: A wildcard `allow_origins=["*"]` is INVALID when combined with
# `allow_credentials=True` — browsers reject `Access-Control-Allow-Origin: *`
# on any credentialed request, which surfaces as "CORS error" in the console.
# Using `allow_origin_regex` makes the middleware echo the caller's Origin back,
# which is spec-compliant and works for any LAN host / tunnel origin.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
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
    device: str = ""   # vide = device monture découvert dynamiquement

class CaptureRequest(BaseModel):
    exposure: float
    device: str = None # Default to currently discovered device
    preview: bool = True  # False = capture technique (autofocus...) : pas de modal preview côté UI

class JogRequest(BaseModel):
    direction: str
    state: str = "start"
    device: str = ""   # vide = device monture découvert dynamiquement
    duration: float = 0.5
    timestamp: float = 0.0
    jog_id: Optional[str] = None

class RateRequest(BaseModel):
    rate: int
    device: str = ""   # vide = device monture découvert dynamiquement

class SyncMasterRequest(BaseModel):
    lat: float
    lon: float
    alt: float
    az: float
    device: str = ""   # vide = device monture découvert dynamiquement

class InitStationRequest(BaseModel):
    lat: float
    lon: float
    elevation: float = 0.0
    device: str = ""   # vide = device monture découvert dynamiquement

class TrackingRateRequest(BaseModel):
    rate: str  # "SIDEREAL" | "LUNAR" | "SOLAR"
    device: str = ""   # vide = device monture découvert dynamiquement

class CaptureSequenceRequest(BaseModel):
    exposure: float = 30.0
    count: int = 20
    gain: int = 400
    device: str = None

class CoordsRequest(BaseModel):
    ra: float = 0.0
    dec: float = 0.0
    # NaN par défaut : lat/lon omis → résolution automatique du site
    # (gpsd → monture → fallback) dans l'endpoint
    lat: float = float("nan")
    lon: float = float("nan")

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
        # Découvert dynamiquement : le nom dépend du driver chargé
        # (indi_celestron_aux → "Celestron AUX", indi_celestron_gps → "Celestron GPS").
        # Un nom codé en dur faisait croire à une panne matérielle après un
        # changement de driver, déclenchant un pkill -9 indiserver en boucle.
        self.device_mount = ""
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
        self.live_view_active: bool = False
        self._restore_live_view_after_capture: bool = False
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self.lat: float = -17.6333 # Tahiti default
        self.lon: float = -149.6000 # Tahiti default
        self.geo_received: bool = False  # True dès qu'un GEOGRAPHIC_COORD réel arrive de la monture
        # Position encodeur brute (driver AUX) — base de la sécurité mécanique
        self.encoder_az: float | None = None
        self.encoder_alt: float | None = None
        self.cordwrap_guard = mount_safety.CordWrapGuard()
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
        max_delay    = 10    # cap at 10s — safety: long dropout blocks jog STOP commands
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
                    
                    # Auto-Recovery avec backoff exponentiel par appareil (plafond 5 min) : gère le cas
                    # où le matériel a été coupé/rebranché pendant qu'INDI restait up. Sans ce plafond,
                    # une panne physique permanente (câble débranché, port occupé) fait retenter la
                    # reconnexion toutes les 30s indéfiniment, sans jamais progresser ni le signaler.
                    if not hasattr(self, '_recovery_backoff'):
                        self._recovery_backoff = {"mount": 30, "ccd": 30}
                        self._recovery_next = {"mount": 0.0, "ccd": 0.0}
                        self._recovery_stuck_since = {"mount": None, "ccd": None}
                    RECOVERY_MAX_DELAY = 300

                    def _try_recover(dev_key: str, device_name: str, is_connected: bool):
                        if is_connected:
                            self._recovery_backoff[dev_key] = 30
                            self._recovery_stuck_since[dev_key] = None
                            return
                        if not device_name or now < self._recovery_next[dev_key]:
                            return
                        if self._recovery_stuck_since[dev_key] is None:
                            self._recovery_stuck_since[dev_key] = now
                        stuck_min = int((now - self._recovery_stuck_since[dev_key]) / 60)
                        logger.info(
                            f"Auto-Recovery: Re-triggering connect for {dev_key} ({device_name}) "
                            f"— hors ligne depuis {stuck_min}min, prochain essai dans {min(self._recovery_backoff[dev_key] * 2, RECOVERY_MAX_DELAY)}s"
                        )
                        self._safe_connect_device(device_name)
                        self._recovery_next[dev_key] = now + self._recovery_backoff[dev_key]
                        self._recovery_backoff[dev_key] = min(self._recovery_backoff[dev_key] * 2, RECOVERY_MAX_DELAY)

                    _try_recover("mount", self.device_mount, self.mount_connected)
                    _try_recover("ccd", self.device_ccd, self.ccd_connected)

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
        """Probe candidates with a real INDI handshake, not just a TCP connect.

        Piège : le tunnel SSH (-L 7624) accepte la connexion TCP localement même
        quand son canal distant est mort (tunnel zombie après une coupure du Pi).
        Un connect() réussi ne prouve donc rien — on envoie getProperties et on
        exige des octets en retour avant de valider le candidat."""
        raw = [self.host, "astroberry.local", "astroberry", "localhost", "127.0.0.1"]
        candidates: list[str] = []
        for c in raw:
            if c and c not in candidates:
                candidates.append(c)
        last_exc: BaseException | None = None
        for candidate in candidates:
            try:
                with socket.create_connection((candidate, self.port), timeout=2) as probe:
                    probe.settimeout(3.0)
                    probe.sendall(b'<getProperties version="1.7"/>\r\n')
                    data = probe.recv(64)
                    if not data:
                        raise ConnectionError("socket ouverte mais aucune donnée INDI (tunnel zombie ?)")
                    logger.info(f"INDI host reachable (handshake OK): {candidate}:{self.port}")
                    return candidate
            except Exception as e:
                last_exc = e
                logger.warning(f"INDI probe failed {candidate}:{self.port} — {e!r}")
                continue
        logger.error(
            "No INDI server reachable on port %s (tried %s). Last error: %s — "
            "set INDI_HOST / ASTROBERRY_HOST to the Pi’s current IP or astroberry.local",
            self.port,
            candidates,
            repr(last_exc) if last_exc else "unknown",
        )
        return None

    def reconnect(self, restart_remote: bool = False):
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

        # ATTENTION : redémarrer indiserver tue TOUTES les sessions en cours
        # (auto-align, capture, tracking) et remet le driver à zéro. Le 6 août,
        # un nom de device périmé a fait boucler cette branche : pkill -9
        # indiserver toutes les ~60 s, matériel injoignable en permanence.
        # Désormais opt-in explicite uniquement (bouton UI), jamais en auto.
        if restart_remote:
            try:
                logger.warning("Redémarrage distant d'indiserver demandé explicitement — "
                               "toutes les sessions en cours vont être interrompues")
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
        upload mode to ``UPLOAD_CLIENT`` for cameras, and finally toggle the
        ``CONNECTION`` switch to ``CONNECT``.
        """
        try:
            # 1. Handshake: Get properties to ensure device is reachable
            self.send(f'<getProperties version="1.7" device="{device}"/>')
            time.sleep(0.5)
            
            # 2. Enable BLOBs (Critical for CCD/Camera image streaming)
            self.send(f'<enableBLOB device="{device}">Also</enableBLOB>')
            
            # 3. Optimized Upload Mode for DSLRs (avoid memory issues on RPi)
            if any(kw in device for kw in ["Canon", "Nikon", "DSLR", "EOS", "GPhoto"]):
                self.send(
                    f'<newSwitchVector device="{device}" name="UPLOAD_MODE">'
                    f'<oneSwitch name="UPLOAD_CLIENT">On</oneSwitch>'
                    f'</newSwitchVector>'
                )
                time.sleep(0.2)
            
            # 4. Mount-specific: reduce polling period for responsive state feedback.
            #    2 s is fast enough for the NexStar serial link without flooding it.
            #    Do NOT send TRACK_SIDEREAL here — the Celestron GPS driver activates
            #    sidereal tracking automatically after a successful connection and the
            #    TRACK command causes a multi-second "Busy" window that blocks jog.
            is_mount = any(kw in device for kw in ["Celestron", "GPS", "NexStar", "Mount"])
            if is_mount:
                self.send(f'<newNumberVector device="{device}" name="POLLING_PERIOD">'
                          f'<oneNumber name="PERIOD_MS">5000</oneNumber></newNumberVector>')

            # 5. THE FINAL SWITCH: Trigger the actual connection
            self.send(
                f'<newSwitchVector device="{device}" name="CONNECTION">'
                f'<oneSwitch name="CONNECT">On</oneSwitch>'
                f'<oneSwitch name="DISCONNECT">Off</oneSwitch>'
                f'</newSwitchVector>'
            )
            logger.info(f"✅ Safe-connect sequence sent for device: {device}")
        except Exception as e:
            logger.error(f"❌ Safe-connect failed for {device}: {e}")

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
            # Recv timeout for listener thread; send timeout caps sendall() so a
            # stalled Pi never blocks jog STOP commands for more than 3 seconds.
            sock.settimeout(3.0)
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
            # Rate-limit : quand le Pi est injoignable, la boucle de reconnexion
            # spamme sinon ce log toutes les 5-10 s pendant des heures.
            now = time.time()
            if now - getattr(self, "_last_conn_err_log", 0) > 60:
                self._last_conn_err_log = now
                logger.error(f"Connection failed: {e} (log limité à 1/min)")
            self._close_socket()
            self.connected = False

    def send(self, xml):
        with self.socket_lock:
            if self.sock and self.connected:
                try:
                    self.sock.sendall((xml + "\r\n").encode())
                    logger.info(f"INDI SEND: {xml}")
                    return True
                except (socket.error, BrokenPipeError, ConnectionResetError, socket.timeout) as e:
                    logger.error(f"Send failure (socket error): {e}")
                    self.connected = False
                    self.mount_connected = False
                    self.ccd_connected = False
                    self._close_socket()
                    return False
                except Exception as e:
                    logger.error(f"Send error: {e}")
                    return False
            else:
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
                    if any(kw in dev_name for kw in MOUNT_DEVICE_KEYWORDS):
                        self.device_mount = dev_name
                        self.mount_connected = is_connected
                        if is_connected: logger.info(f"✅ Mount Online: {dev_name}")
                    elif any(kw in dev_name for kw in ["CCD", "Camera", "DSLR", "EOS", "GPhoto"]):
                        if self.device_ccd != dev_name:
                            logger.info(f"Detected new CCD device name: {dev_name}")
                            self.device_ccd = dev_name
                            # Autoconnect discovered camera once
                            if not is_connected:
                                self._safe_connect_device(dev_name)

                        prev_connected = self.ccd_connected
                        self.ccd_connected = is_connected
                        if is_connected:
                            logger.info(f"✅ Camera Online: {dev_name}")
                            if not prev_connected and any(kw in dev_name for kw in ["GPhoto", "Canon", "DSLR", "EOS"]):
                                # indi_gphoto_ccd initialise CCD_INFO à zéro au démarrage
                                # ce qui bloque toute exposition. On pousse les valeurs Canon 600D.
                                time.sleep(1.0)
                                logger.info(f"[CCD] Init CCD_INFO Canon 600D → 5184×3456, 4.3µm, 14bit")
                                self.send(
                                    f'<newNumberVector device="{dev_name}" name="CCD_INFO">'
                                    f'<oneNumber name="CCD_MAX_X">5184</oneNumber>'
                                    f'<oneNumber name="CCD_MAX_Y">3456</oneNumber>'
                                    f'<oneNumber name="CCD_PIXEL_SIZE">4.3</oneNumber>'
                                    f'<oneNumber name="CCD_PIXEL_SIZE_X">4.3</oneNumber>'
                                    f'<oneNumber name="CCD_PIXEL_SIZE_Y">4.3</oneNumber>'
                                    f'<oneNumber name="CCD_BITSPERPIXEL">14</oneNumber>'
                                    f'</newNumberVector>'
                                )
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

            # 2.4 Encodeurs bruts (driver celestron_aux) — référentiel MONTURE.
            # Seule source fiable pour la sécurité mécanique : contrairement à
            # HORIZONTAL_COORD, ces valeurs ne passent pas par le modèle
            # d'alignement (donc ni fausses avant alignement, ni mouvantes après
            # chaque sync). Zéro posé à la mise sous tension.
            if 'TELESCOPE_ENCODER_ANGLES' in xml_str:
                m_az = re.search(r'name="AXIS_AZ"[^>]*>\s*([-\d.]+)', xml_str)
                m_alt = re.search(r'name="AXIS_ALT"[^>]*>\s*([-\d.]+)', xml_str)
                if m_az:
                    try:
                        self.encoder_az = float(m_az.group(1))
                        self.cordwrap_guard.update(self.encoder_az)
                    except ValueError:
                        pass
                if m_alt:
                    try:
                        self.encoder_alt = float(m_alt.group(1))
                    except ValueError:
                        pass

            # 2.5 GPS / Geographic updates
            if 'GEOGRAPHIC_COORD' in xml_str:
                lat_match = re.search(r'name="LAT"[^>]*>([\d\.\-\s\n]+)<', xml_str)
                lon_match = re.search(r'name="LONG"[^>]*>([\d\.\-\s\n]+)<', xml_str)
                if lat_match:
                    try:
                        self.lat = float(lat_match.group(1).strip())
                        self.geo_received = True
                    except: pass
                if lon_match:
                    try:
                        self.lon = float(lon_match.group(1).strip())
                        self.geo_received = True
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

            # Taille déclarée par le driver INDI (octets bruts, avant base64) —
            # comparée après décodage pour détecter un transfert tronqué (tunnel
            # SSH/réseau coupé en cours de route) avant d'écrire un fichier
            # corrompu qui ferait planter astropy/rawpy plus tard silencieusement.
            declared_size = None
            size_match = re.search(rb'size="(\d+)"', blob_tag)
            if size_match:
                declared_size = int(size_match.group(1))
            
            # content_start_idx was calculated above as the byte after the '>' of the opening tag
            # content_end_idx was calculated above as the start of '</oneBLOB>'
            # So blob_content already contains the base64 data.
            
            # Memory efficient cleanup of base64 whitespace
            clean_content = blob_content.replace(b'\n', b'').replace(b'\r', b'')
            try:
                raw_bytes = base64.b64decode(clean_content)

                is_viewfinder_frame = (
                    "viewfinder" in prop_name.lower() or
                    "stream" in prop_name.lower() or
                    "stream" in fmt.lower() or
                    "ccd_force_blob" in prop_name.lower() or
                    prop_name == "unknown"
                )
                if declared_size is not None and len(raw_bytes) < declared_size:
                    msg = (f"Image tronquée : {len(raw_bytes)}/{declared_size} octets reçus "
                           f"({len(raw_bytes)*100//max(declared_size,1)}%) — transfert coupé (tunnel SSH/réseau)")
                    logger.error(f"[Capture] ❌ {msg}")
                    if not is_viewfinder_frame:
                        with _capture_lock:
                            _capture_state["phase"] = "error"
                            _capture_state["error"] = msg
                            _capture_state["preview_label"] = ""
                            _capture_state["capture_started"] = None
                    return

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

                    with _capture_lock:
                        _capture_state["preview_label"] = "Sauvegarde de l'image..."

                    with open(filepath, 'wb') as f:
                        f.write(raw_bytes)

                    with _capture_lock:
                        _capture_state["last_file"] = filename
                        _capture_state["preview_label"] = "Génération de l'aperçu..."

                    size_kb = len(raw_bytes) // 1024
                    logger.info(f"[Capture] ✅ Image reçue — {size_kb} ko, format {fmt.upper()}, fichier : {filename}")
                    self.generate_thumb(filepath, ts)

                    if self._restore_live_view_after_capture and self._event_loop:
                        self._restore_live_view_after_capture = False
                        dev = (self.device_ccd or "GPhoto CCD").strip()
                        asyncio.run_coroutine_threadsafe(_restore_live_view(dev), self._event_loop)
                else:
                    # Log stream frame reception occasionally
                    if random.random() < 0.01: # Reduce log spam even more
                        logger.debug(f"Live frame received: {len(raw_bytes)} bytes (Prop: {prop_name}, Fmt: {fmt})")
            except Exception as e:
                logger.error(f"Inner BLOB Error: {e}")
                        
        except Exception as e:
            logger.error(f"Blob error: {e}")


    @staticmethod
    def _compute_frame_stats(img_bgr, exposure_s: float | None) -> dict:
        """Histogramme + saturation + suggestion d'exposition sur le preview 8 bits."""
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        total = gray.size
        saturated_pct = round(float(np.count_nonzero(gray >= 250)) / total * 100, 1)
        under_pct = round(float(np.count_nonzero(gray <= 5)) / total * 100, 1)
        mean = float(gray.mean())
        hist = np.histogram(gray, bins=32, range=(0, 256))[0]
        hist_norm = (hist / max(1, hist.max()) * 100).round(1).tolist()

        verdict, suggestion = "ok", None
        if saturated_pct > 5:
            verdict = "overexposed"
            if exposure_s:
                factor = max(2.0, mean / 90.0)
                suggestion = f"Surexposé ({saturated_pct}% saturé) — réessayez vers {max(0.001, exposure_s / factor):.3g}s"
            else:
                suggestion = f"Surexposé ({saturated_pct}% de pixels saturés) — réduisez l'exposition"
        elif mean < 15 and under_pct > 60:
            verdict = "underexposed"
            if exposure_s:
                factor = min(16.0, 70.0 / max(mean, 1.0))
                suggestion = f"Sous-exposé (moyenne {mean:.0f}/255) — réessayez vers {exposure_s * factor:.3g}s"
            else:
                suggestion = f"Sous-exposé (moyenne {mean:.0f}/255) — augmentez l'exposition"
        return {"saturated_pct": saturated_pct, "under_pct": under_pct,
                "mean": round(mean, 1), "verdict": verdict,
                "suggestion": suggestion, "histogram": hist_norm}

    @staticmethod
    def _compute_hfr(img_bgr) -> float | None:
        """HFR moyen (px) sur les ~20 étoiles les plus brillantes du preview.
        Retourne None si aucune étoile détectable (plein jour, image saturée)."""
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        med, sigma = float(np.median(gray)), float(gray.std())
        if sigma < 1e-3 or med > 200:  # image uniforme ou cramée : pas d'étoiles
            return None
        _, mask = cv2.threshold(gray, med + 4 * sigma, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = [c for c in contours if 2 <= cv2.contourArea(c) <= 400]
        if not candidates:
            return None
        hfrs = []
        for c in sorted(candidates, key=cv2.contourArea, reverse=True)[:20]:
            x, y, w, h = cv2.boundingRect(c)
            pad = 4
            sub = gray[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad] - med
            sub = np.clip(sub, 0, None)
            flux = sub.sum()
            if flux <= 0:
                continue
            ys, xs = np.indices(sub.shape)
            cy, cx = (ys * sub).sum() / flux, (xs * sub).sum() / flux
            r = np.sqrt((ys - cy) ** 2 + (xs - cx) ** 2)
            order = np.argsort(r.ravel())
            cumflux = np.cumsum(sub.ravel()[order])
            half_idx = int(np.searchsorted(cumflux, flux / 2))
            hfrs.append(float(r.ravel()[order][min(half_idx, len(order) - 1)]))
        return round(float(np.median(hfrs)), 2) if hfrs else None

    def generate_thumb(self, path, ts):
        thumb_name = f"thumb_{ts}.jpg"
        thumb_path = os.path.join(THUMBNAIL_PATH, thumb_name)
        try:
            if path.lower().endswith(".cr2") or path.lower().endswith(".cr3"):
                with rawpy.imread(path) as raw:
                    rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=True, bright=1.0)
                    imageio.imsave(thumb_path, rgb)
            elif path.lower().endswith((".fits", ".fit", ".fits.fz")):
                # FITS : dématriçage Bayer (BAYERPAT) puis étirement percentile vers 8 bits
                from astropy.io import fits as _fits
                with _fits.open(path) as hdul:
                    hdu = next((h for h in hdul if h.data is not None), None)
                    data = hdu.data if hdu is not None else None
                    bayer = str(hdu.header.get("BAYERPAT", "")).strip().upper() if hdu is not None else ""
                if data is None:
                    raise ValueError("FITS sans données image")
                arr = np.asarray(data)
                if arr.ndim == 3:
                    # (3,H,W) → (H,W,3) ; sinon on prend le premier plan
                    arr = np.moveaxis(arr, 0, -1) if arr.shape[0] in (1, 3) else arr[..., 0]
                    if arr.ndim == 3 and arr.shape[-1] == 1:
                        arr = arr[..., 0]
                # Convention : motif FITS → code OpenCV inversé (cv2 nomme le 2x2 opposé)
                _BAYER_CV = {"RGGB": cv2.COLOR_BayerBG2BGR, "BGGR": cv2.COLOR_BayerRG2BGR,
                             "GRBG": cv2.COLOR_BayerGB2BGR, "GBRG": cv2.COLOR_BayerGR2BGR}
                if arr.ndim == 2 and bayer in _BAYER_CV:
                    arr = cv2.cvtColor(np.ascontiguousarray(arr, dtype=np.uint16), _BAYER_CV[bayer])
                # Réduire AVANT la conversion float : sur un capteur 36 Mpx, étirer en
                # float32 pleine résolution fait des pics à plusieurs Go et PM2 tue le
                # backend (max_memory_restart) → "connexion INDI perdue" post-capture.
                h0, w0 = arr.shape[:2]
                scale0 = min(1.0, 1200.0 / max(h0, w0))
                if scale0 < 1.0:
                    arr = cv2.resize(arr, (int(w0 * scale0), int(h0 * scale0)), interpolation=cv2.INTER_AREA)
                arr = arr.astype(np.float32)
                # Balance des blancs gray-world : égalise les moyennes des canaux
                # (le debayer brut donne une dominante turquoise/verte sinon)
                if arr.ndim == 3 and arr.shape[-1] == 3:
                    means = arr.reshape(-1, 3).mean(axis=0)
                    gmean = float(means.mean())
                    if gmean > 0 and all(m > 0 for m in means):
                        arr *= (gmean / means)
                lo, hi = np.percentile(arr, (1.0, 99.5))
                if hi - lo < 16:
                    # Frame quasi uniforme (bouchon, bias) : ne pas amplifier le bruit
                    mid = (hi + lo) / 2
                    lo, hi = mid - 128, mid + 128
                arr = np.clip((arr - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
                cv2.imwrite(thumb_path, (arr * 255).astype(np.uint8))
            else:
                with open(path, 'rb') as src, open(thumb_path, 'wb') as dst:
                    dst.write(src.read())
            self.latest_image_path = thumb_name

            # Redimensionner et pousser en base64 dans le SSE capture/progress
            img = cv2.imread(thumb_path)
            if img is not None:
                h, w = img.shape[:2]
                scale = min(1.0, 600 / max(h, w))
                preview = cv2.resize(img, (int(w * scale), int(h * scale)))
                # Focus numérique de session : netteté calibrée appliquée au preview
                preview = _apply_focus_profile(preview)
                _, buf = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 82])
                b64 = base64.b64encode(buf).decode()
                with _capture_lock:
                    expo = _capture_state.get("exposure_s") or None
                try:
                    stats = self._compute_frame_stats(preview, expo)
                except Exception as e:
                    logger.error(f"Stats error: {e}")
                    stats = None
                try:
                    hfr = self._compute_hfr(preview)
                except Exception as e:
                    logger.error(f"HFR error: {e}")
                    hfr = None
                with _capture_lock:
                    _capture_state["last_thumbnail"] = f"data:image/jpeg;base64,{b64}"
                    _capture_state["preview_label"] = ""
                    _capture_state["stats"] = stats
                    if hfr is not None:
                        _capture_state["hfr"] = hfr
                    # Marquer la capture unique comme terminée (la séquence écrase ceci)
                    if not _capture_state.get("running"):
                        _capture_state["phase"] = "complete"
        except Exception as e:
            logger.error(f"Thumb error: {e}")
            # Sans ceci, l'UI restait bloquée sur "capturing"/"Téléchargement..."
            # jusqu'au faux timeout de 45s du watchdog SSE, qui affichait alors
            # "image jamais reçue" alors que l'image était bien arrivée mais que
            # son traitement (debayer/FITS) avait planté — message trompeur.
            with _capture_lock:
                if not _capture_state.get("running"):
                    _capture_state["phase"] = "error"
                    _capture_state["error"] = f"Traitement de l'image échoué : {e}"
                    _capture_state["preview_label"] = ""
                    _capture_state["capture_started"] = None

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
    mem = _safe_virtual_memory()
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

@app.get("/coords/stream")
async def coords_stream(request: Request):
    """SSE — pousse RA/DEC + état monture toutes les 500ms.
    Remplace le polling HTTP pour les coordonnées temps réel."""
    async def event_generator():
        prev_ra = None
        prev_dec = None
        prev_slew = None
        while True:
            if await request.is_disconnected():
                break
            ra  = getattr(indi, "mount_ra",  0.0)
            dec = getattr(indi, "mount_dec", 0.0)
            slew_state = getattr(indi, "mount_slew_state", "Idle")
            # N'émettre que si quelque chose a changé (économise la bande passante)
            if ra != prev_ra or dec != prev_dec or slew_state != prev_slew:
                prev_ra, prev_dec, prev_slew = ra, dec, slew_state
                payload = json.dumps({
                    "ra":  format_ra(ra),
                    "dec": format_dec(dec),
                    "ra_deg":  ra,
                    "dec_deg": dec,
                    "mount_slew_state": slew_state,
                })
                yield f"data: {payload}\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

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

def _jog_shares_component(dir1: str, dir2: str) -> bool:
    if not dir1 or not dir2:
        return False
    parts1 = set(dir1.split("-"))
    parts2 = set(dir2.split("-"))
    return not parts1.isdisjoint(parts2)


def _jog_send_stop(device: str) -> None:
    """Hard-stop the mount. Called from watchdog thread or stop request.

    Sends TELESCOPE_MOTION Off commands only for the axes that were actually moving,
    avoiding redundant commands and avoiding the heavy TELESCOPE_ABORT_MOTION."""
    global indi, _jog_current_dir, _jog_active_id
    
    if not (indi and indi.connected):
        _jog_current_dir = None
        _jog_active_id = None
        return

    # Determine which axes need to be stopped based on the last active direction
    active_dir = _jog_current_dir
    _jog_current_dir = None
    _jog_active_id = None

    stop_ns = True
    stop_we = True

    if active_dir:
        directions = active_dir.split("-")
        stop_ns = any(d in ["up", "down"] for d in directions)
        stop_we = any(d in ["left", "right"] for d in directions)

    logger.info(f"JOG STOP → NS={stop_ns}, WE={stop_we} (last dir: {active_dir})")

    if stop_ns:
        indi.send(
            f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_NS">'
            f'<oneSwitch name="MOTION_NORTH">Off</oneSwitch>'
            f'<oneSwitch name="MOTION_SOUTH">Off</oneSwitch>'
            f'</newSwitchVector>'
        )

    if stop_we:
        indi.send(
            f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_WE">'
            f'<oneSwitch name="MOTION_EAST">Off</oneSwitch>'
            f'<oneSwitch name="MOTION_WEST">Off</oneSwitch>'
            f'</newSwitchVector>'
        )


def _jog_arm_watchdog(device: str, timeout: float = 1.5) -> None:
    """Reset the safety watchdog. Must be called on every START pulse."""
    global _jog_wd_timer
    with _jog_wd_lock:
        if _jog_wd_timer:
            _jog_wd_timer.cancel()
        t = threading.Timer(timeout, _jog_send_stop, args=[device])
        t.daemon = True
        t.start()
        _jog_wd_timer = t


def _jog_cancel_watchdog() -> None:
    global _jog_wd_timer
    with _jog_wd_lock:
        if _jog_wd_timer:
            _jog_wd_timer.cancel()
            _jog_wd_timer = None


@app.post("/mount/jog")
async def mount_jog(req: JogRequest):
    """
    Jog the mount directionally.

    Design principles:
    - NO asyncio lock: indi.send() is already thread-safe via socket_lock.
      An asyncio lock was the root cause of STOP commands being queued
      behind START commands and arriving too late (mount ran uncontrolled).
    - NO timestamp filtering: eliminated the 10-second blackout bug where
      STOP's future timestamp blocked all subsequent STARTs.
    - Watchdog: 1.5s timer fires _jog_send_stop() if no heartbeat received.
      Frontend sends START pulses every 800ms to keep the watchdog alive.
    - STOP: always processed immediately, directly on executor, no waiting.
    """
    global indi, _jog_current_dir, _last_stop_time, _last_stop_dir, _stopped_jog_ids, _jog_active_id
    try:
        if not indi or not indi.connected:
            return {"success": False, "error": "Matériel déconnecté"}
        device = indi.device_mount
        loop = asyncio.get_running_loop()

        # ── STOP ──────────────────────────────────────────────────────────────
        if req.state == "stop":
            # Only process STOP if it's from the active session or if no ID is specified
            is_active = (not req.jog_id) or (req.jog_id == _jog_active_id)
            if is_active:
                _jog_cancel_watchdog()
                _last_stop_time = time.time()
                _last_stop_dir = req.direction
                if req.jog_id:
                    _stopped_jog_ids.add(req.jog_id)
                    if len(_stopped_jog_ids) > 100:
                        _stopped_jog_ids.pop()
                await loop.run_in_executor(None, _jog_send_stop, device)
            else:
                logger.warning(
                    f"Ignoring out-of-order STOP request for {req.direction} "
                    f"(jog_id {req.jog_id} is not active; active is {_jog_active_id})"
                )
            return {"success": True}

        # ── START / HEARTBEAT ─────────────────────────────────────────────────
        # Filter out delayed heartbeat pulses that arrive after a stop was already processed
        if req.jog_id and req.jog_id in _stopped_jog_ids:
            logger.warning(
                f"Ignoring delayed start/heartbeat request for {req.direction} "
                f"(jog_id {req.jog_id} is already stopped)"
            )
            return {"success": True}

        # Fallback to cooldown if no jog_id is provided
        if not req.jog_id and _last_stop_dir and (time.time() - _last_stop_time < 1.2):
            if _jog_shares_component(req.direction, _last_stop_dir):
                logger.warning(
                    f"Ignoring delayed start/heartbeat request for {req.direction} without jog_id "
                    f"(shares component with {_last_stop_dir} stopped {time.time() - _last_stop_time:.2f}s ago)"
                )
                return {"success": True}

        # Track the active session ID
        if req.jog_id:
            _jog_active_id = req.jog_id

        is_new_direction = (_jog_current_dir != req.direction)
        prev_dir = _jog_current_dir
        _jog_current_dir = req.direction

        if is_new_direction:
            # Parse directions
            prev_parts = set(prev_dir.split("-")) if prev_dir else set()
            new_parts = set(req.direction.split("-")) if req.direction else set()

            # Determine components
            prev_ns = any(d in ["up", "down"] for d in prev_parts)
            prev_we = any(d in ["left", "right"] for d in prev_parts)
            new_ns = any(d in ["up", "down"] for d in new_parts)
            new_we = any(d in ["left", "right"] for d in new_parts)

            xmls: list[str] = []

            # 1. NS Axis
            if new_ns:
                new_ns_dir = "up" if "up" in new_parts else "down"
                prev_ns_dir = "up" if "up" in prev_parts else ("down" if "down" in prev_parts else None)
                if new_ns_dir != prev_ns_dir:
                    val = "MOTION_SOUTH" if new_ns_dir == "up" else "MOTION_NORTH"
                    opp = "MOTION_NORTH" if new_ns_dir == "up" else "MOTION_SOUTH"
                    xmls.append(
                        f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_NS">'
                        f'<oneSwitch name="{val}">On</oneSwitch>'
                        f'<oneSwitch name="{opp}">Off</oneSwitch>'
                        f'</newSwitchVector>'
                    )
            elif prev_ns:
                xmls.append(
                    f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_NS">'
                    f'<oneSwitch name="MOTION_NORTH">Off</oneSwitch>'
                    f'<oneSwitch name="MOTION_SOUTH">Off</oneSwitch>'
                    f'</newSwitchVector>'
                )

            # 2. WE Axis
            if new_we:
                new_we_dir = "left" if "left" in new_parts else "right"
                prev_we_dir = "left" if "left" in prev_parts else ("right" if "right" in prev_parts else None)
                if new_we_dir != prev_we_dir:
                    val = "MOTION_EAST" if new_we_dir == "left" else "MOTION_WEST"
                    opp = "MOTION_WEST" if new_we_dir == "left" else "MOTION_EAST"
                    xmls.append(
                        f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_WE">'
                        f'<oneSwitch name="{val}">On</oneSwitch>'
                        f'<oneSwitch name="{opp}">Off</oneSwitch>'
                        f'</newSwitchVector>'
                    )
            elif prev_we:
                xmls.append(
                    f'<newSwitchVector device="{device}" name="TELESCOPE_MOTION_WE">'
                    f'<oneSwitch name="MOTION_EAST">Off</oneSwitch>'
                    f'<oneSwitch name="MOTION_WEST">Off</oneSwitch>'
                    f'</newSwitchVector>'
                )

            if xmls:
                indi_ref = indi
                await loop.run_in_executor(None, lambda: [indi_ref.send(x) for x in xmls])

        # Always reset the watchdog (both new direction and heartbeat pulse)
        _jog_arm_watchdog(device, timeout=1.5)
        return {"success": True}

    except Exception as e:
        logger.error(f"Jog error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/mount/rate")
async def mount_rate(req: RateRequest):
    device = req.device
    if not device or (indi.device_mount and device != indi.device_mount):
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
    if not device:
        logger.error("Slew refusé : aucune monture découverte sur INDI")
        return {"success": False, "error": "Aucune monture détectée sur INDI — vérifiez le driver"}

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

    # ── GARDE-FOU MÉCANIQUE ──────────────────────────────────────────────────
    # Vérifié AVANT tout envoi INDI, sur les encodeurs bruts (jamais sur
    # HORIZONTAL_COORD qui dépend du modèle d'alignement). Protège des deux
    # incidents du 5-6 août : collision Canon/fourche et enroulement du câble.
    if not sync:
        try:
            site = await _get_site_location(indi, INDI_HOST)
            target_alt, target_az = _radec_to_altaz(ra_hours, dec, site["lat"], site["lon"])
            cur_alt, cur_az = indi.encoder_alt, indi.encoder_az
            if cur_alt is not None and cur_az is not None:
                # Décalage cible/courant en coordonnées ciel, appliqué aux encodeurs
                sky_alt_now, sky_az_now = _radec_to_altaz(
                    indi.mount_ra / 15.0, indi.mount_dec, site["lat"], site["lon"])
                enc_target_alt = mount_safety.signed_angle(cur_alt) + (target_alt - sky_alt_now)
                d_az = mount_safety.shortest_delta(sky_az_now, target_az)
                ok, reason = mount_safety.check_altitude(enc_target_alt, ConfigService.load_config())
                if ok:
                    ok, reason = indi.cordwrap_guard.check_delta(d_az)
                if not ok:
                    logger.error(f"GoTo REFUSÉ par le garde-fou mécanique : {reason}")
                    return {"success": False, "error": f"Mouvement refusé — {reason}"}
            else:
                logger.warning("Encodeurs indisponibles : garde-fou mécanique inactif "
                               "(seules les limites du driver protègent)")
        except Exception as e:
            logger.error(f"Garde-fou mécanique en erreur ({e}) — GoTo refusé par précaution")
            return {"success": False, "error": f"Vérification de sécurité impossible : {e}"}

    # ABORT before every GoTo (unconditional).
    # The NexStar firmware queues GoTo commands internally — sending Abort first
    # ensures the previous command is cancelled regardless of what our Python state
    # thinks (mount_slew_state can be stale after a backend restart).
    if not sync:
        logger.info(f"Sending ABORT_MOTION before GoTo (unconditional)")
        indi.send(f'<newSwitchVector device="{device}" name="TELESCOPE_ABORT_MOTION"><oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
        await asyncio.sleep(0.1)  # NexStar acknowledges ABORT in <100ms over INDI TCP

    try:
        # 1. Set ON_COORD_SET mode FIRST
        # SLEW mode is for moving to a new target.
        mode = "SYNC" if sync else "SLEW"
        indi.send(f'<newSwitchVector device="{device}" name="ON_COORD_SET"><oneSwitch name="{mode}">On</oneSwitch></newSwitchVector>')
        
        # Small delay for the driver to acknowledge the mode change
        await asyncio.sleep(0.05)

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



async def ccd_capture_internal(device: str, exposure: float, preview: bool = True):
    # Use detected device if provided one is generic or empty
    if not device or device == "Canon" or device == "Canon DSLR EOS 600D":
        device = indi.device_ccd or "Canon DSLR EOS 600D"

    if not indi.connected:
        return {"success": False, "error": "Hardware offline"}

    was_live = indi.live_view_active
    logger.info(f"[Capture] Début — {device} | Exp: {exposure}s | LiveView: {was_live}")

    # ── Branche A : live view actif → arrêt propre avant capture ─────────────
    if was_live:
        logger.info("[Capture] Arrêt du flux live view...")
        indi.live_view_active = False
        indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM">'
                  f'<oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
        await asyncio.sleep(0.4)
        logger.info("[Capture] Miroir en descente (attente ~1.5s)...")
        indi.send(f'<newSwitchVector device="{device}" name="viewfinder">'
                  f'<oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
        await asyncio.sleep(1.5)
    else:
        # ── Branche B : pas de live view → sécurité miroir bas ───────────────
        logger.info("[Capture] Vérification miroir (pas de live view actif)...")
        indi.send(f'<newSwitchVector device="{device}" name="CCD_VIDEO_STREAM">'
                  f'<oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
        indi.send(f'<newSwitchVector device="{device}" name="viewfinder">'
                  f'<oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
        await asyncio.sleep(0.5)

    # ── Reset BLOB + configuration driver ────────────────────────────────────
    indi.send(f'<enableBLOB device="{device}">Never</enableBLOB>')
    await asyncio.sleep(0.3)
    indi.send(f'<enableBLOB device="{device}">Also</enableBLOB>')
    indi.send(f'<newSwitchVector device="{device}" name="UPLOAD_MODE">'
              f'<oneSwitch name="UPLOAD_CLIENT">On</oneSwitch></newSwitchVector>')
    # indi_gphoto_ccd : switch "RAM" (≠ "CCD_CAPTURE_RAM" de l'ancien indi_canon_ccd)
    indi.send(f'<newSwitchVector device="{device}" name="CCD_CAPTURE_TARGET">'
              f'<oneSwitch name="RAM">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(0.4)

    # ── Déclenchement ─────────────────────────────────────────────────────────
    logger.info(f"[Capture] ⏱ Ouverture obturateur — exposition {exposure}s...")
    with _capture_lock:
        # Repasser par "idle" pour garantir la transition idle→capturing côté SSE
        _capture_state["phase"] = "idle"
        _capture_state["last_thumbnail"] = None
    with _capture_lock:
        _capture_state["phase"] = "capturing"
        _capture_state["preview_label"] = f"Exposition en cours — {exposure}s"
        _capture_state["exposure_s"] = float(exposure)
        _capture_state["capture_started"] = time.time()
        _capture_state["elapsed_s"] = 0.0
        _capture_state["eta_s"] = float(exposure)
        _capture_state["preview_suppressed"] = not preview
        _capture_state["error"] = None
    indi.ccd_exposure_state = "Busy"
    indi._restore_live_view_after_capture = was_live
    indi.send(f'<newNumberVector device="{device}" name="CCD_EXPOSURE">'
              f'<oneNumber name="CCD_EXPOSURE_VALUE">{exposure}</oneNumber></newNumberVector>')

    return {"success": True, "message": f"Exposition {exposure}s lancée sur {device}", "state": "Busy"}

async def ccd_focus_internal(device: str, direction: str, steps: int):
    logger.info(f"Focusing {device}: {direction} {steps} steps")
    # Mapping for Canon focusing
    # Most INDI drivers use FOCUS_MOTION and FOCUS_TIMER or FOCUS_RELATIVE_STEPS
    indi.send(f'<newSwitchVector device="{device}" name="FOCUS_MOTION"><oneSwitch name="FOCUS_{direction.upper()}">On</oneSwitch></newSwitchVector>')
    indi.send(f'<newNumberVector device="{device}" name="FOCUS_TIMER"><oneNumber name="FOCUS_TIMER_VALUE">{steps/1000.0}</oneNumber></newNumberVector>')
    return {"success": True}

@app.post("/ccd/capture")
async def ccd_capture(req: CaptureRequest):
    # La session d'auto-align possède la caméra : une capture manuelle simultanée
    # vole la frame FITS de la session et sature le bus USB (saccades + timeouts).
    if _autoalign_session is not None and _autoalign_session.running:
        return {"success": False,
                "error": "Session d'auto-alignement en cours — la caméra est occupée. "
                         "Arrêtez la session (ou attendez la fin) avant de capturer."}
    return await ccd_capture_internal(req.device, req.exposure, preview=req.preview)

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

# ── Calcul Alt/Az sans astropy IERS (précision ~0.1° — suffisant pour alt-az) ──────────────
def _lst_deg(lon_deg: float, when: datetime | None = None) -> float:
    """Local Sidereal Time en degrés à partir de l'heure UTC (courante par défaut) et de la longitude."""
    now = (when or datetime.now(timezone.utc)).replace(tzinfo=None)
    # Julian Day Number
    y, mo, d = now.year, now.month, now.day
    h = now.hour + now.minute / 60.0 + now.second / 3600.0
    jd = (367 * y - int(7 * (y + int((mo + 9) / 12)) / 4)
          + int(275 * mo / 9) + d + 1721013.5 + h / 24.0)
    t = (jd - 2451545.0) / 36525.0
    # Greenwich Mean Sidereal Time (degrés)
    gst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)
           + 0.000387933 * t * t - t * t * t / 38710000.0) % 360.0
    return (gst + lon_deg) % 360.0

def _radec_to_altaz(ra_hours: float, dec_deg: float, lat_deg: float, lon_deg: float):
    """RA/Dec (ICRS) → Alt/Az. Précision ~0.1° sans téléchargement IERS."""
    lst = _lst_deg(lon_deg)
    ha  = math.radians((lst - ra_hours * 15.0) % 360.0)
    dec = math.radians(dec_deg)
    lat = math.radians(lat_deg)
    sin_alt = math.sin(dec) * math.sin(lat) + math.cos(dec) * math.cos(lat) * math.cos(ha)
    sin_alt = max(-1.0, min(1.0, sin_alt))
    alt = math.degrees(math.asin(sin_alt))
    cos_az = (math.sin(dec) - math.sin(lat) * sin_alt) / (math.cos(lat) * math.cos(math.radians(alt)) + 1e-12)
    cos_az = max(-1.0, min(1.0, cos_az))
    az = math.degrees(math.acos(cos_az))
    if math.sin(ha) > 0:
        az = 360.0 - az
    return alt, az

def _altaz_to_radec(alt_deg: float, az_deg: float, lat_deg: float, lon_deg: float):
    """Alt/Az → RA/Dec (ICRS). Précision ~0.1° sans téléchargement IERS."""
    lst = _lst_deg(lon_deg)
    alt = math.radians(alt_deg)
    az  = math.radians(az_deg)
    lat = math.radians(lat_deg)
    sin_dec = math.sin(alt) * math.sin(lat) + math.cos(alt) * math.cos(lat) * math.cos(az)
    sin_dec = max(-1.0, min(1.0, sin_dec))
    dec = math.degrees(math.asin(sin_dec))
    cos_ha = (math.sin(alt) - math.sin(lat) * sin_dec) / (math.cos(lat) * math.cos(math.radians(dec)) + 1e-12)
    cos_ha = max(-1.0, min(1.0, cos_ha))
    ha = math.degrees(math.acos(cos_ha))
    if math.sin(az) > 0:
        ha = 360.0 - ha
    ra_hours = ((lst - ha) % 360.0) / 15.0
    return ra_hours, dec

@app.post("/astro/coords")
async def get_astro_coords(req: CoordsRequest):
    """RA/Dec → Alt/Az. Calcul purement local (pas de IERS, pas de réseau)."""
    try:
        if math.isnan(req.lat) or math.isinf(req.lat) or math.isnan(req.lon) or math.isinf(req.lon):
            site = await _get_site_location(indi, INDI_HOST)
            lat, lon = site["lat"], site["lon"]
        else:
            lat, lon = req.lat, req.lon
        ra  = req.ra  if not (math.isnan(req.ra)  or math.isinf(req.ra))  else 0.0
        dec = req.dec if not (math.isnan(req.dec) or math.isinf(req.dec)) else 0.0
        alt, az = _radec_to_altaz(ra, dec, lat, lon)
        return {"success": True, "alt": alt, "az": az}
    except Exception as e:
        logger.error(f"Error in get_astro_coords: {e}")
        return {"success": False, "error": str(e), "alt": 0.0, "az": 0.0}


class AltAzToRaDecRequest(BaseModel):
    alt: float = 0.0
    az:  float = 0.0
    # NaN par défaut : lat/lon omis → résolution automatique du site
    lat: float = float("nan")
    lon: float = float("nan")
    height: float = 0.0


@app.post("/astro/altaz_to_radec")
async def altaz_to_radec(req: AltAzToRaDecRequest):
    """Alt/Az → RA/Dec. Calcul purement local (pas de IERS, pas de réseau)."""
    try:
        if math.isnan(req.lat) or math.isinf(req.lat) or math.isnan(req.lon) or math.isinf(req.lon):
            site = await _get_site_location(indi, INDI_HOST)
            lat, lon = site["lat"], site["lon"]
        else:
            lat, lon = req.lat, req.lon
        alt = req.alt if not (math.isnan(req.alt) or math.isinf(req.alt)) else 0.0
        az  = req.az  if not (math.isnan(req.az)  or math.isinf(req.az))  else 0.0
        ra_hours, dec = _altaz_to_radec(alt, az, lat, lon)
        logger.info(f"AltAz→RaDec: Alt={alt:.1f}° Az={az:.1f}° → RA={ra_hours:.4f}h Dec={dec:.4f}°")
        return {"success": True, "ra": ra_hours, "dec": dec}
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

# --- PHONE SENSOR ---

_phone_sensor: dict = {
    "connected": False,
    "alpha": None,      # compass azimuth 0-360° (0 = north)
    "beta": None,       # pitch -180..180° (altitude proxy when mounted on tube)
    "gamma": None,      # roll -90..90°
    "lat": None,
    "lon": None,
    "accuracy_m": None,
    "timestamp": None,
}
_phone_sensor_lock = threading.Lock()

active_phone_sensor_ws = set()

@app.websocket("/ws/phone-sensor")
async def phone_sensor_ws(ws: WebSocket):
    await ws.accept()
    logger.info("Phone sensor WebSocket connected")
    active_phone_sensor_ws.add(ws)
    with _phone_sensor_lock:
        _phone_sensor["connected"] = True
    try:
        while True:
            data = await ws.receive_json()
            with _phone_sensor_lock:
                _phone_sensor.update({k: v for k, v in data.items() if k in _phone_sensor})
                _phone_sensor["connected"] = True
                _phone_sensor["timestamp"] = datetime.now(timezone.utc).isoformat()
                current_state = _phone_sensor.copy()
            
            # Broadcast the updated state to other connected WebSockets (e.g. desktop wizard)
            for client in list(active_phone_sensor_ws):
                if client != ws:
                    try:
                        await client.send_json(current_state)
                    except Exception:
                        active_phone_sensor_ws.discard(client)
    except WebSocketDisconnect:
        logger.info("Phone sensor WebSocket disconnected")
    except Exception as e:
        logger.warning(f"Phone sensor WS error: {e}")
    finally:
        active_phone_sensor_ws.discard(ws)
        with _phone_sensor_lock:
            if not active_phone_sensor_ws:
                _phone_sensor["connected"] = False

@app.get("/phone-sensor/state")
async def get_phone_sensor_state():
    with _phone_sensor_lock:
        return _phone_sensor.copy()

# --- STREAMING ---
async def mjpeg_generator():
    """Yield frames as fast as the camera delivers them using frame_condition.

    Design: run_in_executor blocks a thread pool worker on the Condition wait,
    freeing the asyncio event loop between frames. The notify_all() in
    process_blobs() wakes the thread immediately — latency = INDI socket
    transit time only, no polling delay.
    """
    last_frame_count = indi.frame_count
    loop = asyncio.get_event_loop()

    while True:
        if not indi.connected:
            break

        # Capture current count in closure to avoid race with outer scope reassignment.
        current_count = last_frame_count

        def wait_for_frame():
            with indi.frame_condition:
                return indi.frame_condition.wait_for(
                    lambda: indi.frame_count != current_count or not indi.connected,
                    timeout=0.5   # 0.5s — détecte déconnexion rapidement, sans polling actif
                )

        got_new = await loop.run_in_executor(None, wait_for_frame)

        if not indi.connected:
            break

        if got_new and indi.frame_count != last_frame_count:
            frame = indi.latest_frame
            last_frame_count = indi.frame_count
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n'
                       b'Content-Length: ' + str(len(frame)).encode() + b'\r\n\r\n'
                       + frame + b'\r\n')
        # No asyncio.sleep(0) — run_in_executor already yields the event loop.

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",   # Disable nginx/Caddy proxy buffering
            "Access-Control-Allow-Origin": "*",  # CORS pour accès direct browser
        },
    )

@app.post("/ccd/reconnect")
async def ccd_reconnect():
    """Reconnect Canon ONLY — without restarting indiserver or disconnecting the mount.

    Strategy (up to 2 attempts):
      1. Kill gvfs-gphoto2 + fuser -k on Canon USB node (aggressive lock release)
      2. INDI DISCONNECT Canon
      3. Wait 2 s (driver releases internal libgphoto2 handle)
      4. INDI CONNECT Canon
      5. Wait 3 s for driver to enumerate USB
      If ccd_connected is still False → repeat once more from step 1.

    The mount stays connected throughout.
    """
    dev = (indi.device_ccd or "Canon DSLR EOS 600D").strip()
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}

    loop = asyncio.get_event_loop()

    for attempt in range(1, 3):
        logger.info(f"[CCD Reconnect] Attempt {attempt}/2 for {dev}")

        # Step 1 — aggressive USB lock release via SSH
        try:
            lock_result = await asyncio.wait_for(
                loop.run_in_executor(executor, raspi.release_camera_usb_lock),
                timeout=15.0
            )
            if not lock_result.get("success"):
                logger.warning(f"[CCD Reconnect] USB lock release warning: {lock_result.get('error')}")
        except asyncio.TimeoutError:
            logger.warning("[CCD Reconnect] USB lock release timed out — continuing")

        # Step 2 — INDI DISCONNECT
        indi.send(f'<newSwitchVector device="{dev}" name="CONNECTION">'
                  f'<oneSwitch name="DISCONNECT">On</oneSwitch>'
                  f'<oneSwitch name="CONNECT">Off</oneSwitch>'
                  f'</newSwitchVector>')
        await asyncio.sleep(2.0)

        # Step 3 — INDI CONNECT (full safe-connect sequence)
        await loop.run_in_executor(executor, indi._safe_connect_device, dev)
        await asyncio.sleep(3.0)  # gphoto USB enumeration can take up to 3 s

        if indi.ccd_connected:
            logger.info(f"[CCD Reconnect] ✅ Success on attempt {attempt}")
            return {"success": True}

        logger.warning(f"[CCD Reconnect] Attempt {attempt} failed — ccd_connected still False")
        if attempt < 2:
            await asyncio.sleep(1.0)  # brief pause before retry

    return {
        "success": False,
        "error": (
            "Canon toujours non connectée après 2 tentatives. "
            "Débranchez/rebranchez le câble USB puis réessayez."
        )
    }


async def _restore_live_view(dev: str):
    """Restaure le live view après une capture. Appelé depuis le thread BLOB via run_coroutine_threadsafe."""
    logger.info(f"[Capture] Reprise du live view sur {dev}...")
    indi.send(f'<newSwitchVector device="{dev}" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(2.5)
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>')
    indi.live_view_active = True
    logger.info(f"[Capture] Live view restauré.")


@app.post("/ccd/stream/start")
async def ccd_stream_start_endpoint():
    if _autoalign_session is not None and _autoalign_session.running:
        return {"success": False,
                "error": "Session d'auto-alignement en cours — le live view est piloté par la session."}
    return await ccd_stream_start()

async def ccd_stream_start():
    dev = (indi.device_ccd or "Canon DSLR EOS 600D").strip()
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}
    if not indi.ccd_connected:
        logger.warning(f"[LiveView] ccd_connected=False — Canon not responding on INDI. Check USB and gphoto driver.")
        return {"success": False, "error": f"Canon non connectée à INDI ({dev}) — vérifiez le câble USB et le driver gphoto"}

    logger.info(f"[LiveView] Starting stream on {dev} — full driver reset sequence")

    # ── Step 0: Aggressive reset ─────────────────────────────────────────────
    # Stop stream, lower mirror, then disable BLOBs to flush driver buffers.
    # This clears Busy/stuck states left over from previous sessions or crashes.
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(0.3)
    indi.send(f'<newSwitchVector device="{dev}" name="viewfinder"><oneSwitch name="viewfinder1">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(0.3)
    # Temporarily disable BLOBs to flush any partially-read frame from the socket
    indi.send(f'<enableBLOB device="{dev}">Never</enableBLOB>')
    await asyncio.sleep(0.5)

    # ── Step 1: Re-enable BLOBs ──────────────────────────────────────────────
    indi.send(f'<enableBLOB device="{dev}">Also</enableBLOB>')

    # ── Step 2: Upload mode = CLIENT (frames come to us, not saved to disk) ──
    indi.send(f'<newSwitchVector device="{dev}" name="UPLOAD_MODE"><oneSwitch name="UPLOAD_CLIENT">On</oneSwitch></newSwitchVector>')

    # ── Step 3: Encoder = MJPEG ──────────────────────────────────────────────
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_STREAM_ENCODER"><oneSwitch name="MJPEG">On</oneSwitch></newSwitchVector>')

    # ── Step 4: FPS cap ──────────────────────────────────────────────────────
    indi.send(f'<newNumberVector device="{dev}" name="LIMITS"><oneNumber name="LIMITS_PREVIEW_FPS">30</oneNumber></newNumberVector>')

    # ── Step 5: Live view size (largest) ─────────────────────────────────────
    indi.send(f'<newSwitchVector device="{dev}" name="liveviewsize"><oneSwitch name="liveviewsize0">On</oneSwitch></newSwitchVector>')

    await asyncio.sleep(0.5)  # let driver digest all configuration before mirror up

    # ── Step 6: Mirror up (viewfinder0 = live view mode on 600D) ─────────────
    # The 600D takes ~1.5s for the mirror to physically travel and lock.
    indi.send(f'<newSwitchVector device="{dev}" name="viewfinder"><oneSwitch name="viewfinder0">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(2.5)  # 2.5 s — more headroom than the original 2.0

    # ── Step 7: Start stream ─────────────────────────────────────────────────
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_ON">On</oneSwitch></newSwitchVector>')

    indi.live_view_active = True
    logger.info(f"[LiveView] STREAM_ON sent to {dev}")
    return {"success": True}

@app.post("/ccd/stream/stop")
async def ccd_stream_stop_endpoint():
    if _autoalign_session is not None and _autoalign_session.running:
        return {"success": False,
                "error": "Session d'auto-alignement en cours — le live view est piloté par la session."}
    return await ccd_stream_stop()

async def ccd_stream_stop():
    dev = (indi.device_ccd or "Canon DSLR EOS 600D").strip()
    if not indi.connected:
        return {"success": False, "error": "INDI bridge not connected"}
    indi.live_view_active = False
    # Stop stream first, then lower mirror — order matters for the 600D
    indi.send(f'<newSwitchVector device="{dev}" name="CCD_VIDEO_STREAM"><oneSwitch name="STREAM_OFF">On</oneSwitch></newSwitchVector>')
    await asyncio.sleep(0.5)
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
    mem = _safe_virtual_memory()
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


@app.post("/mount/init-station")
async def mount_init_station(req: InitStationRequest):
    """Étape 2 du wizard mise en station: envoie GPS+UTC à INDI et active le suivi sidéral."""
    device = req.device or indi.device_mount
    now_utc = datetime.utcnow()
    logger.info(f"Init station: device={device} lat={req.lat} lon={req.lon} elev={req.elevation}")

    # Send geographic coordinates
    indi.send(
        f'<newNumberVector device="{device}" name="GEOGRAPHIC_COORD">'
        f'<oneNumber name="LAT">{req.lat}</oneNumber>'
        f'<oneNumber name="LONG">{req.lon}</oneNumber>'
        f'<oneNumber name="ELEV">{req.elevation}</oneNumber>'
        f'</newNumberVector>'
    )
    await asyncio.sleep(0.3)

    # Send UTC time
    utc_str = now_utc.strftime("%Y-%m-%dT%H:%M:%S")
    offset_str = "0"
    indi.send(
        f'<newTextVector device="{device}" name="TIME_UTC">'
        f'<oneText name="UTC">{utc_str}</oneText>'
        f'<oneText name="OFFSET">{offset_str}</oneText>'
        f'</newTextVector>'
    )
    await asyncio.sleep(0.3)

    # Enable sidereal tracking
    indi.send(
        f'<newSwitchVector device="{device}" name="TELESCOPE_TRACK_STATE">'
        f'<oneSwitch name="TRACK_ON">On</oneSwitch>'
        f'</newSwitchVector>'
    )

    return {
        "success": True,
        "lat": req.lat,
        "lon": req.lon,
        "elevation": req.elevation,
        "utc": utc_str,
        "tracking": True,
        "message": "GPS, heure et suivi sidéral initialisés"
    }


@app.post("/mount/tracking-rate")
async def mount_tracking_rate(req: TrackingRateRequest):
    """Définit le mode de suivi: SIDEREAL, LUNAR ou SOLAR."""
    device = req.device or indi.device_mount
    rate = req.rate.upper()
    if rate not in ("SIDEREAL", "LUNAR", "SOLAR"):
        return {"success": False, "error": f"Rate invalide: {rate}"}

    logger.info(f"Tracking rate: {rate} on {device}")

    # First ensure tracking is ON
    indi.send(
        f'<newSwitchVector device="{device}" name="TELESCOPE_TRACK_STATE">'
        f'<oneSwitch name="TRACK_ON">On</oneSwitch>'
        f'</newSwitchVector>'
    )
    await asyncio.sleep(0.2)

    # Set track mode
    indi.send(
        f'<newSwitchVector device="{device}" name="TELESCOPE_TRACK_MODE">'
        f'<oneSwitch name="TRACK_{rate}">On</oneSwitch>'
        f'</newSwitchVector>'
    )

    return {"success": True, "rate": rate}


# ─── Capture sequence state (shared between SSE stream and background task) ───
_capture_state: dict = {
    "running": False,
    "phase": "idle",          # idle | capturing | stacking | complete | error
    "current_frame": 0,
    "total_frames": 0,
    "elapsed_s": 0.0,
    "eta_s": 0.0,
    "hfr": None,
    "snr": None,
    "stack_count": 0,
    "last_thumbnail": None,   # base64 jpeg thumbnail of latest capture/stack
    "last_file": None,        # nom du dernier fichier capturé (pour save/delete UI)
    "stats": None,            # histogramme/saturation/suggestion d'expo du dernier preview
    "preview_suppressed": False,  # True = capture technique (autofocus) : l'UI n'ouvre pas le modal
    "preview_label": "",      # texte affiché dans la barre de chargement preview
    "exposure_s": 0.0,        # durée d'exposition de la capture unique en cours
    "capture_started": None,  # epoch du début d'exposition (interne, sert au calcul elapsed/eta)
    "log": [],                # list of {time, msg, type}
    "error": None,
}
_capture_lock = threading.Lock()


def _cap_log(msg: str, kind: str = "info"):
    entry = {"time": datetime.utcnow().strftime("%H:%M:%S"), "msg": msg, "type": kind}
    with _capture_lock:
        _capture_state["log"].append(entry)
    logger.info(f"[capture] {msg}")


@app.get("/capture/progress")
async def capture_progress(request: Request):
    """SSE stream of current capture+stacking state."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            with _capture_lock:
                # Capture unique : elapsed/eta calculés en direct + bascule du label
                # "Exposition" → "Téléchargement" quand l'obturateur est refermé.
                if (_capture_state["phase"] == "capturing"
                        and not _capture_state["running"]
                        and _capture_state["capture_started"]):
                    elapsed = time.time() - _capture_state["capture_started"]
                    expo = _capture_state["exposure_s"] or 0.0
                    _capture_state["elapsed_s"] = round(elapsed, 1)
                    _capture_state["eta_s"] = round(max(0.0, expo - elapsed), 1)
                    if elapsed > expo + 0.5 and _capture_state["preview_label"].startswith("Exposition"):
                        _capture_state["preview_label"] = "Téléchargement depuis l'appareil..."
                    # Watchdog : si l'image n'arrive jamais (mauvais device, driver muet),
                    # ne pas rester bloqué sur "Téléchargement..." indéfiniment.
                    if elapsed > expo + 45:
                        _capture_state["phase"] = "error"
                        _capture_state["error"] = "Image jamais reçue de l'appareil (timeout 45s) — vérifiez le device et l'obturation"
                        _capture_state["preview_label"] = ""
                        _capture_state["capture_started"] = None
                payload = json.dumps({k: v for k, v in _capture_state.items() if k != "capture_started"})
            yield f"data: {payload}\n\n"
            await asyncio.sleep(0.8)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/capture/discard")
async def capture_discard():
    """Supprime définitivement le dernier fichier capturé + son thumbnail (preview non désirée)."""
    with _capture_lock:
        filename = _capture_state["last_file"]
    if not filename:
        return {"success": False, "error": "Aucune capture récente à supprimer"}
    # Sécurité : nom de fichier simple uniquement, pas de traversée de chemin
    if os.path.basename(filename) != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    deleted = []
    filepath = os.path.join(STORAGE_PATH, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)
        deleted.append(filename)
    # Thumbnail associé : capture_TS.ext → thumb_TS.jpg
    m = re.match(r"capture_(\d{8}_\d{6})\.", filename)
    if m:
        thumb = f"thumb_{m.group(1)}.jpg"
        thumb_path = os.path.join(THUMBNAIL_PATH, thumb)
        if os.path.isfile(thumb_path):
            os.remove(thumb_path)
            deleted.append(thumb)

    with _capture_lock:
        _capture_state["last_file"] = None
        _capture_state["last_thumbnail"] = None
        _capture_state["phase"] = "idle"
        _capture_state["preview_label"] = ""
    logger.info(f"[Capture] 🗑 Supprimé : {', '.join(deleted) or 'rien (fichier déjà absent)'}")
    return {"success": True, "deleted": deleted}


# ─── Focus numérique de session ────────────────────────────────────────────────
# Principe : l'utilisateur fait la mise au point manuellement UNE fois sur une
# étoile, puis calibre. On mesure le HFR de référence et Gemini Vision propose
# des paramètres de netteté (unsharp/denoise) appliqués automatiquement à
# toutes les captures suivantes de la session.

_FOCUS_PROFILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "focus_profile.json")
_focus_profile: dict = {"active": False}


def _load_focus_profile():
    global _focus_profile
    try:
        if os.path.isfile(_FOCUS_PROFILE_PATH):
            _focus_profile = json.loads(open(_FOCUS_PROFILE_PATH).read())
            if _focus_profile.get("active"):
                logger.info(f"[Focus] Profil numérique rechargé : {_focus_profile.get('comment', '')}")
    except Exception as e:
        logger.error(f"[Focus] Lecture profil échouée: {e}")
        _focus_profile = {"active": False}


def _save_focus_profile():
    try:
        with open(_FOCUS_PROFILE_PATH, "w") as f:
            json.dump(_focus_profile, f, indent=2)
    except Exception as e:
        logger.error(f"[Focus] Sauvegarde profil échouée: {e}")


def _apply_focus_profile(img):
    """Applique le profil de netteté numérique de session à un preview BGR 8 bits."""
    if not _focus_profile.get("active"):
        return img
    try:
        radius = float(_focus_profile.get("sharpen_radius", 2.0))
        amount = float(_focus_profile.get("sharpen_amount", 0.8))
        denoise = int(_focus_profile.get("denoise_strength", 3))
        out = img
        if denoise > 0:
            out = cv2.fastNlMeansDenoisingColored(out, None, denoise, denoise, 7, 21)
        if amount > 0 and radius > 0:
            k = max(3, int(radius * 3) | 1)  # noyau impair ≈ 3σ
            blurred = cv2.GaussianBlur(out, (k, k), radius)
            out = cv2.addWeighted(out, 1.0 + amount, blurred, -amount, 0)
        return out
    except Exception as e:
        logger.error(f"[Focus] Application profil échouée: {e}")
        return img


def _call_gemini_vision(prompt: str, jpeg_b64: str) -> dict:
    """Variante vision de _call_gemini : envoie le prompt + une image JPEG base64."""
    token = _get_gemini_token()
    if not token:
        raise ValueError("Gemini indisponible — vérifiez server/firebase-adminsdk.json")
    body = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/jpeg", "data": jpeg_b64}},
        ]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512, "responseMimeType": "application/json"},
    }).encode()
    req = _urllib_request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with _urllib_request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read())
    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    m = re.search(r'\{[\s\S]*?\}', content)
    if not m:
        raise ValueError(f"JSON introuvable dans la réponse Gemini: {content[:200]}")
    return json.loads(m.group())


@app.post("/focus/calibrate")
async def focus_calibrate():
    """Calibre le focus numérique de session à partir de la dernière capture (étoile
    mise au point manuellement). Mesure le HFR de référence, demande à Gemini Vision
    des paramètres de netteté, sauvegarde le profil appliqué aux captures suivantes."""
    global _focus_profile
    thumb_name = indi.latest_image_path
    if not thumb_name:
        return {"success": False, "error": "Aucune capture récente — capturez d'abord l'étoile mise au point"}
    thumb_path = os.path.join(THUMBNAIL_PATH, os.path.basename(thumb_name))
    if not os.path.isfile(thumb_path):
        return {"success": False, "error": f"Aperçu introuvable : {thumb_name}"}

    def _calibrate():
        img = cv2.imread(thumb_path)
        if img is None:
            raise ValueError("Aperçu illisible")
        hfr = INDIClient._compute_hfr(img)
        stats = INDIClient._compute_frame_stats(img, None)

        # Paramètres par défaut dérivés du HFR mesuré (fallback sans IA)
        base_radius = max(1.0, min(6.0, (hfr or 3.0) * 0.8))
        params = {"sharpen_radius": round(base_radius, 1), "sharpen_amount": 0.8,
                  "denoise_strength": 3, "comment": "Paramètres dérivés du HFR mesuré (sans IA)"}

        # Gemini Vision affine les paramètres si disponible
        ai_used = False
        if _gemini_available():
            _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            b64 = base64.b64encode(buf).decode()
            prompt = (
                "Tu es un expert en traitement d'images astronomiques. Cette image est une capture "
                f"d'étoile(s) après mise au point manuelle d'un télescope (HFR mesuré: {hfr}, "
                f"luminosité moyenne: {stats['mean']}/255, pixels saturés: {stats['saturated_pct']}%). "
                "Propose des paramètres de netteté numérique (unsharp mask gaussien + débruitage NlMeans) "
                "à appliquer aux captures suivantes de la session pour compenser le flou résiduel. "
                "Réponds UNIQUEMENT en JSON: {\"sharpen_radius\": <1.0-6.0 px>, \"sharpen_amount\": <0.3-1.5>, "
                "\"denoise_strength\": <0-8>, \"comment\": \"<diagnostic bref en français>\"}"
            )
            try:
                ai_params = _call_gemini_vision(prompt, b64)
                params.update({k: ai_params[k] for k in ("sharpen_radius", "sharpen_amount", "denoise_strength", "comment") if k in ai_params})
                ai_used = True
            except Exception as e:
                logger.warning(f"[Focus] Gemini indisponible, fallback HFR: {e}")

        # Aperçu avant/après pour l'UI
        after = _apply_focus_profile_params(img, params)
        _, buf_after = cv2.imencode(".jpg", after, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return hfr, params, ai_used, base64.b64encode(buf_after).decode()

    try:
        loop = asyncio.get_event_loop()
        hfr, params, ai_used, after_b64 = await loop.run_in_executor(None, _calibrate)
        _focus_profile = {
            "active": True, "hfr_ref": hfr, "ai_used": ai_used,
            "calibrated_at": datetime.now().isoformat(timespec="seconds"),
            "source_thumb": os.path.basename(thumb_name), **params,
        }
        _save_focus_profile()
        logger.info(f"[Focus] ✅ Profil numérique calibré (HFR ref {hfr}, IA: {ai_used}): {params}")
        return {"success": True, "profile": _focus_profile, "preview_after": f"data:image/jpeg;base64,{after_b64}"}
    except Exception as e:
        logger.error(f"[Focus] Calibration échouée: {e}")
        return {"success": False, "error": str(e)}


def _apply_focus_profile_params(img, params: dict):
    saved = dict(_focus_profile)
    try:
        _focus_profile.update({"active": True, **params})
        return _apply_focus_profile(img)
    finally:
        _focus_profile.clear()
        _focus_profile.update(saved)


@app.get("/focus/profile")
async def focus_profile_get():
    return {"success": True, "profile": _focus_profile}


@app.post("/focus/reset")
async def focus_profile_reset():
    global _focus_profile
    _focus_profile = {"active": False}
    _save_focus_profile()
    logger.info("[Focus] Profil numérique désactivé")
    return {"success": True}


_load_focus_profile()


@app.get("/capture/state")
async def capture_state_snapshot():
    """Snapshot ponctuel de l'état capture (pour les wizards qui pollent sans SSE)."""
    with _capture_lock:
        return {k: v for k, v in _capture_state.items() if k not in ("capture_started", "last_thumbnail", "log")}


@app.post("/capture/enhance")
async def capture_enhance():
    """Amélioration automatique du dernier preview : débruitage, étirement asinh,
    balance des blancs, CLAHE et boost de saturation. Retourne le base64 amélioré."""
    with _capture_lock:
        thumb_name = indi.latest_image_path
    if not thumb_name:
        # Après un redémarrage backend, retomber sur le thumbnail le plus récent du disque
        try:
            thumbs = sorted(
                (f for f in os.listdir(THUMBNAIL_PATH) if f.startswith("thumb_") and f.endswith(".jpg")),
                reverse=True,
            )
            thumb_name = thumbs[0] if thumbs else None
        except FileNotFoundError:
            thumb_name = None
    if not thumb_name:
        return {"success": False, "error": "Aucune capture récente à améliorer"}
    thumb_path = os.path.join(THUMBNAIL_PATH, os.path.basename(thumb_name))
    if not os.path.isfile(thumb_path):
        return {"success": False, "error": f"Aperçu introuvable : {thumb_name}"}

    def _enhance():
        img = cv2.imread(thumb_path)
        if img is None:
            raise ValueError("Aperçu illisible")
        h, w = img.shape[:2]
        scale = min(1.0, 1200.0 / max(h, w))
        if scale < 1.0:
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        # 1. Débruitage (préserve les étoiles ponctuelles)
        img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        # 2. Balance des blancs gray-world
        f = img.astype(np.float32)
        means = f.reshape(-1, 3).mean(axis=0)
        gmean = float(means.mean())
        if gmean > 0 and all(m > 0 for m in means):
            f *= (gmean / means)
        f = np.clip(f, 0, 255)
        # 3. Étirement asinh (rehausse les faibles luminosités sans cramer les hautes)
        norm = f / 255.0
        stretched = np.arcsinh(norm * 10.0) / np.arcsinh(10.0)
        img = np.clip(stretched * 255.0, 0, 255).astype(np.uint8)
        # 4. CLAHE sur la luminance
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        lab[..., 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lab[..., 0])
        img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        # 5. Boost léger de saturation
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[..., 1] = np.clip(hsv[..., 1] * 1.25, 0, 255)
        img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return base64.b64encode(buf).decode()

    try:
        loop = asyncio.get_event_loop()
        b64 = await loop.run_in_executor(None, _enhance)
        return {"success": True, "image": f"data:image/jpeg;base64,{b64}"}
    except Exception as e:
        logger.error(f"Enhance error: {e}")
        return {"success": False, "error": str(e)}


@app.get("/capture/gallery")
async def capture_gallery():
    """Liste les aperçus de la session (thumbnails), plus récents en premier."""
    items = []
    try:
        for name in os.listdir(THUMBNAIL_PATH):
            if not name.startswith("thumb_") or not name.endswith(".jpg"):
                continue
            fp = os.path.join(THUMBNAIL_PATH, name)
            ts = name.removeprefix("thumb_").removesuffix(".jpg")
            # Fichier capture associé (peut avoir été supprimé)
            capture_file = None
            for f in os.listdir(STORAGE_PATH):
                if f.startswith(f"capture_{ts}."):
                    capture_file = f
                    break
            items.append({
                "thumb": name, "ts": ts, "capture_file": capture_file,
                "size_kb": os.path.getsize(fp) // 1024,
                "capture_size_mb": round(os.path.getsize(os.path.join(STORAGE_PATH, capture_file)) / 1e6, 1) if capture_file else None,
            })
    except FileNotFoundError:
        pass
    items.sort(key=lambda x: x["ts"], reverse=True)
    return {"success": True, "items": items[:200]}


@app.get("/capture/gallery/thumb/{name}")
async def capture_gallery_thumb(name: str):
    if os.path.basename(name) != name or not name.startswith("thumb_"):
        raise HTTPException(status_code=400, detail="Nom invalide")
    fp = os.path.join(THUMBNAIL_PATH, name)
    if not os.path.isfile(fp):
        raise HTTPException(status_code=404, detail="Introuvable")
    with open(fp, "rb") as f:
        return Response(f.read(), media_type="image/jpeg")


class GalleryDeleteRequest(BaseModel):
    thumbs: list[str]


@app.post("/capture/gallery/delete")
async def capture_gallery_delete(req: GalleryDeleteRequest):
    """Suppression en lot : thumbnails + fichiers capture associés."""
    deleted = []
    for name in req.thumbs[:200]:
        if os.path.basename(name) != name or not name.startswith("thumb_"):
            continue
        ts = name.removeprefix("thumb_").removesuffix(".jpg")
        fp = os.path.join(THUMBNAIL_PATH, name)
        if os.path.isfile(fp):
            os.remove(fp)
            deleted.append(name)
        for f in os.listdir(STORAGE_PATH):
            if f.startswith(f"capture_{ts}."):
                os.remove(os.path.join(STORAGE_PATH, f))
                deleted.append(f)
    logger.info(f"[Gallery] 🗑 {len(deleted)} fichiers supprimés")
    return {"success": True, "deleted": deleted}


def _purge_old_thumbnails(max_age_days: int = 14):
    """Purge les thumbnails plus vieux que max_age_days (les captures restent)."""
    try:
        cutoff = time.time() - max_age_days * 86400
        removed = 0
        for name in os.listdir(THUMBNAIL_PATH):
            fp = os.path.join(THUMBNAIL_PATH, name)
            if os.path.isfile(fp) and os.path.getmtime(fp) < cutoff:
                os.remove(fp)
                removed += 1
        if removed:
            logger.info(f"[Gallery] Purge : {removed} thumbnails > {max_age_days}j supprimés")
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.error(f"Purge thumbnails error: {e}")


@app.post("/capture/sequence/start")
async def capture_sequence_start(req: CaptureSequenceRequest):
    """Démarre une séquence de capture+stacking en arrière-plan."""
    with _capture_lock:
        if _capture_state["running"]:
            return {"success": False, "error": "Une séquence est déjà en cours"}
        _capture_state.update({
            "running": True,
            "phase": "capturing",
            "current_frame": 0,
            "total_frames": req.count,
            "elapsed_s": 0.0,
            "eta_s": req.exposure * req.count,
            "hfr": None,
            "snr": None,
            "stack_count": 0,
            "last_thumbnail": None,
            "preview_label": f"Démarrage — {req.count} × {req.exposure}s",
            "log": [],
            "error": None,
        })

    device = req.device or indi.detectedCcd or "Canon DSLR"

    def run_sequence():
        import time as _time
        start = _time.time()
        frames = []
        capture_dir = STORAGE_PATH if os.path.isdir(STORAGE_PATH) else os.path.join(os.path.dirname(__file__), "captures")
        IMG_EXTS = ["*.jpg", "*.jpeg", "*.cr2", "*.cr3", "*.fit", "*.fits"]

        _cap_log(f"Démarrage: {req.count} frames × {req.exposure}s — {device}", "info")

        # Désactiver la restauration du live view pendant toute la séquence
        was_live = indi.live_view_active
        indi._restore_live_view_after_capture = False

        for i in range(req.count):
            with _capture_lock:
                if not _capture_state["running"]:
                    _cap_log("Séquence annulée", "warn")
                    break
                _capture_state["phase"] = "capturing"
                _capture_state["current_frame"] = i + 1
                _capture_state["elapsed_s"] = round(_time.time() - start, 1)
                _capture_state["eta_s"] = round((req.count - i) * req.exposure, 1)
                _capture_state["preview_label"] = f"Exposition {i+1}/{req.count} — {req.exposure}s"

            _cap_log(f"Frame {i+1}/{req.count} — exposition {req.exposure}s")

            # ── Déclencher via le chemin unique (miroir, UPLOAD_MODE, RAM, etc.) ─
            pre_ts = _time.time()
            if indi._event_loop:
                future = asyncio.run_coroutine_threadsafe(
                    ccd_capture_internal(device, req.exposure),
                    indi._event_loop,
                )
                try:
                    result = future.result(timeout=req.exposure + 10.0)
                    if not result.get("success"):
                        _cap_log(f"Frame {i+1}: déclenchement échoué — {result.get('error','?')}", "error")
                        continue
                except Exception as exc:
                    _cap_log(f"Frame {i+1}: exception déclenchement — {exc}", "error")
                    continue
            else:
                _cap_log("Boucle asyncio non disponible — envoi INDI direct", "warn")
                indi.send(
                    f'<newNumberVector device="{device}" name="CCD_EXPOSURE">'
                    f'<oneNumber name="CCD_EXPOSURE_VALUE">{req.exposure}</oneNumber>'
                    f'</newNumberVector>'
                )

            # ── Attendre l'apparition d'un NOUVEAU fichier sur disque ───────────
            with _capture_lock:
                _capture_state["preview_label"] = f"Attente image {i+1}/{req.count}..."
            deadline = _time.time() + req.exposure + 30.0
            latest = None
            while _time.time() < deadline:
                _time.sleep(1.0)
                new_files = sorted(
                    [f for ext in IMG_EXTS for f in Path(capture_dir).glob(ext)
                     if os.path.getmtime(str(f)) > pre_ts],
                    key=os.path.getmtime,
                )
                if new_files:
                    latest = str(new_files[-1])
                    break

            if latest:
                frames.append(latest)
                _cap_log(f"Frame {i+1} capturée: {os.path.basename(latest)}", "success")
                with _capture_lock:
                    _capture_state["preview_label"] = f"Génération aperçu {i+1}..."
                # Réutilise generate_thumb qui pousse aussi dans _capture_state
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                indi.generate_thumb(latest, ts)
                with _capture_lock:
                    _capture_state["stack_count"] = len(frames)
                    if len(frames) > 1:
                        _capture_state["phase"] = "stacking"
                        _capture_state["preview_label"] = f"Empilement {len(frames)} frames..."
            else:
                _cap_log(f"Frame {i+1}: timeout — aucun fichier reçu dans {int(req.exposure)+30}s", "error")

        # ── Fin de séquence ───────────────────────────────────────────────────
        # Restaurer le live view si actif avant la séquence
        if was_live and indi._event_loop:
            asyncio.run_coroutine_threadsafe(
                _restore_live_view(device), indi._event_loop
            )

        with _capture_lock:
            _capture_state["running"] = False
            _capture_state["phase"] = "complete"
            _capture_state["elapsed_s"] = round(_time.time() - start, 1)
            _capture_state["eta_s"] = 0.0
            _capture_state["preview_label"] = ""

        _cap_log(f"Séquence terminée — {len(frames)} frames capturées", "success")

    threading.Thread(target=run_sequence, daemon=True).start()
    return {"success": True, "count": req.count, "exposure": req.exposure}


@app.post("/capture/sequence/stop")
def capture_sequence_stop():
    """Arrête la séquence en cours."""
    with _capture_lock:
        _capture_state["running"] = False
        _capture_state["phase"] = "idle"
    _cap_log("Séquence arrêtée par l'utilisateur", "warn")
    return {"success": True}


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


@app.post("/reset-all")
async def reset_all():
    """Graded recovery of the full INDI/hardware stack.

    Runs the cheapest fixes first and escalates only if needed. Returns a
    step-by-step log so the UI can show exactly what was done and what failed.
    Never reboots the Pi (that stays an explicit, separate action).
    """
    loop = asyncio.get_event_loop()
    steps: list[dict] = []

    def step(name: str, ok: bool, detail: str = ""):
        steps.append({"step": name, "ok": bool(ok), "detail": detail})
        logger.info(f"[ResetAll] {name}: {'OK' if ok else 'FAIL'} {detail}")

    # 1 — Bridge INDI socket
    if indi.connected:
        step("Bridge INDI", True, "déjà connecté")
    else:
        ok = await loop.run_in_executor(executor, indi.connect)
        step("Bridge INDI", ok, "reconnecté" if ok else "échec — tunnel SSH ou Pi injoignable")

    # 2 — Escalade : redémarrage indiserver distant si déconnecté ou si le matériel est hors ligne
    if not indi.connected or not indi.mount_connected or not indi.ccd_connected:
        await loop.run_in_executor(executor, raspi.restart_indi)
        await asyncio.sleep(3.0)
        ok = await loop.run_in_executor(executor, indi.connect)
        step("Redémarrage INDI distant", ok, "indiserver relancé" if ok else "Pi injoignable")

    # 3 — Connexion matériel (monture + caméra)
    if indi.connected:
        try:
            indi.send('<getProperties version="1.7"/>')
            await asyncio.sleep(0.5)
            indi._safe_connect_device(indi.device_mount)
            indi._safe_connect_device(indi.device_ccd)
            await asyncio.sleep(2.0)
            step("Connexion matériel", True, f"{indi.device_mount} + {indi.device_ccd}")
        except Exception as e:
            step("Connexion matériel", False, str(e))
    else:
        step("Connexion matériel", False, "bridge non connecté")

    # 4 — Caméra Canon : libération du verrou USB si toujours déconnectée
    if indi.connected and indi.mount_connected and not indi.ccd_connected:
        try:
            res = await ccd_reconnect()
            step("Verrou USB Canon", res.get("success", False), res.get("message") or res.get("error", ""))
        except Exception as e:
            step("Verrou USB Canon", False, str(e))

    overall = indi.connected and indi.mount_connected and indi.ccd_connected
    return {
        "success": overall,
        "steps": steps,
        "health": {
            "bridge": indi.connected,
            "mount": indi.mount_connected,
            "ccd": indi.ccd_connected,
        },
    }


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

def _debayer_fits_to_jpeg(fits_bytes: bytes) -> bytes:
    """Parse un FITS minimal (BLOB CCD INDI), dématrice si BAYERPAT présent, et
    étire vers un JPEG 8 bits. solve-field sur une mosaïque Bayer brute prend le
    damier CFA pour de fausses étoiles et ne matche jamais d'astérisme réel."""
    pos = 0
    header_bytes = b""
    while True:
        block = fits_bytes[pos:pos + 2880]
        if not block:
            raise ValueError("Truncated FITS header")
        header_bytes += block
        pos += 2880
        if block.rstrip().endswith(b"END"):
            break
    cards = [header_bytes[i:i + 80].decode("ascii", "ignore") for i in range(0, len(header_bytes), 80)]
    keys = {}
    for c in cards:
        if "=" in c:
            k, v = c.split("=", 1)
            keys[k.strip()] = v.split("/")[0].strip().strip("'").strip()

    naxis1 = int(keys.get("NAXIS1", 0))
    naxis2 = int(keys.get("NAXIS2", 0))
    bzero = float(keys.get("BZERO", 0))
    bayerpat = keys.get("BAYERPAT", "").strip()

    if not naxis1 or not naxis2:
        raise ValueError("Not a recognizable FITS image (missing NAXIS1/2)")

    raw = fits_bytes[pos: pos + naxis1 * naxis2 * 2]
    arr = np.frombuffer(raw, dtype=">i2").reshape(naxis2, naxis1).astype(np.int32)
    arr = arr + int(bzero)
    arr = np.clip(arr, 0, 65535).astype(np.uint16)

    bayer_map = {
        "RGGB": cv2.COLOR_BayerBG2GRAY,
        "BGGR": cv2.COLOR_BayerRG2GRAY,
        "GRBG": cv2.COLOR_BayerGB2GRAY,
        "GBRG": cv2.COLOR_BayerGR2GRAY,
    }
    code = bayer_map.get(bayerpat)
    gray16 = cv2.cvtColor(arr, code) if code is not None else arr

    # hi=99.95% (pas 99.5%) : écrêter 0.5% des pixels transforme le bruit de fond
    # en centaines de faux points saturés — l'extracteur d'étoiles (le nôtre comme
    # celui de solve-field) les prend pour des étoiles. Les vraies étoiles restent
    # bien au-dessus du 99.95e percentile d'un champ normal.
    lo, hi = np.percentile(gray16, [1.0, 99.95])
    if hi <= lo:
        hi = lo + 1
    stretched = np.clip((gray16.astype(np.float32) - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)

    ok, buf = cv2.imencode(".jpg", stretched, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return buf.tobytes()


def _solve_frame(image_bytes: bytes,
                 ra_hint_h: float | None = None,
                 dec_hint: float | None = None,
                 radius_deg: float | None = None,
                 scale_low: float = 0.4,
                 scale_high: float = 1.6) -> dict:
    """Plate-solve une image (JPEG ou FITS brut) via solve-field sur Astroberry.

    SYNCHRONE (SCP + subprocess) — appeler via asyncio.to_thread depuis l'event loop.
    Bornes d'échelle par défaut resserrées sur le FOV réel du setup
    (NexStar 4SE 1350mm + APS-C ≈ 0.95°×0.63°).

    Returns:
        { success: True, ra: float (heures décimales), dec: float (degrés) }
        { success: False, error: str }
    """
    import subprocess, tempfile, shutil

    # Solveur local (Mac Mini M4, ~50× plus rapide que le Pi 3B) si installé,
    # sinon repli SSH direct vers le Pi en LAN (pas le tunnel 2222 qui flappe).
    local_solver = shutil.which("solve-field") or (
        "/opt/homebrew/bin/solve-field" if os.path.exists("/opt/homebrew/bin/solve-field") else None)

    if INDI_HOST in ("127.0.0.1", "localhost"):
        astroberry_host = os.getenv("ASTROBERRY_DIRECT_HOST", "astroberry.local")
        ssh_port = "22"
    else:
        astroberry_host = INDI_HOST
        ssh_port = os.getenv("ASTROBERRY_PORT", "22")
    ssh_user = os.getenv("ASTROBERRY_USER", "astroberry")
    ssh_key  = os.getenv("ASTROBERRY_SSH_KEY", "")

    local_path = None
    try:
        if len(image_bytes) < 100:
            return {"success": False, "error": "Image too small — capture may have failed"}

        # Dématriçage si FITS Bayer brut (sinon solve-field voit le damier CFA)
        if image_bytes[:6] == b"SIMPLE":
            try:
                image_bytes = _debayer_fits_to_jpeg(image_bytes)
            except Exception as e:
                logger.warning(f"Debayer failed, falling back to raw bytes: {e}")

        # Downsample adaptatif : accélère l'extraction de sources 5-10× sans
        # perte de précision astrométrique utile à ce FOV.
        try:
            _probe = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
            img_w = _probe.shape[1] if _probe is not None else 0
        except Exception:
            img_w = 0
        downsample = 4 if img_w > 3000 else 2

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            local_path = tmp.name

        # Hint RA/DEC : réduit drastiquement l'espace de recherche des index
        hint = ""
        if ra_hint_h is not None and dec_hint is not None and radius_deg is not None:
            hint = f"--ra {ra_hint_h * 15.0:.4f} --dec {dec_hint:.4f} --radius {radius_deg:.1f} "

        common_flags = (
            f"--no-plots --overwrite --scale-units degwidth "
            f"--scale-low {scale_low} --scale-high {scale_high} "
            f"{hint}"
            f"--downsample {downsample} --depth 40 --cpulimit 90 "
        )

        if local_solver:
            solve_dir = "/tmp/stargazer_solve"
            os.makedirs(solve_dir, exist_ok=True)
            solve_cmd = (f"{local_solver} {common_flags}"
                         f"--dir {solve_dir} --out solve_input {local_path}")
            logger.info(f"Running LOCAL solve-field: {solve_cmd}")
            # PATH : solve-field appelle jpegtopnm (netpbm, /opt/homebrew/bin) —
            # absent du PATH du process PM2, la conversion JPEG échoue sinon.
            env = {**os.environ, "PATH": f"/opt/homebrew/bin:{os.environ.get('PATH', '')}"}
            result = subprocess.run(["bash", "-c", solve_cmd + " 2>&1"],
                                    capture_output=True, text=True, timeout=120, env=env)
        else:
            remote_dir = "/tmp/stargazer_solve"
            remote_img = f"{remote_dir}/solve_input.jpg"

            ssh_base = ["ssh", "-p", ssh_port, "-o", "StrictHostKeyChecking=no",
                        "-o", "ConnectTimeout=10"]
            if ssh_key:
                ssh_base += ["-i", ssh_key]
            ssh_base.append(f"{ssh_user}@{astroberry_host}")

            subprocess.run(ssh_base + [f"mkdir -p {remote_dir}"], timeout=10, check=True)

            scp_cmd = ["scp", "-P", ssh_port, "-o", "StrictHostKeyChecking=no",
                       "-o", "ConnectTimeout=10"]
            if ssh_key:
                scp_cmd += ["-i", ssh_key]
            scp_cmd += [local_path, f"{ssh_user}@{astroberry_host}:{remote_img}"]
            subprocess.run(scp_cmd, timeout=90, check=True)  # RAW ~35MB → 35-40s sur le LAN Pi

            check = subprocess.run(ssh_base + ["which solve-field"],
                                   capture_output=True, text=True, timeout=10)
            if check.returncode == 255:
                # 255 = échec de connexion SSH, pas un outil manquant
                return {"success": False, "error": f"SSH vers le Pi injoignable ({astroberry_host}:{ssh_port}) — {check.stderr.strip()[:200]}"}
            if check.returncode != 0:
                logger.warning("solve-field not found on Astroberry — plate solve unavailable")
                return {"success": False, "error": "solve-field not installed on Astroberry. Install astrometry.net: sudo apt-get install astrometry.net"}

            solve_cmd = (f"solve-field {common_flags}"
                         f"--dir {remote_dir} --out solve_input {remote_img} 2>&1")
            logger.info(f"Running solve-field on Astroberry: {solve_cmd}")
            result = subprocess.run(ssh_base + [solve_cmd],
                                    capture_output=True, text=True, timeout=180)
        logger.info(f"solve-field stdout: {result.stdout[-2000:]}")

        if "Field center: (RA H:M:S, Dec D:M:S)" not in result.stdout \
                and "Field center: (RA,Dec) = " not in result.stdout:
            logger.warning(f"solve-field failed or timed out. Output: {result.stdout[-500:]}")
            return {"success": False, "error": "solve-field could not find a solution. Check star visibility and scale bounds."}

        ra_deg, dec_deg = None, None
        m = re.search(r"Field center.*?RA,Dec\).*?\(([+-]?\d+\.?\d*),\s*([+-]?\d+\.?\d*)\)", result.stdout)
        if m:
            ra_deg  = float(m.group(1))
            dec_deg = float(m.group(2))

        if ra_deg is None:
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
        return {"success": False, "error": "solve-field timed out (>180s). Try shorter exposure or brighter field."}
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"SSH/SCP command failed: {e}"}
    except Exception as e:
        logger.error(f"_solve_frame error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
    finally:
        if local_path:
            try:
                os.unlink(local_path)
            except Exception:
                pass


class AutoAlignSolveRequest(BaseModel):
    image_b64: str            # image (JPEG ou FITS) encodée en base64
    scale_low: float = 0.4    # borne basse largeur de champ (degrés)
    scale_high: float = 1.6   # borne haute largeur de champ (degrés)

@app.post("/autoalign/solve")
async def autoalign_solve(req: AutoAlignSolveRequest):
    """Wrapper HTTP de _solve_frame (compat UI existante)."""
    try:
        img_bytes = base64.b64decode(req.image_b64)
    except Exception as e:
        return {"success": False, "error": f"base64 decode failed: {e}"}
    return await asyncio.to_thread(
        _solve_frame, img_bytes, None, None, None, req.scale_low, req.scale_high)


# ── AUTO-ALIGN v2 — Session de scan continu ─────────────────────────────────

from autoalign_session import AutoAlignSession, get_site_location as _get_site_location

_autoalign_session: AutoAlignSession | None = None

def _get_autoalign_session() -> AutoAlignSession:
    global _autoalign_session
    if _autoalign_session is None:
        _autoalign_session = AutoAlignSession(
            indi=indi,
            slew=mount_slew_internal,
            capture=ccd_capture_internal,
            solve=_solve_frame,
            altaz_to_radec=_altaz_to_radec,
            debayer_fits=_debayer_fits_to_jpeg,
            start_live_view=ccd_stream_start,
            stop_live_view=ccd_stream_stop,
            logger=logger,
            gpsd_host=INDI_HOST,
            reconnect_ccd=ccd_reconnect,
        )
    return _autoalign_session


class AutoAlignZone(BaseModel):
    altMin: float
    altMax: float
    azMin: float
    azMax: float

class AutoAlignSessionStartRequest(BaseModel):
    zone: AutoAlignZone
    target_pairs: int = 3
    preview_exposure: float = 1.0
    solve_exposure: float = 4.0
    max_duration_s: int = 1800
    use_ai: bool = False
    dry_run: bool = False
    lat: float | None = None
    lon: float | None = None

@app.post("/autoalign/session/start")
async def autoalign_session_start(req: AutoAlignSessionStartRequest):
    session = _get_autoalign_session()
    if session.running:
        raise HTTPException(status_code=409, detail="Une session d'auto-alignement est déjà en cours")
    if not indi.mount_connected:
        return {"success": False, "error": "Monture hors ligne"}
    if not indi.ccd_connected and not req.dry_run:
        return {"success": False, "error": "Caméra hors ligne"}
    sid = session.start(
        req.zone.model_dump(),
        target_pairs=req.target_pairs,
        preview_exposure=req.preview_exposure,
        solve_exposure=req.solve_exposure,
        max_duration_s=req.max_duration_s,
        use_ai=req.use_ai,
        dry_run=req.dry_run,
        config_lat=req.lat,
        config_lon=req.lon,
    )
    return {"success": True, "session_id": sid}

@app.post("/autoalign/session/stop")
async def autoalign_session_stop():
    session = _get_autoalign_session()
    if not session.running:
        return {"success": True, "message": "Aucune session en cours"}
    await session.stop()
    return {"success": True, "message": "Session arrêtée"}

@app.get("/autoalign/session/status")
async def autoalign_session_status():
    session = _get_autoalign_session()
    return {"running": session.running, **session.snapshot()}

@app.get("/autoalign/session/stream")
async def autoalign_session_stream(request: Request):
    """SSE — événements temps réel de la session (state, cell, pair, log, done)."""
    session = _get_autoalign_session()
    q = session.subscribe()

    async def event_generator():
        # Snapshot initial pour permettre la reconnexion en cours de session
        yield f"data: {json.dumps({'event': 'snapshot', 'data': session.snapshot()})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            session.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/autoalign/site")
async def autoalign_site():
    """Position du site résolue via la chaîne gpsd → monture → fallback."""
    site = await _get_site_location(indi, INDI_HOST)
    return {"success": True, **site}


# ── SKYSAFARI — pont NexStar/TCP (recherche d'objets + GoTo depuis l'iPhone) ─

from skysafari_bridge import SkySafariBridge

_skysafari_bridge: SkySafariBridge | None = None

@app.on_event("startup")
async def start_skysafari_bridge():
    global _skysafari_bridge
    port = int(os.getenv("SKYSAFARI_PORT", "4030"))
    _skysafari_bridge = SkySafariBridge(indi=indi, slew=mount_slew_internal,
                                        logger=logger, port=port)
    try:
        await _skysafari_bridge.start()
    except OSError as e:
        logger.error(f"[SkySafari] Impossible d'écouter sur le port {port}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# AI — credentials from local CLIs, no key stored in the browser
# ─────────────────────────────────────────────────────────────────────────────

import urllib.request as _urllib_request
import urllib.parse as _urllib_parse

# ── Google Service Account JWT auth (RS256, no external deps) ──────────────
_SA_TOKEN_CACHE: dict = {"token": None, "expires_at": 0.0}
_SA_FILE = Path(__file__).parent / "firebase-adminsdk.json"
_GEMINI_SCOPE = "https://www.googleapis.com/auth/generative-language"

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _sa_sign_jwt(sa: dict) -> str:
    """Build and sign a JWT assertion for the service account."""
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.asymmetric import padding as _pad
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64url(json.dumps({
        "iss": sa["client_email"],
        "scope": _GEMINI_SCOPE,
        "aud": sa["token_uri"],
        "exp": now + 3600,
        "iat": now,
    }).encode())
    signing_input = f"{header}.{claims}".encode()
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = key.sign(signing_input, _pad.PKCS1v15(), hashes.SHA256())
    return f"{header}.{claims}.{_b64url(sig)}"

def _get_gemini_token() -> str | None:
    """Return a valid Google access token for the Generative Language API."""
    global _SA_TOKEN_CACHE
    if _SA_TOKEN_CACHE["token"] and time.time() < _SA_TOKEN_CACHE["expires_at"] - 60:
        return _SA_TOKEN_CACHE["token"]
    if not _SA_FILE.exists():
        logger.warning("[AI] firebase-adminsdk.json not found — Gemini unavailable")
        return None
    try:
        sa = json.loads(_SA_FILE.read_text())
        jwt_assertion = _sa_sign_jwt(sa)
        data = _urllib_parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt_assertion,
        }).encode()
        req = _urllib_request.Request(
            sa["token_uri"],
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with _urllib_request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
        token = result["access_token"]
        _SA_TOKEN_CACHE = {"token": token, "expires_at": time.time() + result.get("expires_in", 3600)}
        logger.info("[AI] Gemini service-account token refreshed")
        return token
    except Exception as e:
        logger.error(f"[AI] Gemini service-account token error: {e}")
        return None

def _gemini_available() -> bool:
    return _SA_FILE.exists() and json.loads(_SA_FILE.read_text()).get("type") == "service_account"

def _call_gemini(prompt: str) -> dict:
    token = _get_gemini_token()
    if not token:
        raise ValueError("Gemini indisponible — vérifiez server/firebase-adminsdk.json")
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512, "responseMimeType": "application/json"},
    }).encode()
    req = _urllib_request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with _urllib_request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    m = re.search(r'\{[\s\S]*?\}', content)
    if not m:
        raise ValueError(f"JSON introuvable dans la réponse Gemini: {content[:200]}")
    return json.loads(m.group())

def _call_claude(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY non défini — exportez-le dans l'env du backend")
    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 512,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = _urllib_request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with _urllib_request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    content = data["content"][0]["text"].strip()
    m = re.search(r'\{[\s\S]*?\}', content)
    if not m:
        raise ValueError(f"JSON introuvable dans la réponse Claude: {content[:200]}")
    return json.loads(m.group())

def _ai_call(prompt: str, provider: str | None = None) -> dict:
    """Call the best available AI provider, avec bascule automatique sur l'autre en cas d'échec."""
    if not provider:
        provider = "claude" if os.getenv("ANTHROPIC_API_KEY") else "gemini"
    if provider not in ("claude", "gemini"):
        raise ValueError(f"Provider inconnu: {provider}")

    primary, fallback_name = (
        (_call_claude, "gemini") if provider == "claude" else (_call_gemini, "claude")
    )
    fallback_available = _gemini_available() if fallback_name == "gemini" else bool(os.getenv("ANTHROPIC_API_KEY"))
    fallback_call = _call_gemini if fallback_name == "gemini" else _call_claude

    try:
        return primary(prompt)
    except Exception as e:
        logger.warning(f"[AI] {provider} a échoué ({e}), bascule automatique sur {fallback_name}...")
        if not fallback_available:
            raise e
        return fallback_call(prompt)

@app.get("/ai/auth/status")
async def ai_auth_status():
    """Return which AI providers are available."""
    claude_ok = bool(os.getenv("ANTHROPIC_API_KEY"))
    gemini_ok = _gemini_available()
    provider = "claude" if claude_ok else ("gemini" if gemini_ok else None)
    sa_email = None
    if gemini_ok:
        try:
            sa_email = json.loads(_SA_FILE.read_text()).get("client_email")
        except Exception:
            pass
    return {"claude": claude_ok, "gemini": gemini_ok, "provider": provider, "gemini_sa": sa_email}

class ClaudeKeyRequest(BaseModel):
    apiKey: str

@app.post("/ai/claude/key")
async def set_claude_key(req: ClaudeKeyRequest):
    """Store Anthropic API key in server/.env (never returned to client)."""
    key = req.apiKey.strip()
    if not key.startswith("sk-ant-"):
        raise HTTPException(status_code=400, detail="Clé Anthropic invalide (doit commencer par sk-ant-)")
    env_path = Path(__file__).parent / ".env"
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    updated = [l for l in lines if not l.startswith("ANTHROPIC_API_KEY=")]
    updated.append(f"ANTHROPIC_API_KEY={key}")
    env_path.write_text("\n".join(updated) + "\n")
    os.environ["ANTHROPIC_API_KEY"] = key
    return {"ok": True}

@app.delete("/ai/claude/key")
async def delete_claude_key():
    """Remove Anthropic API key from server/.env."""
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        lines = [l for l in env_path.read_text().splitlines() if not l.startswith("ANTHROPIC_API_KEY=")]
        env_path.write_text("\n".join(lines) + "\n")
    os.environ.pop("ANTHROPIC_API_KEY", None)
    return {"ok": True}

class AiSequenceRequest(BaseModel):
    targetName: str
    provider: str | None = None

@app.post("/ai/sequence")
async def ai_sequence(req: AiSequenceRequest):
    """Generate optimal capture sequence for a DSO target."""
    prompt = (
        f'I am an astrophotographer using a Celestron NexStar 4SE (focal length 1350mm, aperture 90mm, '
        f'Alt-Azimuth mount) and a Canon EOS 600D (APS-C sensor).\n'
        f'I want to photograph: "{req.targetName}".\n'
        f'Provide the optimal live-stacking capture sequence. Consider Alt-Az mount limitations '
        f'(field rotation — max ~15s per sub before star trails).\n'
        f'Reply ONLY with valid JSON, no markdown:\n'
        f'{{"exposureTime": <seconds>, "isoGain": "<ISO string>", "frameCount": <count>}}'
    )
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, lambda: _ai_call(prompt, req.provider))
        return result
    except Exception as e:
        logger.error(f"[AI] sequence error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class AiSkyRequest(BaseModel):
    prompt: str
    provider: str | None = None

@app.post("/ai/sky")
async def ai_sky(req: AiSkyRequest):
    """Free-form sky/observation planning AI call (used by SkyMap)."""
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, lambda: _ai_call(req.prompt, req.provider))
        return result
    except Exception as e:
        logger.error(f"[AI] sky error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class AiPlateSolveRequest(BaseModel):
    imageBase64: str  # JPEG base64 without data: prefix
    provider: str | None = None

@app.post("/ai/platesolve")
async def ai_platesolve(req: AiPlateSolveRequest):
    """AI vision fallback plate-solving via Claude or Gemini."""
    loop = asyncio.get_event_loop()

    def _solve():
        provider = req.provider or ("claude" if os.getenv("ANTHROPIC_API_KEY") else "gemini")
        vision_prompt = (
            "This is an astronomical image taken through a telescope. "
            "Identify the star patterns and estimate the center coordinates in J2000 equatorial. "
            "Reply ONLY with valid JSON: "
            '{"ra": <decimal_hours_0_to_24>, "dec": <decimal_degrees_-90_to_90>} '
            "or {\"ra\": null, \"dec\": null} if you cannot determine coordinates."
        )
        if provider == "claude":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY non défini")
            body = json.dumps({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 128,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": req.imageBase64}},
                        {"type": "text", "text": vision_prompt},
                    ]
                }],
            }).encode()
            http_req = _urllib_request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                method="POST",
            )
            with _urllib_request.urlopen(http_req, timeout=30) as resp:
                data = json.loads(resp.read())
            content = data["content"][0]["text"].strip()
        elif provider == "gemini":
            token = _get_gemini_token()
            if not token:
                raise ValueError("Gemini token unavailable")
            body = json.dumps({
                "contents": [{"parts": [
                    {"inlineData": {"mimeType": "image/jpeg", "data": req.imageBase64}},
                    {"text": vision_prompt},
                ]}],
                "generationConfig": {"temperature": 0, "maxOutputTokens": 128, "responseMimeType": "application/json"},
            }).encode()
            http_req = _urllib_request.Request(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
                data=body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            with _urllib_request.urlopen(http_req, timeout=30) as resp:
                data = json.loads(resp.read())
            content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        else:
            raise ValueError("No AI provider available for plate solving")

        m = re.search(r'\{[^}]+\}', content)
        if not m:
            raise ValueError(f"No JSON in AI response: {content[:200]}")
        parsed = json.loads(m.group())
        if parsed.get("ra") is None or parsed.get("dec") is None:
            return {"success": False, "ra": None, "dec": None}
        return {"success": True, "ra": float(parsed["ra"]), "dec": float(parsed["dec"])}

    try:
        result = await loop.run_in_executor(None, _solve)
        return result
    except Exception as e:
        logger.error(f"[AI] platesolve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    # access_log=False : coupe le flood de logs par-requête + l'ouverture/fermeture
    # WebSocket. Le middleware metrics_middleware loggue déjà l'essentiel.
    uvicorn.run(app, host="0.0.0.0", port=5005, access_log=False)
