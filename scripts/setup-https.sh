#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-https.sh — Configure HTTPS local pour Stargazer (Caddy + mkcert)
# ─────────────────────────────────────────────────────────────────────────────
# Usage : bash scripts/setup-https.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_DIR/certs"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Stargazer — Setup HTTPS local (mkcert)  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Vérification des dépendances ──────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌  '$1' introuvable. Installation via Homebrew..."
    brew install "$2"
  else
    echo "✅  $1 $(\"$1\" --version 2>&1 | head -1)"
  fi
}

check_cmd caddy caddy
check_cmd mkcert mkcert

# ── 2. Installer la CA locale mkcert (system trust store) ────────────────────
echo ""
echo "▶  Installation de la CA mkcert dans le trust store macOS..."
echo "   (Un mot de passe admin ou une confirmation GUI peut être demandée)"
if mkcert -install 2>/dev/null; then
  echo "✅  CA locale installée dans le trust store macOS."
else
  echo "⚠️  Impossible d'installer automatiquement la CA (erreur GUI/keychain)."
  echo "   → Le certificat sera quand même généré."
  echo "   → Pour faire confiance manuellement sur le Mac :"
  echo "     sudo security add-trusted-cert -d -r trustRoot \\"
  echo "       -k /Library/Keychains/System.keychain \"\$(mkcert -CAROOT)/rootCA.pem\""
fi

# ── 3. Générer les certificats ────────────────────────────────────────────────
mkdir -p "$CERTS_DIR"
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
echo ""
echo "▶  Génération des certificats pour : macmini.local localhost 127.0.0.1 $LOCAL_IP"
mkcert \
  -cert-file "$CERTS_DIR/stargazer.pem" \
  -key-file  "$CERTS_DIR/stargazer-key.pem" \
  macmini.local \
  localhost \
  127.0.0.1 \
  ${LOCAL_IP:+"$LOCAL_IP"}

echo "✅  Certificats générés dans certs/"

# ── 4. Exporter la CA pour iOS ────────────────────────────────────────────────
CA_FILE="$(mkcert -CAROOT)/rootCA.pem"
EXPORT_FILE="$CERTS_DIR/mkcert-CA-INSTALL-ON-IPHONE.pem"
cp "$CA_FILE" "$EXPORT_FILE"
echo ""
echo "══════════════════════════════════════════════════════════"
echo "📱  POUR iOS (iPhone 16 Pro) :"
echo ""
echo "  1. Envoie ce fichier sur ton iPhone (AirDrop ou Mail) :"
echo "     $EXPORT_FILE"
echo ""
echo "  2. Sur l'iPhone : Réglages > Profil téléchargé > Installer"
echo ""
echo "  3. Puis : Réglages > Général > Informations > Réglages de"
echo "     confiance des certificats → active 'mkcert …'"
echo ""
echo "  4. Ouvre ensuite : https://macmini.local:8443/sensor"
echo "══════════════════════════════════════════════════════════"
echo ""

# ── 5. Ajouter certs/ au .gitignore ──────────────────────────────────────────
GITIGNORE="$PROJECT_DIR/.gitignore"
if ! grep -q "^certs/" "$GITIGNORE" 2>/dev/null; then
  echo "certs/" >> "$GITIGNORE"
  echo "✅  certs/ ajouté au .gitignore"
fi

# ── 6. Démarrer / redémarrer via PM2 ─────────────────────────────────────────
cd "$PROJECT_DIR"
echo ""
echo "▶  Démarrage de Caddy via PM2..."
if pm2 list | grep -q "stargazer-https"; then
  pm2 restart stargazer-https
else
  pm2 start ecosystem.config.js --only stargazer-https
fi

pm2 save
echo ""
echo "✅  Caddy démarré. Stargazer HTTPS disponible sur :"
echo "    https://macmini.local:8443"
echo ""
