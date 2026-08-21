const staticConfig = require("./app.json");

module.exports = () => {
  const config = structuredClone(staticConfig.expo);
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }

  return config;
};
