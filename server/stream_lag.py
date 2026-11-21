# server/stream_lag.py
"""Retard du flux live : âge des images à leur arrivée.

Mesuré le 20 novembre 2026 : le Pi, en Wi-Fi, ne passait que ~60 ko/s alors
que le driver produisait jusqu'à 10 images de 65 ko par seconde. Les images
s'empilaient côté Pi et l'écran montrait le passé : 49 s de retard après une
minute de flux, et toujours plus ensuite. Mise au point et loupe devenaient
inutilisables sans que rien ne le signale.

Les horloges du Pi et du Mac ne sont pas synchronisées : l'âge brut d'une
image n'a pas de sens, seule sa DÉRIVE en a. On prend donc pour référence le
plus petit âge observé depuis le démarrage du flux.
"""

from datetime import datetime, timezone
from typing import Optional

# Au-delà, l'image n'est plus du direct : on vide la file en relançant le flux.
FLUSH_LAG_S = 4.0
# Pas plus d'une relance toutes les 12 s, pour ne pas hacher le flux.
FLUSH_MIN_INTERVAL_S = 12.0


def parse_indi_timestamp(raw: str) -> Optional[float]:
    """Horodatage INDI (« 2026-11-21T06:08:37 », UTC) → secondes Unix."""
    try:
        return datetime.fromisoformat(raw.strip()).replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


class LagTracker:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._baseline: Optional[float] = None
        self.lag_s: Optional[float] = None
        self.last_flush_ts: float = 0.0

    def note(self, frame_ts: float, now_ts: float) -> float:
        """Enregistre une image, renvoie le retard courant en secondes."""
        age = now_ts - frame_ts
        if self._baseline is None or age < self._baseline:
            self._baseline = age
        self.lag_s = round(age - self._baseline, 1)
        return self.lag_s

    def should_flush(self, now_ts: float) -> bool:
        return (self.lag_s is not None and self.lag_s > FLUSH_LAG_S
                and now_ts - self.last_flush_ts > FLUSH_MIN_INTERVAL_S)
