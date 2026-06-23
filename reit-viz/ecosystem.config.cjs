// Secrets must NOT be committed. Set ANTHROPIC_API_KEY in an untracked .env file
// next to this config (e.g. /opt/reit-viz/.env on the server) — it is loaded below.
// `.env` is gitignored. Node 22+ ships process.loadEnvFile built in; if the file is
// absent we fall back to whatever is already in the ambient environment.
try {
  process.loadEnvFile(__dirname + "/.env");
} catch {
  /* no .env present — rely on ambient process.env */
}

module.exports = {
  apps: [{
    name: "reit-viz",
    script: "./dist/index.cjs",
    cwd: "/opt/reit-viz",
    env: {
      NODE_ENV: "production",
      PORT: "8090",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    }
  }]
};
