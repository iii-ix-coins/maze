module.exports = {
  apps: [{
    name: 'hollld-maze-multiplayer',
    script: './dist/maze-server/server.cjs',
    cwd: './',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    restart_delay: 3000,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
      MAZE_PORT: '8081',
      // Set this in the deployment environment to the exact public site origin(s).
      MAZE_ALLOWED_ORIGINS: process.env.MAZE_ALLOWED_ORIGINS || ''
    }
  }]
};
