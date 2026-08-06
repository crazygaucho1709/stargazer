# server/stacking.py
"""
Empilement et post-traitement — issu de la session de terrain du 5 août 2026.

RÉPARTITION DU TRAVAIL

  Siril (CLI, macmini) fait le gros œuvre : calibration par le master dark,
  alignement global sur les étoiles avec ROTATION, et empilement avec rejet.
  Son `register` gère la rotation de champ, indispensable sur une alt-az :
  mesurée sur le terrain à ~0,13°/pose de 15 s, soit ~0,5°/minute. Un recalage
  en translation seule laisse les étoiles en arcs sur les bords.

  Python fait ce que Siril fait mal ou trop grossièrement sur nos images :
  construction du master dark, retrait de gradient, balance des blancs et
  étirement. Ces trois derniers ont été réglés sur les données réelles de la
  session et donnent un fond à 9,1 d'écart-type là où une première version
  naïve plafonnait à 16,7.

  Un repli 100 % Python existe si Siril échoue ou n'est pas installé : il est
  plus lent mais il a produit le résultat validé le 5 août.

ENSEIGNEMENTS DE TERRAIN CÂBLÉS ICI

  * Le master dark n'est PAS optionnel. Sur les images du 5 août, 100 % des
    « étoiles » détectées avant soustraction étaient des pixels chauds — 489
    points sur 489. Sans dark, l'empilement les aligne et les renforce, et on
    empile de faux astres.
  * Un master dark n'est valable que pour SON couple (exposition, ISO) : 856
    pixels chauds à 0,1 s contre 1438 à 15 s sur le même capteur.
  * La médiane, jamais la moyenne, pour le master dark : elle rejette le bruit
    aléatoire et ne garde que les défauts persistants.
  * Le point noir de l'étirement doit se placer AU-DESSUS du plancher de bruit.
    Placé dessous, il amplifie le grain autant que le signal.
  * Le JPEG natif du boîtier descend en ~10 s contre ~60 s pour le FITS 16 bits
    (35,8 Mo à ~2 Mo/s depuis le Pi 3B). Pour le cadrage, le test et les
    séries longues, c'est le bon compromis.
"""

from __future__ import annotations

import glob
import json
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger("stargazer-backend")

# Emplacement de la bibliothèque de master darks, indexée par (exposition, ISO).
DARK_LIBRARY_DIRNAME = "darks"

# Un master dark reste pertinent tant que la température du capteur n'a pas
# franchement bougé. On le considère périmé au-delà de ce délai.
DARK_MAX_AGE_H = 12.0

SIRIL_CANDIDATES = ("/opt/homebrew/bin/siril-cli", "siril-cli")


# ─────────────────────────────────────────────────────────────────────────────
# Résultats
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class StackStats:
    """Mesures objectives de la pile — sert aussi d'entrée aux conseils IA."""
    frames_total: int = 0
    frames_used: int = 0
    frames_rejected: int = 0
    exposure_s: float = 0.0
    iso: Optional[str] = None
    integration_s: float = 0.0
    field_rotation_deg: float = 0.0
    background_median: float = 0.0
    background_sigma: float = 0.0
    background_sigma_single: float = 0.0
    noise_gain: float = 1.0
    star_count: int = 0
    hfr_px: Optional[float] = None
    saturated_pct: float = 0.0
    dark_applied: bool = False
    dark_hot_pixels: int = 0
    engine: str = "python"

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────────────────────
# Master dark
# ─────────────────────────────────────────────────────────────────────────────

def dark_key(exposure_s: float, iso) -> str:
    """Clé de bibliothèque. Un dark ne vaut que pour son exposition ET son ISO."""
    return f"dark_e{float(exposure_s):g}_i{str(iso or 'auto')}"


