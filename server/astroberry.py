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


def restart_indi() -> Dict[str, Any]:
    """Stop and restart indiserver on Astroberry.

    Uses ``sudo pkill`` to ensure stale ``indiserver`` instances launched by
    other users (e.g. by KStars/Ekos) are also terminated, and relaunches
    the drivers with verbose logging (``-vvv``) so kernel-level USB issues
    are captured in the indiserver log.
    """
    logger.info("Restarting indiserver on Astroberry (sudo pkill + verbose relaunch)...")
    log_path = "/tmp/indiserver.log"
    # Modern Canon DSLRs use indi_gphoto_ccd. indi_canon_ccd is for ancient models.
    drivers = "indi_celestron_gps indi_gphoto_ccd"
    # systemctl is preferred when a service unit exists; otherwise we kill
    # any running indiserver (with sudo, since it may be owned by another
    # user) and relaunch with verbose output redirected to a known log.
    fallback_cmd = (
        "pkill -9 indiserver; sleep 1; "
        "nohup indiserver -vvv indi_celestron_gps indi_gphoto_ccd > /tmp/indiserver.log 2>&1 &"
    )
    result = _run(fallback_cmd, timeout=15)
    time.sleep(2)
    # Verify it's back up
    verify = _run("pgrep -x indiserver || echo DEAD")
    running = "DEAD" not in verify.get("stdout", "DEAD")
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
