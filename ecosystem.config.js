module.exports = {
  apps: [
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
        // Bonjour name survives DHCP changes; override with a fixed IP if mDNS is unreliable.
        ASTROBERRY_HOST: 'astroberry.local',
        INDI_HOST: 'astroberry.local'
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
        PORT: 3000
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
