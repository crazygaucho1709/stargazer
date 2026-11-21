# server/tests/test_station_stream.py
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import main


def test_light_state_carries_link_flags_and_station():
    state = asyncio.run(main._station_stream_state())
    for key in ("indi_connected", "mount_connected", "ccd_connected"):
        assert isinstance(state[key], bool)
    # Les champs que l'interface lit pour juger la fraîcheur de l'encodeur
    assert "encoder_age_s" in state["station"]
    assert "link_suspect" in state["station"]


def test_light_state_is_json_serialisable():
    import json
    json.dumps(asyncio.run(main._station_stream_state()), default=str)


def test_infrastructure_report_is_slower_than_light_state():
    """Le rapport coûteux ne doit jamais cadencer l'état de liaison."""
    assert main.STATION_STREAM_FULL_PERIOD_S > main.STATION_STREAM_PERIOD_S


def test_serial_write_error_blocks_then_releases():
    import mount_safety
    assert mount_safety.serial_link_failing(0.0, 1000.0) is False          # jamais d'erreur
    assert mount_safety.serial_link_failing(1000.0, 1001.0) is True        # erreur récente
    assert mount_safety.serial_link_failing(1000.0, 1014.9) is True
    assert mount_safety.serial_link_failing(1000.0, 1015.1) is False       # 15 s de silence


def test_mount_write_error_alert_raises_the_flag():
    client = main.indi
    client.serial_error_ts = 0.0
    client._alert_seen.clear()
    assert client.serial_failing() is False
    client.process_message(
        '<message device="Celestron AUX" timestamp="2026-11-21T05:36:40" '
        'message="[ERROR] Write Error: Input/output error"/>')
    assert client.serial_failing() is True
    assert client.serial_error_ts > 0


def test_camera_alert_does_not_block_the_mount():
    client = main.indi
    client.serial_error_ts = 0.0
    client._alert_seen.clear()
    client.process_message(
        '<message device="GPhoto CCD" timestamp="2026-11-21T05:36:40" '
        'message="[ERROR] Exposure failed"/>')
    assert client.serial_failing() is False


def test_station_reports_applied_limits_and_position():
    station = asyncio.run(main.station_status())
    limits = station["limits"]
    assert limits["alt_min"] < limits["alt_max"]
    assert limits["az_min"] < limits["az_max"]
    assert "encoder_alt" in station and "encoder_az" in station


def test_station_hides_position_while_serial_link_fails(monkeypatch):
    import time
    monkeypatch.setattr(main.indi, "encoder_alt", 10.0)
    monkeypatch.setattr(main.indi, "encoder_az", 20.0)
    monkeypatch.setattr(main.indi, "serial_error_ts", 0.0)
    assert asyncio.run(main.station_status())["encoder_alt"] == 10.0
    # Erreur d'écriture toute récente : la position du driver ne vaut plus rien.
    monkeypatch.setattr(main.indi, "serial_error_ts", time.time())
    station = asyncio.run(main.station_status())
    assert station["encoder_alt"] is None and station["encoder_az"] is None
