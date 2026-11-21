# server/tests/test_canon_zoom.py
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import canon_zoom


def test_level_1_is_full_frame():
    assert canon_zoom.zoom_window(1, 0.9, 0.1) == (0, 0, 0.5, 0.5)


def test_centered_5x_window():
    x, y, cx, cy = canon_zoom.zoom_window(5, 0.5, 0.5)
    # Fenêtre de 1036.8 × 691.2 centrée sur 2592 × 1728
    assert (x, y) == (2074, 1382)
    assert cx == pytest.approx(0.5, abs=1e-3)
    assert cy == pytest.approx(0.5, abs=1e-3)


@pytest.mark.parametrize("level", [5, 10])
@pytest.mark.parametrize("cx,cy", [(0, 0), (1, 1), (-3, 7), (0.02, 0.99)])
def test_window_never_leaves_sensor(level, cx, cy):
    x, y, ncx, ncy = canon_zoom.zoom_window(level, cx, cy)
    assert 0 <= x <= canon_zoom.SENSOR_W - canon_zoom.SENSOR_W / level + 1
    assert 0 <= y <= canon_zoom.SENSOR_H - canon_zoom.SENSOR_H / level + 1
    assert 0 < ncx < 1 and 0 < ncy < 1


def test_invalid_level_rejected():
    with pytest.raises(ValueError):
        canon_zoom.zoom_window(3, 0.5, 0.5)


def test_sequence_is_position_then_level():
    """La fenêtre est placée avant le changement de niveau."""
    for level, x, y in [(10, 100, 200), (5, 2074, 1382), (1, 0, 0)]:
        cmds = canon_zoom.zoom_commands("GPhoto CCD", level, x, y)
        assert len(cmds) == 2
        # Le driver multiplie la position par 5 : on la lui envoie divisée.
        assert 'name="eoszoomposition"' in cmds[0] and f">{round(x / 5)},{round(y / 5)}<" in cmds[0]
        assert 'name="eoszoom"' in cmds[1] and f">{level}<" in cmds[1]
