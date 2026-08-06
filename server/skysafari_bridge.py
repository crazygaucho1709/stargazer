# server/skysafari_bridge.py
"""
Pont SkySafari ↔ INDI — serveur TCP parlant le protocole Celestron NexStar.

SkySafari (6 Pro et autres) ne parle pas INDI : il se connecte en TCP brut et
émet des commandes NexStar ASCII. Ce module écoute sur un port (défaut 4030),
décode le sous-ensemble NexStar utilisé par SkySafari et le traduit vers le
client INDI du backend :

  - 'e' / 'E'    lecture RA/DEC (précis 32 bits / 16 bits)
  - 'r' / 'R'    GoTo (précis / court)
  - 's' / 'S'    Sync
  - 'Kx'         echo (test de liaison)
  - 'V'          version firmware
  - 'L'          GoTo en cours ?
  - 'M'          annulation GoTo
  - 'J'          alignement terminé ?
  - 't' / 'T'    mode de tracking (lecture / écriture)
  - 'P...'       commandes moteur à taux fixe (flèches SkySafari) → jog INDI

Configuration SkySafari : Scope Type "Celestron NexStar/Advanced GT", IP du
Mac Mini, port 4030, "Set Time & Location" activable sans effet de bord.

Dépendances injectées (pas d'import de main.py) :
  indi        : client INDI (mount_ra en degrés, mount_dec, mount_slew_state, send())
  slew        : coroutine mount_slew_internal(device, ra_hours, dec_deg, sync=False)
  logger      : logger du backend
"""

import asyncio
from typing import Optional

NEXSTAR_PORT_DEFAULT = 4030

# Taux NexStar (1-9) → TELESCOPE_SLEW_RATE INDI ({1..9}x)
_MOTION_PROPS = {
    16: ("TELESCOPE_MOTION_NS", {36: "MOTION_NORTH", 37: "MOTION_SOUTH"}),  # axe DEC/ALT
    17: ("TELESCOPE_MOTION_WE", {36: "MOTION_WEST", 37: "MOTION_EAST"}),    # axe RA/AZ
}


def _deg_to_hex32(deg: float) -> str:
    """Degrés → fraction de révolution non signée sur 32 bits, hex majuscule."""
    frac = (deg % 360.0) / 360.0
    return f"{int(frac * 0x100000000) & 0xFFFFFFFF:08X}"


def _deg_to_hex16(deg: float) -> str:
    frac = (deg % 360.0) / 360.0
    return f"{int(frac * 0x10000) & 0xFFFF:04X}"


def _hex_to_deg(hexstr: str) -> float:
    """Fraction de révolution hex (16 ou 32 bits) → degrés dans [0, 360)."""
    value = int(hexstr, 16)
    span = 0x100000000 if len(hexstr) > 4 else 0x10000
    return (value / span) * 360.0