def dark_library_dir(storage_path: str) -> str:
    d = os.path.join(storage_path, DARK_LIBRARY_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def build_master_dark(paths: list[str], storage_path: str,
                      exposure_s: float, iso) -> dict:
    """Construit un master dark par MÉDIANE et l'archive dans la bibliothèque.

    Médiane et non moyenne : elle écarte le bruit de lecture aléatoire et ne
    conserve que les pixels défectueux, présents sur toutes les poses.
    """
    imgs = []
    for p in paths:
        im = cv2.imread(p)
        if im is None:
            logger.warning(f"[Dark] illisible, ignoré : {p}")
            continue
        imgs.append(im.astype(np.float32))
    if len(imgs) < 2:
        raise ValueError(
            f"Master dark impossible : {len(imgs)} pose(s) exploitable(s), "
            f"2 minimum (la médiane n'a pas de sens en dessous)")

    shapes = {i.shape for i in imgs}
    if len(shapes) > 1:
        raise ValueError(
            f"Les darks n'ont pas tous la même taille ({shapes}) — "
            f"le format de capture a changé en cours de série")

    master = np.median(np.stack(imgs), axis=0)
    gray = cv2.cvtColor(master.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    hot = int((gray > 40).sum())

    key = dark_key(exposure_s, iso)
    out = os.path.join(dark_library_dir(storage_path), key + ".npy")
    np.save(out, master)

    # Les poses BRUTES sont conservées à côté du master : Siril exige de
    # construire lui-même son master dans sa propre chaîne de normalisation
    # (voir stack_siril). Le .npy ne sert qu'au repli Python.
    raw_dir = os.path.join(dark_library_dir(storage_path), key + "_raw")
    shutil.rmtree(raw_dir, ignore_errors=True)
    os.makedirs(raw_dir, exist_ok=True)
    kept = []
    for i, p in enumerate(paths, start=1):
        if cv2.imread(p) is None:
            continue
        dst = os.path.join(raw_dir, f"dark_{i:04d}{os.path.splitext(p)[1] or '.jpg'}")
        shutil.copy2(p, dst)
        kept.append(dst)

    meta = {
        "key": key, "path": out, "raw_dir": raw_dir, "frames": len(imgs),
        "exposure_s": float(exposure_s), "iso": str(iso or "auto"),
        "hot_pixels": hot, "width": master.shape[1], "height": master.shape[0],
        "created_at": os.path.getmtime(out),
    }
    with open(out.replace(".npy", ".json"), "w") as f:
        json.dump(meta, f, indent=2)
    logger.info(f"[Dark] master {key} : {len(imgs)} poses, {hot} pixels chauds")
    return meta


def load_master_dark(storage_path: str, exposure_s: float, iso) -> Optional[tuple]:
    """Rend (array, meta) si un master dark correspond, sinon None.

    Aucune tolérance sur l'exposition : les pixels chauds croissent avec elle
    (856 à 0,1 s contre 1438 à 15 s sur le 600D). Appliquer un dark de la
    mauvaise pose sur-corrige ou sous-corrige, dans les deux cas c'est faux.
    """
    key = dark_key(exposure_s, iso)
    npy = os.path.join(dark_library_dir(storage_path), key + ".npy")
    if not os.path.exists(npy):
        return None
    try:
        arr = np.load(npy)
    except (ValueError, OSError) as e:
        logger.error(f"[Dark] {key} illisible : {e}")
        return None
    meta = {}
    jsn = npy.replace(".npy", ".json")
    if os.path.exists(jsn):
        try:
            with open(jsn) as f:
                meta = json.load(f)
        except json.JSONDecodeError:
            pass
    return arr, meta


def list_master_darks(storage_path: str) -> list[dict]:
    out = []
    import time as _t
    now = _t.time()
    for j in sorted(glob.glob(os.path.join(dark_library_dir(storage_path), "*.json"))):
        try:
            with open(j) as f:
                m = json.load(f)
        except json.JSONDecodeError:
            continue
        age_h = (now - m.get("created_at", 0)) / 3600.0
        m["age_hours"] = round(age_h, 1)
        m["stale"] = age_h > DARK_MAX_AGE_H
        out.append(m)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Post-traitement (validé sur les données du 5 août)
# ─────────────────────────────────────────────────────────────────────────────

def remove_gradient(img: np.ndarray, order: int = 2, grid: int = 48) -> np.ndarray:
    """Retire le fond par surface polynomiale ajustée sur des tuiles écrêtées.

    On échantillonne le 30ᵉ centile par tuile — insensible aux étoiles, qui
    sont ponctuelles — puis on ajuste un polynôme de degré 2. Un flou gaussien
    large ferait le même travail mais absorberait aussi les nébulosités
    étendues réelles ; le polynôme ne suit que les variations lentes
    (vignetage, pollution lumineuse, glow d'amplificateur).
    """
    h, w = img.shape[:2]
    ys = np.linspace(0, h - 1, grid).astype(int)
    xs = np.linspace(0, w - 1, grid).astype(int)
    gy_full, gx_full = np.mgrid[0:h, 0:w]
    gy_full = gy_full / h
    gx_full = gx_full / w
    out = img.copy()

    def basis(Y, X):
        t = [np.ones_like(Y), Y, X, Y * X, Y ** 2, X ** 2]
        if order >= 3:
            t += [Y ** 3, X ** 3, Y ** 2 * X, Y * X ** 2]
        return t

    for c in range(img.shape[2]):
        ch = img[:, :, c]
        pts, vals = [], []
        for y in ys:
            for x in xs:
                y0, y1 = max(0, y - 40), min(h, y + 40)
                x0, x1 = max(0, x - 40), min(w, x + 40)
                vals.append(np.percentile(ch[y0:y1, x0:x1], 30))
                pts.append((y / h, x / w))
        P = np.array(pts, dtype=np.float64)
        A = np.vstack(basis(P[:, 0], P[:, 1])).T
        coef, *_ = np.linalg.lstsq(A, np.array(vals, dtype=np.float64), rcond=None)
        surf = sum(co * t for co, t in zip(coef, basis(gy_full, gx_full)))
        out[:, :, c] = ch - surf
    return out


def star_white_balance(img: np.ndarray) -> tuple[np.ndarray, dict]:
    """Égalise les canaux sur les étoiles elles-mêmes.

    Une population stellaire quelconque est statistiquement neutre : tout écart
    entre canaux mesuré sur les étoiles vient du capteur, pas du ciel. Mesuré
    le 5 août sur le 600D : B ×0,756, V ×1,035, R ×1,408 — matrice de Bayer à
    deux verts, plus le filtre IR-cut d'origine.
    """
    g = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    mask = cv2.GaussianBlur(g, (0, 0), 1.5) > 40
    if mask.sum() < 200:
        return img, {}
    means = [float(img[:, :, c][mask].mean()) for c in range(img.shape[2])]
    target = float(np.mean(means))
    out = img.copy()
    gains = {}
    for c, name in enumerate(("B", "G", "R")):
        if means[c] > 1e-6:
            gains[name] = round(target / means[c], 3)
            out[:, :, c] = img[:, :, c] * (target / means[c])
    return out, gains


def asinh_stretch(img: np.ndarray, black_pct: float = 72.0,
                  soft: float = 0.30) -> np.ndarray:
    """Étirement asinh : linéaire sur le faible, logarithmique sur le fort.

    Le point noir DOIT se placer au-dessus du plancher de bruit. Réglé à 25 %
    lors d'un essai du 5 août, il amplifiait le grain autant que le signal et
    faisait remonter l'écart-type du fond de 16,7 à 24,5 — pire que sans
    traitement. Avec peu de pose cumulée, il faut assumer de couper le très
    faible plutôt que de le remonter accompagné de son bruit.
    """
    a = np.clip(img - np.percentile(img, black_pct), 0, None)
    hi = np.percentile(a, 99.9)
    if hi <= 0:
        return np.zeros(img.shape, dtype=np.uint8)
    s = np.arcsinh((a / hi) / soft) / np.arcsinh(1.0 / soft)
    return (np.clip(s, 0, 1) * 255).astype(np.uint8)


def denoise(bgr: np.ndarray) -> np.ndarray:
    """Chrominance filtrée fort, luminance à peine — les étoiles restent nettes."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L, A, B = cv2.split(lab)
    A = cv2.medianBlur(A, 7)
    B = cv2.medianBlur(B, 7)
    L = cv2.bilateralFilter(L, 5, 18, 5)
    return cv2.cvtColor(cv2.merge([L, A, B]), cv2.COLOR_LAB2BGR)


def measure(img8: np.ndarray) -> dict:
    """Mesures objectives sur une image 8 bits déjà étirée."""
    g = cv2.cvtColor(img8, cv2.COLOR_BGR2GRAY)
    corner = g[:300, :300]
    blurred = cv2.GaussianBlur(g, (0, 0), 1.5)
    n, _, stats, _ = cv2.connectedComponentsWithStats(
        (blurred > 60).astype(np.uint8), 8)
    areas = stats[1:, cv2.CC_STAT_AREA] if n > 1 else np.array([])
    hfr = float(np.sqrt(np.median(areas) / np.pi)) if areas.size else None
    return {
        "background_median": float(np.median(g)),
        "background_sigma": float(corner.std()),
        "star_count": int(n - 1),
        "hfr_px": round(hfr, 2) if hfr else None,
        "saturated_pct": round(100.0 * float((g >= 254).sum()) / g.size, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Alignement + empilement — repli Python
# ─────────────────────────────────────────────────────────────────────────────

def _align_scale_gray(bgr: np.ndarray, scale: float) -> np.ndarray:
    g = cv2.cvtColor(bgr.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    g = cv2.resize(g, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    g = cv2.GaussianBlur(g, (0, 0), 1.2)
    g -= g.min()
    m = g.max()
    return g / m if m > 0 else g


def stack_python(light_paths: list[str], master: Optional[np.ndarray],
                 scale: float = 0.35) -> tuple[np.ndarray, np.ndarray, StackStats]:
    """Empilement Python : ECC euclidien (rotation + translation) et rejet.

    MOTION_EUCLIDEAN et non MOTION_TRANSLATION : sur une monture alt-az le
    champ tourne pendant la série. Mesuré le 5 août : +0,146° / +0,285° /
    +0,404° / +0,522° / +0,644° sur cinq poses de 15 s — une progression
    linéaire, signature de l'alt-az.
    """
    frames = []
    for p in light_paths:
        im = cv2.imread(p)
        if im is None:
            logger.warning(f"[Stack] illisible, ignorée : {p}")
            continue
        f = im.astype(np.float32)
        if master is not None and master.shape == f.shape:
            f = np.clip(f - master, 0, 255)
        frames.append(f)
    if not frames:
        raise ValueError("Aucune pose exploitable")

    st = StackStats(frames_total=len(frames), dark_applied=master is not None)
    single = frames[0].copy()
    if len(frames) == 1:
        return single, single, st

    H, W = frames[0].shape[:2]
    ref = _align_scale_gray(frames[0], scale)
    acc = frames[0].copy()
    used = 1
    rots: list[float] = []
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)

    for idx, f in enumerate(frames[1:], start=2):
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            cv2.findTransformECC(ref, _align_scale_gray(f, scale), warp,
                                 cv2.MOTION_EUCLIDEAN, crit, None, 5)
        except cv2.error:
            logger.warning(f"[Stack] pose {idx} : alignement non convergent, écartée")
            st.frames_rejected += 1
            continue
        full = warp.copy()
        full[0, 2] /= scale
        full[1, 2] /= scale
        ang = float(np.degrees(np.arctan2(full[1, 0], full[0, 0])))

        # La rotation de champ d'une alt-az est monotone et lente. Une pose qui
        # s'écarte franchement de la tendance signale un ECC parti sur un
        # minimum local ; l'empiler floute toute la pile.
        if rots:
            step = float(np.median(np.diff([0.0] + rots))) if len(rots) > 1 else rots[0]
            if abs(ang - (rots[-1] + step)) > max(0.3, abs(step) * 3):
                logger.warning(f"[Stack] pose {idx} : rotation {ang:+.3f}° incohérente, écartée")
                st.frames_rejected += 1
                continue
        rots.append(ang)
        acc += cv2.warpAffine(f, full, (W, H),
                              flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REPLICATE)
        used += 1

    st.frames_used = used
    st.field_rotation_deg = round(max(rots) - min(rots), 3) if rots else 0.0
    return acc / used, single, st


# ─────────────────────────────────────────────────────────────────────────────
# Alignement + empilement — Siril
# ─────────────────────────────────────────────────────────────────────────────

def siril_binary() -> Optional[str]:
    for c in SIRIL_CANDIDATES:
        p = shutil.which(c) if not os.path.isabs(c) else (c if os.path.exists(c) else None)
        if p:
            return p
    return None


def stack_siril(light_paths: list[str], workdir: str,
                dark_paths: Optional[list[str]] = None) -> Optional[str]:
    """Calibration + alignement global + empilement, entièrement par Siril.

    `register` aligne sur les étoiles AVEC rotation, ce qu'exige une alt-az.

    Le dark est confié à Siril sous forme de POSES BRUTES, pas de master
    pré-calculé : Siril convertit les JPEG dans son propre format interne et
    normalise l'empilement (`-norm=addscale`). Soustraire après coup un master
    calculé hors de Siril donne un résultat arithmétiquement faux — essayé le
    5 août, le bruit de fond montait de 21,6 à 30,0 au lieu de descendre, et
    26 085 fausses étoiles étaient comptées. Tout doit rester dans la même
    chaîne de normalisation.

    Rend None si Siril est absent ou échoue ; l'appelant bascule alors sur le
    repli Python.
    """
    exe = siril_binary()
    if not exe:
        logger.info("[Stack] siril-cli introuvable, repli Python")
        return None

    # Répertoires SÉPARÉS : `convert` de Siril convertit tous les fichiers
    # lisibles du répertoire courant, sans filtrer sur le préfixe donné. Darks
    # et lights mélangés produisent des séquences vides et un échec silencieux
    # ("Reading sequence failed: dark.seq").
    lightdir = os.path.join(workdir, "lights")
    darkdir = os.path.join(workdir, "darks")
    os.makedirs(lightdir, exist_ok=True)
    for i, p in enumerate(sorted(light_paths), start=1):
        shutil.copy2(p, os.path.join(lightdir, f"light_{i:04d}{os.path.splitext(p)[1] or '.jpg'}"))

    # `convert light` produit light_00001.fit… : la séquence s'appelle donc
    # "light_", tiret bas final compris. Sans lui, register et stack échouent
    # sur "Reading sequence failed: light.seq" sans autre explication.
    script = ["requires 1.2.0"]
    base = "light_"
    use_dark = bool(dark_paths) and len(dark_paths) >= 2
    if use_dark:
        os.makedirs(darkdir, exist_ok=True)
        for i, p in enumerate(sorted(dark_paths), start=1):
            shutil.copy2(p, os.path.join(darkdir, f"dark_{i:04d}{os.path.splitext(p)[1] or '.jpg'}"))
        script += [
            f"cd {darkdir}",
            "convert dark -out=.",
            # Médiane sans normalisation : un master dark doit rester au niveau
            # brut des défauts, toute mise à l'échelle le rendrait inapplicable.
            "stack dark_ median -nonorm -out=master_dark",
            f"cd {lightdir}",
            "convert light -out=.",
            f"calibrate light_ -dark={os.path.join(darkdir, 'master_dark')}",
        ]
        base = "pp_light_"
    else:
        script += [f"cd {lightdir}", "convert light -out=."]

    script += [
        f"register {base}",
        # rej 3 3 : sigma-clip haut/bas — écarte satellites et rayons cosmiques.
        f"stack r_{base} rej 3 3 -norm=addscale -out=result",
        "close",
    ]
    seq = lightdir
    sf = os.path.join(workdir, "stack.ssf")
    with open(sf, "w") as f:
        f.write("\n".join(script) + "\n")

    try:
        r = subprocess.run([exe, "-s", sf], cwd=workdir, capture_output=True,
                           text=True, timeout=900)
    except subprocess.TimeoutExpired:
        logger.error("[Stack] Siril : délai dépassé (900s)")
        return None
    except OSError as e:
        logger.error(f"[Stack] Siril injoignable : {e}")
        return None

    for cand in ("result.fit", "result.fits"):
        out = os.path.join(seq, cand)
        if os.path.exists(out):
            logger.info(f"[Stack] Siril OK ({'avec' if use_dark else 'sans'} dark) : {out}")
            return out
    logger.error(f"[Stack] Siril n'a produit aucun résultat. stderr={r.stderr[-400:]!r}")
    return None


def _read_any(path: str) -> Optional[np.ndarray]:
    """Lit un FITS (sortie Siril) ou une image classique, en BGR float32."""
    if path.lower().endswith((".fit", ".fits")):
        try:
            from astropy.io import fits
            data = fits.getdata(path)
        except Exception as e:
            logger.error(f"[Stack] FITS illisible {path} : {e}")
            return None
        a = np.asarray(data, dtype=np.float32)
        if a.ndim == 3 and a.shape[0] == 3:      # Siril rend (C, H, W)
            a = np.transpose(a, (1, 2, 0))[:, :, ::-1]
        elif a.ndim == 2:
            a = cv2.cvtColor(a, cv2.COLOR_GRAY2BGR)
        m = a.max()
        return a * (255.0 / m) if m > 0 else a
    im = cv2.imread(path)
    return None if im is None else im.astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline complet
# ─────────────────────────────────────────────────────────────────────────────

def run_stack(light_paths: list[str], storage_path: str, exposure_s: float,
              iso, out_basename: str, prefer_siril: bool = False) -> dict:
    # prefer_siril est FAUX par défaut, à dessein.
    #
    # Le moteur Python est celui validé sur les données réelles du 5 août :
    # 475 étoiles, bruit de fond 21,6 → 9,1. La chaîne Siril fonctionne en
    # ligne de commande (convert → register → stack produit bien result.fit)
    # mais l'enchaînement calibrate par master dark ne passe pas encore dans
    # le script, et une tentative précédente rendait un résultat DÉGRADÉ sans
    # le signaler (bruit remonté à 30,0, 26 085 fausses étoiles).
    #
    # Un moteur qui dégrade en silence est pire que pas de moteur : tant que
    # la calibration Siril n'est pas vérifiée de bout en bout sur des données
    # réelles, il reste en option explicite.
    """Enchaîne calibration, alignement, empilement et post-traitement.

    Rend les chemins produits et les mesures objectives, ces dernières servant
    aussi à alimenter les conseils IA.
    """
    if not light_paths:
        raise ValueError("Aucune pose fournie")

    loaded = load_master_dark(storage_path, exposure_s, iso)
    master, dark_meta = (loaded if loaded else (None, {}))
    if master is None:
        logger.warning(
            f"[Stack] aucun master dark pour {exposure_s}s/ISO {iso} — "
            f"les pixels chauds seront empilés comme des étoiles")

    stacked = None
    stats = StackStats()
    workdir = tempfile.mkdtemp(prefix="stargazer_stack_")
    try:
        if prefer_siril and len(light_paths) >= 3:
            # Poses brutes du dark, pour que Siril calibre dans sa propre
            # chaîne. Ne JAMAIS soustraire le master .npy d'un résultat Siril :
            # celui-ci est normalisé, la soustraction serait fausse.
            raw = dark_meta.get("raw_dir")
            dark_paths = sorted(glob.glob(os.path.join(raw, "*"))) if raw and os.path.isdir(raw) else None
            res = stack_siril(light_paths, workdir, dark_paths=dark_paths)
            if res:
                arr = _read_any(res)
                if arr is not None:
                    stacked = arr
                    stats.engine = "siril"
                    stats.frames_used = len(light_paths)
                    stats.frames_total = len(light_paths)
                    stats.dark_applied = bool(dark_paths)
        if stacked is None:
            stacked, _, stats = stack_python(light_paths, master)
            stats.engine = "python"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    single = cv2.imread(light_paths[0])
    single_f = single.astype(np.float32) if single is not None else stacked
    if master is not None and single is not None and master.shape == single_f.shape:
        single_f = np.clip(single_f - master, 0, 255)

    flat = remove_gradient(stacked, order=2)
    flat, gains = star_white_balance(flat)
    img = denoise(asinh_stretch(flat))

    ref_single = denoise(asinh_stretch(remove_gradient(single_f, order=2)))

    margin = 90
    if img.shape[0] > 3 * margin and img.shape[1] > 3 * margin:
        img = img[margin:-margin, margin:-margin]
        ref_single = ref_single[margin:-margin, margin:-margin]

    m = measure(img)
    m_single = measure(ref_single)
    stats.exposure_s = float(exposure_s)
    stats.iso = str(iso) if iso is not None else None
    stats.integration_s = round(stats.frames_used * float(exposure_s), 1)
    stats.dark_hot_pixels = int(dark_meta.get("hot_pixels", 0))
    stats.background_median = round(m["background_median"], 2)
    stats.background_sigma = round(m["background_sigma"], 2)
    stats.background_sigma_single = round(m_single["background_sigma"], 2)
    stats.noise_gain = round(
        m_single["background_sigma"] / max(m["background_sigma"], 1e-6), 2)
    stats.star_count = m["star_count"]
    stats.hfr_px = m["hfr_px"]
    stats.saturated_pct = m["saturated_pct"]

    out_dir = os.path.join(storage_path, "stacks")
    os.makedirs(out_dir, exist_ok=True)
    full = os.path.join(out_dir, f"{out_basename}.png")
    cv2.imwrite(full, img)
    h, w = img.shape[:2]
    zoom = os.path.join(out_dir, f"{out_basename}_zoom.png")
    cv2.imwrite(zoom, cv2.resize(
        img[max(0, h//2-260):h//2+260, max(0, w//2-390):w//2+390],
        (1560, 1040), interpolation=cv2.INTER_LANCZOS4))

    logger.info(
        f"[Stack] {stats.engine} : {stats.frames_used}/{stats.frames_total} poses, "
        f"{stats.integration_s}s cumulées, {stats.star_count} étoiles, "
        f"bruit {stats.background_sigma_single}→{stats.background_sigma} "
        f"(×{stats.noise_gain})")

    return {"success": True, "image": full, "zoom": zoom,
            "white_balance": gains, "stats": stats.to_dict()}
