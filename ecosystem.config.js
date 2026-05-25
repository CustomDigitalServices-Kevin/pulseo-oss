/**
 * PM2 ecosystem config for Pulseo production
 *
 * Usage on VPS:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 *
 * Requires Next.js standalone output (configured in next.config.ts).
 * The deployment hook copies .next/static and public/ alongside server.js.
 */
module.exports = {
  apps: [
    {
      name: "pulseo",
      script: "server.js",
      cwd: "/opt/pulseo/.next/standalone",
      // instances: 1 (not 2) — cluster duplication caused duplicate emails
      // for single user actions in field testing. Stay at one instance
      // until a stateful dedup mechanism (e.g., a DB email_queue with
      // a claim column) is added.
      instances: 1,
      exec_mode: "cluster",

      env: {
        NODE_ENV: "production",
        PORT: 3004,
        HOSTNAME: "127.0.0.1",
      },

      env_production: {
        NODE_ENV: "production",
        PORT: 3004,
        HOSTNAME: "127.0.0.1",
      },

      max_memory_restart: "500M",
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,

      error_file: "/var/log/pulseo-error.log",
      out_file: "/var/log/pulseo-out.log",
      log_file: "/var/log/pulseo-combined.log",
      time: true,
      merge_logs: true,

      watch: false,
      ignore_watch: ["node_modules", ".git", "public", "storage"],

      kill_timeout: 5000,
      // wait_ready is disabled because Next.js standalone server.js does not
      // emit the 'ready' signal. Without this, PM2 hangs in "waiting" forever.
      wait_ready: false,
      listen_timeout: 10000,
    },
    {
      name: "pulseo-worker",
      // Exécuté via tsx (compile TS à la volée) — évite de maintenir un
      // build step dist-workers/ séparé. Le node_modules inclut tsx en dev
      // deps, présent en prod car `npm install` sans --production.
      script: "./node_modules/.bin/tsx",
      args: "src/modules/projects/workers/index.ts",
      cwd: "/opt/pulseo",
      instances: 1,
      exec_mode: "fork",
      interpreter: "none",  // tsx est déjà un interpréteur

      // Le worker lit .env.production au boot (via dotenv-config)
      env_production: {
        NODE_ENV: "production",
      },

      max_memory_restart: "1G",
      max_restarts: 10,
      min_uptime: "10s",
      stop_exit_codes: [0],  // exit 0 = intentional (flag off) → PM2 ne restart pas
      autorestart: true,

      error_file: "/var/log/pulseo-worker-error.log",
      out_file: "/var/log/pulseo-worker-out.log",
      time: true,
      merge_logs: true,
    },
  ],
};
