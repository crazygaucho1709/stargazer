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
        STORAGE_PATH: '/Volumes/Data/captures',
        PYTHONPATH: '.',
        ASTROBERRY_HOST: '192.168.178.142',
        INDI_HOST: '192.168.178.142'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'stargazer-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
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
