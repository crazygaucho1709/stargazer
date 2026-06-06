module.exports = {
  apps: [
    {
      name: 'stargazer-tunnel',
      script: '/usr/bin/ssh',
      args: '-N -L 7624:127.0.0.1:7624 -L 2222:127.0.0.1:22 -o StrictHostKeyChecking=no astroberry@192.168.178.127',
      autorestart: true,
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
        NEXT_PUBLIC_BACKEND_URL: 'http://macmini.local:5005'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
