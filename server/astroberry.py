"""
astroberry.py — SSH client for Raspberry Pi / Astroberry control.
All credentials come from environment variables.
"""
import os
import logging
import threading
import time
import platform
from typing import Optional, Dict, Any

logger = logging.getLogger("stargazer-backend")

ASTROBERRY_HOST = os.getenv("ASTROBERRY_HOST", "astroberry.local")
ASTROBERRY_USER = os.getenv("ASTROBERRY_USER", "astroberry")
ASTROBERRY_PASS = os.getenv("ASTROBERRY_PASS", "astroberry")
ASTROBERRY_PORT = int(os.getenv("ASTROBERRY_PORT", "22"))


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
        # Linux iputils: -W is seconds per reply. macOS: -W is milliseconds — do not use -W 1 on Darwin.
        if platform.system() == "Darwin":
            cmd = ["ping", "-c", "2", "-o", ASTROBERRY_HOST]
        else:
            cmd = ["ping", "-c", "2", "-W", "2", ASTROBERRY_HOST]
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
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


def release_camera_usb_lock() -> Dict[str, Any]:
    """Kill every process that could hold an exclusive libgphoto2 lock on the Canon.

    gvfs-gphoto2-volume-monitor respawns via D-Bus within ~1 s after a simple
    pkill.  To win the race we must:
      1. Kill all gvfs / gphoto helper processes.
      2. Kill any stray gphoto2 CLI process.
      3. Use ``fuser -k`` to force-close any remaining file handles on the Canon
         USB node — works even for processes that respawned before pkill returned.
      4. Sleep 0.5 s so the kernel releases the fd before we return.

    The indiserver gphoto driver is NOT killed — only user-space lock holders.
    """
    cmd = (
        # Kill all known gvfs camera-related daemons and stray gphoto2 CLI
        "for proc in gvfs-gphoto2-volume-monitor gvfs-gphoto2-volume-monitor-ap "
        "gvfsd-gphoto2 gvfs-afc-volume-monitor gphoto2; do "
        "  pkill -9 \"$proc\" 2>/dev/null || true; "
        "done; "
        # Force-close remaining file handles on the Canon USB device via fuser
        "CANON_DEV=$(lsusb 2>/dev/null | grep -i 'Canon\\|EOS' | head -1 "
        "  | awk '{printf \"/dev/bus/usb/%s/%s\", $2, substr($4,1,3)}'); "
        "if [ -n \"$CANON_DEV\" ] && [ -e \"$CANON_DEV\" ]; then "
        "  fuser -k \"$CANON_DEV\" 2>/dev/null || true; "
        "fi; "
        "sleep 0.5; "
        "echo OK"
    )
    result = _run(cmd, timeout=12)
    if result.get("exit_code") == -1:
        err = result.get("stderr") or "SSH connection to Astroberry failed"
        logger.error("release_camera_usb_lock: SSH failed — %s", err)
        return {"success": False, "error": err}
    logger.info("USB lock released on Astroberry — %s", result.get("stdout", "").strip())
    return {"success": True}


def get_indi_logs(lines: int = 50) -> str:
    """Fetch indiserver logs from /tmp/indiserver.log on Astroberry."""
    result = _run(f"tail -n {lines} /tmp/indiserver.log 2>/dev/null || journalctl -u indiserver -n {lines} --no-pager")
    return result.get("stdout", result.get("stderr", "No logs available"))


def restart_indi() -> Dict[str, Any]:
    """Stop and restart indiserver on Astroberry.

    Uses ``sudo pkill`` to ensure stale ``indiserver`` instances launched by
    other users (e.g. by KStars/Ekos) are also terminated, and relaunches
    the drivers with verbose logging (``-vvv``) so kernel-level USB issues
    are captured in the indiserver log.
    """
    logger.info("Restarting indiserver on Astroberry (sudo pkill + verbose relaunch)...")
    log_path = "/tmp/indiserver.log"
    # Modern Canon DSLRs use indi_gphoto_ccd.
    drivers = "indi_celestron_gps indi_gphoto_ccd"
    # systemctl is preferred when a service unit exists; otherwise we kill
    # any running indiserver (with sudo, since it may be owned by another
    # user) and relaunch with verbose output redirected to a known log.
    # We also kill gvfs-gphoto2 to ensure the OS doesn't lock the camera.
    fallback_cmd = (
        "pkill -9 indiserver; pkill -9 gvfs-gphoto2-volume-monitor; sleep 1; "
        "nohup indiserver -vvv indi_celestron_gps indi_gphoto_ccd > /tmp/indiserver.log 2>&1 &"
    )
    result = _run(fallback_cmd, timeout=15)
    if result.get("exit_code") == -1:
        err = result.get("stderr") or "SSH connection to Astroberry failed"
        logger.error("restart_indi: cannot run remote shell — %s", err)
        return {
            "success": False,
            "output": "",
            "error": err,
            "log_path": log_path,
        }

    time.sleep(2)
    verify = _run("pgrep -x indiserver || echo DEAD")
    if verify.get("exit_code") == -1:
        logger.error("restart_indi: verify step SSH failed — %s", verify.get("stderr"))
        return {
            "success": False,
            "output": result.get("stdout", ""),
            "error": verify.get("stderr") or "SSH failed during indiserver verify",
            "log_path": log_path,
        }

    out = (verify.get("stdout") or "").strip()
    # Do not treat empty stdout as "running" (old bug: "DEAD" not in "" was True)
    running = bool(out) and "DEAD" not in out
    logger.info(
        f"indiserver restart result: running={running}, "
        f"verbose log at {log_path} on Astroberry"
    )
    return {
        "success": running,
        "output": result.get("stdout", ""),
        "error": result.get("stderr", ""),
        "log_path": log_path,
    }


def reboot(confirm_token: str) -> Dict[str, Any]:
    """Reboot Astroberry. Requires confirmation token."""
    if confirm_token not in ["REBOOT_CONFIRMED", "confirm"]:
        return {"success": False, "error": "Invalid confirmation token"}
    logger.warning("Rebooting Astroberry!")
    result = _run("sudo reboot", timeout=5)
    return {"success": True, "message": "Astroberry rebooting..."}
