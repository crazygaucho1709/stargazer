# server/canon_zoom.py
"""Zoom du live view Canon (la loupe ×5 / ×10 de l'écran arrière).

Le driver indi_gphoto_ccd expose deux textes libgphoto2 :
  - eoszoom          : "1", "5" ou "10"
  - eoszoomposition  : "x,y", coin haut-gauche de la fenêtre agrandie,
                       exprimé en pixels du capteur complet.

L'interface, elle, raisonne en centre normalisé (0..1) : c'est ce qu'un clic
sur l'image fournit. Ce module fait la conversion, sans dépendance, pour
rester testable hors matériel.

Hypothèse non vérifiée sur le boîtier : la fenêtre agrandie mesure
capteur / niveau. C'est le comportement documenté de l'EDSDK ; si le cadrage
se révèle décalé sur le 600D, c'est ici qu'il faut corriger.
"""

ZOOM_LEVELS = (1, 5, 10)

# Facteur appliqué par le driver indi_gphoto à eoszoomposition.
DRIVER_POSITION_SCALE = 5

# Canon EOS 600D — mêmes valeurs que l'initialisation de CCD_INFO dans main.py
SENSOR_W = 5184
SENSOR_H = 3456


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def zoom_window(level: int, cx: float, cy: float,
                sensor_w: int = SENSOR_W, sensor_h: int = SENSOR_H):
    """Renvoie (x, y, cx, cy).

    x, y   : coin haut-gauche de la fenêtre, en pixels capteur.
    cx, cy : centre normalisé réellement obtenu, après recalage dans le
             capteur — l'interface s'en sert pour ne pas dériver hors champ.
    """
    if level not in ZOOM_LEVELS:
        raise ValueError(f"Niveau de zoom invalide : {level} (attendu {ZOOM_LEVELS})")
    if level == 1:
        return 0, 0, 0.5, 0.5

    win_w = sensor_w / level
    win_h = sensor_h / level
    x = _clamp(_clamp(cx, 0.0, 1.0) * sensor_w - win_w / 2, 0, sensor_w - win_w)
    y = _clamp(_clamp(cy, 0.0, 1.0) * sensor_h - win_h / 2, 0, sensor_h - win_h)
    x, y = int(round(x)), int(round(y))
    return x, y, (x + win_w / 2) / sensor_w, (y + win_h / 2) / sensor_h


def zoom_commands(device: str, level: int, x: int, y: int) -> list[str]:
    """Commandes INDI à envoyer, dans l'ordre : position, niveau, position.

    Mesuré sur le 600D le 20 novembre 2026 : un changement de niveau envoyé en
    dernier reste sans effet, bien que le driver réponde « Ok ». L'image ne
    change (1056×704 → 1024×680 en ×5) que lorsqu'une autre commande le suit.
    Position puis niveau ne zoomait donc jamais, et le retour en ×1 non plus.
    La position est envoyée avant ET après : avant pour que la fenêtre soit
    déjà placée, après pour faire prendre le niveau. Valable aussi pour ×1.
    """
    def text(name: str, value: str) -> str:
        return (f'<newTextVector device="{device}" name="{name}">'
                f'<oneText name="{name}">{value}</oneText></newTextVector>')

    # Le driver indi_gphoto multiplie lui-même la position par 5 avant de la
    # passer au boîtier (vu dans son journal : « eoszoomposition 2074,1382 →
    # adjusted 10370,6910 », soit hors d'un capteur de 5184 px). On lui donne
    # donc la position en pixels capteur divisée par ce facteur.
    position = text("eoszoomposition",
                    f"{round(x / DRIVER_POSITION_SCALE)},{round(y / DRIVER_POSITION_SCALE)}")
    return [position, text("eoszoom", str(level)), position]
