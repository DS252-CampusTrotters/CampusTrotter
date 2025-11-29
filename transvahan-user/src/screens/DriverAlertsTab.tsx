// src/screens/DriverAlertsTab.tsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

const API_BASE_URL = "https://<NGROK_BACKEND_URL>";
// ✅ Add role hint to WebSocket URL
const WS_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws?role=driver";

export default function DriverAlertsTab() {
  const { colors: C } = useTheme();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // 🔐 Retrieve saved JWT token
  const getToken = async () => {
    const keys = ["auth_token", "token", "jwt", "accessToken"];
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
  };

  // 🧭 Fetch latest driver alerts (REST fallback)
  const fetchAlerts = useCallback(async () => {
    try {
      setRefreshing(true);
      const token = await getToken();
      const { data } = await axios.get(`${API_BASE_URL}/alerts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const filtered = Array.isArray(data)
        ? data.filter((a) =>
            ["drivers", "driver", "all"].includes(
              String(a.target).toLowerCase()
            )
          )
        : [];
      setAlerts(filtered);
    } catch (err) {
      console.warn("⚠️ Driver Alerts fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 🔔 Real-time alerts via WebSocket
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = async () => {
      const token = await getToken();
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🚚 [Driver WS] Connected:", WS_URL);
        if (token) {
          ws.send(JSON.stringify({ type: "auth", token }));
          console.log("📨 [Driver WS] Sent auth token");
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type?.toLowerCase();
          const data = msg.data || {};
          const target = String(msg.audience || data.target || "").toLowerCase();

          // Debug logging
          console.log("📩 [Driver WS] Received:", type, target, data);

          if (type === "alert" || type === "alert_created") {
            // Show only driver or all alerts
            if (!["drivers", "driver", "all"].includes(target)) {
              console.log("⏭️ Skipping alert not for driver:", target);
              return;
            }

            setAlerts((prev) => {
              if (prev.some((a) => a.id === data.id)) return prev; // avoid duplicates
              return [{ ...data, id: data.id || Date.now().toString() }, ...prev];
            });

            Alert.alert("🔔 New Alert", data.message || "New alert received");
          } else if (type === "alert_resolved") {
            setAlerts((prev) =>
              prev.map((a) =>
                a.id === data.id ? { ...a, resolved: true } : a
              )
            );
          } else if (type === "alert_deleted") {
            setAlerts((prev) => prev.filter((a) => a.id !== data.id));
          }
        } catch (err) {
          console.warn("⚠️ WS parse error:", err);
        }
      };

      ws.onerror = (err) => {
        console.warn("❌ [Driver WS] Error:", err);
      };

      ws.onclose = (e) => {
        console.log("🔕 [Driver WS] Disconnected:", e.reason);
        // Auto-reconnect after 5s (optional)
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      };
    };

    connectWebSocket();
    fetchAlerts(); // initial load

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchAlerts]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.successText} />
        <Text style={{ color: C.text, marginTop: 8 }}>Loading alerts...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={["top"]}>
      <Text style={[styles.header, { color: C.successText }]}>Driver Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item, index) => item.id || index.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchAlerts} tintColor={C.successText} />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }, item.resolved && styles.resolvedCard]}>
            <Text style={[styles.title, { color: C.text }]}>Alert</Text>
            <Text style={[styles.body, { color: C.text }]}>{item.message}</Text>
            <Text style={[styles.time, { color: C.mutedText }]}>
              {new Date(item.createdAt || Date.now()).toLocaleString()}
              {item.resolved ? " ✅ Resolved" : ""}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: C.mutedText }]}>No alerts yet</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#16a34a",
    borderWidth: 1,
  },
  resolvedCard: { opacity: 0.6, borderLeftColor: "#22c55e" },
  title: { fontWeight: "700", fontSize: 16, marginBottom: 4 },
  body: { marginBottom: 6 },
  time: { fontSize: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", marginTop: 20 },
});
