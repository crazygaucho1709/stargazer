# server/tests/test_station_setup.py
"""Mise en station automatique, jouée sans monture ni ciel : une fausse session
de balayage répond à la place du matériel."""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import station_setup as ss


# ── Logique pure ─────────────────────────────────────────────────────────────

def test_survey_stays_inside_mechanical_limits():
    cells = ss.plan_survey(0, 70, -85, 85)
    assert cells, "le balayage doit produire des cases"
    assert all(ss.SURVEY_ALT_FLOOR <= c["enc_alt"] <= 70 - ss.SURVEY_MARGIN for c in cells)
    assert all(-85 + ss.SURVEY_MARGIN <= c["enc_az"] <= 85 - ss.SURVEY_MARGIN for c in cells)


def test_survey_is_a_serpentine():
    """Deux rangées consécutives se parcourent en sens inverse : pas de grand retour."""
    cells = ss.plan_survey(0, 70, -85, 85)
    rows = {}
    for c in cells:
        rows.setdefault(c["enc_alt"], []).append(c["enc_az"])
    first, second = list(rows.values())[:2]
    assert first == sorted(first) and second == sorted(second, reverse=True)


def test_tripod_reference_points_south():
    assert ss.encoder_to_compass_az(0) == 180.0      # repère = plein sud
    assert ss.encoder_to_compass_az(90) == 270.0     # ouest positif
    assert ss.encoder_to_compass_az(-90) == 90.0


def _scored(cells, sky):
    for c in cells:
        c["status"] = "scored"
        c["star_count"] = 12 if sky(c) else 0
    return cells


def test_horizon_finds_the_building_to_the_east():
    """Ciel libre seulement côté ouest : la zone retenue s'arrête au repère."""
    cells = _scored(ss.plan_survey(0, 70, -85, 85), lambda c: c["enc_az"] >= 0)
    h = ss.horizon_from_cells(cells)
    assert h["visible"] is True
    assert h["zone"]["azMin"] >= 0
    east = [p for p in h["profile"] if p["enc_az"] < 0]
    assert east and all(p["min_sky_alt"] is None for p in east)


def test_low_obstacle_raises_the_floor_on_that_azimuth():
    cells = _scored(ss.plan_survey(0, 70, -85, 85),
                    lambda c: not (c["enc_az"] > 40 and c["enc_alt"] < 40))
    h = ss.horizon_from_cells(cells)
    west = [p for p in h["profile"] if p["enc_az"] > 40]
    assert all(p["min_sky_alt"] >= 40 for p in west)


def test_overcast_sky_gives_no_horizon():
    h = ss.horizon_from_cells(_scored(ss.plan_survey(0, 70, -85, 85), lambda c: False))
    assert h["visible"] is False and h["zone"] is None


def test_refused_cells_are_not_counted_as_obstacles():
    cells = _scored(ss.plan_survey(0, 70, -85, 85), lambda c: True)
    cells[0]["status"] = "failed"
    h = ss.horizon_from_cells(cells)
    assert h["unreached_cells"] == 1 and h["blocked_cells"] == 0


# ── Orchestrateur, avec matériel simulé ──────────────────────────────────────

class FakeIndi:
    connected = mount_connected = ccd_connected = True
    link_suspect = False
    device_mount = "Celestron AUX"
    serial_down = False

    def serial_failing(self):
        return self.serial_down


class FakeSession:
    """Remplace AutoAlignSession : note les étoiles sans bouger quoi que ce soit."""

    def __init__(self, sky=lambda c: True, align_ok=True, hang=False):
        self.sky, self.align_ok, self.hang = sky, align_ok, hang
        self.cells, self.result, self.calls = [], None, []
        self.running = False
        self.stopped = False
        self._release = asyncio.Event()

    def start(self, zone, **kw):
        self.calls.append({"zone": zone, **kw})
        self.running = True
        if kw.get("score_only"):
            self.cells = kw["grid"]
            for c in self.cells:
                c["status"], c["star_count"] = "scored", (9 if self.sky(c) else 0)
            self.result = {"success": True, "survey": True}
        elif self.align_ok:
            self.result = {"success": True, "pairs": [{}, {}, {}]}
        else:
            self.result = {"success": False, "error": "Seulement 1 paire(s) résolue(s)"}

    async def wait(self):
        if self.hang:
            await self._release.wait()
        self.running = False

    async def stop(self):
        self.stopped = True
        self._release.set()


