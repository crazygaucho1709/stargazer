#!/bin/zsh
# Autorise les globs sans correspondance (ex: ~/.cache/* sur dossier vide) à
# s'évaluer en liste vide au lieu de faire échouer la commande — cron lance un
# shell non-interactif où le comportement par défaut de zsh diffère.
setopt null_glob 2>/dev/null

# scripts/disk-guard.sh
#
# Routine de sécurité disque pour le Mac Mini (M4) — évite la panne "no space
# left on device" qui a bloqué toute installation (npm, brew, git) et fait
# perdre l'historique shell. Ne touche jamais à /System ou aux volumes gérés
# par macOS (voir incident du runtime simulateur iOS, retiré manuellement).
#
# Seuil critique par défaut : 80% d'utilisation du volume racine.
# En dessous : ne fait rien (idempotent, coût quasi nul en cron fréquent).
# Au-dessus : nettoie caches/logs/tmp régénérables, dans cet ordre de risque
# croissant, et s'arrête dès que le seuil est repassé sous la barre.

# cron lance un shell minimal — recharger nvm/homebrew pour que npm/brew/pm2
# soient trouvés (sinon ils sont silencieusement ignorés, comme si absents).
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

THRESHOLD=${DISK_GUARD_THRESHOLD:-80}
LOG_FILE="$HOME/dev/project/web/stargazer/logs/disk-guard.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  # Auto-plafonnement à ~5000 lignes : la routine ne doit jamais devenir
  # elle-même une cause de disque plein.
  if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5000 ]; then
    tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

usage_pct() {
  df / | tail -1 | awk '{gsub("%","",$5); print $5}'
}

PCT=$(usage_pct)
if [ "$PCT" -lt "$THRESHOLD" ]; then
  # Rien à faire — pas de log pour ne pas gonfler le fichier à chaque tick cron.
  exit 0
fi

log "⚠ Seuil dépassé : ${PCT}% (limite ${THRESHOLD}%) — nettoyage automatique"

# 1. Caches régénérables (le moins risqué : reconstruits automatiquement)
if command -v npm >/dev/null 2>&1; then
  npm cache clean --force >/dev/null 2>&1
  log "npm cache nettoyé"
fi
if [ -x "$HOME/dev/project/web/stargazer/server/venv/bin/pip" ]; then
  "$HOME/dev/project/web/stargazer/server/venv/bin/pip" cache purge >/dev/null 2>&1
  log "pip cache nettoyé"
fi
if command -v brew >/dev/null 2>&1; then
  brew cleanup -s --prune=all >/dev/null 2>&1
  log "brew cleanup exécuté"
fi
rm -rf "$HOME/Library/Caches"/* 2>/dev/null
rm -rf "$HOME/.cache"/* 2>/dev/null
log "Caches utilisateur vidés (~/Library/Caches, ~/.cache) — $(usage_pct)% restant"

PCT=$(usage_pct)
[ "$PCT" -lt "$THRESHOLD" ] && { log "✅ Sous le seuil après nettoyage caches (${PCT}%)"; exit 0; }

# 2. Fichiers temporaires anciens (>2 jours, appartenant à l'utilisateur)
find /tmp -mindepth 1 -mtime +2 -exec rm -rf {} + 2>/dev/null
find /private/var/tmp -mindepth 1 -user "$(whoami)" -mtime +2 -exec rm -rf {} + 2>/dev/null
log "Fichiers temporaires >2j supprimés — $(usage_pct)% restant"

PCT=$(usage_pct)
[ "$PCT" -lt "$THRESHOLD" ] && { log "✅ Sous le seuil après nettoyage tmp (${PCT}%)"; exit 0; }

# 3. Logs Stargazer (PM2) — flush plutôt que rm : évite de casser les
# descripteurs de fichier ouverts par les process PM2 en cours.
if command -v pm2 >/dev/null 2>&1; then
  pm2 flush >/dev/null 2>&1
  log "Logs PM2 (stargazer) vidés"
fi

PCT=$(usage_pct)
if [ "$PCT" -lt "$THRESHOLD" ]; then
  log "✅ Sous le seuil après flush logs (${PCT}%)"
else
  MSG="Disque M4 à ${PCT}% — nettoyage auto insuffisant, intervention manuelle requise"
  log "❌ $MSG (voir : du -sh ~/Library/Developer/CoreSimulator/Volumes, ~/Library/Containers, snapshots TM locaux)"
  # Notification macOS — visible si une session GUI est ouverte sur le Mac Mini.
  osascript -e "display notification \"$MSG\" with title \"Stargazer — Disque critique\" sound name \"Basso\"" >/dev/null 2>&1
fi
