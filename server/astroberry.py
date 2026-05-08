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
            "error": result["stderr"] or "SSH connection failed"
        }

    data = {}
    for line in result["stdout"].splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            data[k.strip().lower()] = v.strip()
            
    indi_pid = int(data.get("indi_pid", "0"))
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
        "last_usb_error": data.get("dmesg", "None"),
    }


def get_indi_logs(lines: int = 50) -> str:
    """Fetch indiserver logs from Astroberry (journalctl or process output)."""
    result = _run(
        f"sudo journalctl -u indiserver -n {lines} --no-pager --output=short-iso 2>/dev/null "
        f"|| ps aux | grep indiserver | grep -v grep"
    )
    return result.get("stdout", result.get("stderr", "No logs available"))


def restart_indi() -> Dict[str, Any]:
    """Stop and restart indiserver on Astroberry."""
    logger.info("Restarting indiserver on Astroberry...")
    # Try systemctl first, fallback to pkill + manual restart
    result = _run(
        "sudo systemctl restart indiserver 2>/dev/null || "
        "(pkill -x indiserver; sleep 2; "
        "indiserver -v indi_celestron_gps indi_canon_ccd &)"
    , timeout=15)
    time.sleep(2)
    # Verify it's back up
    verify = _run("pgrep -x indiserver || echo DEAD")
    running = "DEAD" not in verify.get("stdout", "DEAD")
    logger.info(f"indiserver restart result: running={running}")
    return {"success": running, "output": result.get("stdout", ""), "error": result.get("stderr", "")}


def reboot(confirm_token: str) -> Dict[str, Any]:
    """Reboot Astroberry. Requires confirmation token."""
    if confirm_token not in ["REBOOT_CONFIRMED", "confirm"]:
        return {"success": False, "error": "Invalid confirmation token"}
    logger.warning("Rebooting Astroberry!")
    result = _run("sudo reboot", timeout=5)
    return {"success": True, "message": "Astroberry rebooting..."}