def _make(tmp_path, session, indi=None, focus=None, slew_ok=True, model_alt=0.0):
    events = {"aligned": [], "slews": []}

    async def slew(dev, ra, dec, sync):
        events["slews"].append(sync)
        return {"success": slew_ok, "error": None if slew_ok else "Hardware offline"}

    async def site():
        return {"lat": -17.6, "lon": -149.6, "source": "test"}

    async def focus_calibrate():
        return focus or {"success": True, "profile": {"hfr": 2.4}}

    setup = ss.StationSetup(
        indi=indi or FakeIndi(), get_session=lambda: session, slew=slew,
        altaz_to_radec=lambda alt, az, lat, lon: (5.0, -5.0), get_site=site,
        push_site_time=lambda s: events.setdefault("pushed", []).append(s),
        model_altitude=lambda s: model_alt,
        get_limits=lambda: (0.0, 70.0, -85.0, 85.0),
        encoder_position=lambda: (0.0, 0.0), position_fresh=lambda: (True, None),
        focus_calibrate=focus_calibrate, set_aligned=events["aligned"].append,
        logger=logging.getLogger("test"), horizon_file=str(tmp_path / "horizon.json"))
    setup.settle_s = 0
    return setup, events


def _run(setup):
    async def go():
        setup.start()
        await setup._task
    asyncio.run(go())


def test_full_run_ends_aligned_with_a_saved_horizon(tmp_path):
    session = FakeSession(sky=lambda c: c["enc_az"] >= 0)
    setup, events = _make(tmp_path, session)
    _run(setup)
    assert setup.state == "DONE", setup.result
    assert [s["status"] for s in setup.steps] == ["done"] * 6
    assert os.path.isfile(tmp_path / "horizon.json")
    # Calage grossier : pas « aligné ». Reconnaissance du ciel : aligné.
    assert events["aligned"] == [False, True]
    assert events["slews"] == [True]          # un seul ordre direct, et c'est un SYNC
    # L'alignement est cantonné à la zone où le ciel est visible (côté ouest)
    align_zone = session.calls[1]["zone"]
    assert 170 <= align_zone["azMin"] <= 180


def test_overcast_sky_stops_before_alignment(tmp_path):
    session = FakeSession(sky=lambda c: False)
    setup, events = _make(tmp_path, session)
    _run(setup)
    assert setup.state == "FAILED" and setup.result["step"] == "limits"
    assert "ciel couvert" in setup.result["error"]
    assert len(session.calls) == 1            # balayage seul, pas d'alignement
    assert not os.path.isfile(tmp_path / "horizon.json")
    assert True not in events["aligned"]


def test_serial_failure_refuses_to_start(tmp_path):
    indi = FakeIndi()
    indi.serial_down = True
    session = FakeSession()
    setup, events = _make(tmp_path, session, indi=indi)
    _run(setup)
    assert setup.state == "FAILED" and setup.result["step"] == "precheck"
    assert session.calls == [] and events["slews"] == []


def test_failed_alignment_keeps_the_horizon_but_not_the_aligned_flag(tmp_path):
    session = FakeSession(align_ok=False)
    setup, events = _make(tmp_path, session)
    _run(setup)
    assert setup.state == "FAILED" and setup.result["step"] == "align"
    assert os.path.isfile(tmp_path / "horizon.json")
    assert True not in events["aligned"]


def test_soft_stars_are_reported_not_hidden(tmp_path):
    session = FakeSession()
    setup, _ = _make(tmp_path, session, focus={"success": True, "profile": {"hfr": 9.5}})
    _run(setup)
    assert setup.state == "DONE"
    focus_step = setup.steps[-1]
    assert focus_step["status"] == "warning" and "molette" in focus_step["detail"]


def test_stop_during_survey_aborts_and_nothing_restarts(tmp_path):
    session = FakeSession(hang=True)
    setup, events = _make(tmp_path, session)

    async def go():
        setup.start()
        await asyncio.sleep(0.05)
        assert setup.state == "SURVEY"
        await setup.stop()

    asyncio.run(go())
    assert session.stopped is True
    assert setup.state == "ABORTED"
    assert len(session.calls) == 1            # aucun alignement lancé après l'arrêt
    assert True not in events["aligned"]


def test_site_and_time_are_pushed_before_any_move(tmp_path):
    session = FakeSession()
    setup, events = _make(tmp_path, session)
    _run(setup)
    assert events["pushed"] and events["pushed"][0]["lat"] == -17.6


def test_coarse_sync_that_did_not_take_blocks_every_move(tmp_path):
    """Modèle toujours 30° sous l'encodeur après le calage : on ne balaie pas."""
    session = FakeSession()
    setup, _ = _make(tmp_path, session, model_alt=-30.0)
    _run(setup)
    assert setup.state == "FAILED" and setup.result["step"] == "coarse_sync"
    assert session.calls == []
