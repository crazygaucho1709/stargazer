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


def test_eod_heartbeat_bridges_short_encoder_gaps():
    """Les encodeurs n'arrivent que par intermittence : le battement comble le trou."""
    ts = mount_safety.position_proof_ts(encoder_ts=1000.0, heartbeat_ts=1016.0, now_ts=1017.0)
    assert ts == 1016.0
    assert mount_safety.check_encoder_fresh(ts, 1017.0)[0] is True


def test_eod_heartbeat_cannot_vouch_for_silent_encoders():
    """Encodeurs muets au-delà de la borne : le battement ne vaut plus preuve de vie."""
    gap = mount_safety.HEARTBEAT_MAX_ENCODER_GAP_S
    now = 1000.0 + gap + 5
    ts = mount_safety.position_proof_ts(encoder_ts=1000.0, heartbeat_ts=now - 0.5, now_ts=now)
    assert ts == 1000.0
    assert mount_safety.check_encoder_fresh(ts, now)[0] is False


def test_no_encoder_frame_means_no_proof():
    assert not mount_safety.position_proof_ts(0.0, 1234.0, 1235.0)


def test_goto_refused_when_model_contradicts_encoder():
    """20 novembre 2026 : modèle à −30°, tube à l'horizontale."""
    ok, why = mount_safety.check_model_matches_encoder(-30.0, 0.0)
    assert ok is False and "mise en station" in why


def test_goto_allowed_when_model_matches_encoder():
    assert mount_safety.check_model_matches_encoder(41.0, 43.5)[0] is True


def test_goto_refused_when_altitude_unknown():
    assert mount_safety.check_model_matches_encoder(None, 12.0)[0] is False


def test_reconnexion_serie_attend_une_panne_installee():
    # Pas de panne, ou panne trop récente : on ne touche à rien.
    assert not mount_safety.should_reconnect_serial(0.0, 0.0, 1000.0)
    assert not mount_safety.should_reconnect_serial(990.0, 0.0, 1000.0)
    # 20 s d'erreurs continues, aucune tentative : on reconnecte.
    assert mount_safety.should_reconnect_serial(980.0, 0.0, 1000.0)


def test_reconnexion_serie_une_tentative_par_minute():
    assert not mount_safety.should_reconnect_serial(900.0, 970.0, 1000.0)
    assert mount_safety.should_reconnect_serial(900.0, 940.0, 1000.0)


def test_monture_muette_reconnue_dans_les_messages_du_driver():
    assert mount_safety.is_mount_silent_message("[ERROR] Write Error: Input/output error")
    assert mount_safety.is_mount_silent_message("[ERROR] Timeout error")
    assert mount_safety.is_mount_silent_message("[ERROR] Got no response from target ALT or AZM.")
    assert mount_safety.is_mount_silent_message("[ERROR] Cannot continue without connection to motor controllers.")
    assert not mount_safety.is_mount_silent_message("[INFO] Setting serial speed to 9600 baud.")


def test_position_affichee_seulement_si_prouvee():
    now = 1000.0
    assert mount_safety.position_is_proven(True, False, 995.0, now)
    assert not mount_safety.position_is_proven(False, False, 995.0, now)   # déconnectée
    assert not mount_safety.position_is_proven(True, True, 995.0, now)     # liaison en échec
    assert not mount_safety.position_is_proven(True, False, 900.0, now)    # preuve trop ancienne
    assert not mount_safety.position_is_proven(True, False, 0.0, now)      # jamais lue
