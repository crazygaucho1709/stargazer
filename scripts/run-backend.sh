#!/bin/zsh
# scripts/run-backend.sh
# Lanceur backend pour PM2.
#
# Pourquoi : sur macOS, le python du venv (framework build) démarre le vrai
# serveur via le trampoline Python.app — un processus ENFANT que PM2 ne suit
# pas. Au restart, PM2 tue le stub mais l'enfant survit, orphelin, accroché au
# port 5005 → crash-loop "address already in use" + code périmé servi.
#
# Ce script rend chaque démarrage auto-nettoyant : il tue tout détenteur du
# port 5005 avant d'exec python, donc l'orphelin du run précédent est éliminé.

cd "$(dirname "$0")/.."

ZOMBIES=$(lsof -ti :5005 2>/dev/null)
if [ -n "$ZOMBIES" ]; then
  echo "run-backend: kill des processus résiduels sur :5005 → $ZOMBIES"
  echo "$ZOMBIES" | xargs kill -9 2>/dev/null
  sleep 1
fi

# Le python.org/Python.framework build ne lit pas le trousseau de certificats
# macOS — urllib.request échoue en CERTIFICATE_VERIFY_FAILED sur tout appel
# HTTPS (Gemini, Claude...) sans ce bundle CA explicite.
export SSL_CERT_FILE="$(server/venv/bin/python3 -c 'import certifi; print(certifi.where())' 2>/dev/null)"
export REQUESTS_CA_BUNDLE="$SSL_CERT_FILE"

exec server/venv/bin/python3 server/main.py
