# server/autoalign_session.py
"""
Auto-Align v2 — Session de scan continu de zone avec calibration relative.

Machine à états pilotant : résolution du site (gpsd → monture → config → fallback),
scan en serpentin de la zone cadrée, scoring d'étoiles sur frames live/preview,
capture+plate-solve des champs prometteurs, et SYNC final après 2-3 paires
(position_rapportée, position_résolue) cohérentes.

Le référentiel de départ est arbitraire : la monture n'a pas besoin d'être en
position initiale. Ses coordonnées rapportées forment un référentiel relatif
cohérent en interne ; le SYNC final le recale sur le ciel réel.

Aucune dépendance vers main.py : toutes les fonctions du backend sont injectées
au constructeur (pas d'import circulaire).
"""

import asyncio
import json
import math
import os
import socket
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import cv2
import numpy as np

# ── Champ réel du setup : NexStar 4SE 1350mm + APS-C Canon 600D ─────────────
FOV_W_DEG = 0.95
FOV_H_DEG = 0.63
GRID_STEP_ALT = FOV_H_DEG * 0.8   # ~0.5°
GRID_STEP_AZ_EQ = FOV_W_DEG * 0.8  # ~0.75° à l'équateur, divisé par cos(alt)

PAIRS_FILE = os.path.join(os.path.dirname(__file__), "autoalign_pairs.json")


# ─────────────────────────────────────────────────────────────────────────────
# Résolution du site d'observation
# ─────────────────────────────────────────────────────────────────────────────

def _query_gpsd(host: str, port: int = 2947, timeout: float = 3.0) -> Optional[dict]:
    """Interroge gpsd sur le Pi (TCP). Retourne {lat, lon, alt} si fix 2D/3D, sinon None.
    Bloquant — à appeler via asyncio.to_thread."""
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.sendall(b'?WATCH={"enable":true,"json":true}\n')
        s.settimeout(timeout)
        deadline = time.time() + timeout
        buf = b""
        while time.time() < deadline:
            try:
                chunk = s.recv(4096)
            except socket.timeout:
                break
            if not chunk:
                break
            buf += chunk
            for line in buf.decode(errors="ignore").splitlines():
                try:
                    d = json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue
                if d.get("class") == "TPV" and d.get("mode", 0) >= 2 and "lat" in d and "lon" in d:
                    s.close()
                    return {"lat": float(d["lat"]), "lon": float(d["lon"]),
                            "elev": float(d.get("alt", 0.0))}
        s.close()
    except OSError:
        pass
    return None


def _normalize_lon(lon: float) -> float:
    """INDI publie la longitude en 0-360 Est ; normalise en ±180."""
    return lon - 360.0 if lon > 180.0 else lon


async def get_site_location(indi, gpsd_host: str,
                            config_lat: Optional[float] = None,
                            config_lon: Optional[float] = None) -> dict:
    """Chaîne de priorité : gpsd Pi → GEOGRAPHIC_COORD monture → config → fallback.
    Retourne {lat, lon, elev, source}."""
    gps = await asyncio.to_thread(_query_gpsd, gpsd_host)
    if gps:
        return {**gps, "source": "gpsd"}

    if getattr(indi, "geo_received", False):
        m_lat = getattr(indi, "lat", None)
        m_lon = getattr(indi, "lon", None)
        if m_lat is not None and m_lon is not None and (m_lat, m_lon) != (0.0, 0.0):
            return {"lat": float(m_lat), "lon": _normalize_lon(float(m_lon)),
                    "elev": 0.0, "source": "mount"}

    if config_lat is not None and config_lon is not None:
        return {"lat": config_lat, "lon": config_lon, "elev": 0.0, "source": "config"}

    return {"lat": -17.6333, "lon": -149.6000, "elev": 0.0, "source": "fallback"}


# ─────────────────────────────────────────────────────────────────────────────
# Scoring d'étoiles (extrait/adapté de _compute_hfr)
# ─────────────────────────────────────────────────────────────────────────────

