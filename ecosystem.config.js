module.exports = {
  apps: [
    {
      name: 'stargazer-tunnel',
      script: '/usr/bin/ssh',
      // Keepalive : envoie un ping SSH toutes les 30s, abandonne après 3 échecs (90s)
      // ExitOnForwardFailure=no : ne quitte pas si le port 7624 n'est pas encore ouvert côté Pi
      // ConnectTimeout=10 : échoue vite si le Pi est injoignable
      args: '-N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o ExitOnForwardFailure=no -L 7624:127.0.0.1:7624 -L 2222:127.0.0.1:22 astroberry@192.168.178.127',
      autorestart: true,
      restart_delay: 10000,   // attend 10s avant de retenter (évite le flood de 1118 restarts)
      max_restarts: 50,
      min_uptime: '5s',
      error_file: 'logs/tunnel-error.log',
      out_file: 'logs/tunnel-out.log',
    },
    {
      name: 'stargazer-backend',
      script: 'server/main.py',
      interpreter: 'server/venv/bin/python3',
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
      max_memory_restart: '1G'
    },
    {
      // HTTPS local via Caddy — requis pour DeviceOrientationEvent sur iOS.
      // Prérequis : bash scripts/setup-https.sh (installe mkcert + génère les certs)
      // Accès : https://macmini.local:8443
      name: 'stargazer-https',
      script: 'caddy',
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
    }
  ]
};
