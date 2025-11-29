/**
 * src/hooks/useAlerts.ts
 * FINAL ROLE-AWARE VERSION ✅
 * - Listens to WebSocket alerts only for the logged-in role
 * - Falls back to REST polling if WS disconnects
 */

import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import { useAuth } from "../auth/authContext";
import { apiClient } from "../api/client";

const API = Constants.expoConfig?.extra?.API_BASE_URL;

export function useAlerts() {
  const lastShown = useRef<string | null>(null);
  const { token, isDriver, user } = useAuth();

  useEffect(() => {
    let disconnectWs: (() => void) | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    // infer role
    const role = isDriver
      ? "driver"
      : user?.role?.toLowerCase() === "admin"
      ? "admin"
      : "user";

    console.log(`🔔 [useAlerts] Initialized for role=${role}`);

    // --- WebSocket subscription ---
    async function initWs() {
      try {
        // subscribeAlerts may or may not return an unsubscribe function; handle both cases
        let maybeUnsub: any = null;
        if (apiClient && typeof apiClient.subscribeAlerts === "function") {
          maybeUnsub = await apiClient.subscribeAlerts((msg: any) => {
            if (!msg || !msg.message) return;

            const target = (msg.target || "all").toLowerCase();

            // 🚫 Skip alerts not meant for this role
            if (
              (target === "drivers" && role !== "driver") ||
              (target === "users" && role !== "user") ||
              (target === "admins" && role !== "admin")
            ) {
              console.log(
                `🚫 Ignored alert for target=${target} (current=${role})`
              );
              return;
            }

            // ✅ Prevent duplicates
            if (msg.createdAt && msg.createdAt === lastShown.current) return;
            lastShown.current = msg.createdAt;

            console.log(
              `⚠️ Received alert [target=${target}, role=${role}]: ${msg.message}`
            );
            Alert.alert("⚠️ Shuttle Alert", msg.message);
          });
        } else {
          console.warn("apiClient.subscribeAlerts is not available, falling back to polling.");
        }

        if (typeof maybeUnsub === "function") {
          disconnectWs = maybeUnsub;
        } else {
          // subscribeAlerts didn't provide an unsubscribe function; set to null
          disconnectWs = null;
        }
      } catch (err) {
        console.warn("⚠️ WebSocket alert subscription failed:", err);
        // fallback to REST polling if WS fails
        startPolling();
      }
    }

    // --- REST polling fallback (every 10s) ---
    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API}/alerts`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (data.length > 0) {
            const latest = data[0];
            const target = (latest.target || "all").toLowerCase();

            if (
              (target === "drivers" && role !== "driver") ||
              (target === "users" && role !== "user") ||
              (target === "admins" && role !== "admin")
            )
              return;

            if (latest.createdAt !== lastShown.current) {
              lastShown.current = latest.createdAt;
              Alert.alert("⚠️ Shuttle Alert", latest.message);
            }
          }
        } catch (err) {
          console.warn("Alerts REST fetch failed:", err);
        }
      }, 10000);
    }

    initWs();

    return () => {
      if (disconnectWs) {
        console.log("🔌 [useAlerts] Cleaning up WebSocket subscription.");
        disconnectWs();
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [token, isDriver]);
}