def _fits_to_gray16(fits_bytes: bytes) -> np.ndarray:
    """Parse un FITS minimal (BLOB INDI) et retourne l'image 16-bit dématricée
    en niveaux de gris, SANS stretch. Le scoring doit travailler dans le domaine
    d'origine : tout stretch percentile étale le bruit d'un champ vide sur toute
    la dynamique et fabrique des centaines de fausses étoiles."""
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
        raise ValueError("Not a recognizable FITS image")
    raw = fits_bytes[pos: pos + naxis1 * naxis2 * 2]
    arr = np.frombuffer(raw, dtype=">i2").reshape(naxis2, naxis1).astype(np.int32)
    arr = np.clip(arr + int(bzero), 0, 65535).astype(np.uint16)
    bayer_map = {
        "RGGB": cv2.COLOR_BayerBG2GRAY,
        "BGGR": cv2.COLOR_BayerRG2GRAY,
        "GRBG": cv2.COLOR_BayerGB2GRAY,
        "GBRG": cv2.COLOR_BayerGR2GRAY,
    }
    code = bayer_map.get(bayerpat)
    return cv2.cvtColor(arr, code) if code is not None else arr


def score_frame(image_bytes: bytes, debayer_fits: Optional[Callable[[bytes], bytes]] = None) -> dict:
    """Compte les étoiles détectables dans une frame JPEG (live view) ou FITS.

    FITS : analyse en 16-bit natif, seuil MAD absolu (med + 8σ) — un champ vide
    ne produit rien au-dessus, une vraie étoile dépasse largement.
    JPEG live view : analyse 8-bit classique.
    Retourne {star_count, max_flux, background, sigma, promising, error?}."""
    result = {"star_count": 0, "max_flux": 0.0, "background": 0.0,
              "sigma": 0.0, "promising": False}
    try:
        if image_bytes[:6] == b"SIMPLE":
            gray = _fits_to_gray16(image_bytes).astype(np.float32)
            saturation_ceiling = 65000.0
            snr_k = 8.0  # 16-bit natif : le bruit est réel, pas amplifié
            # Pixels chauds : pics extrêmes sur 1-2px, étalés en ~2x2 par le débayer.
            # Une vraie étoile (seeing ~3px FWHM à 1350mm/4.3µm) couvre ≥6px au seuil.
            # Bornes hautes larges : une étoile filée (trail) peut être très étendue.
            min_area, max_area = 6.0, 5000.0
        else:
            arr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
            if img is None:
                result["error"] = "decode failed"
                return result
            gray = img.astype(np.float32)
            saturation_ceiling = 250.0
            snr_k = 5.0
            min_area, max_area = 2.0, 400.0
        med = float(np.median(gray))
        # σ robuste (MAD) : insensible aux queues de distribution / pixels chauds
        mad = float(np.median(np.abs(gray - med)))
        sigma = max(1.4826 * mad, 1.0)
        result["background"] = round(med, 1)
        result["sigma"] = round(sigma, 2)
        if med > saturation_ceiling * 0.8:  # image cramée
            result["error"] = "saturated or flat"
            return result
        threshold = min(med + snr_k * sigma, saturation_ceiling)
        _, mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(mask.astype(np.uint8),
                                       cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        count = 0
        max_flux = 0.0
        for c in contours:
            area = cv2.contourArea(c)
            if not (min_area <= area <= max_area):
                continue
            x, y, w, h = cv2.boundingRect(c)
            sub = np.clip(gray[y:y + h, x:x + w] - med, 0, None)
            flux = float(sub.sum())
            # SNR approx : flux / (sigma * sqrt(aire))
            if flux / (sigma * math.sqrt(max(area, 1.0))) > 5.0:
                count += 1
                max_flux = max(max_flux, flux)
        result["star_count"] = count
        result["max_flux"] = round(max_flux, 1)
        # Seuil bas : le live view (expo ~1/30s) montre 4-7 étoiles là où la pose
        # pleine de 4s en révèle des dizaines — 5 en live suffit pour tenter le solve.
        result["promising"] = count >= 5
        return result
    except Exception as e:
        result["error"] = str(e)
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Grille de scan
# ─────────────────────────────────────────────────────────────────────────────

def build_scan_grid(alt_min: float, alt_max: float,
                    az_min: float, az_max: float,
                    max_cells: int = 120) -> list[dict]:
    """Serpentin alt/az sur la zone, pas ≈ 0.8×FOV, az corrigé en cos(alt).
    Gère le wrap azimut (az_min > az_max = zone traversant 0/360°).
    Ordre stratifié coarse-to-fine : 1 cellule sur 3 d'abord, puis le reste."""
    az_span = (az_max - az_min) % 360.0
    if az_span == 0.0:
        az_span = 360.0
    cells: list[dict] = []
    alt = max(alt_min, 5.0)  # sous 5° : réfraction + obstacles, inutile
    row = 0
    while alt <= alt_max and len(cells) < max_cells * 3:
        step_az = GRID_STEP_AZ_EQ / max(math.cos(math.radians(alt)), 0.1)
        n_az = max(1, int(az_span / step_az) + 1)
        row_cells = []
        for i in range(n_az):
            az = (az_min + min(i * step_az, az_span)) % 360.0
            row_cells.append({"alt": round(alt, 2), "az": round(az, 2)})
        if row % 2 == 1:
            row_cells.reverse()  # serpentin
        cells.extend(row_cells)
        alt += GRID_STEP_ALT
        row += 1

    # Stratification : visite 1/3 des cellules d'abord (réparties), puis le reste
    coarse = cells[::3]
    fine = [c for i, c in enumerate(cells) if i % 3 != 0]
    ordered = coarse + fine
    for i, c in enumerate(ordered):
        c["i"] = i
        c["status"] = "pending"
    return ordered[:max_cells]


async def _retry(fn: Callable, attempts: int = 3, base_delay: float = 2.0,
                 label: str = "op", log=None):
    """Retry avec backoff exponentiel pour les opérations distantes (sous-voltage Pi)."""
    last_exc: Optional[Exception] = None
    for n in range(attempts):
        try:
            res = fn()
            if asyncio.iscoroutine(res):
                res = await res
            return res
        except Exception as e:
            last_exc = e
            delay = base_delay * (2 ** n)
            if log:
                log(f"⚠️ {label} tentative {n + 1}/{attempts} échouée ({e}) — retry dans {delay:.0f}s")
            await asyncio.sleep(delay)
    raise last_exc if last_exc else RuntimeError(f"{label} failed")


# ─────────────────────────────────────────────────────────────────────────────
# Session
# ─────────────────────────────────────────────────────────────────────────────

class AutoAlignSession:
    """Machine à états du scan d'alignement. Une seule instance active à la fois.

    Dépendances injectées depuis main.py :
      indi                : client INDI (état monture/caméra, send(), frame_condition…)
      slew                : mount_slew_internal(device, ra_hours, dec_deg, sync=False)
      capture             : ccd_capture_internal(device, exposure, preview)
      solve               : _solve_frame(image_bytes, ra_hint, dec_hint, radius_deg) → dict
      altaz_to_radec      : _altaz_to_radec(alt, az, lat, lon) → (ra_hours, dec_deg)
      debayer_fits        : _debayer_fits_to_jpeg(bytes) → bytes
      start_live_view     : coroutine ccd_stream_start-like → dict
      stop_live_view      : coroutine ccd_stream_stop-like → dict
      logger              : logger structuré du backend
      ai_score            : optionnel — coroutine(image_jpeg_bytes) → dict | None
    """

    def __init__(self, *, indi, slew, capture, solve, altaz_to_radec,
                 debayer_fits, start_live_view, stop_live_view, logger,
                 gpsd_host: str, ai_score=None, reconnect_ccd=None):
        self.indi = indi
        self.slew = slew
        self.capture = capture
        self.solve = solve
        self.altaz_to_radec = altaz_to_radec
        self.debayer_fits = debayer_fits
        self.start_live_view = start_live_view
        self.stop_live_view = stop_live_view
        self.logger = logger
        self.gpsd_host = gpsd_host
        self.ai_score = ai_score
        self.reconnect_ccd = reconnect_ccd

        self.session_id: Optional[str] = None
        self.state = "IDLE"
        self.cells: list[dict] = []
        self.pairs: list[dict] = []
        self.logs: list[str] = []
        self.result: Optional[dict] = None
        self.site: Optional[dict] = None
        self._task: Optional[asyncio.Task] = None
        self._abort = False
        self._subscribers: list[asyncio.Queue] = []
        self._camera_lock = asyncio.Lock()  # sérialise live-view ↔ capture

    # ── Événements SSE ────────────────────────────────────────────────────────

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def _emit(self, event: str, data: Any):
        payload = {"event": event, "data": data, "t": time.time()}
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass  # abonné lent : on saute l'événement plutôt que bloquer la session

    def _log(self, msg: str):
        self.logs.append(msg)
        if len(self.logs) > 500:
            self.logs = self.logs[-400:]
        self.logger.info(f"[AutoAlign] {msg}")
        self._emit("log", msg)

    def _set_state(self, state: str):
        self.state = state
        self._emit("state", state)

    def snapshot(self) -> dict:
        return {
            "session_id": self.session_id,
            "state": self.state,
            "cells": self.cells,
            "pairs": self.pairs,
            "logs": self.logs[-100:],
            "result": self.result,
            "site": self.site,
        }

    # ── Contrôle ──────────────────────────────────────────────────────────────

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self, zone: dict, *, target_pairs: int = 3, preview_exposure: float = 1.0,
              solve_exposure: float = 4.0, max_duration_s: int = 1800,
              use_ai: bool = False, dry_run: bool = False, device_mount: str = "",
              config_lat: Optional[float] = None, config_lon: Optional[float] = None) -> str:
        if self.running:
            raise RuntimeError("Session déjà en cours")
        self.session_id = uuid.uuid4().hex[:12]
        self.state = "INIT"
        self.cells = []
        self.pairs = []
        self.logs = []
        self.result = None
        self.site = None
        self._abort = False
        self._task = asyncio.get_event_loop().create_task(
            self._run(zone, target_pairs, preview_exposure, solve_exposure,
                      max_duration_s, use_ai, dry_run, device_mount,
                      config_lat, config_lon)
        )
        return self.session_id

    async def stop(self):
        self._abort = True
        dev = getattr(self.indi, "device_mount", "") or ""
        if dev:
            self.indi.send(f'<newSwitchVector device="{dev}" name="TELESCOPE_ABORT_MOTION">'
                           f'<oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=10)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    # ── Boucle principale ─────────────────────────────────────────────────────

    async def _run(self, zone, target_pairs, preview_exposure, solve_exposure,
                   max_duration_s, use_ai, dry_run, device_mount,
                   config_lat, config_lon):
        started = time.time()
        dev_mount = device_mount or getattr(self.indi, "device_mount", "") or "Celestron GPS"
        dev_ccd = getattr(self.indi, "device_ccd", "") or "Canon DSLR EOS 600D"
        first_solve_done = False
        try:
            # ── INIT ─────────────────────────────────────────────────────────
            self._set_state("INIT")
            self._log("🚀 Session d'auto-alignement démarrée"
                      + (" (dry-run)" if dry_run else ""))

            # Après un restart backend, GEOGRAPHIC_COORD peut ne pas être encore
            # arrivé de la monture — attendre brièvement plutôt que tomber en fallback.
            for _ in range(10):
                if getattr(self.indi, "geo_received", False):
                    break
                await asyncio.sleep(0.5)

            self.site = await get_site_location(self.indi, self.gpsd_host,
                                                config_lat, config_lon)
            self._emit("site", self.site)
            self._log(f"📍 Site: lat {self.site['lat']:.5f}° lon {self.site['lon']:.5f}° "
                      f"(source: {self.site['source']})")

            # NE PLUS pousser heure/position vers la monture : la raquette
            # correctement configurée fait foi, et un push mal interprété par le
            # driver peut corrompre son modèle de pointage (incident du 5 août :
            # slews erratiques, quasi cord-wrap). Le site résolu ne sert qu'à NOS
            # conversions alt/az↔RA/DEC.
            self._log(f"🕐 Heure serveur UTC {datetime.now(timezone.utc).strftime('%H:%M:%S')} "
                      f"— monture non modifiée (raquette = source de vérité)")

            # Origine relative : ce que la monture croit être sa position maintenant
            origin_ra = getattr(self.indi, "mount_ra", 0.0)   # degrés
            origin_dec = getattr(self.indi, "mount_dec", 0.0)
            self._log(f"🧭 Origine relative monture: RA {origin_ra / 15.0:.4f}h "
                      f"DEC {origin_dec:.4f}° (référentiel interne, peut être faux — c'est normal)")

            # Tracking sidéral ON — indispensable à 1350mm
            if not dry_run:
                self.indi.send(
                    f'<newSwitchVector device="{dev_mount}" name="TELESCOPE_TRACK_STATE">'
                    f'<oneSwitch name="TRACK_ON">On</oneSwitch></newSwitchVector>')
                await asyncio.sleep(1.0)
                self._log(f"🔄 Tracking sidéral: "
                          f"{'actif' if getattr(self.indi, 'mount_tracking', False) else 'demandé (état non confirmé)'}")

                # Live view pour le scoring rapide
                async with self._camera_lock:
                    lv = await self.start_live_view()
                if lv.get("success"):
                    self._log("📹 Live view démarré pour le scoring")
                else:
                    self._log(f"⚠️ Live view indisponible ({lv.get('error')}) — "
                              f"scoring par captures courtes")

            # ── PLAN ─────────────────────────────────────────────────────────
            self._set_state("PLAN")
            self.cells = build_scan_grid(zone["altMin"], zone["altMax"],
                                         zone["azMin"], zone["azMax"])
            self._emit("grid", self.cells)
            self._log(f"🗺️ Grille: {len(self.cells)} cellules "
                      f"(pas {GRID_STEP_ALT:.2f}° alt / ~{GRID_STEP_AZ_EQ:.2f}° az)")

            # ── Boucle de scan ───────────────────────────────────────────────
            for cell in self.cells:
                if self._abort:
                    raise asyncio.CancelledError()
                if time.time() - started > max_duration_s:
                    self._log(f"⏰ Durée max atteinte ({max_duration_s}s) — arrêt du scan")
                    break
                if len(self.pairs) >= target_pairs:
                    break

                ok = await self._process_cell(cell, dev_mount, dev_ccd,
                                              preview_exposure, solve_exposure,
                                              use_ai, dry_run, first_solve_done)
                if ok:
                    first_solve_done = True

            # ── SYNCING ──────────────────────────────────────────────────────
            if len(self.pairs) >= 2 and not dry_run:
                await self._finalize_sync(dev_mount, zone)
            elif dry_run:
                self._set_state("DONE")
                self.result = {"success": True, "dry_run": True,
                               "cells_visited": sum(1 for c in self.cells
                                                    if c["status"] != "pending")}
                self._log("✅ Dry-run terminé")
            else:
                self._set_state("FAILED")
                self.result = {"success": False,
                               "error": f"Seulement {len(self.pairs)} paire(s) résolue(s) "
                                        f"(minimum 2). Zone trop pauvre en étoiles ?",
                               "pairs": self.pairs}
                self._log(f"❌ Alignement impossible: {len(self.pairs)} paire(s) seulement")

        except asyncio.CancelledError:
            self._set_state("ABORTED")
            self.result = {"success": False, "error": "Session annulée", "pairs": self.pairs}
            self._log("🛑 Session annulée")
        except Exception as e:
            self.logger.error(f"[AutoAlign] Session error: {e}", exc_info=True)
            self._set_state("FAILED")
            self.result = {"success": False, "error": str(e), "pairs": self.pairs}
            self._log(f"❌ Erreur de session: {e}")
        finally:
            # Toujours relâcher proprement le live view
            try:
                async with self._camera_lock:
                    await self.stop_live_view()
            except Exception:
                pass
            self._emit("done", self.result or {"success": False})

    # ── Traitement d'une cellule ──────────────────────────────────────────────

    async def _process_cell(self, cell, dev_mount, dev_ccd, preview_exposure,
                            solve_exposure, use_ai, dry_run, first_solve_done) -> bool:
        """Slew → settle → score → (capture → solve). Retourne True si paire ajoutée."""
        i = cell["i"]
        self._set_state("SLEWING")
        cell["status"] = "slewing"
        self._emit("cell", cell)

        # Conversion alt/az → RA/Dec au moment du slew (site résolu, heure actuelle)
        ra_hours, dec_deg = self.altaz_to_radec(cell["alt"], cell["az"],
                                                self.site["lat"], self.site["lon"])
        self._log(f"🔭 Cellule {i}: Alt {cell['alt']}° Az {cell['az']}° "
                  f"→ RA {ra_hours:.3f}h DEC {dec_deg:.2f}°")

        res = await self.slew(dev_mount, ra_hours, dec_deg, False)
        if not res.get("success"):
            cell["status"] = "failed"
            self._emit("cell", cell)
            self._log(f"⚠️ Slew échoué: {res.get('error')}")
            return False

        # Attente fin de slew (état INDI), timeout 90s
        if not await self._wait_slew_done(90):
            cell["status"] = "failed"
            self._emit("cell", cell)
            self._log("⚠️ Timeout de slew — cellule suivante")
            return False

        self._set_state("SETTLING")
        await asyncio.sleep(3.0)

        if dry_run:
            cell["status"] = "scored"
            cell["star_count"] = -1
            self._emit("cell", cell)
            return False

        # ── SCORING ──────────────────────────────────────────────────────────
        self._set_state("SCORING")
        score = await self._score_current_field(dev_ccd, preview_exposure)
        cell["star_count"] = score.get("star_count", 0)

        promising = score.get("promising", False)

        # Assistance IA optionnelle sur les cas ambigus (3-7 étoiles)
        if use_ai and not promising and 3 <= score.get("star_count", 0) <= 7 and self.ai_score:
            try:
                ai = await asyncio.wait_for(self.ai_score(score.get("_jpeg", b"")), timeout=20)
                if ai and ai.get("solvable"):
                    promising = True
                    self._log(f"🤖 IA: champ jugé résoluble "
                              f"(~{ai.get('est_star_count', '?')} étoiles)")
            except Exception as e:
                self._log(f"🤖 IA indisponible ({e}) — verdict local conservé")

        if not promising:
            cell["status"] = "skipped"
            self._emit("cell", cell)
            self._log(f"  ⏭️ {score.get('star_count', 0)} étoile(s) — champ pauvre, suivant "
                      f"(fond {score.get('background')}, σ {score.get('sigma')})")
            return False

        self._log(f"  ⭐ {score['star_count']} étoiles détectées — capture pleine résolution")

        # ── CAPTURING ────────────────────────────────────────────────────────
        self._set_state("CAPTURING")
        cell["status"] = "solving"
        self._emit("cell", cell)

        frame = await self._full_capture(dev_ccd, solve_exposure)
        if frame is None:
            cell["status"] = "failed"
            self._emit("cell", cell)
            self._log("  ⚠️ Capture pleine résolution échouée")
            return False

        # ── SOLVING ──────────────────────────────────────────────────────────
        self._set_state("SOLVING")
        reported_ra = getattr(self.indi, "mount_ra", 0.0)   # degrés
        reported_dec = getattr(self.indi, "mount_dec", 0.0)
        radius = 10.0 if first_solve_done and self.pairs else 45.0

        solve_res = await asyncio.to_thread(
            self.solve, frame, reported_ra / 15.0, reported_dec, radius)
        if not solve_res.get("success"):
            # Retry blind (sans hint) une fois — la monture peut être très décalée
            self._log(f"  🔁 Solve hinté échoué ({solve_res.get('error')}) — retry blind")
            solve_res = await asyncio.to_thread(self.solve, frame, None, None, None)

        if not solve_res.get("success"):
            cell["status"] = "failed"
            self._emit("cell", cell)
            self._log(f"  ❌ Solve échoué: {solve_res.get('error')}")
            return False

        solved_ra_h = solve_res["ra"]     # heures décimales
        solved_dec = solve_res["dec"]
        pair = {
            "reported_ra_h": reported_ra / 15.0, "reported_dec": reported_dec,
            "solved_ra_h": solved_ra_h, "solved_dec": solved_dec,
            "alt": cell["alt"], "az": cell["az"], "t": time.time(),
            "offset_ra_deg": (solved_ra_h * 15.0 - reported_ra),
            "offset_dec_deg": (solved_dec - reported_dec),
        }

        # Contrôle de cohérence : l'offset doit concorder avec la paire précédente (~1.5°)
        if self.pairs:
            prev = self.pairs[-1]
            d_ra = abs(pair["offset_ra_deg"] - prev["offset_ra_deg"])
            d_dec = abs(pair["offset_dec_deg"] - prev["offset_dec_deg"])
            if d_ra > 1.5 or d_dec > 1.5:
                cell["status"] = "failed"
                self._emit("cell", cell)
                self._log(f"  ⚠️ Solve incohérent avec la paire précédente "
                          f"(ΔRA {d_ra:.2f}° ΔDEC {d_dec:.2f}°) — écarté")
                return False

        self.pairs.append(pair)
        cell["status"] = "solved"
        self._emit("cell", cell)
        self._emit("pair", pair)
        self._log(f"  ✅ Résolu: RA {solved_ra_h:.4f}h DEC {solved_dec:.4f}° "
                  f"(offset ΔRA {pair['offset_ra_deg']:.2f}° ΔDEC {pair['offset_dec_deg']:.2f}°) "
                  f"— paire {len(self.pairs)}")
        return True

    # ── Sous-étapes ───────────────────────────────────────────────────────────

    async def _wait_slew_done(self, timeout_s: float) -> bool:
        deadline = time.time() + timeout_s
        # Laisser le temps à l'état de passer Busy
        await asyncio.sleep(1.0)
        while time.time() < deadline:
            if self._abort:
                raise asyncio.CancelledError()
            if getattr(self.indi, "mount_slew_state", "Idle") != "Busy":
                return True
            await asyncio.sleep(0.5)
        return False

    async def _grab_live_frame(self, timeout_s: float = 5.0) -> Optional[bytes]:
        """Attend une nouvelle frame live view via frame_condition (thread-safe)."""
        current = self.indi.frame_count

        def wait_new():
            with self.indi.frame_condition:
                self.indi.frame_condition.wait_for(
                    lambda: self.indi.frame_count != current, timeout=timeout_s)
                return self.indi.latest_frame if self.indi.frame_count != current else None

        return await asyncio.to_thread(wait_new)

    async def _score_current_field(self, dev_ccd: str, preview_exposure: float) -> dict:
        """Score via live view si actif, sinon capture courte. Adaptatif."""
        if getattr(self.indi, "live_view_active", False):
            best = {"star_count": 0, "promising": False}
            for _ in range(3):
                frame = await self._grab_live_frame()
                if frame:
                    s = score_frame(frame, self.debayer_fits)
                    s["_jpeg"] = frame
                    if s["star_count"] > best.get("star_count", 0) or "star_count" not in best:
                        best = s
            if best.get("promising") or best.get("star_count", 0) > 0:
                return best
            # Live view vide → tenter une capture courte (plus sensible)

        # Capture courte preview — plus longue exposition = plus d'étoiles
        async with self._camera_lock:
            frame = await self._capture_and_wait(dev_ccd, preview_exposure, timeout_s=75)
        if frame is None:
            return {"star_count": 0, "promising": False, "error": "capture failed"}
        s = score_frame(frame, self.debayer_fits)
        if frame[:6] != b"SIMPLE":
            s["_jpeg"] = frame
        return s

    async def _capture_and_wait(self, dev_ccd: str, exposure: float,
                                timeout_s: float) -> Optional[bytes]:
        """Lance une capture et attend l'arrivée du BLOB FITS (download RAW 25-35s).

        Attend spécifiquement une frame FITS (préfixe SIMPLE) : des frames MJPEG
        du live view peuvent encore arriver juste après son arrêt et incrémenter
        frame_count — les prendre pour la capture enverrait un preview de 40KB
        au solveur au lieu du RAW."""
        current = self.indi.frame_count
        res = await self.capture(dev_ccd, exposure, True)
        if not res.get("success"):
            return None

        def wait_fits_frame():
            deadline = time.time() + timeout_s
            last_seen = current
            while time.time() < deadline:
                remaining = deadline - time.time()
                with self.indi.frame_condition:
                    seen = last_seen
                    self.indi.frame_condition.wait_for(
                        lambda: self.indi.frame_count != seen,
                        timeout=min(remaining, 5.0))
                    if self.indi.frame_count != last_seen:
                        last_seen = self.indi.frame_count
                        frame = self.indi.latest_frame
                        if frame and frame[:6] == b"SIMPLE":
                            return frame
                        # frame live view résiduelle — on continue d'attendre le FITS
            return None

        return await asyncio.to_thread(wait_fits_frame)

    async def _full_capture(self, dev_ccd: str, exposure: float) -> Optional[bytes]:
        """Capture pleine résolution pour le solve. Stoppe/relance le live view autour.

        Reconnecte la caméra avant la capture : une fois le live view lancé, le
        driver Canon reste coincé en résolution viewfinder (1056×704 au lieu de
        5184×3456) même après STREAM_OFF — seule une reconnexion restaure la
        pleine résolution (vérifié le 5 août sur l'EOS 600D)."""
        async with self._camera_lock:
            was_live = getattr(self.indi, "live_view_active", False)
            if was_live:
                await self.stop_live_view()
                await asyncio.sleep(1.0)
            if self.reconnect_ccd is not None:
                self._log("  🔌 Reconnexion caméra (restauration pleine résolution)...")
                try:
                    rec = await self.reconnect_ccd()
                    if not rec.get("success"):
                        self._log(f"  ⚠️ Reconnexion caméra: {rec.get('error')} — capture quand même")
                except Exception as e:
                    self._log(f"  ⚠️ Reconnexion caméra échouée ({e}) — capture quand même")
            frame = None
            try:
                frame = await self._capture_and_wait(dev_ccd, exposure, timeout_s=90)
            finally:
                if was_live:
                    try:
                        await self.start_live_view()
                    except Exception as e:
                        self._log(f"⚠️ Live view non relancé: {e}")
            return frame

    async def _finalize_sync(self, dev_mount: str, zone: dict):
        """SYNC unique à la meilleure paire (la plus proche du centre de zone)."""
        self._set_state("SYNCING")
        center_alt = (zone["altMin"] + zone["altMax"]) / 2.0
        az_span = (zone["azMax"] - zone["azMin"]) % 360.0
        center_az = (zone["azMin"] + az_span / 2.0) % 360.0

        def dist(p):
            d_az = min(abs(p["az"] - center_az), 360.0 - abs(p["az"] - center_az))
            return (p["alt"] - center_alt) ** 2 + d_az ** 2

        best = min(self.pairs, key=dist)

        # Re-slew au point exact de la meilleure paire n'est pas nécessaire :
        # on SYNC la position COURANTE de la monture sur les coords résolues de
        # la DERNIÈRE paire (le télescope y est encore, il tracke).
        last = self.pairs[-1]
        self._log(f"🔄 SYNC final: la monture pointe RA {last['reported_ra_h']:.4f}h "
                  f"(croyance) → recalée sur RA {last['solved_ra_h']:.4f}h "
                  f"DEC {last['solved_dec']:.4f}° (réalité résolue)")
        res = await self.slew(dev_mount, last["solved_ra_h"], last["solved_dec"], True)

        # Persistance des paires pour le futur modèle de pointage logiciel
        try:
            with open(PAIRS_FILE, "w") as f:
                json.dump({"t": time.time(), "site": self.site,
                           "pairs": self.pairs}, f, indent=2)
        except OSError as e:
            self._log(f"⚠️ Persistance des paires échouée: {e}")

        # Tracking doit rester actif
        self.indi.send(
            f'<newSwitchVector device="{dev_mount}" name="TELESCOPE_TRACK_STATE">'
            f'<oneSwitch name="TRACK_ON">On</oneSwitch></newSwitchVector>')

        if res.get("success"):
            self._set_state("DONE")
            self.result = {"success": True, "pairs": self.pairs,
                           "sync": {"ra_h": last["solved_ra_h"], "dec": last["solved_dec"]},
                           "best_pair_index": self.pairs.index(best),
                           "site_source": self.site["source"]}
            self._log(f"✅ Alignement figé — {len(self.pairs)} paires, tracking actif")
        else:
            self._set_state("FAILED")
            self.result = {"success": False, "error": f"SYNC échoué: {res.get('error')}",
                           "pairs": self.pairs}
            self._log(f"❌ SYNC final échoué: {res.get('error')}")
