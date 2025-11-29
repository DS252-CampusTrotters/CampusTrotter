/**
 * transvahan-user/src/api/ws.ts
 * Multi-subscriber WebSocket with role + auth + normalization.
 * All screens (vehicles, reservations, alerts, heat) share a single WS.
 */

import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

console.log("🚀 [TransVahan WS] DEFENSIVE NORMALIZER ACTIVE");

// Get API base from Expo config, fallback to explicit URL
const FALLBACK_API = "https://<NGROK_BACKEND_URL>";

const API_BASE_URL: string =
  ((Constants as any)?.expoConfig?.extra?.API_BASE_URL as string) ||
  FALLBACK_API;

const WS_RETRY_INTERVAL = 2000;

// Single shared WebSocket + state
let currentWs: WebSocket | null = null;
let isConnecting = false;
let reconnectTimer: any = null;

// All active subscribers (vehicles, reservations, alerts, etc.)
const subscribers = new Set<(msg: any) => void>();

// NetInfo subscription (single)
let netInfoSubscription: any = null;

// Last known role/token for reconnects
let lastRole: "user" | "driver" | "admin" = "user";
let lastToken: string | null = null;

// --------- Role & token detection ---------

async function detectRole(): Promise<"user" | "driver" | "admin"> {
  try {
    // Check auth_user first (most reliable source of truth)
    const userJson = await AsyncStorage.getItem("auth_user");
    if (userJson) {
      const user = JSON.parse(userJson);
      const raw = (
        user?.role ||
        user?.type ||
        user?.roleName ||
        user?.userRole ||
        user?.category ||
        ""
      )
        .toString()
        .toLowerCase()
        .trim();

      if (["driver", "drivers"].includes(raw)) return "driver";
      if (["admin", "admins"].includes(raw)) return "admin";
      return "user";
    }

    // Fallback to last_login_endpoint if no auth_user
    const lastLoginUrl = await AsyncStorage.getItem("last_login_endpoint");
    if (lastLoginUrl?.includes("/driver/login")) return "driver";

    return "user";
  } catch {
    return "user";
  }
}

async function getAuthToken(): Promise<string | null> {
  try {
    const keys = ["auth_token", "token", "accessToken", "jwt"];
    for (const k of keys) {
      const v = await AsyncStorage.getItem(k);
      if (v) return v;
    }
    const userJson = await AsyncStorage.getItem("auth_user");
    if (userJson) {
      const user = JSON.parse(userJson);
      return (
        user?.token ||
        user?.authToken ||
        user?.accessToken ||
        user?.jwt ||
        user?.idToken ||
        null
      );
    }
    return null;
  } catch {
    return null;
  }
}

// --------- Message normalization & audience filter ---------

function normalizeAndFilterMessage(msg: any, role: "user" | "driver" | "admin") {
  if (!msg || typeof msg !== "object") return null;

  let type = (msg.type || "").toString();
  if (type === "alert" || type === "alert_created") type = "alert_created";
  if (type === "alert_resolved") type = "alert_resolved";
  if (type === "alert_deleted") type = "alert_deleted";
  if (type === "demand_update") type = "demand_update";
  if (type === "vehicle_update") type = "vehicle"; // normalize alias

  const payload = msg?.data ?? msg;
  const audience = (msg?.audience ?? payload?.target ?? "all")
    .toString()
    .toLowerCase();

  const mismatch =
    (audience === "users" && role !== "user") ||
    (audience === "drivers" && role !== "driver") ||
    (audience === "admins" && role !== "admin");

  if (mismatch) {
    // console.log(`🚫 Dropping message type=${type} audience=${audience} for role=${role}`);
    return null;
  }

  return { type, audience, data: payload };
}

// --------- Internal connect logic ---------

function buildWsUrl(base: string, role: string) {
  const proto = base.startsWith("https") ? "wss:" : "ws:";
  return base.replace(/^https?:/, proto) + `/ws?role=${encodeURIComponent(role)}`;
}

function attachNetInfo(connectFn: () => void) {
  if (netInfoSubscription) return;
  netInfoSubscription = NetInfo.addEventListener((s) => {
    if (s.isConnected) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectFn, 1000);
    }
  });
}

function internalConnect(role: "user" | "driver" | "admin", token: string | null) {
  if (isConnecting) return;
  if (currentWs) {
    if (currentWs.readyState === WebSocket.OPEN) {
      // re-auth in case token changed
      if (token) {
        currentWs.send(JSON.stringify({ type: "auth", token }));
      }
      return;
    }
    if (currentWs.readyState === WebSocket.CONNECTING) return;
  }

  const wsUrl = buildWsUrl(API_BASE_URL, role);
  console.log("🔌 [WS] Connecting to:", wsUrl);

  isConnecting = true;

  try {
    currentWs = new WebSocket(wsUrl);
  } catch (err) {
    console.warn("❌ [WS] Failed to create WebSocket:", err);
    isConnecting = false;
    return;
  }

  const messageQueue: string[] = [];

  function sendSafe(obj: any) {
    const msg = JSON.stringify(obj);
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      currentWs.send(msg);
    } else {
      messageQueue.push(msg);
    }
  }

  function flushQueue() {
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      if (msg) currentWs.send(msg);
    }
  }

  currentWs.onopen = () => {
    isConnecting = false;
    console.log("✅ [WS] Connected");
    if (token) sendSafe({ type: "auth", token });
    setTimeout(flushQueue, 200);
  };

  currentWs.onmessage = (ev) => {
    let raw: any;
    try {
      raw = JSON.parse(ev.data);
    } catch {
      return;
    }

    const normalized = normalizeAndFilterMessage(raw, role);
    if (!normalized) return;

    subscribers.forEach((fn) => {
      try {
        fn({
          type: normalized.type,
          data: normalized.data,
          audience: normalized.audience,
        });
      } catch (err) {
        console.warn("⚠️ [WS] Subscriber error:", err);
      }
    });
  };

  currentWs.onerror = (err) => {
    console.warn("⚠️ [WS] Error:", err);
  };

  currentWs.onclose = () => {
    console.log("❌ [WS] Closed");
    isConnecting = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (subscribers.size > 0) {
      reconnectTimer = setTimeout(async () => {
        const roleNow = lastRole;
        const tokenNow = lastToken;
        internalConnect(roleNow, tokenNow);
      }, WS_RETRY_INTERVAL);
    }
  };
}

// --------- Public API: wsConnect ---------

/**
 * wsConnect(onMessage) → cleanup()
 *
 * - Registers a subscriber for normalized WS messages.
 * - Starts / reuses a single underlying WebSocket.
 * - Returns a cleanup function (unsubscribe + close WS if no listeners).
 */
export function wsConnect(onMessage: (data: any) => void): () => void {
  subscribers.add(onMessage);

  // Lazy-start connection
  (async () => {
    const role = await detectRole();
    const token = await getAuthToken();
    lastRole = role;
    lastToken = token;
    attachNetInfo(() => internalConnect(role, token));
    internalConnect(role, token);
  })();

  // Cleanup: remove this subscriber, and if none left, close WS
  return () => {
    subscribers.delete(onMessage);
    if (subscribers.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (currentWs) {
        try {
          currentWs.close();
        } catch {
          /* ignore */
        }
        currentWs = null;
      }
      if (netInfoSubscription?.remove) {
        netInfoSubscription.remove();
        netInfoSubscription = null;
      }
    }
  };
}
