# server/station_setup.py
"""
Mise en station automatique : un seul lancement, sans intervention.

Enchaîne ce qui se faisait à la main, assistant par assistant :

  1. PRECHECK    — monture, caméra et liaison série saines, encodeurs frais.
  2. COARSE_SYNC — calage grossier du modèle de pointage sur les ENCODEURS
                   (tube horizontal sur le repère du trépied = direction connue),
                   pour que les GoTo du balayage visent là où on le pense.
  3. SURVEY      — balayage à gros pas de toute la zone mécaniquement permise ;
                   chaque case note combien d'étoiles la caméra voit.
  4. LIMITS      — carte d'horizon : là où il n'y a pas d'étoiles, il y a un
                   obstacle. Donne la zone d'observation réelle.
  5. ALIGN       — alignement par reconnaissance du champ sur 2 à 3 points de
                   cette zone (session AutoAlign existante).
  6. FOCUS       — focus numérique calculé sur la dernière image résolue.

Aucune dépendance vers main.py : tout est injecté, comme pour AutoAlignSession.

Sécurité : ce module ne parle jamais à la monture directement. Chaque
déplacement passe par la fonction de pointage du backend, donc par ses
garde-fous (limites d'altitude, enroulement du câble, fraîcheur des encodeurs,
liaison série). Un arrêt demandé coupe le mouvement en cours et rien ne repart.

Référentiels : la carte d'horizon est exprimée en angles ENCODEUR (altitude
absolue, azimut signé autour du repère du trépied). C'est le référentiel des
limites mécaniques ; il ne dépend pas du modèle d'alignement.
"""

import asyncio
import json
import os
import time
from typing import Any, Optional

HORIZON_FILE = os.path.join(os.path.dirname(__file__), "station_horizon.json")

# Pas du balayage, en degrés. Volontairement gros : il s'agit de trouver les
# obstacles et les zones riches en étoiles, pas de cartographier le ciel.
SURVEY_ALT_STEP = 15.0
SURVEY_AZ_STEP = 20.0
# Marge gardée à l'intérieur des limites mécaniques.
SURVEY_MARGIN = 3.0
# Sous cette hauteur : brume, réfraction, obstacles proches — inutile d'y viser.
SURVEY_ALT_FLOOR = 15.0
# Une case compte comme « ciel » à partir de ce nombre d'étoiles en live view.
MIN_STARS_FOR_SKY = 3
# En dessous de ce nombre de cases « ciel », on ne conclut rien : ciel couvert,
# cache en place ou mise au point très éloignée.
MIN_SKY_CELLS = 3
# Au-delà, la correction numérique ne rattrape plus le flou.
HFR_PHYSICAL_REFOCUS = 6.0
# Écart de hauteur toléré entre modèle et encodeur juste après le calage.
COARSE_SYNC_MAX_GAP_DEG = 3.0

STEPS = [
    ("precheck", "Vérifications"),
    ("coarse_sync", "Calage sur le repère du trépied"),
    ("survey", "Balayage de la zone"),
    ("limits", "Carte d'horizon"),
    ("align", "Alignement sur le ciel"),
    ("focus", "Focus numérique"),
]


class SetupError(Exception):
    """Échec attendu, avec un message destiné à l'opérateur."""


# ─────────────────────────────────────────────────────────────────────────────
# Logique pure — testable sans monture ni ciel
# ─────────────────────────────────────────────────────────────────────────────

def encoder_to_compass_az(enc_az_signed: float, reference_az: float = 180.0) -> float:
    """Azimut boussole d'un azimut encodeur signé (ouest positif).

    `reference_az` est la direction réelle du repère du trépied : 180° (plein
    sud) sur le site de Matt, vérifié à la boussole le 5 août 2026.
    """
    return (reference_az + enc_az_signed) % 360.0


def _steps(lo: float, hi: float, step: float) -> list[float]:
    """Valeurs régulières de lo à hi inclus ; une seule si la plage est trop étroite."""
    if hi < lo:
        return []
    n = max(1, int(round((hi - lo) / step)) + 1)
    if n == 1:
        return [round((lo + hi) / 2.0, 2)]
    return [round(lo + i * (hi - lo) / (n - 1), 2) for i in range(n)]


