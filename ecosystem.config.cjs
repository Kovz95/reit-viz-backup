module.exports = {
  apps: [{
    name: "reit-viz",
    script: "./dist/index.cjs",
    cwd: "/opt/reit-viz",
    env: {
      NODE_ENV: "production",
      PORT: "8090",
      ANTHROPIC_API_KEY: "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"
    }
  }]
};
