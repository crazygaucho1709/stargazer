#!/bin/bash
# Déploiement du projet Stargazer vers le Mac Mini M4 via rsync

# ---------------------------------------------------------
# À CONFIGURER SELON TON RÉSEAU LOCAL ET TON MAC MINI
# ---------------------------------------------------------
DEST_USER="matthieudelamourd"    # Ton nom d'utilisateur sur le Mac Mini
DEST_HOST="macmini.local"        # L'IP ou le nom d'hôte du Mac Mini (ex: 192.168.1.50)
DEST_PATH="~/dev/project/web/stargazer" # Le dossier de destination sur le Mac Mini
# ---------------------------------------------------------

echo "🚀 Démarrage de la synchronisation vers $DEST_HOST..."

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '.next' \
  --exclude '.DS_Store' \
  ./ $DEST_USER@$DEST_HOST:$DEST_PATH

echo "✅ Synchronisation terminée avec succès !"

if [ "$1" == "fast" ]; then
  echo "⚡ Mode FAST : Redémarrage du backend uniquement (pas de build React)..."
  ssh $DEST_USER@$DEST_HOST "zsh -ic 'cd $DEST_PATH && source venv/bin/activate && pip install -r requirements.txt && pm2 restart stargazer-backend --update-env'"
else
  echo "🔄 Recompilation et redémarrage complet des services sur le Mac Mini..."
  ssh $DEST_USER@$DEST_HOST "zsh -ic 'cd $DEST_PATH && source venv/bin/activate && pip install -r requirements.txt && rm -rf node_modules/.cache && npm ci && npm run build && NEXT_PUBLIC_BACKEND_URL=http://macmini.local:5005 pm2 restart ecosystem.config.js --update-env'"
fi

echo "🎉 Déploiement total terminé !"