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
        PYTHONPATH: '.'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'stargazer-frontend',
      script: '/Users/matt/.nvm/versions/node/v24.14.0/bin/npm',
      args: 'start',
      cwd: './',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