class SkySafariBridge:
    def __init__(self, *, indi, slew, logger, port: int = NEXSTAR_PORT_DEFAULT):
        self.indi = indi
        self.slew = slew
        self.logger = logger
        self.port = port
        self._server: Optional[asyncio.base_events.Server] = None

    async def start(self):
        self._server = await asyncio.start_server(self._handle_client, "0.0.0.0", self.port)
        self.logger.info(f"[SkySafari] Pont NexStar/TCP à l'écoute sur 0.0.0.0:{self.port}")

    async def stop(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    # ── Boucle client ─────────────────────────────────────────────────────────

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        peer = writer.get_extra_info("peername")
        self.logger.info(f"[SkySafari] Client connecté: {peer}")
        try:
            buf = b""
            while True:
                chunk = await reader.read(64)
                if not chunk:
                    break
                self.logger.info(f"[SkySafari] RX {chunk!r}")
                buf += chunk
                buf = await self._consume(buf, writer)
        except (ConnectionResetError, asyncio.IncompleteReadError):
            pass
        except Exception as e:
            self.logger.warning(f"[SkySafari] Erreur client {peer}: {e}")
        finally:
            self.logger.info(f"[SkySafari] Client déconnecté: {peer}")
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _consume(self, buf: bytes, writer: asyncio.StreamWriter) -> bytes:
        """Consomme autant de commandes complètes que possible ; retourne le reste."""
        while buf:
            cmd = chr(buf[0])

            if cmd == "K":                      # echo : K<char> → <char>#
                if len(buf) < 2:
                    return buf
                writer.write(bytes([buf[1]]) + b"#")
                buf = buf[2:]

            elif cmd == "e":                    # position précise 32 bits
                ra = getattr(self.indi, "mount_ra", 0.0)   # degrés
                dec = getattr(self.indi, "mount_dec", 0.0)
                writer.write(f"{_deg_to_hex32(ra)},{_deg_to_hex32(dec)}#".encode())
                buf = buf[1:]

            elif cmd == "E":                    # position courte 16 bits
                ra = getattr(self.indi, "mount_ra", 0.0)
                dec = getattr(self.indi, "mount_dec", 0.0)
                writer.write(f"{_deg_to_hex16(ra)},{_deg_to_hex16(dec)}#".encode())
                buf = buf[1:]

            elif cmd in ("r", "s"):             # GoTo / Sync précis : X(8),Y(8)
                if len(buf) < 18:
                    return buf
                payload = buf[1:18].decode(errors="ignore")
                buf = buf[18:]
                await self._goto_or_sync(payload, sync=(cmd == "s"))
                writer.write(b"#")

            elif cmd in ("R", "S"):             # GoTo / Sync court : X(4),Y(4)
                if len(buf) < 10:
                    return buf
                payload = buf[1:10].decode(errors="ignore")
                buf = buf[10:]
                await self._goto_or_sync(payload, sync=(cmd == "S"))
                writer.write(b"#")

            elif cmd == "L":                    # GoTo en cours ? '1'/'0'
                busy = getattr(self.indi, "mount_slew_state", "Idle") == "Busy"
                writer.write(b"1#" if busy else b"0#")
                buf = buf[1:]

            elif cmd == "M":                    # annuler GoTo
                dev = getattr(self.indi, "device_mount", "") or "Celestron GPS"
                self.indi.send(f'<newSwitchVector device="{dev}" name="TELESCOPE_ABORT_MOTION">'
                               f'<oneSwitch name="ABORT">On</oneSwitch></newSwitchVector>')
                writer.write(b"#")
                buf = buf[1:]

            elif cmd == "J":                    # alignement terminé ?
                writer.write(b"\x01#")
                buf = buf[1:]

            elif cmd == "V":                    # version firmware (4.10)
                writer.write(b"\x04\x0A#")
                buf = buf[1:]

            elif cmd == "t":                    # mode tracking : 0=off, 1=alt-az
                tracking = getattr(self.indi, "mount_tracking", False)
                writer.write((b"\x01" if tracking else b"\x00") + b"#")
                buf = buf[1:]

            elif cmd == "T":                    # set tracking mode
                if len(buf) < 2:
                    return buf
                mode = buf[1]
                dev = getattr(self.indi, "device_mount", "") or "Celestron GPS"
                switch = "TRACK_ON" if mode != 0 else "TRACK_OFF"
                self.indi.send(f'<newSwitchVector device="{dev}" name="TELESCOPE_TRACK_STATE">'
                               f'<oneSwitch name="{switch}">On</oneSwitch></newSwitchVector>')
                writer.write(b"#")
                buf = buf[2:]

            elif cmd == "P":                    # passthrough : slew à taux fixe (flèches)
                if len(buf) < 8:
                    return buf
                _, dev_id, action, rate = buf[1], buf[2], buf[3], buf[4]
                buf = buf[8:]
                self._fixed_rate_motion(dev_id, action, rate)
                writer.write(b"#")

            elif cmd in ("w", "W", "h", "H", "m"):  # localisation/heure/date — acquittés
                # SkySafari peut pousser heure/lieu ; l'INDI est déjà la source de
                # vérité (poussée par l'auto-align). On consomme la commande.
                lengths = {"w": 1, "W": 9, "h": 1, "H": 9, "m": 1}
                need = lengths[cmd]
                if len(buf) < need:
                    return buf
                if cmd in ("w", "h", "m"):
                    writer.write(b"\x00" * 8 + b"#" if cmd == "w" else b"\x00" * 8 + b"#")
                else:
                    writer.write(b"#")
                buf = buf[need:]

            else:                               # commande inconnue : consommer 1 octet
                self.logger.debug(f"[SkySafari] Commande ignorée: {cmd!r}")
                buf = buf[1:]

            await writer.drain()
        return buf

    # ── Traductions INDI ─────────────────────────────────────────────────────

    async def _goto_or_sync(self, payload: str, sync: bool):
        try:
            ra_hex, dec_hex = payload.split(",")
            ra_deg = _hex_to_deg(ra_hex.strip())
            dec_deg = _hex_to_deg(dec_hex.strip())
            if dec_deg > 180.0:   # fraction non signée → DEC signée
                dec_deg -= 360.0
            dev = getattr(self.indi, "device_mount", "") or "Celestron GPS"
            self.logger.info(f"[SkySafari] {'SYNC' if sync else 'GOTO'} "
                             f"RA {ra_deg / 15.0:.4f}h DEC {dec_deg:.4f}°")
            await self.slew(dev, ra_deg / 15.0, dec_deg, sync)
        except Exception as e:
            self.logger.error(f"[SkySafari] goto/sync invalide ({payload!r}): {e}")

    def _fixed_rate_motion(self, dev_id: int, action: int, rate: int):
        """P, 2, 16|17, 36|37, rate, 0, 0, 0 → jog INDI. rate 0 = stop."""
        entry = _MOTION_PROPS.get(dev_id)
        if not entry:
            return
        prop, directions = entry
        direction = directions.get(action)
        if not direction:
            return
        dev = getattr(self.indi, "device_mount", "") or "Celestron GPS"
        if rate == 0:
            # stop : relâcher les deux directions de l'axe
            offs = "".join(f'<oneSwitch name="{d}">Off</oneSwitch>' for d in directions.values())
            self.indi.send(f'<newSwitchVector device="{dev}" name="{prop}">{offs}</newSwitchVector>')
            return
        indi_rate = max(1, min(9, rate))
        self.indi.send(f'<newSwitchVector device="{dev}" name="TELESCOPE_SLEW_RATE">'
                       f'<oneSwitch name="{indi_rate}x">On</oneSwitch></newSwitchVector>')
        self.indi.send(f'<newSwitchVector device="{dev}" name="{prop}">'
                       f'<oneSwitch name="{direction}">On</oneSwitch></newSwitchVector>')
