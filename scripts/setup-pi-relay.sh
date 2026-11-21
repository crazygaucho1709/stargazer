#!/usr/bin/env bash
# scripts/setup-pi-relay.sh
# Chemin : scripts/setup-pi-relay.sh
#
# Configure le Pi en mode relais minimal.
# Exécution depuis le M4 :
#   ssh -p 2222 astroberry@127.0.0.1 'bash -s' < scripts/setup-pi-relay.sh
#
# Phase 1 (ce script) :
#   - Arrêt et désactivation de KStars (gros consommateur CPU/RAM)
#   - Installation et configuration de ser2net (port série monture → TCP 7001)
#   - indiserver conserve les deux drivers pour l'instant
#
# Phase 2 (après installation INDI sur M4, voir ecosystem.config.js) :
#   - Changer la ligne DRIVERS ci-dessous de "indi_celestron_gps indi_gphoto_ccd"
#     à "indi_gphoto_ccd" uniquement, puis re-exécuter le script.

set -euo pipefail

# ── Couleurs pour la lisibilité ──────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ── Drivers indiserver ────────────────────────────────────────────────────────
# Phase 1 : les deux drivers (monture + Canon)
# Phase 2 : passer à "indi_gphoto_ccd" uniquement quand INDI tourne sur le M4
INDI_DRIVERS="indi_celestron_gps indi_gphoto_ccd"

echo "======================================================"
echo " Stargazer — Configuration Pi relais"
echo "======================================================"

# ── Phase 1 : arrêt de KStars ────────────────────────────────────────────────
echo ""
echo "--- Phase 1 : KStars ---"

pkill -9 kstars 2>/dev/null && warn "KStars tué" || ok "KStars n'était pas en cours"

# Désactiver l'autostart GNOME/LXDE/systemd
rm -f ~/.config/autostart/kstars.desktop 2>/dev/null && ok "Autostart GNOME supprimé" || true
sudo rm -f /etc/xdg/autostart/kstars.desktop 2>/dev/null || true
sudo systemctl disable kstars 2>/dev/null && ok "Service KStars désactivé" || true

RAM_LIBRE=$(free -m | awk 'NR==2{print $7}')
ok "KStars supprimé — RAM libre estimée : ${RAM_LIBRE} MB"

# ── Phase 2 : ser2net ────────────────────────────────────────────────────────
echo ""
echo "--- Phase 2 : ser2net ---"

if ! dpkg -l ser2net &>/dev/null; then
    echo "Installation de ser2net..."
    sudo apt-get update -qq
    sudo apt-get install -y ser2net
    ok "ser2net installé"
else
    ok "ser2net déjà installé"
fi

# Détection automatique du port série (USB-série Celestron)
MOUNT_PORT=$(ls /dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyACM0 2>/dev/null | head -1 || true)
if [ -z "$MOUNT_PORT" ]; then
    warn "Aucun port série détecté — utilisation de /dev/ttyUSB0 par défaut (monture non branchée ?)"
    MOUNT_PORT="/dev/ttyUSB0"
else
    ok "Port série détecté : $MOUNT_PORT"
fi

# Sauvegarde config existante
sudo cp /etc/ser2net.yaml /etc/ser2net.yaml.bak 2>/dev/null && warn "Ancienne config sauvegardée dans /etc/ser2net.yaml.bak" || true

sudo tee /etc/ser2net.yaml > /dev/null <<EOF
%YAML 1.1
---
# ser2net — relais série monture NexStar → TCP
# Généré par scripts/setup-pi-relay.sh
#
# Port 7001 : lecture/écriture brute sur $MOUNT_PORT
# NexStar 4SE : 9600 baud, 8N1
# kickolduser : une seule connexion à la fois (le M4 est le seul client)
connection: &mount
  accepter: "tcp,0.0.0.0,7001"
  connector: "serialdev,${MOUNT_PORT},9600n81,local"
  options:
    kickolduser: true
    banner: false
EOF

sudo systemctl enable ser2net
sudo systemctl restart ser2net
sleep 1

if sudo systemctl is-active --quiet ser2net; then
    ok "ser2net actif — TCP 7001 → $MOUNT_PORT"
else
    fail "ser2net n'a pas démarré — sudo journalctl -u ser2net -n 20"
fi

# ── Phase 3 : indiserver ─────────────────────────────────────────────────────
echo ""
echo "--- Phase 3 : indiserver ($INDI_DRIVERS) ---"

pkill -9 indiserver 2>/dev/null || true
pkill -9 gvfs-gphoto2-volume-monitor 2>/dev/null || true
rm -f /tmp/indiserver.log
sleep 1

nohup indiserver -v $INDI_DRIVERS > /tmp/indiserver.log 2>&1 &
sleep 2

if pgrep -x indiserver > /dev/null; then
    ok "indiserver démarré : $INDI_DRIVERS"
else
    fail "indiserver n'a pas démarré — cat /tmp/indiserver.log"
fi

# ── Résumé ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo " Pi configuré en mode relais (Phase 1)"
echo "======================================================"
echo "  ser2net  :7001  → $MOUNT_PORT (monture, TCP brut)"
echo "  indiserver :7624 → $INDI_DRIVERS"
echo ""
echo "  RAM libre maintenant :"
free -m | awk 'NR==2{printf "    Utilisée: %d MB  |  Libre: %d MB  |  Total: %d MB\n", $3, $7, $2}'
echo ""
echo "  Phase 2 : quand INDI est installé sur le M4,"
echo "  changer INDI_DRIVERS=\"indi_gphoto_ccd\" et relancer ce script."
echo "======================================================"
