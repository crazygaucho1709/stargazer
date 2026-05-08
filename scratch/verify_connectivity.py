"""verify_connectivity.py — diagnostic script for the Stargazer hardware chain.

Runs a quick three-step check of the end-to-end stack:

    1. Verify ``lsusb`` on the Astroberry Pi shows the Canon camera and the
       Prolific (Celestron mount) adapter.
    2. Verify that ``indiserver`` is running on the Pi AND that the
       Stargazer backend is connected to it (via ``/debug/indi``).
    3. Hit ``/health/full`` on the backend and confirm
       ``mount.connected == true``.

Usage::

    python scratch/verify_connectivity.py
    python scratch/verify_connectivity.py --backend http://127.0.0.1:5005

Exits with code 0 on success, 1 on the first failed step.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict
from urllib.error import URLError
from urllib.request import urlopen

# Make ``server/`` importable so we can reuse the SSH helpers.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))

import astroberry as raspi  # noqa: E402

DEFAULT_BACKEND = os.environ.get("STARGAZER_BACKEND", "http://127.0.0.1:5005")


def _print_step(idx: int, title: str) -> None:
    print(f"\n=== Step {idx}: {title} ===")


def _http_get_json(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    with urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check_lsusb() -> bool:
    _print_step(1, "lsusb on Astroberry shows Canon + Prolific")
    result = raspi._run("lsusb")
    if not result["success"]:
        print(f"  FAIL: SSH error: {result['stderr']}")
        return False
    out = result["stdout"]
    print(out or "  (empty lsusb output)")
    canon_found = "Canon" in out
    prolific_found = "Prolific" in out
    print(f"  Canon camera detected: {canon_found}")
    print(f"  Prolific (mount adapter) detected: {prolific_found}")
    return canon_found and prolific_found


def check_indi_bridge(backend: str) -> bool:
    _print_step(2, "indiserver running + backend bridge connected")
    pi_status = raspi.get_status()
    indi_running = bool(pi_status.get("indi_running"))
    print(f"  indiserver running on Pi: {indi_running} (pid={pi_status.get('indi_pid')})")
    if not indi_running:
        print("  FAIL: indiserver is not running on the Astroberry.")
        return False
    try:
        debug = _http_get_json(f"{backend}/debug/indi")
    except URLError as e:
        print(f"  FAIL: backend unreachable at {backend}: {e}")
        return False
    bridge_connected = bool(debug.get("connected"))
    print(f"  Backend INDI bridge connected: {bridge_connected}")
    if not bridge_connected:
        print(f"  Debug payload: {json.dumps(debug, indent=2)}")
    return bridge_connected


def check_health_full(backend: str) -> bool:
    _print_step(3, "/health/full reports mount.connected == true")
    try:
        health = _http_get_json(f"{backend}/health/full", timeout=10.0)
    except URLError as e:
        print(f"  FAIL: backend unreachable at {backend}: {e}")
        return False
    mount = health.get("mount", {}) or {}
    camera = health.get("camera", {}) or {}
    print(f"  mount.connected: {mount.get('connected')} (device={mount.get('device')})")
    print(f"  camera.connected: {camera.get('connected')} (device={camera.get('device')})")
    dmesg = (health.get("astroberry") or {}).get("dmesg_tail")
    if dmesg:
        print("  recent dmesg (USB-related):")
        for line in dmesg.splitlines()[-5:]:
            print(f"    {line}")
    return bool(mount.get("connected"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--backend",
        default=DEFAULT_BACKEND,
        help=f"Stargazer backend base URL (default: {DEFAULT_BACKEND})",
    )
    args = parser.parse_args()

    steps = [
        ("lsusb", check_lsusb),
        ("indi_bridge", lambda: check_indi_bridge(args.backend)),
        ("health_full", lambda: check_health_full(args.backend)),
    ]

    for name, fn in steps:
        ok = fn()
        if not ok:
            print(f"\nVERIFICATION FAILED at step: {name}")
            return 1

    print("\nAll connectivity checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
