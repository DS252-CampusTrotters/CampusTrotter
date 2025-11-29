// transvahan-user/src/api/client.ts
/**
 * src/api/client.ts
 * FINAL MERGED VERSION ✅ (adds sendDemand + getDriverAssignment + subscribeReservations)
 */
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { endpoints } from "./endpoints";
import { API, LoginRequest, LoginResponse } from "./types";
import { Route, Vehicle, NextArrival } from "../types";
import { wsConnect } from "./ws";

const NGROK_BACKEND = "https://<NGROK_BACKEND_URL>";
const LOCAL_API_URL = "http://<LOCALHOST_BACKEND_URL>";

const API_BASE_URL =
  NGROK_BACKEND && NGROK_BACKEND.trim() !== ""
    ? NGROK_BACKEND
    : (Constants?.expoConfig as any)?.extra?.API_BASE_URL || LOCAL_API_URL;

const WS_URL =
  API_BASE_URL.replace(/^https?:/, API_BASE_URL.startsWith("https") ? "wss:" : "ws:") + "/ws";

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

let cachedToken: string | null = null;
export const setToken = (t: string | null) => {
  cachedToken = t;
};

async function resolveToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const keys = ["auth_token", "token", "accessToken", "jwt"];
    for (const k of keys) {
      const v = await AsyncStorage.getItem(k);
      if (v) {
        cachedToken = v;
        return v;
      }
    }
    const userJson = await AsyncStorage.getItem("auth_user");
    if (userJson) {
      const user = JSON.parse(userJson);
      const t =
        user?.token ||
        user?.authToken ||
        user?.accessToken ||
        user?.jwt ||
        user?.idToken ||
        null;
      if (t) cachedToken = t;
      return t;
    }
  } catch {}
  return null;
}

http.interceptors.request.use(async (config) => {
  try {
    const token = await resolveToken();
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

export const apiClient: API & {
  loginDriver?: (body: { email: string; password: string }) => Promise<LoginResponse>;
  sendTelemetry?: (body: any) => Promise<any>;
  updateOccupancy?: (body: any) => Promise<any>;
  controlTrip?: (body: any) => Promise<any>;
  getAlerts?: () => Promise<any[]>;
  subscribeAlerts?: (cb: (alert: any) => void) => void;
  sendDemand?: (body: {
    vehicle_id: string;
    route_id: string;
    direction?: "to" | "fro";
    stop_id?: string | null;
    lat: number;
    lon: number;
    high?: boolean;
    occupancy?: number;
  }) => Promise<any>;
  getDriverAssignment?: () => Promise<any>;
  subscribeReservations?: (cb: (msg: any) => void) => Promise<() => void>;
  subscribeSchedules?: (cb: (msg: any) => void) => Promise<() => void>;
  getRouteShape?: (routeId: string, direction?: "to" | "fro") => Promise<{ points: Array<{ lat: number; lng: number }>; from_cache?: boolean }>;
} = {
  async login(body: LoginRequest) {
    const { data } = await http.post<LoginResponse>(endpoints.login, body);
    if (data?.token) setToken(data.token);
    return data;
  },

  async loginDriver(body) {
    const { data } = await http.post<LoginResponse>("/auth/driver/login", body);
    if (data?.token) setToken(data.token);
    return data;
  },

  async getRoutes(options?: { activeOnly?: boolean }) {
    const params = options?.activeOnly ? { active_only: "true" } : {};
    const { data } = await http.get<Route[]>(endpoints.routes, { params });
    return data;
  },

  async getVehicles() {
    const { data } = await http.get<Vehicle[]>(endpoints.vehicles);
    return data;
  },

  async getNextArrivals() {
    const { data } = await http.get<NextArrival[]>(endpoints.nextArrivals);
    return data;
  },

  subscribeVehicles(cb) {
    console.log("🚘 [WS] Subscribing to vehicles via ws.ts ...");
    let disconnectFn: (() => void) | null = null;
    let shouldDisconnect = false;

    try {
      const maybePromiseOrFn = wsConnect((msg) => {
        if (msg.type === "vehicle_update" || msg.type === "vehicle" || msg.type === "demand_update") cb(msg);
      });

      if (maybePromiseOrFn && typeof (maybePromiseOrFn as any).then === "function") {
        // wsConnect returned a Promise<() => void>
        (maybePromiseOrFn as unknown as Promise<() => void>)
          .then((d) => {
            disconnectFn = d;
            if (shouldDisconnect && disconnectFn) {
              disconnectFn();
              disconnectFn = null;
            }
          })
          .catch(() => {});
      } else if (typeof maybePromiseOrFn === "function") {
        // wsConnect returned a synchronous disconnect function
        disconnectFn = maybePromiseOrFn as (() => void);
        if (shouldDisconnect && disconnectFn) {
          disconnectFn();
          disconnectFn = null;
        }
      }
    } catch {}

    return () => {
      shouldDisconnect = true;
      if (disconnectFn) {
        disconnectFn();
        disconnectFn = null;
      }
    };
  },

  async subscribeAlerts(cb) {
    console.log("🔔 [WS] Subscribing to alerts via ws.ts ...");
    const disconnect = await wsConnect((msg) => {
      if (["alert", "alert_created", "alert_resolved", "alert_deleted"].includes(msg.type)) {
        cb(msg);
      }
    });
    return disconnect;
  },

  // NEW: reservation + heat WebSocket subscription
  async subscribeReservations(cb) {
    console.log("🪑 [WS] Subscribing to reservations via ws.ts ...");
    const disconnect = await wsConnect((msg) => {
      if (msg.type === "reservation_update" || msg.type === "heat_update") {
        cb(msg);
      }
    });
    return disconnect;
  },

  async subscribeSchedules(cb) {
    console.log("🗓️ [WS] Subscribing to schedules via ws.ts ...");
    const disconnect = await wsConnect((msg) => {
      if (msg.type === "schedule_update") {
        cb(msg.data || msg);
      }
    });
    return disconnect;
  },

  async sendTelemetry(body) {
    const { data } = await http.post("/driver/telemetry", body);
    return data;
  },

  async updateOccupancy(body) {
    const { data } = await http.post("/driver/occupancy", body);
    return data;
  },

  async controlTrip(body) {
    const { data } = await http.post("/driver/trip", body);
    return data;
  },

  async getAlerts() {
    const { data } = await http.get("/alerts");
    return data;
  },

  // ✅ DRIVER → DEMAND SIGNAL
  async sendDemand(body) {
    const { data } = await http.post("/driver/demand", body);
    return data;
  },

  // ✅ DRIVER → fetch active assignment (route_id, vehicle_id, direction)
  async getDriverAssignment() {
    const { data } = await http.get("/driver/assignment");
    return data; // { assignment: {...} }
  },

  // ✅ Get route shape (polyline) for map display
  async getRouteShape(routeId: string, direction?: "to" | "fro") {
    const params = direction ? { direction } : {};
    const { data } = await http.get(`/routes/${routeId}/shape`, { params });
    return data; // { points: [{lat, lng}, ...], from_cache: boolean }
  },
};

console.log("[API] Using base URL:", API_BASE_URL);
console.log("[WS] Using WebSocket URL:", WS_URL);
export { http };
