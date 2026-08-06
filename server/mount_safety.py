# server/mount_safety.py
"""
Garde-fou mécanique de la monture — vérifié AVANT tout envoi de commande INDI.

Contraintes physiques relevées sur site le 5 août 2026 :
  - Au-delà de ~70° d'altitude, le Canon percute la fourche de la monture
  - Toute rotation continue en azimut finit par enrouler le câble (cord wrap)
  - Champ utile ciel : sud → ouest (masque d'obstacles)

RÉFÉRENTIELS — le point clé de ce module :

  * TELESCOPE_ENCODER_ANGLES (driver celestron_aux) = référentiel MONTURE, lu
    directement sur les compteurs moteurs. C'est le SEUL fiable pour la sécurité.
  * HORIZONTAL_COORD / EQUATORIAL_EOD_COORD passent par le modèle d'alignement :
    faux tant que le modèle n'est pas construit, et ils bougent à chaque sync.
    NE JAMAIS s'en servir pour décider d'un mouvement.

  * Axe ALT : le zéro encodeur correspond au tube horizontal (index physique du
    tube, monture de niveau) — vérifié empiriquement : tube à l'horizontale →
    encodeur 359.85° = -0.15°. Les limites d'altitude sont donc ABSOLUES et
    persistantes d'une session à l'autre.
  * Axe AZ : zéro arbitraire, fixé à la mise sous tension (trépied posé au
    hasard). Aucune limite absolue possible → protection par budget de rotation
    cumulée depuis l'allumage. Le masque ciel sud→ouest ne peut s'appliquer
    qu'une fois le nord connu (boussole du téléphone ou plate-solve).
"""

from typing import Optional, Tuple

STEPS_PER_REV = 16777216          # encodeurs 24 bits
STEPS_PER_DEG = STEPS_PER_REV / 360.0   # ≈ 46603.4

# Limites d'altitude par défaut (référentiel encodeur = tube horizontal à 0°).
DEFAULT_ALT_MIN = 0.0
DEFAULT_ALT_MAX = 70.0

# Budget de rotation azimutale autorisé de part et d'autre de la position
# d'allumage, tant qu'aucune référence absolue n'est disponible.
DEFAULT_AZ_BUDGET_DEG = 90.0

# Marge de sécurité sur toutes les bornes (pointage imparfait, jeu mécanique).
SAFETY_MARGIN_DEG = 2.0


def steps_to_deg(steps: float) -> float:
    return steps / STEPS_PER_DEG


def deg_to_steps(deg: float) -> int:
    return int(round(deg * STEPS_PER_DEG))


def signed_angle(deg: float) -> float:
    """Ramène un angle encodeur 0..360 dans -180..180 (une altitude juste sous
    l'horizon se lit 359.8° et vaut -0.2°)."""
    a = deg % 360.0
    return a - 360.0 if a > 180.0 else a


def shortest_delta(from_deg: float, to_deg: float) -> float:
    """Écart signé le plus court entre deux azimuts (-180..180)."""
    return (to_deg - from_deg + 540.0) % 360.0 - 180.0


def load_alt_limits(config: Optional[dict]) -> Tuple[float, float]:
    """Limites d'altitude depuis la config ; repli sur les défauts si absentes
    ou dégénérées (min >= max, cas d'une config jamais renseignée)."""
    raw = (config or {}).get("mountLimits") or {}
    try:
        lo = float(raw.get("minAlt", DEFAULT_ALT_MIN))
        hi = float(raw.get("maxAlt", DEFAULT_ALT_MAX))
    except (TypeError, ValueError):
        lo, hi = DEFAULT_ALT_MIN, DEFAULT_ALT_MAX
    if lo >= hi:
        lo, hi = DEFAULT_ALT_MIN, DEFAULT_ALT_MAX
    return lo, hi


def check_altitude(encoder_alt_deg: float, config: Optional[dict] = None,
                   margin: float = SAFETY_MARGIN_DEG) -> Tuple[bool, Optional[str]]:
    """Valide une altitude ENCODEUR (absolue, tube horizontal = 0°)."""
    if encoder_alt_deg is None:
        return False, "Altitude encodeur indisponible — mouvement refusé"
    alt = signed_angle(encoder_alt_deg)
    lo, hi = load_alt_limits(config)
    if alt < lo + margin:
        return False, (f"Altitude {alt:.1f}° sous la limite basse "
                       f"({lo:.0f}° + {margin:.0f}° de marge) — horizon/obstacles")
    if alt > hi - margin:
        return False, (f"Altitude {alt:.1f}° au-dessus de la limite haute "
                       f"({hi:.0f}° − {margin:.0f}° de marge) — collision Canon/fourche")
    return True, None


