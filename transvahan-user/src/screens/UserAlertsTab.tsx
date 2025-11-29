// transvahan-user/src/screens/UserAlertsTab.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/authContext";
import { useTheme } from "../context/ThemeContext";
import { apiClient, http } from "../api/client";
import { filterAlertForRole } from "../api/alerts-utils";

type AlertItem = {
  id: string;
  message: string;
  title?: string;
  route_id?: string | null;
  vehicle_id?: string | null;
  type?: string;
  target?: "all" | "users" | "drivers" | "admins";
  audience?: "all" | "users" | "drivers" | "admins";
  createdAt?: string; // ISO
  resolved?: boolean;
  createdBy?: any;
};

function normalizeIncomingAlert(raw: any): AlertItem | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;

  const id =
    data.id ||
    raw.id ||
    data.alert_id ||
    data._id ||
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const message = data.message || raw.message;
  if (!message) return null;

  return {
    id: String(id),
    message: String(message),
    title: data.title || raw.title || "Alert",
    route_id: data.route_id ?? null,
    vehicle_id: data.vehicle_id ?? null,
    type: data.type || raw.type || "general",
    target: data.target || raw.target || data.audience || raw.audience || "all",
    audience: raw.audience || data.audience,
    createdAt: data.createdAt || raw.createdAt || new Date().toISOString(),
    resolved: !!(data.resolved ?? raw.resolved),
    createdBy: data.createdBy || raw.createdBy || null,
  };
}

export default function UserAlertsTab() {
  const { user, isDriver } = useAuth();
  const { colors: C } = useTheme();
  const role: "user" | "driver" | "admin" = useMemo(() => {
    if (isDriver) return "driver";
    if (user?.role?.toLowerCase() === "admin") return "admin";
    return "user";
  }, [isDriver, user?.role]);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // prevent duplicate inserts on WS bursts
  const seenIdsRef = useRef<Set<string>>(new Set());

  const applyFreshList = useCallback(
    (list: any[]) => {
      const normalized = (Array.isArray(list) ? list : [])
        .map(normalizeIncomingAlert)
        .filter(Boolean) as AlertItem[];

      const filtered = normalized.filter((a) => filterAlertForRole(a, role));

      // rebuild seenIds based on fresh list
      const newSeen = new Set<string>();
      filtered.forEach((a) => newSeen.add(a.id));
      seenIdsRef.current = newSeen;

      setAlerts(filtered);
    },
    [role]
  );

  // ✅ Fetch latest alerts (AUTH-aware)
  const fetchAlerts = useCallback(async () => {
    try {
      setRefreshing(true);

      // Prefer apiClient if available; it uses authenticated axios instance.
      let data: any[] = [];
      if (apiClient?.getAlerts) {
        data = await apiClient.getAlerts();
      } else {
        const resp = await http.get("/alerts");
        data = resp.data;
      }

      applyFreshList(data);
    } catch (err) {
      console.warn("⚠️ Alerts fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyFreshList]);

  // ✅ Realtime WS via central ws.ts (role + auth + reconnect)
  useEffect(() => {
    let disconnect: (() => void) | null = null;
    let mounted = true;

    (async () => {
      try {
        if (apiClient?.subscribeAlerts) {
          disconnect = await apiClient.subscribeAlerts((msg: any) => {
            if (!mounted || !msg) return;

            const type = (msg.type || "").toString().toLowerCase();
            const incoming = normalizeIncomingAlert(msg);
            const payload = incoming || normalizeIncomingAlert(msg.data);

            if (
              type === "alert" ||
              type === "alert_created" ||
              type === "alert_created".toLowerCase()
            ) {
              if (!payload) return;
              if (!filterAlertForRole(payload, role)) return;

              // dedupe
              if (seenIdsRef.current.has(payload.id)) return;
              seenIdsRef.current.add(payload.id);

              setAlerts((prev) => [payload, ...prev]);
              return;
            }

            if (type === "alert_resolved") {
              const id = msg.data?.id || msg.id;
              if (!id) return;
              setAlerts((prev) =>
                prev.map((a) =>
                  a.id === String(id) ? { ...a, resolved: true } : a
                )
              );
              return;
            }

            if (type === "alert_deleted") {
              const id = msg.data?.id || msg.id;
              if (!id) return;
              seenIdsRef.current.delete(String(id));
              setAlerts((prev) => prev.filter((a) => a.id !== String(id)));
              return;
            }
          });
        } else {
          console.warn("apiClient.subscribeAlerts not available. Alerts will be REST-only.");
        }
      } catch (err) {
        console.warn("⚠️ Alerts WS subscription failed:", err);
      }
    })();

    fetchAlerts(); // initial fetch

    return () => {
      mounted = false;
      if (disconnect) disconnect();
    };
  }, [fetchAlerts, role]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ marginTop: 8, color: C.text }}>Loading alerts...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={["top"]}>
      <Text style={[styles.header, { color: C.primary }]}>Service Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchAlerts} tintColor={C.primary} />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, item.resolved && styles.resolvedCard]}>
            <Text style={[styles.title, { color: C.text }]}>{item.title || "Alert"}</Text>
            <Text style={[styles.body, { color: C.text }]}>{item.message}</Text>
            <Text style={[styles.time, { color: C.mutedText }]}>
              {new Date(item.createdAt || Date.now()).toLocaleString()}
              {item.resolved ? " ✅ Resolved" : ""}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: C.mutedText }]}>No active alerts</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  card: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
    borderWidth: 1,
  },
  resolvedCard: {
    opacity: 0.6,
    borderLeftColor: "#22c55e",
  },
  title: { fontWeight: "700", fontSize: 16, marginBottom: 4 },
  body: { marginBottom: 6 },
  time: { fontSize: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 20 },
});