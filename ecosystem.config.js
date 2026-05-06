module.exports = {
  apps: [
    {
      name: 'stargazer-backend',
      script: 'server/main.py',
      interpreter: 'server/venv/bin/python3',
      cwd: './',
      env: {
        STORAGE_PATH: '/Volumes/ASTRO_HDD/captures',
        PYTHONPATH: '.'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'stargazer-frontend',
      script: 'npm',
      args: 'start',
      cwd: './',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