def plan_survey(alt_min: float, alt_max: float, az_min: float, az_max: float,
                reference_az: float = 180.0) -> list[dict]:
    """Cases du balayage, en serpentin, à l'intérieur des limites mécaniques.

    Entrées et champs `enc_alt` / `enc_az` en angles ENCODEUR. Les champs
    `alt` / `az` sont la même direction en coordonnées ciel (azimut boussole),
    celles que la session de balayage convertit en ascension droite/déclinaison.
    """
    alts = _steps(max(alt_min + SURVEY_MARGIN, SURVEY_ALT_FLOOR),
                  alt_max - SURVEY_MARGIN, SURVEY_ALT_STEP)
    azs = _steps(az_min + SURVEY_MARGIN, az_max - SURVEY_MARGIN, SURVEY_AZ_STEP)
    cells: list[dict] = []
    for row, alt in enumerate(alts):
        row_az = azs if row % 2 == 0 else list(reversed(azs))
        for az in row_az:
            cells.append({
                "enc_alt": alt, "enc_az": az,
                "alt": alt, "az": round(encoder_to_compass_az(az, reference_az), 2),
            })
    for i, c in enumerate(cells):
        c["i"] = i
        c["status"] = "pending"
    return cells


def horizon_from_cells(cells: list[dict], min_stars: int = MIN_STARS_FOR_SKY) -> dict:
    """Carte d'horizon tirée du balayage.

    Une case est « ciel » si la caméra y a vu assez d'étoiles, « masquée » si
    elle a été visée sans rien y voir, « non atteinte » si le pointage a été
    refusé ou a échoué (limite mécanique, garde-fou).
    """
    sky = [c for c in cells if c.get("status") == "scored"
           and (c.get("star_count") or 0) >= min_stars]
    blocked = [c for c in cells if c.get("status") == "scored"
               and (c.get("star_count") or 0) < min_stars]
    unreached = [c for c in cells if c.get("status") != "scored"]

    # Profil : pour chaque azimut visé, la plus basse hauteur où le ciel est visible.
    profile = []
    for az in sorted({c["enc_az"] for c in cells}):
        col = [c["enc_alt"] for c in sky if c["enc_az"] == az]
        profile.append({"enc_az": az, "min_sky_alt": min(col) if col else None})

    result: dict[str, Any] = {
        "visible": len(sky) >= MIN_SKY_CELLS,
        "sky_cells": len(sky),
        "blocked_cells": len(blocked),
        "unreached_cells": len(unreached),
        "total_cells": len(cells),
        "profile": profile,
        "zone": None,
        "best_cell": None,
    }
    if sky:
        result["zone"] = {
            "altMin": min(c["enc_alt"] for c in sky),
            "altMax": max(c["enc_alt"] for c in sky),
            "azMin": min(c["enc_az"] for c in sky),
            "azMax": max(c["enc_az"] for c in sky),
        }
        best = max(sky, key=lambda c: c.get("star_count") or 0)
        result["best_cell"] = {"enc_alt": best["enc_alt"], "enc_az": best["enc_az"],
                               "star_count": best.get("star_count")}
    return result