class CordWrapGuard:
    """Anti-enroulement SANS référence absolue.

    Le zéro azimut de l'encodeur est arbitraire, mais l'enroulement ne dépend que
    de la ROTATION CUMULÉE depuis la position où le câble est détendu — mesurable
    à l'encodeur seul. À l'allumage on prend la position courante comme neutre
    (l'instrument vient d'être posé, câble détendu) et on autorise ±budget.
    """

    def __init__(self, budget_deg: float = DEFAULT_AZ_BUDGET_DEG):
        self.budget_deg = budget_deg
        self.unwrapped: Optional[float] = None   # rotation cumulée, non modulo
        self._last_raw: Optional[float] = None

    def set_neutral(self, encoder_az_deg: float):
        """Déclare la position courante comme neutre câble (allumage, ou après
        un démêlage manuel)."""
        self.unwrapped = 0.0
        self._last_raw = encoder_az_deg % 360.0

    def update(self, encoder_az_deg: float):
        """Suit la rotation en dépliant le modulo (une rotation continue doit
        accumuler 90, 180, 270… et non repasser par 0)."""
        raw = encoder_az_deg % 360.0
        if self._last_raw is None:
            self.set_neutral(raw)
            return
        self.unwrapped = (self.unwrapped or 0.0) + shortest_delta(self._last_raw, raw)
        self._last_raw = raw

    @property
    def rotation(self) -> float:
        return self.unwrapped or 0.0

    def check_delta(self, delta_deg: float,
                    margin: float = SAFETY_MARGIN_DEG) -> Tuple[bool, Optional[str]]:
        """Valide un déplacement azimutal supplémentaire."""
        if self.unwrapped is None:
            return True, None
        projected = self.unwrapped + delta_deg
        if abs(projected) > self.budget_deg - margin:
            sens = "horaire" if projected > 0 else "antihoraire"
            return False, (f"Rotation cumulée {projected:+.0f}° en {sens} depuis l'allumage "
                           f"(budget ±{self.budget_deg:.0f}°) — risque d'enroulement câble")
        return True, None

    def check_target_az(self, current_az_deg: float, target_az_deg: float,
                        margin: float = SAFETY_MARGIN_DEG) -> Tuple[bool, Optional[str]]:
        """Valide une cible azimutale : la monture prendra le plus court chemin."""
        return self.check_delta(shortest_delta(current_az_deg, target_az_deg), margin)


def check_move(target_alt_deg: Optional[float], current_az_deg: Optional[float],
               target_az_deg: Optional[float], guard: Optional[CordWrapGuard],
               config: Optional[dict] = None) -> Tuple[bool, Optional[str]]:
    """Validation complète d'un mouvement, en coordonnées ENCODEUR.

    Refuse par défaut si les données nécessaires manquent : mieux vaut un GoTo
    bloqué qu'un câble arraché ou un Canon contre la fourche.
    """
    ok, reason = check_altitude(target_alt_deg, config)
    if not ok:
        return False, reason

    if guard is not None and current_az_deg is not None and target_az_deg is not None:
        ok, reason = guard.check_target_az(current_az_deg, target_az_deg)
        if not ok:
            return False, reason

    return True, None


def check_jog(direction: str, encoder_alt_deg: Optional[float],
              guard: Optional[CordWrapGuard], config: Optional[dict] = None,
              lookahead_deg: float = 5.0) -> Tuple[bool, Optional[str]]:
    """Valide un jog manuel : refuse d'entamer un mouvement déjà orienté vers une
    butée (les jogs sont continus, on ne peut pas les borner autrement)."""
    d = (direction or "").lower()

    if encoder_alt_deg is not None:
        alt = signed_angle(encoder_alt_deg)
        lo, hi = load_alt_limits(config)
        if ("up" in d or "north" in d) and alt + lookahead_deg > hi - SAFETY_MARGIN_DEG:
            return False, (f"Jog haut refusé : altitude {alt:.1f}° proche de la limite "
                           f"{hi:.0f}° (collision Canon/fourche)")
        if ("down" in d or "south" in d) and alt - lookahead_deg < lo + SAFETY_MARGIN_DEG:
            return False, (f"Jog bas refusé : altitude {alt:.1f}° proche de l'horizon ({lo:.0f}°)")

    if guard is not None:
        if "west" in d or "right" in d:
            return guard.check_delta(lookahead_deg)
        if "east" in d or "left" in d:
            return guard.check_delta(-lookahead_deg)

    return True, None
