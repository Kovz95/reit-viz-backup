module.exports = {
  apps: [{
    name: "reit-viz",
    script: "./dist/index.cjs",
    cwd: "/opt/reit-viz",
    env: {
      NODE_ENV: "production",
      PORT: "8090",
    }
  }]
};
