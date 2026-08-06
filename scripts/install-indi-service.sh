#!/bin/bash
# scripts/install-indi-service.sh
#
# Installe indiserver en service systemd sur l'astroberry :
#   - démarrage automatique au boot (objectif "on allume et c'est tout")
#   - redémarrage automatique en cas de crash ou de coupure série
#   - indépendant de toute session SSH / session graphique
#
# À exécuter SUR le Raspberry Pi :
#   bash scripts/install-indi-service.sh
#
# Driver appareil photo : indi_gphoto_ccd, PAS indi_canon_ccd.
# L'ancien indi_canon_ccd émet des BLOB tronqués (~44 % de la trame) puis cesse
# complètement de livrer les images, alors que la même capture passe sans erreur
# en gphoto2 direct. Constaté le 5 août 2026 sur EOS 600D / Pi 3B.
set -e

DRIVERS="indi_celestron_aux indi_gphoto_ccd"

sudo tee /etc/systemd/system/indiserver.service >/dev/null <<EOF
[Unit]
Description=INDI server (Stargazer) - $DRIVERS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=astroberry
# Laisse le temps aux périphériques USB (adaptateur série, Canon) d'énumérer
ExecStartPre=/bin/sleep 8
ExecStart=/usr/bin/indiserver -v $DRIVERS
Restart=always
RestartSec=5
StandardOutput=append:/home/astroberry/indi.log
StandardError=append:/home/astroberry/indi.log

[Install]
WantedBy=multi-user.target
EOF

# Neutralise l'ancien lancement (crontab @reboot / autostart) pour éviter un
# double indiserver qui se disputerait le port série de la monture.
crontab -l 2>/dev/null | grep -v indi_autostart | crontab - 2>/dev/null || true

sudo systemctl daemon-reload
sudo systemctl enable indiserver.service
sudo pkill -x indiserver 2>/dev/null || true
sleep 2
sudo systemctl restart indiserver.service
sleep 14

echo "=== etat du service ==="
systemctl is-enabled indiserver.service
systemctl is-active indiserver.service
ps aux | grep "[i]ndiserver" | head -2
echo "=== derniers logs ==="
tail -6 /home/astroberry/indi.log 2>/dev/null | grep -v "Client" || true
