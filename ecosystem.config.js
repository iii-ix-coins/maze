module.exports = {
    apps: [
        {
            name: 'hollld-platform',
            script: './start.js',
            cwd: './',
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            restart_delay: 3000,
            max_memory_restart: '800M',
            env_production: {
                NODE_ENV: 'production'
            }
        }
    ]
};