def align_zone_from_horizon(horizon: dict, reference_az: float = 180.0) -> dict:
    """Zone à confier à l'alignement, en coordonnées ciel (azimut boussole).

    Élargie d'un demi-pas de balayage autour des cases « ciel » : la zone libre
    ne s'arrête pas au centre de la dernière case où l'on a vu des étoiles.
    """
    z = horizon["zone"]
    half_alt = SURVEY_ALT_STEP / 2.0
    half_az = SURVEY_AZ_STEP / 2.0
    return {
        "altMin": max(SURVEY_ALT_FLOOR, z["altMin"] - half_alt),
        "altMax": z["altMax"] + half_alt,
        "azMin": round(encoder_to_compass_az(z["azMin"] - half_az, reference_az), 2),
        "azMax": round(encoder_to_compass_az(z["azMax"] + half_az, reference_az), 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrateur
# ─────────────────────────────────────────────────────────────────────────────

class StationSetup:
    """Une seule mise en station à la fois.

    Dépendances injectées depuis main.py :
      indi            : client INDI (états de connexion, liaison série)
      get_session     : () → AutoAlignSession
      slew            : mount_slew_internal(device, ra_hours, dec_deg, sync)
      altaz_to_radec  : (alt, az, lat, lon) → (ra_hours, dec_deg)
      get_site        : coroutine () → {lat, lon, source}
      push_site_time  : (site) → None, envoie lieu et heure au pilote (bloquant)
      model_altitude  : (site) → hauteur que le modèle attribue à la visée courante
      get_limits      : () → (alt_min, alt_max, az_min, az_max) en angles encodeur
      encoder_position: () → (alt, az_signé) en degrés, ou (None, None)
      position_fresh  : () → (bool, raison)
      focus_calibrate : coroutine () → {success, profile | error}
      set_aligned     : (bool) → None, état « synchronisée sur le ciel »
      logger          : logger du backend
    """

    def __init__(self, *, indi, get_session, slew, altaz_to_radec, get_site,
                 push_site_time, model_altitude, get_limits, encoder_position, position_fresh, focus_calibrate,
                 set_aligned, logger, reference_az: float = 180.0,
                 horizon_file: str = HORIZON_FILE):
        self.indi = indi
        self.get_session = get_session
        self.slew = slew
        self.altaz_to_radec = altaz_to_radec
        self.get_site = get_site
        self.push_site_time = push_site_time
        self.model_altitude = model_altitude
        self.get_limits = get_limits
        self.encoder_position = encoder_position
        self.position_fresh = position_fresh
        self.focus_calibrate = focus_calibrate
        self.set_aligned = set_aligned
        self.logger = logger
        self.reference_az = reference_az
        self.horizon_file = horizon_file
        # Temps laissé au pilote pour digérer le calage avant le premier GoTo.
        self.settle_s = 1.5

        self.state = "IDLE"
        self.steps: list[dict] = []
        self.logs: list[str] = []
        self.result: Optional[dict] = None
        self.horizon: Optional[dict] = self._load_horizon()
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        self._task: Optional[asyncio.Task] = None
        self._abort = False

    # ── État ──────────────────────────────────────────────────────────────────

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def snapshot(self) -> dict:
        cells = getattr(self.get_session(), "cells", []) if self.state in ("SURVEY", "ALIGN") else []
        done_cells = sum(1 for c in cells if c.get("status") != "pending")
        return {
            "running": self.running,
            "state": self.state,
            "steps": self.steps,
            "progress": {"done": done_cells, "total": len(cells)} if cells else None,
            "logs": self.logs[-6:],
            "result": self.result,
            "horizon": self.horizon,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }

    def _log(self, msg: str):
        self.logs.append(msg)
        if len(self.logs) > 300:
            self.logs = self.logs[-200:]
        self.logger.info(f"[MiseEnStation] {msg}")

    def _step(self, step_id: str, status: str, detail: Optional[str] = None):
        for s in self.steps:
            if s["id"] == step_id:
                s["status"] = status
                if detail is not None:
                    s["detail"] = detail

    def _enter(self, step_id: str):
        if self._abort:
            raise asyncio.CancelledError()
        self.state = step_id.upper()
        self._step(step_id, "running")

    def _load_horizon(self) -> Optional[dict]:
        try:
            with open(self.horizon_file) as f:
                return json.load(f)
        except (OSError, ValueError):
            return None  # jamais calculée, ou fichier illisible : pas de carte

    # ── Contrôle ──────────────────────────────────────────────────────────────

    def start(self) -> None:
        if self.running:
            raise RuntimeError("Mise en station déjà en cours")
        self.state = "PRECHECK"
        self.steps = [{"id": sid, "label": label, "status": "pending", "detail": None}
                      for sid, label in STEPS]
        self.logs = []
        self.result = None
        self.started_at = time.time()
        self.finished_at = None
        self._abort = False
        self._task = asyncio.get_event_loop().create_task(self._run())

    async def stop(self) -> None:
        """Arrêt demandé : coupe le mouvement en cours, rien ne repart."""
        self._abort = True
        session = self.get_session()
        if session.running:
            await session.stop()          # envoie TELESCOPE_ABORT_MOTION
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=15)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    # ── Déroulé ───────────────────────────────────────────────────────────────

    async def _run(self):
        current = "precheck"
        try:
            self._enter(current)
            self._precheck()
            self._step(current, "done")

            current = "coarse_sync"
            self._enter(current)
            await self._coarse_sync()
            self._step(current, "done")

            current = "survey"
            self._enter(current)
            cells = await self._survey()
            self._step(current, "done", f"{len(cells)} cases visées")

            current = "limits"
            self._enter(current)
            horizon = self._limits(cells)
            z = horizon["zone"]
            self._step(current, "done",
                       f"hauteur {z['altMin']:.0f}° à {z['altMax']:.0f}°, "
                       f"azimut {z['azMin']:+.0f}° à {z['azMax']:+.0f}° du repère")

            current = "align"
            self._enter(current)
            pairs = await self._align(horizon)
            self._step(current, "done", f"{pairs} points résolus")

            current = "focus"
            self._enter(current)
            focus = await self._focus()
            self._step(current, focus["status"], focus["detail"])

            self.state = "DONE"
            self.result = {"success": True, "pairs": pairs, "focus": focus}
            self._log("✅ Mise en station terminée")
        except asyncio.CancelledError:
            self._step(current, "aborted")
            self.state = "ABORTED"
            self.result = {"success": False, "error": "Mise en station arrêtée"}
            self._log("🛑 Mise en station arrêtée")
        except SetupError as e:
            self._step(current, "failed", str(e))
            self.state = "FAILED"
            self.result = {"success": False, "step": current, "error": str(e)}
            self._log(f"❌ {e}")
        except Exception as e:  # défaut inattendu : on le dit, on ne le maquille pas
            self.logger.error(f"[MiseEnStation] Erreur inattendue: {e}", exc_info=True)
            self._step(current, "failed", str(e))
            self.state = "FAILED"
            self.result = {"success": False, "step": current, "error": str(e)}
            self._log(f"❌ Erreur inattendue : {e}")
        finally:
            self.finished_at = time.time()

    def _check_link(self):
        """Contrôle répété entre les étapes : on ne poursuit pas sur une liaison douteuse."""
        if not getattr(self.indi, "mount_connected", False):
            raise SetupError("Monture déconnectée")
        if self.indi.serial_failing():
            raise SetupError("Liaison série de la monture en panne : les ordres ne lui "
                             "parviennent plus. Vérifiez l'alimentation du Pi et l'adaptateur USB.")
        if getattr(self.indi, "link_suspect", False):
            raise SetupError("Liaison monture présumée morte : un mouvement est resté sans effet.")

    def _precheck(self):
        if not getattr(self.indi, "connected", False):
            raise SetupError("Serveur INDI injoignable")
        self._check_link()
        if not getattr(self.indi, "ccd_connected", False):
            raise SetupError("Caméra hors ligne")
        if self.get_session().running:
            raise SetupError("Un alignement automatique est déjà en cours")
        fresh, why = self.position_fresh()
        if not fresh:
            raise SetupError(why or "Position de la monture non rafraîchie")
        alt, az = self.encoder_position()
        if alt is None or az is None:
            raise SetupError("Encodeurs de la monture non reçus")
        self._log(f"🔎 Monture et caméra prêtes — encodeurs hauteur {alt:.1f}°, azimut {az:+.1f}°")

    async def _coarse_sync(self):
        """Cale le modèle de pointage sur la direction donnée par les encodeurs.

        Avant tout alignement, le pilote convertit ses angles moteurs avec un
        modèle vide : la position céleste qu'il annonce peut être n'importe où,
        et un GoTo viserait à côté. Les encodeurs, eux, sont fiables dès
        l'allumage si le tube a été posé sur le repère du trépied.
        Ce calage est grossier (quelques degrés) : l'étape ALIGN le remplace.
        """
        alt, az = self.encoder_position()
        site = await self.get_site()
        # Le pilote convertit ciel ↔ moteurs avec SON lieu et SON heure. S'ils
        # diffèrent des nôtres, un GoTo part ailleurs que prévu : le 20 novembre
        # 2026, viser 15° de hauteur a mené le tube à −30°. On les lui impose.
        await asyncio.to_thread(self.push_site_time, site)
        await asyncio.sleep(self.settle_s)
        compass_az = encoder_to_compass_az(az, self.reference_az)
        ra_h, dec = self.altaz_to_radec(alt, compass_az, site["lat"], site["lon"])
        dev = getattr(self.indi, "device_mount", "") or ""
        self._log(f"🧭 Calage grossier : hauteur {alt:.1f}°, azimut {compass_az:.1f}° "
                  f"→ AD {ra_h:.3f}h, Déc {dec:+.2f}°")
        res = await self.slew(dev, ra_h, dec, True)
        if not res.get("success"):
            raise SetupError(f"Calage grossier refusé : {res.get('error')}")
        # Un calage sur le repère n'est pas un alignement : la position reste
        # marquée « non alignée » jusqu'à la reconnaissance du ciel.
        self.set_aligned(False)
        await asyncio.sleep(self.settle_s)
        # Preuve que le calage a pris : le modèle doit maintenant situer le
        # tube à la hauteur lue sur l'encodeur. Sinon on ne bouge pas.
        model_alt = self.model_altitude(site)
        if abs(model_alt - alt) > COARSE_SYNC_MAX_GAP_DEG:
            raise SetupError(
                f"Le calage n'a pas pris : le modèle situe le tube à {model_alt:+.0f}° "
                f"de hauteur, l'encodeur lit {alt:+.0f}°. Aucun déplacement n'a été lancé.")

    async def _run_session(self, **kwargs) -> dict:
        session = self.get_session()
        session.start(**kwargs)
        await session.wait()
        if self._abort:
            raise asyncio.CancelledError()
        self._check_link()
        return session.result or {"success": False, "error": "Session sans résultat"}

    async def _survey(self) -> list[dict]:
        alt_min, alt_max, az_min, az_max = self.get_limits()
        grid = plan_survey(alt_min, alt_max, az_min, az_max, self.reference_az)
        if not grid:
            raise SetupError("Limites mécaniques trop étroites pour un balayage")
        self._log(f"🗺️ Balayage : {len(grid)} cases dans les limites "
                  f"hauteur {alt_min:.0f}–{alt_max:.0f}°, azimut {az_min:+.0f}–{az_max:+.0f}°")
        res = await self._run_session(zone={}, grid=grid, score_only=True,
                                      max_duration_s=1800)
        if not res.get("success"):
            raise SetupError(f"Balayage interrompu : {res.get('error')}")
        return list(self.get_session().cells)

    def _limits(self, cells: list[dict]) -> dict:
        horizon = horizon_from_cells(cells)
        if not horizon["visible"]:
            raise SetupError(
                f"Aucune étoile vue sur {horizon['blocked_cells']} cases visées "
                f"({horizon['unreached_cells']} non atteintes) : ciel couvert, cache en place, "
                "ou mise au point physique trop éloignée. Carte d'horizon non enregistrée.")
        horizon["computed_at"] = time.time()
        horizon["reference_az"] = self.reference_az
        try:
            with open(self.horizon_file, "w") as f:
                json.dump(horizon, f, indent=2)
        except OSError as e:
            self._log(f"⚠️ Carte d'horizon non enregistrée sur disque : {e}")
        self.horizon = horizon
        self._log(f"🌄 Ciel visible sur {horizon['sky_cells']} cases, "
                  f"{horizon['blocked_cells']} masquées, {horizon['unreached_cells']} non atteintes")
        return horizon

    async def _align(self, horizon: dict) -> int:
        zone = align_zone_from_horizon(horizon, self.reference_az)
        self._log(f"🎯 Alignement dans la zone libre : hauteur {zone['altMin']:.0f}–{zone['altMax']:.0f}°, "
                  f"azimut {zone['azMin']:.0f}–{zone['azMax']:.0f}°")
        res = await self._run_session(zone=zone, target_pairs=3, max_duration_s=1800)
        if not res.get("success"):
            raise SetupError(f"Alignement non abouti : {res.get('error')}")
        self.set_aligned(True)
        return len(res.get("pairs") or [])

    async def _focus(self) -> dict:
        """Focus numérique sur la dernière image résolue. Un échec ici ne remet
        pas en cause l'alignement : l'étape est signalée, pas bloquante."""
        res = await self.focus_calibrate()
        if not res.get("success"):
            self._log(f"⚠️ Focus numérique non calculé : {res.get('error')}")
            return {"status": "warning", "detail": res.get("error") or "non calculé", "hfr": None}
        profile = res.get("profile") or {}
        hfr = profile.get("hfr_reference") or profile.get("hfr")
        if isinstance(hfr, (int, float)) and hfr > HFR_PHYSICAL_REFOCUS:
            detail = (f"étoiles larges (HFR {hfr:.1f}) : la correction numérique ne suffira pas, "
                      "reprenez la mise au point à la molette")
            self._log(f"⚠️ Focus : {detail}")
            return {"status": "warning", "detail": detail, "hfr": hfr}
        detail = f"profil calculé (HFR {hfr:.1f})" if isinstance(hfr, (int, float)) else "profil calculé"
        self._log(f"🔬 Focus numérique : {detail}")
        return {"status": "done", "detail": detail, "hfr": hfr}
