// src/screens/DriverOccupancyTab.tsx
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import axios from "axios";
import { useAuth } from "../auth/authContext";

export default function DriverOccupancyTab() {
  const { token, user } = useAuth();
  const [occupancy, setOccupancy] = useState<number>(0);
  const [capacity, setCapacity] = useState<number>(4);
  const [vehicleId] = useState<string>("BUS-101"); // ✅ Replace later with driver's selected vehicle

const API_BASE_URL = "https://<NGROK_BACKEND_URL>";

  useEffect(() => {
    // Optional: fetch initial occupancy from backend (via /vehicles)
    const fetchVehicle = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/vehicles/${vehicleId}`);
        setOccupancy(res.data?.occupancy ?? 0);
        setCapacity(res.data?.capacity ?? 4);
      } catch (err) {
        if (err instanceof Error) {
          console.warn("⚠️ Could not load vehicle:", err.message);
        } else {
          console.warn("⚠️ Could not load vehicle:", err);
        }
      }
    };
    fetchVehicle();
  }, [vehicleId]);

  const updateOccupancy = async (delta: number) => {
    try {
      const newOcc = Math.max(0, Math.min(capacity, occupancy + delta));
      setOccupancy(newOcc);

      await axios.post(
        `${API_BASE_URL}/driver/occupancy`,
        { vehicleId, delta },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      Alert.alert("Update Failed", "Could not update occupancy");
      console.error("❌ Occupancy update error:", err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Occupancy Control</Text>
      <Text style={styles.subheader}>Driver: {user?.name ?? "Unknown"}</Text>
      <Text style={styles.count}>
        {occupancy} / {capacity}
      </Text>

      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#16a34a" }]}
          onPress={() => updateOccupancy(+1)}
        >
          <Text style={styles.btnText}>+1</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#dc2626" }]}
          onPress={() => updateOccupancy(-1)}
        >
          <Text style={styles.btnText}>−1</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 6 },
  subheader: { fontSize: 16, color: "#555", marginBottom: 20 },
  count: { fontSize: 40, fontWeight: "800", marginBottom: 30 },
  btnRow: { flexDirection: "row", gap: 20 },
  btn: { padding: 20, borderRadius: 12, minWidth: 80, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 22, fontWeight: "700" },
});
