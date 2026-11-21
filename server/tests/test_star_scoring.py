# server/tests/test_star_scoring.py
"""Comptage d'étoiles du balayage : ne pas prendre le capteur ou un mur pour le ciel."""
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import autoalign_session as aa

W, H = 1056, 704
RNG = np.random.default_rng(7)
HOT = [(int(x), int(y)) for x, y in zip(RNG.integers(20, W - 20, 60), RNG.integers(20, H - 20, 60))]


def _frame(stars, hot=HOT, background=12, streaks=()):
    img = np.full((H, W), background, np.uint8)
    for x, y in hot:                      # pixel chaud : petit carré net, toujours au même endroit
        img[y - 1:y + 2, x - 1:x + 2] = 230
    for x, y in stars:                    # étoile : tache ronde
        cv2.circle(img, (int(x), int(y)), 3, 240, -1)
    for x, y in streaks:                  # trait fin : fil, arête, reflet
        cv2.line(img, (int(x), int(y)), (int(x) + 40, int(y) + 2), 240, 2)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tobytes()


def _stars(n, seed):
    r = np.random.default_rng(seed)
    return list(zip(r.integers(30, W - 30, n), r.integers(30, H - 30, n)))


def test_without_a_map_hot_pixels_pass_for_stars():
    """Le défaut constaté : capteur seul, aucune étoile, et pourtant des dizaines de « détections »."""
    assert aa.score_frame(_frame(stars=[]))["star_count"] > 30


def test_points_fixed_across_pointings_are_learned_as_defects(tmp_path):
    defects = aa.DefectMap(path=str(tmp_path / "hot.json"))
    for pointing in range(5):             # 5 directions : les étoiles bougent, pas les défauts
        s = aa.score_frame(_frame(_stars(12, pointing)), defects=defects)
        defects.observe(s["points"], pointing, s["frame_size"])
    wall = aa.score_frame(_frame(stars=[]), defects=defects)
    assert wall["star_count"] <= 2, wall
    sky = aa.score_frame(_frame(_stars(12, 99)), defects=defects)
    assert 10 <= sky["star_count"] <= 14, sky


def test_real_stars_are_not_learned_as_defects(tmp_path):
    defects = aa.DefectMap(path=str(tmp_path / "hot.json"))
    for pointing in range(6):
        s = aa.score_frame(_frame(_stars(40, pointing), hot=[]), defects=defects)
        defects.observe(s["points"], pointing, s["frame_size"])
    assert len(defects.defects) == 0


def test_map_survives_a_restart_and_ignores_other_frame_sizes(tmp_path):
    path = str(tmp_path / "hot.json")
    defects = aa.DefectMap(path=path)
    for pointing in range(4):
        s = aa.score_frame(_frame(_stars(8, pointing)), defects=defects)
        defects.observe(s["points"], pointing, s["frame_size"])
    defects.save()
    reloaded = aa.DefectMap(path=path)
    x, y = HOT[0]
    assert reloaded.is_defect(x, y, (W, H)) is True
    assert reloaded.is_defect(x, y, (1024, 680)) is False     # image de loupe : autre repère


def test_lit_wall_is_not_a_night_sky():
    res = aa.score_frame(_frame(_stars(30, 1), background=140))
    assert res["star_count"] == 0 and "trop clair" in res["error"]


def test_thin_streaks_are_not_stars():
    res = aa.score_frame(_frame(stars=[], hot=[], streaks=_stars(20, 3)))
    assert res["star_count"] == 0, res
