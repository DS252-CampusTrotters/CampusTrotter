// transvahan-user/src/screens/DriverDashboardTab.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import { useAuth } from "../auth/authContext";
import DemandIndicator from "../components/DemandIndicator";
import { apiClient } from "../api/client";

const API_BASE_URL = "https://<NGROK_BACKEND_URL>";
const ASPECT_RATIO = Dimensions.get("window").width / Dimensions.get("window").height;

export default function DriverDashboardTab() {
  const { token, user } = useAuth();
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [vehicleId, setVehicleId] = useState<string>("");
  const [routeId, setRouteId] = useState<string | null>(null);

  const [occupancy, setOccupancy] = useState<number>(0);
  const [capacity, setCapacity] = useState<number>(4);
  const [tripActive, setTripActive] = useState<boolean>(false);
  const [demandHigh, setDemandHigh] = useState<boolean>(false);

  const cleanupRef = useRef<(() => void) | null>(null);
  const wsCleanupRef = useRef<(() => void) | null>(null);

  /* ------------------------ Fetch Driver Assignment ------------------------ */
  useEffect(() => {
    (async () => {
      try {
        if (!apiClient.getDriverAssignment) return;
        const data = await apiClient.getDriverAssignment();
        const a = data?.assignment || data;
        if (a) {
          if (a.vehicle_id) setVehicleId(a.vehicle_id);
          if (a.route_id) setRouteId(String(a.route_id));
        }
      } catch (err) {
        console.warn("⚠️ Could not load driver assignment:", (err as any)?.message || err);
        // Fallback (legacy constant) if absolutely needed
        if (!vehicleId) setVehicleId("BUS-101");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------ Fetch Current Vehicle ------------------------ */
  useEffect(() => {
    if (!vehicleId) return;
    const fetchVehicle = async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/vehicle/${vehicleId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOccupancy(data.occupancy ?? 0);
        setCapacity(data.capacity ?? 4);
        setDemandHigh(!!data.demand_high);
      } catch (err) {
        console.warn("⚠️ Could not load vehicle:", (err as any)?.message || err);
      }
    };
    fetchVehicle();
  }, [vehicleId, token]);

  /* ------------------------ WS subscribe to vehicle feed ------------------------ */
  useEffect(() => {
    (async () => {
      wsCleanupRef.current = await apiClient.subscribeVehicles((msg: any) => {
        if (msg.type === "vehicle" && msg?.data?.id) {
          const v = msg.data;
          if (!vehicleId) return;
          if (v.id === vehicleId || v.vehicle_id === vehicleId) {
            if (typeof v.occupancy === "number") setOccupancy(v.occupancy);
            if (typeof v.capacity === "number") setCapacity(v.capacity);
            setDemandHigh(!!v.demand_high);
          }
        }
        if (msg.type === "demand_update") {
          const d = msg.data;
          if (d?.vehicle_id === vehicleId) setDemandHigh(!!d.demand_high);
        }
      });
    })();

    return () => {
      if (wsCleanupRef.current) wsCleanupRef.current();
    };
  }, [vehicleId]);

  /* ------------------------ Location + Telemetry Loop ------------------------ */
  useEffect(() => {
    (async () => {
      if (!vehicleId) {
        // wait until assignment / vehicle resolved
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location access required to update shuttle position.");
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
      setLoading(false);

      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // update every 5s
          distanceInterval: 5, // or every 5 meters
        },
        async (pos) => {
          setLocation(pos);
          try {
            await axios.post(
              `${API_BASE_URL}/driver/telemetry`,
              {
                vehicleId,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                occupancy,
                status: tripActive ? "running" : "idle",
                route_id: routeId || undefined,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log("✅ Telemetry sent", pos.coords);
          } catch (err) {
            console.warn("❌ Telemetry failed:", (err as any)?.message || err);
          }
        }
      );

      cleanupRef.current = () => watcher.remove();
    })();

    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [tripActive, occupancy, vehicleId, routeId, token]);

  /* ------------------------ Occupancy Control ------------------------ */
  const updateOccupancy = async (delta: number) => {
    if (!vehicleId) return;
    try {
      const newOcc = Math.max(0, Math.min(capacity, occupancy + delta));
      setOccupancy(newOcc);
      await axios.post(
        `${API_BASE_URL}/driver/occupancy`,
        { vehicleId, delta },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      Alert.alert("Update Failed", "Could not update occupancy.");
    }
  };

  /* ------------------------ Trip Control ------------------------ */
  const toggleTrip = async () => {
    if (!vehicleId) return;
    try {
      const action = tripActive ? "stop" : "start";
      await axios.post(
        `${API_BASE_URL}/driver/trip`,
        { vehicleId, action, route_id: routeId || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTripActive(!tripActive);
    } catch (err) {
      Alert.alert("Trip Control Failed", "Could not update trip status.");
      console.error(err);
    }
  };

  /* ------------------------ Demand Button ------------------------ */
  const sendDemand = async () => {
    try {
      if (!vehicleId) {
        Alert.alert("Missing vehicle", "No vehicle assigned to this driver.");
        return;
      }
      if (!location?.coords) {
        Alert.alert("Location missing", "Current GPS fix not available.");
        return;
      }
      if (!routeId) {
        Alert.alert("Missing route", "No route assigned. Contact admin.");
        return;
      }
      const body: {
        vehicle_id: string;
        route_id: string;
        direction?: "to" | "fro";
        stop_id?: string | null;
        lat: number;
        lon: number;
        high?: boolean;
        occupancy?: number;
      } = {
        vehicle_id: vehicleId,
        route_id: routeId,
        direction: "to",
        stop_id: null,
        lat: Number(location.coords.latitude),
        lon: Number(location.coords.longitude),
        high: true,
        occupancy,
      };
      setDemandHigh(true);
      await apiClient.sendDemand!(body);
    } catch (err) {
      setDemandHigh(false);
      Alert.alert("Failed", "Could not send demand signal.");
    }
  };

  /* ------------------------ UI ------------------------ */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text>Fetching GPS location...</Text>
      </View>
    );
  }

  const region = location
    ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01 * ASPECT_RATIO,
      }
    : {
        latitude: 13.0213,
        longitude: 77.567,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01 * ASPECT_RATIO,
      };

  return (
    <View style={{ flex: 1 }}>
      <MapView provider={PROVIDER_GOOGLE} style={{ flex: 0.6 }} region={region} showsUserLocation>
        {location && (
          <Marker
            coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
            title={user?.name || "Driver"}
            description={
              vehicleId
                ? `Vehicle ${vehicleId}${routeId ? ` • Route ${routeId}` : ""}`
                : "No vehicle assigned"
            }
          />
        )}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.driverName}>{user?.name || "Driver"}</Text>
        <Text style={styles.subText}>{user?.email}</Text>
        <Text style={styles.subText}>
          Vehicle: {vehicleId || "—"} {routeId ? `• Route ${routeId}` : ""}
        </Text>

        <View style={{ marginTop: 8, marginBottom: 12 }}>
          <DemandIndicator high={demandHigh} />
        </View>

        <View style={styles.occRow}>
          <TouchableOpacity style={styles.occBtn} onPress={() => updateOccupancy(-1)}>
            <Text style={styles.occBtnText}>−</Text>
          </TouchableOpacity>

          <Text style={styles.occValue}>
            {occupancy} / {capacity}
          </Text>

          <TouchableOpacity style={styles.occBtn} onPress={() => updateOccupancy(+1)}>
            <Text style={styles.occBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <TouchableOpacity
            style={[styles.tripBtn, { backgroundColor: "#16a34a", flex: 1 }]}
            onPress={toggleTrip}
            disabled={!vehicleId}
          >
            <Text style={styles.tripBtnText}>
              {tripActive ? "Stop Trip" : "Start Trip"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tripBtn, { backgroundColor: "#2563eb", flex: 1 }]}
            onPress={sendDemand}
            disabled={!vehicleId || !routeId}
          >
            <Text style={styles.tripBtnText}>High demand here</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  panel: {
    flex: 0.4,
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  driverName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  subText: { color: "#555", marginBottom: 4 },
  occRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  occBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  occBtnText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  occValue: { fontSize: 24, fontWeight: "800", marginHorizontal: 16 },
  tripBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  tripBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
