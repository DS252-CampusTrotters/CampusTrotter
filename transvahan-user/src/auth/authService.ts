// transvahan-user/src/auth/authService.ts
import Constants from "expo-constants";
import { apiClient, setToken } from "../api/client";
import { mockApi } from "../api/mockServer";

// 🔐 Safely coerce USE_MOCK from expo extra → real boolean
const rawUseMock = (Constants.expoConfig as any)?.extra?.USE_MOCK;

const USE_MOCK: boolean =
  typeof rawUseMock === "boolean"
    ? rawUseMock
    : String(rawUseMock).toLowerCase() === "true";

// You can console.log once to confirm which path is used
// console.log("[AuthService] USE_MOCK =", USE_MOCK);

export const AuthAPI = USE_MOCK ? mockApi : apiClient;

export const login = async (email: string, password: string) => {
  const { token, user } = await AuthAPI.login({ email, password });
  setToken(token);
  return user;
};
