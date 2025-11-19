module.exports = {
  apps: [{
    name: 'townranker-production',
    script: './server.js',
    cwd: '/var/www/townranker.com',
    instances: 1,
    exec_mode: 'fork',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      ADMIN_DEBUG: true,
      NODE_OPTIONS: '--max-old-space-size=512 --max-semi-space-size=64'
    },

    // Memory management
    max_memory_restart: '400M',  // Restart if memory exceeds 400MB (increased)

    // Logging
    error_file: '/root/.pm2/logs/townranker-production-error.log',
    out_file: '/root/.pm2/logs/townranker-production-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Performance monitoring
    autorestart: true,
    watch: false,
    max_restarts: 10,          // Max 10 restarts within...
    min_uptime: '10s',         // ...10 seconds (prevents crash loop)

    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: false,

    // Advanced options
    node_args: '--max-old-space-size=512 --max-semi-space-size=64',
    interpreter_args: '--max-old-space-size=512 --max-semi-space-size=64',

    // Instance variables
    instance_var: 'INSTANCE_ID'
  }]
};
