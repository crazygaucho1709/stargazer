# server/tests/test_stream_lag.py
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import stream_lag


def test_clock_offset_between_pi_and_mac_is_not_lag():
    t = stream_lag.LagTracker()
    # Horloge du Pi en avance de 3 s : âge brut négatif, retard nul
    assert t.note(frame_ts=1003.0, now_ts=1000.0) == 0.0
    assert t.note(frame_ts=1004.0, now_ts=1001.0) == 0.0


def test_growing_backlog_is_measured():
    t = stream_lag.LagTracker()
    t.note(1000.0, 1000.5)
    assert t.note(1010.0, 1020.5) == 10.0      # l'image a pris 10 s de retard


def test_flush_only_above_threshold_and_not_too_often():
    t = stream_lag.LagTracker()
    t.note(1000.0, 1000.0)
    t.note(1001.0, 1003.0)                      # 2 s : toléré
    assert t.should_flush(1003.0) is False
    t.note(1002.0, 1008.0)                      # 6 s : trop
    assert t.should_flush(1008.0) is True
    t.last_flush_ts = 1008.0
    t.note(1003.0, 1012.0)
    assert t.should_flush(1012.0) is False      # relance trop récente
    assert t.should_flush(1021.0) is True


def test_reset_forgets_the_baseline():
    t = stream_lag.LagTracker()
    t.note(1000.0, 1050.0)
    t.reset()
    assert t.lag_s is None
    assert t.note(2000.0, 2001.0) == 0.0


def test_indi_timestamp_is_read_as_utc():
    assert stream_lag.parse_indi_timestamp("1970-01-01T00:01:40") == 100.0
    assert stream_lag.parse_indi_timestamp("pas une date") is None
