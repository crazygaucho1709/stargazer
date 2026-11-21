# server/tests/test_mount_safety.py
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import main
import mount_safety


def test_polling_period_strictly_below_encoder_stale_threshold():
    """Le polling encodeur doit rester strictement inférieur au seuil de péremption."""
    polling_s = main.MOUNT_POLLING_PERIOD_MS / 1000.0
    assert polling_s < mount_safety.ENCODER_STALE_S
    assert polling_s <= mount_safety.ENCODER_STALE_S / 2.0


def test_check_encoder_fresh_bounds():
    ok, err = mount_safety.check_encoder_fresh(100.0, 102.0)
    assert ok is True
    assert err is None

    stale, err_stale = mount_safety.check_encoder_fresh(100.0, 105.0)
    assert stale is False
    assert err_stale is not None
    assert "figée" in err_stale


def test_motion_proven_threshold():
    assert mount_safety.motion_proven((10.0, 20.0), 10.0, 20.0) is False
    assert mount_safety.motion_proven((10.0, 20.0), 10.05, 20.0) is True
