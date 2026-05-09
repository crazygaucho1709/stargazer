"""
astroberry.py — SSH client for Raspberry Pi / Astroberry control.
All credentials come from environment variables.
"""
import os
import logging
import threading
import time
from typing import Optional, Dict, Any

logger = logging.getLogger("stargazer-backend")

ASTROBERRY_HOST = os.getenv("ASTROBERRY_HOST", "192.168.178.142")
ASTROBERRY_USER = os.getenv("ASTROBERRY_USER", "astroberry")
ASTROBERRY_PASS = os.getenv("ASTROBERRY_PASS", "astroberry")
ASTROBERRY_PORT = int(os.getenv("ASTROBERRY_PORT", "22"))

# Default driver list relaunched by ``restart_indi`` when the systemd unit
# is not present (or has been disabled). ``indi_canon_ccd`` is preferred over
# ``indi_gphoto_ccd`` because it registers a model-specific device name
# ("Canon DSLR EOS 600D") that the bridge already keys off of. Override via
# ``INDI_DRIVERS`` if your camera is incompatible (e.g. set to
# "indi_celestron_gps indi_gphoto_ccd" to fall back to gphoto).
INDI_DEFAULT_DRIVERS = os.getenv(
    "INDI_DRIVERS", "indi_celestron_gps indi_gphoto_ccd"
)


def _get_client():
    """Create and return a connected paramiko SSH client."""
    import paramiko
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=ASTROBERRY_HOST,
        port=ASTROBERRY_PORT,
        username=ASTROBERRY_USER,
        password=ASTROBERRY_PASS,
        timeout=8,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def _run(cmd: str, timeout: int = 10) -> Dict[str, Any]:
    """Run a command on Astroberry via SSH. Returns stdout, stderr, exit_code."""
    client = None
    try:
        client = _get_client()
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="ignore").strip()
        err = stderr.read().decode("utf-8", errors="ignore").strip()
        code = stdout.channel.recv_exit_status()
        return {"stdout": out, "stderr": err, "exit_code": code, "success": code == 0}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "success": False}
    finally:
        if client:
            client.close()


# ── Public API ───────────────────────────────────────────────────────────────

