// PM2 keeps both programs running, restarts them if they crash, and starts them again after a server reboot.
// IMPORTANT: the API must run as exactly ONE copy. It runs the background jobs (provider checks, refunds), and two copies would do every job twice.
module.exports = {
  apps: [
    {
      name: 'numvexs-api',
      cwd: './apps/api',
      script: 'dist/server.js',
      node_args: '--env-file=.env', // the secrets live in apps/api/.env on the server, never in git
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'numvexs-web',
      cwd: './apps/web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production', API_PROXY_TARGET: 'http://127.0.0.1:4000' },
    },
  ],
};
