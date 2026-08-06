module.exports = {
  apps: [
    {
      name: 'stargazer-tunnel',
      script: '/usr/bin/ssh',
      // Keepalive : envoie un ping SSH toutes les 30s, abandonne après 3 échecs (90s)
      // ExitOnForwardFailure=no : ne quitte pas si le port 7624 n'est pas encore ouvert côté Pi
      // ConnectTimeout=10 : échoue vite si le Pi est injoignable
      // Ports tunnelisés :
      //   7624 → Pi:7624  indiserver (Phase 1 : deux drivers)
      //   7001 → Pi:7001  ser2net monture (prêt pour Phase 2)
      //   2222 → Pi:22    SSH Pi
      //
      // ── Phase 2 ─ décommenter après `brew tap knro/indi && brew install indi` ──
      // Remplacer la ligne args ci-dessous par :
      //   args: '-N ... -L 7625:127.0.0.1:7624 -L 7001:127.0.0.1:7001 -L 2222:127.0.0.1:22 astroberry@astroberry.local',
      // (7624 est libéré pour l'indiserver local M4 — voir stargazer-socat/indiserver en bas)
      args: '-N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o ExitOnForwardFailure=no -L 7624:127.0.0.1:7624 -L 7001:127.0.0.1:7001 -L 2222:127.0.0.1:22 astroberry@astroberry.local',
      autorestart: true,
      restart_delay: 10000,   // attend 10s avant de retenter (évite le flood de 1118 restarts)
      max_restarts: 50,
      min_uptime: '5s',
      error_file: 'logs/tunnel-error.log',
      out_file: 'logs/tunnel-out.log',
    },
    {
      name: 'stargazer-backend',
      // Lanceur auto-nettoyant : tue tout orphelin sur :5005 (trampoline
      // Python.app macOS échappe au kill de PM2) avant d'exec python.
      script: 'scripts/run-backend.sh',
      interpreter: '/bin/zsh',
      cwd: './',
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      env: {
        STORAGE_PATH: '/Volumes/Data2/captures',
        PYTHONPATH: '.',
        // Tunneled through SSH to bypass macOS Local Network Privacy blocks
        ASTROBERRY_HOST: '127.0.0.1',
        INDI_HOST: '127.0.0.1',
        ASTROBERRY_PORT: '2222'
      },
      autorestart: true,
      watch: false,
      // 4G : le traitement d'une capture 36 Mpx (BLOB INDI + debayer) pique à ~3 Go ;
      // à 1G PM2 tuait le backend à chaque capture → "connexion INDI perdue".
      max_memory_restart: '4G',
      // Anti crash-loop : si le port 5005 est tenu par un orphelin, le doublon
      // meurt immédiatement — sans délai PM2 flood des centaines de restarts.
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 20,
      kill_timeout: 8000
    },
    {
      // HTTPS local via Caddy — requis pour DeviceOrientationEvent sur iOS.
      // Prérequis : bash scripts/setup-https.sh (installe mkcert + génère les certs)
      // Accès : https://macmini.local:8443
      name: 'stargazer-https',
      script: '/opt/homebrew/bin/caddy',
      args: 'run --config Caddyfile --adapter caddyfile',
      cwd: './',
      error_file: 'logs/caddy-error.log',
      out_file: 'logs/caddy-out.log',
      autorestart: true,
      watch: false,
    },
    {
      name: 'stargazer-frontend',
      script: 'node_modules/next/dist/bin/next',
      // Align with package.json "start": must listen on all interfaces so
      // http://macmini.local:3000 (LAN / Bonjour) reaches the same server as localhost.
      args: 'start -H 0.0.0.0',
      cwd: './',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:5005'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },

    // ── Phase 2 : indiserver local M4 + socat ────────────────────────────────
    // Activer ces deux processus après installation INDI sur le M4 :
    //   brew tap knro/indi && brew install indi
    // Et après avoir exécuté scripts/setup-pi-relay.sh avec INDI_DRIVERS="indi_gphoto_ccd"
    //
    // {
    //   name: 'stargazer-socat',
    //   // Crée /tmp/mount_serial : port série virtuel → ser2net Pi (via tunnel 7001)
    //   script: '/opt/homebrew/bin/socat',
    //   args: 'PTY,link=/tmp/mount_serial,raw,b9600,echo=0 TCP:127.0.0.1:7001',
    //   autorestart: true,
    //   restart_delay: 5000,
    //   error_file: 'logs/socat-error.log',
    //   out_file: 'logs/socat-out.log',
    // },
    // {
    //   name: 'stargazer-indiserver',
    //   // indiserver local : driver monture en natif M4, Canon proxié depuis Pi (port 7625)
    //   // @127.0.0.1:7625 = chaînage INDI vers l'indiserver Pi (tunnel SSH renommé 7625)
    //   script: '/opt/homebrew/bin/indiserver',
    //   args: '-p 7624 indi_celestron_gps @127.0.0.1:7625',
    //   autorestart: true,
    //   restart_delay: 5000,
    //   error_file: 'logs/indiserver-error.log',
    //   out_file: 'logs/indiserver-out.log',
    // },
    // ─────────────────────────────────────────────────────────────────────────
  ]
};
