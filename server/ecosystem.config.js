module.exports = {
  apps: [
    {
      name: "nfl-pickem-gh-api",
      cwd: __dirname,
      script: "src/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