def ping() -> bool:
    """Return True if Astroberry is reachable via ICMP (ping)."""
    import subprocess
    try:
        # -c 2: two packets for better reliability, -W 1: 1s timeout per packet
        result = subprocess.run(
            ["ping", "-c", "2", "-W", "1", ASTROBERRY_HOST],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except Exception:
        return False


def ping_ssh() -> bool:
    """Return True if Astroberry SSH port is reachable."""
    import socket
    try:
        s = socket.create_connection((ASTROBERRY_HOST, ASTROBERRY_PORT), timeout=2)
        s.close()
        return True
    except Exception:
        return False



def _get_dmesg_tail(lines: int = 15) -> str:
    """Return the last ``lines`` of dmesg, focused on USB/Canon/Prolific activity.

    Surfacing kernel messages lets the UI show "urb stopped: -32" and other
    USB broken-pipe errors without requiring the operator to SSH in. Falls
    back to a plain tail if the grep filter returns nothing or fails.
    """
    keyword_filter = "usb\\|urb\\|Canon\\|Prolific\\|disconnect\\|reset"
    cmd = (
        f"sudo dmesg -T 2>/dev/null | grep -i '{keyword_filter}' | tail -n {lines} "
        f"|| sudo dmesg -T 2>/dev/null | tail -n {lines} "
        f"|| dmesg 2>/dev/null | tail -n {lines}"
    )
    result = _run(cmd, timeout=8)
    if result.get("success"):
        return result.get("stdout", "").strip()
    return ""


def get_status() -> Dict[str, Any]:
    """Return system status: CPU, temp, memory, uptime, indiserver state."""
    # Attempt to fetch status via SSH
    result = _run(
        "echo CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1); "
        "echo TEMP:$(vcgencmd measure_temp 2>/dev/null | cut -d= -f2 || echo N/A); "
        "echo MEM:$(free -m | awk 'NR==2{printf \"%s/%s\", $3, $2}'); "
        "echo UPTIME:$(uptime -p 2>/dev/null || uptime); "
        "echo INDI_PID:$(pgrep -x indiserver || echo 0); "
        "echo INDI_DEVICES:$(ps aux | grep indiserver | grep -v grep | awk '{for(i=11;i<=NF;i++) printf $i\" \"; print \"\"}'); "
        "echo AVAILABLE_DRIVERS:$(ls /usr/bin/indi_* | xargs -n1 basename | grep -E 'canon|gphoto' | tr '\\n' ' '); "
        "echo GPHOTO_DETECT:$(gphoto2 --auto-detect 2>/dev/null | tail -n +3 | head -n 1 || echo None); "
        "echo LSUSB:$(lsusb | tr '\\n' ' | '); "
        "echo DMESG_CANON:$(dmesg | grep -i canon | tail -n 5); "
        "echo DMESG:$(dmesg | grep -i usb | tail -n 5)"
    )
    
    if not result["success"]:
        # If SSH fails, try a simple socket check to see if it's at least alive
        ssh_alive = ping_ssh()
        ping_alive = ping()
        logger.warning(f"Astroberry status fetch failed. SSH={ssh_alive}, Ping={ping_alive}")
        return {
            "reachable": ssh_alive or ping_alive,
            "ssh_reachable": ssh_alive,
            "ping_reachable": ping_alive,
            "error": result["stderr"] or "SSH connection failed",
            "dmesg_tail": "",
        }

    data = {}
    stdout = result["stdout"]
    logger.debug(f"Astroberry raw status: {stdout}")
    for line in stdout.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            data[k.strip().lower()] = v.strip()
            
    indi_pid = int(data.get("indi_pid", "0"))
    dmesg_tail = _get_dmesg_tail()
    return {
        "reachable": True,
        "ssh_reachable": True,
        "cpu_percent": data.get("cpu", "N/A"),
        "temperature": data.get("temp", "N/A"),
        "memory": data.get("mem", "N/A"),
        "uptime": data.get("uptime", "N/A"),
        "indi_running": indi_pid > 0,
        "indi_pid": indi_pid,
        "indi_devices": data.get("indi_devices", "").strip(),
        "available_drivers": data.get("available_drivers", ""),
        "gphoto_detect": data.get("gphoto_detect", ""),
        "lsusb": data.get("lsusb", ""),
        "dmesg_canon": data.get("dmesg_canon", ""),
        "last_usb_error": data.get("dmesg", "None"),
        "dmesg_tail": dmesg_tail,
    }


def get_indi_logs(lines: int = 50) -> str:
    """Fetch indiserver logs from /tmp/indiserver.log on Astroberry."""
    result = _run(f"tail -n {lines} /tmp/indiserver.log 2>/dev/null || journalctl -u indiserver -n {lines} --no-pager")
    return result.get("stdout", result.get("stderr", "No logs available"))


def restart_indi(drivers: Optional[str] = None) -> Dict[str, Any]:
    """Stop and restart indiserver on Astroberry with an explicit driver list.

    The systemd unit (when present) is unreliable here because it caches the
    last driver set chosen by KStars/Ekos, which may differ from what the
    bridge expects (notably ``indi_gphoto_ccd`` vs ``indi_canon_ccd``). We
    therefore always go through the ``pkill`` + ``nohup`` fallback to
    guarantee the requested drivers are the ones actually running.
    """
    drivers = drivers or INDI_DEFAULT_DRIVERS
    log_path = "/tmp/indiserver.log"
    cmd = (
        f"pkill -9 indiserver 2>/dev/null; sleep 1; "
        f"nohup indiserver -vvv {drivers} > {log_path} 2>&1 &"
    )
    logger.info(
        f"Restarting indiserver with explicit drivers: {drivers} "
        f"(verbose log at {log_path} on Astroberry)"
    )
    result = _run(cmd, timeout=15)
    time.sleep(2)
    verify = _run(
        "ps -o args= -C indiserver 2>/dev/null | head -n 1 || echo DEAD"
    )
    args_line = verify.get("stdout", "DEAD").strip()
    running = args_line and "DEAD" not in args_line
    logger.info(
        f"indiserver restart result: running={bool(running)}, args={args_line!r}"
    )
    return {
        "success": bool(running),
        "output": result.get("stdout", ""),
        "error": result.get("stderr", ""),
        "drivers_requested": drivers,
        "drivers_running": args_line if running else "",
        "log_path": log_path,
    }


def get_indi_devices() -> Dict[str, Any]:
    """Query the running indiserver for the device names it knows about.

    Sends a single ``getProperties`` over the local TCP socket on the Pi and
    extracts unique ``device="..."`` attributes from the reply. Returns the
    sorted device list and the raw indiserver process line so the UI can
    show "driver X is loaded but registered no device" situations.
    """
    cmd = (
        "DEVICES=$( (echo '<getProperties version=\"1.7\"/>'; sleep 1) "
        "| nc -q 1 localhost 7624 2>/dev/null "
        "| grep -oE 'device=\"[^\"]+\"' "
        "| sort -u "
        "| sed -E 's/device=\"([^\"]+)\"/\\1/'); "
        "PS=$(ps -o args= -C indiserver 2>/dev/null | head -n 1); "
        "printf 'DEVICES_BLOCK_BEGIN\\n%s\\nDEVICES_BLOCK_END\\nPS:%s\\n' \"$DEVICES\" \"$PS\""
    )
    result = _run(cmd, timeout=8)
    if not result.get("success"):
        return {
            "reachable": False,
            "devices": [],
            "indiserver_args": "",
            "error": result.get("stderr", "SSH/INDI query failed"),
        }
    out = result.get("stdout", "")
    devices: list = []
    in_block = False
    indiserver_args = ""
    for line in out.splitlines():
        if line == "DEVICES_BLOCK_BEGIN":
            in_block = True
            continue
        if line == "DEVICES_BLOCK_END":
            in_block = False
            continue
        if in_block and line.strip():
            devices.append(line.strip())
        elif line.startswith("PS:"):
            indiserver_args = line[3:].strip()
    return {
        "reachable": True,
        "devices": devices,
        "indiserver_args": indiserver_args,
    }


def get_diagnostics() -> Dict[str, Any]:
    """One-shot diagnostic dump of the Pi's hardware + INDI state.

    Combines SSH reachability, ``ps`` of indiserver, ``lsusb``, registered
    INDI device names, and the last 30 lines of the indiserver verbose log.
    Designed to be hit from the UI (``GET /astroberry/diag``) so the user
    never has to ssh into the Pi to figure out what is broken.
    """
    ssh_alive = ping_ssh()
    if not ssh_alive:
        return {
            "ssh_reachable": False,
            "ping_reachable": ping(),
        }

    cmd = (
        "echo PS_BEGIN; ps -o args= -C indiserver 2>/dev/null | head -n 1; echo PS_END; "
        "echo LSUSB_BEGIN; lsusb 2>/dev/null; echo LSUSB_END; "
        "echo DRIVERS_BEGIN; ls /usr/bin/indi_celestron* /usr/bin/indi_canon* /usr/bin/indi_gphoto* 2>/dev/null; echo DRIVERS_END; "
        "echo LOG_BEGIN; tail -n 30 /tmp/indiserver.log 2>/dev/null; echo LOG_END"
    )
    raw = _run(cmd, timeout=10)
    sections: Dict[str, list] = {}
    current = None
    for line in raw.get("stdout", "").splitlines():
        if line.endswith("_BEGIN"):
            current = line[: -len("_BEGIN")]
            sections[current] = []
        elif line.endswith("_END"):
            current = None
        elif current is not None:
            sections[current].append(line)

    indiserver_args = "\n".join(sections.get("PS", [])).strip()
    lsusb_lines = sections.get("LSUSB", [])
    drivers_installed = [
        os.path.basename(p) for p in sections.get("DRIVERS", []) if p.strip()
    ]
    log_tail = "\n".join(sections.get("LOG", [])).strip()

    canon_in_lsusb = any("canon" in l.lower() for l in lsusb_lines)
    prolific_in_lsusb = any(
        "prolific" in l.lower() or "067b:2303" in l for l in lsusb_lines
    )

    devices_info = get_indi_devices()
    return {
        "ssh_reachable": True,
        "ping_reachable": True,
        "indiserver_running": bool(indiserver_args),
        "indiserver_args": indiserver_args,
        "indi_devices": devices_info.get("devices", []),
        "lsusb": lsusb_lines,
        "canon_in_lsusb": canon_in_lsusb,
        "prolific_in_lsusb": prolific_in_lsusb,
        "drivers_installed": drivers_installed,
        "indiserver_log_tail": log_tail,
    }


def reboot(confirm_token: str) -> Dict[str, Any]:
    """Reboot Astroberry. Requires confirmation token."""
    if confirm_token not in ["REBOOT_CONFIRMED", "confirm"]:
        return {"success": False, "error": "Invalid confirmation token"}
    logger.warning("Rebooting Astroberry!")
    result = _run("sudo reboot", timeout=5)
    return {"success": True, "message": "Astroberry rebooting..."}
