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
  ssh $DEST_USER@$DEST_HOST "source ~/.nvm/nvm.sh; cd $DEST_PATH && source venv/bin/activate && pip install -r requirements.txt -q && lsof -ti:5005 | xargs kill -9 2>/dev/null; sleep 1; pm2 restart stargazer-backend --update-env"
else
  # .next est purge a chaque build : le cache incrementiel de Next reutilise
  # les fragments CSS deja compiles, et une modification de globals.css part
  # alors en production sans aucun effet. Constate le 8 octobre 2026 : le CSS
  # servi faisait 47 335 octets sans vision nocturne, echelle typographique ni
  # etats de focus ; apres purge, 55 862 octets avec les cinq regles.
  echo "🔄 Recompilation et redémarrage complet des services sur le Mac Mini..."
  ssh $DEST_USER@$DEST_HOST "source ~/.nvm/nvm.sh; cd $DEST_PATH && source venv/bin/activate && pip install -r requirements.txt -q && rm -rf node_modules/.cache .next && npm ci && npm run build && lsof -ti:5005 | xargs kill -9 2>/dev/null; sleep 1; NEXT_PUBLIC_BACKEND_URL=http://macmini.local:5005 pm2 restart ecosystem.config.js --update-env && /opt/homebrew/bin/caddy reload --config Caddyfile --adapter caddyfile 2>/dev/null || echo 'caddy reload skipped'; pm2 save"
fi

echo "🎉 Déploiement total terminé !"