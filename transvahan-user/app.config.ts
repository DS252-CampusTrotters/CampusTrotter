import "dotenv/config";
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiBaseUrl = process.env.API_BASE_URL;
  const wsUrl = process.env.WS_URL;
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const useMock =
    String(process.env.USE_MOCK ?? "false").toLowerCase() === "true";

  return {
    ...config,
    name: "TransVahan CampusTrotter",
    slug: "<Paste_your_app_slug_here>",

    // App versioning for stores / installation
    version: config.version ?? "1.0.0",

    ios: {
      ...(config.ios || {}),
      buildNumber: config.ios?.buildNumber ?? "1",
      config: {
        ...(config.ios?.config || {}),
        googleMapsApiKey: googleMapsKey,
      },
    },

    android: {
      ...(config.android || {}),
      // If you already had android.package in app.json, it will be preserved.
      // If not, this will give you a default one.
      package: config.android?.package ?? "com.transvahan.user",
      versionCode: config.android?.versionCode ?? 1,
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps || {}),
          apiKey: googleMapsKey,
        },
      },
    },

    // 🔹 Stuff available at runtime via Constants.expoConfig.extra
    extra: {
      ...(config.extra || {}),
      API_BASE_URL: apiBaseUrl,
      WS_URL: wsUrl,
      USE_MOCK: useMock,
      GOOGLE_MAPS_API_KEY: googleMapsKey,
      eas: {
        projectId: "<paste-your-eas-project-id>",
      },
    },
  };
};
