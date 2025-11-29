import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "../auth/authContext";
import { apiClient } from "../api/client";
import { wsConnect } from "../api/ws";
import DemandIndicator from "../components/DemandIndicator";

const ASPECT_RATIO =
  Dimensions.get("window").width / Dimensions.get("window").height;

export type DirectionKey = "to" | "fro";

// Stop type from backend
interface RouteStop {
  stop_id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
}

// Route shape point
interface RoutePoint {
  lat: number;
  lng: number;
}

export default function DriverMapTab() {
  const { user } = useAuth();

  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [direction, setDirection] = useState<DirectionKey>("to");

  // 🗺️ Route display data
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routePolyline, setRoutePolyline] = useState<RoutePoint[]>([]);
  const [routeColor, setRouteColor] = useState<string>("#2563eb"); // Default blue

  const [tripActive, setTripActive] = useState(false);
  const [tripBusy, setTripBusy] = useState(false);

  const [occupancy, setOccupancy] = useState(0);
  const [capacity, setCapacity] = useState(4);
  const [demandHigh, setDemandHigh] = useState<boolean>(false);

  const cleanupRef = useRef<(() => void) | null>(null);
  const gpsWatchRef = useRef<Location.LocationSubscription | null>(null);
  const mapRef = useRef<MapView | null>(null);

  // ✅ prevent auto-flip from server noise
  const manualLockRef = useRef<number>(0);
  const lastServerStatusRef = useRef<string | null>(null);
  const serverStatusStreakRef = useRef<number>(0);

  // ------------------------ Load assignment WITH route data ------------------------
  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.getDriverAssignment?.();
        const a = data?.assignment || data;
        if (a) {
          setVehicleId(a.vehicle_id);
          setRouteId(String(a.route_id));
          setRouteName(a.route_name || a.route_id);
          setDirection(a.direction === "fro" ? "fro" : "to");

          // 🗺️ Load route stops for map display
          if (a.stops && Array.isArray(a.stops)) {
            setRouteStops(a.stops);
          }

          // 🗺️ Load route polyline for map display
          if (a.route_shape?.points && Array.isArray(a.route_shape.points)) {
            setRoutePolyline(a.route_shape.points);
          }

          // 🎨 Set route color
          if (a.route_color) {
            setRouteColor(a.route_color);
          }
        }
      } catch (err: any) {
        console.warn("⚠️ assignment load failed", err?.message || err);
      }
    })();
  }, []);

  // ------------------------ Fetch route shape if not in assignment ------------------------
  useEffect(() => {
    if (!routeId || routePolyline.length > 0) return;

    (async () => {
      try {
        // Fetch route shape from backend
        const shapeData = await apiClient.getRouteShape?.(routeId, direction);
        if (shapeData?.points && Array.isArray(shapeData.points)) {
          setRoutePolyline(shapeData.points);
        }
      } catch (err: any) {
        console.warn("⚠️ Could not fetch route shape:", err?.message);
      }
    })();
  }, [routeId, direction, routePolyline.length]);

  // ------------------------ Load vehicle snapshot ------------------------
  useEffect(() => {
    if (!vehicleId) return;
    (async () => {
      try {
        const res = await apiClient.getVehicles();
        const v = (res as any[])?.find(
          (x) => x.id === vehicleId || x.vehicle_id === vehicleId
        );
        if (v) {
          setOccupancy(v.occupancy ?? 0);
          setCapacity(v.capacity ?? 4);
          setDemandHigh(!!v.demand_high);
          setTripActive(v.status === "active");
        }
      } catch {}
    })();
  }, [vehicleId]);

  // ------------------------ helper: burst telemetry instantly ------------------------
  const sendTelemetryBurst = useCallback(
    async (lat?: number, lng?: number, statusOverride?: "active" | "idle") => {
      if (!vehicleId) return;
      const latNum =
        Number.isFinite(Number(lat)) && lat != null
          ? Number(lat)
          : location?.coords?.latitude;
      const lngNum =
        Number.isFinite(Number(lng)) && lng != null
          ? Number(lng)
          : location?.coords?.longitude;

      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

      try {
        await apiClient.sendTelemetry?.({
          vehicleId,
          lat: latNum,
          lng: lngNum,
          occupancy,
          status: statusOverride || (tripActive ? "active" : "idle"),
          route_id: routeId || undefined,
          direction,
        });
      } catch {}
    },
    [vehicleId, routeId, direction, tripActive, location, occupancy]
  );

  // ------------------------ LOCATION + TELEMETRY LOOP (fast) ------------------------
  useEffect(() => {
    if (!vehicleId) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Location access required for live updates."
        );
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation(loc);
      setLoading(false);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 1200,
          distanceInterval: 3,
        },
        async (pos) => {
          setLocation(pos);
          if (!tripActive) return;
          await sendTelemetryBurst(
            pos.coords.latitude,
            pos.coords.longitude,
            "active"
          );
        }
      );

      gpsWatchRef.current = sub;
    })();

    return () => {
      gpsWatchRef.current?.remove();
      gpsWatchRef.current = null;
    };
  }, [vehicleId, tripActive, sendTelemetryBurst]);

  // ------------------------ WS alerts + vehicle/demand updates ------------------------
  useEffect(() => {
    if (!vehicleId) return;
    const cleanup = wsConnect((msg) => {
      if (msg.type === "alert") {
        Alert.alert("⚠️ Admin Alert", msg.message);
      }

      if (
        (msg.type === "vehicle" || msg.type === "vehicle_update") &&
        msg?.data
      ) {
        const v = msg.data;
        const id = v?.id || v?.vehicle_id;
        if (String(id) !== String(vehicleId)) return;

        if (typeof v.occupancy === "number") setOccupancy(v.occupancy);
        if (typeof v.capacity === "number") setCapacity(v.capacity);
        if (typeof v.status === "string") {
          const s = v.status.toLowerCase();
          const now = Date.now();
        
          if (lastServerStatusRef.current === s) {
            serverStatusStreakRef.current += 1;
          } else {
            lastServerStatusRef.current = s;
            serverStatusStreakRef.current = 1;
          }
        
          const stableEnough = serverStatusStreakRef.current >= 2;
          const manualLockExpired = now > manualLockRef.current;
        
          if (stableEnough && manualLockExpired) {
            if (s === "active") setTripActive(true);
            if (s === "idle" || s === "stopped" || s === "stop") setTripActive(false);
          }
        }
        setDemandHigh(!!v.demand_high);
      }

      if (msg.type === "demand_update") {
        const d = msg.data;
        if (String(d?.vehicle_id) === String(vehicleId)) {
          setDemandHigh(!!d.demand_high);
        }
      }
    });

    cleanupRef.current = cleanup;
    return () => cleanupRef.current?.();
  }, [vehicleId]);

  // ------------------------ Trip controls (FAST) ------------------------
  const toggleTrip = async () => {
    if (!vehicleId || tripBusy) return;

    const nextActive = !tripActive;
    const action = nextActive ? "start" : "stop";

    setTripActive(nextActive);
    setTripBusy(true);
    manualLockRef.current = Date.now() + 8000; // ✅ ignore server flips for 8s
    let startLat: number | undefined;
    let startLng: number | undefined;

    if (action === "start") {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        startLat = pos.coords.latitude;
        startLng = pos.coords.longitude;
      } catch {
        if (location?.coords) {
          startLat = location.coords.latitude;
          startLng = location.coords.longitude;
        }
      }
    }

    try {
      const resp = await apiClient.controlTrip?.({
        vehicleId,
        action,
        route_id: routeId || undefined,
        lat: startLat,
        lng: startLng,
      });

      const newDir =
        resp?.data?.direction || resp?.direction || null;

      if (action === "start" && (newDir === "to" || newDir === "fro")) {
        setDirection(newDir);
      }

      await sendTelemetryBurst(startLat, startLng, nextActive ? "active" : "idle");
    } catch (err) {
      setTripActive(!nextActive);
      Alert.alert("Trip Control Failed", "Could not update trip status.");
    } finally {
      setTripBusy(false);
    }
  };

  const changeOccupancy = async (delta: number) => {
    if (!vehicleId) return;
    try {
      const next = Math.max(0, Math.min(capacity, occupancy + delta));
      setOccupancy(next);
      await apiClient.updateOccupancy?.({ vehicleId, delta });
    } catch {
      Alert.alert("Error", "Failed to update occupancy");
    }
  };

  const sendDemand = async () => {
    try {
      if (!vehicleId || !routeId) return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const body = {
        vehicle_id: vehicleId,
        route_id: routeId,
        direction,
        stop_id: null,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        high: true,
        occupancy,
      };
      setDemandHigh(true);
      await apiClient.sendDemand?.(body);
    } catch {
      setDemandHigh(false);
      Alert.alert("Failed", "Could not send demand signal.");
    }
  };

  // ------------------------ UI ------------------------
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
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

  // Get next stop based on current position
  const getNextStopIndex = () => {
    if (!location || routeStops.length === 0) return 0;
    const driverLat = location.coords.latitude;
    const driverLng = location.coords.longitude;

    let minDist = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < routeStops.length; i++) {
      const stop = routeStops[i];
      const dist = Math.sqrt(
        Math.pow(stop.lat - driverLat, 2) + Math.pow(stop.lng - driverLng, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    // Return next stop (or current if at last stop)
    return Math.min(closestIdx, routeStops.length - 1);
  };

  const nextStopIdx = getNextStopIndex();
  const nextStop = routeStops[nextStopIdx];

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        mapType="none"
        initialRegion={region}
        showsUserLocation
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          zIndex={0}
        />

        {/* 🗺️ Route polyline - driver's assigned route only */}
        {routePolyline.length > 1 && (
          <Polyline
            coordinates={routePolyline.map((p) => ({
              latitude: p.lat,
              longitude: p.lng || (p as any).lon,
            }))}
            strokeColor={routeColor}
            strokeWidth={5}
            zIndex={1}
          />
        )}

        {/* 🚏 Stop markers along the route */}
        {routeStops.map((stop, index) => (
          <Marker
            key={stop.stop_id || `stop-${index}`}
            coordinate={{
              latitude: stop.lat,
              longitude: stop.lng,
            }}
            title={stop.name}
            description={`Stop ${index + 1}${index === nextStopIdx ? " (Next)" : ""}`}
            pinColor={index === nextStopIdx ? "#16a34a" : routeColor}
            zIndex={2}
          />
        ))}

        {/* 🚌 Driver's current location */}
        {location && (
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title={user?.name || "Driver"}
            description={tripActive ? "Trip active" : "Idle"}
            pinColor="#2563eb"
            zIndex={3}
          />
        )}
      </MapView>

      <View style={styles.attribution}>
        <Text style={styles.attrText}>© OpenStreetMap contributors</Text>
      </View>

      {/* 🧭 Next stop indicator */}
      {nextStop && tripActive && (
        <View style={styles.nextStopBanner}>
          <Text style={styles.nextStopLabel}>Next Stop:</Text>
          <Text style={styles.nextStopName}>{nextStop.name}</Text>
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.title}>Vehicle: {vehicleId || "—"}</Text>
        <Text style={styles.status}>
          Status: {tripActive ? "🟢 Running" : "⚫ Idle"}
        </Text>
        <Text style={[styles.status, { color: routeColor, fontWeight: "700" }]}>
          Route: {routeName || routeId || "—"} ({direction.toUpperCase()})
        </Text>

        <View style={{ marginTop: 8, marginBottom: 12 }}>
          <DemandIndicator high={demandHigh} />
        </View>

        <Text style={styles.occ}>
          Occupancy: {occupancy}/{capacity}
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#16a34a" }]}
            onPress={() => changeOccupancy(+1)}
          >
            <Text style={styles.btnText}>+1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#dc2626" }]}
            onPress={() => changeOccupancy(-1)}
          >
            <Text style={styles.btnText}>−1</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btnWide, { backgroundColor: "#2563eb" }]}
          onPress={sendDemand}
          disabled={!vehicleId || !routeId}
        >
          <Text style={styles.btnText}>High demand here</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btnWide,
            {
              backgroundColor: tripActive ? "#f59e0b" : "#16a34a",
              opacity: tripBusy ? 0.6 : 1,
            },
          ]}
          onPress={toggleTrip}
          disabled={!vehicleId || tripBusy}
        >
          <Text style={styles.btnText}>
            {tripActive ? "Stop Trip" : "Start Trip"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 15,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700" },
  status: { marginTop: 4, fontSize: 16 },
  occ: { marginTop: 8, fontSize: 20, fontWeight: "800" },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    gap: 12,
  },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  btnWide: {
    paddingVertical: 12,
    paddingHorizontal: 50,
    borderRadius: 10,
    marginTop: 10,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  attribution: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  attrText: { fontSize: 10, color: "#111" },
  // 🧭 Next stop banner styles
  nextStopBanner: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: "rgba(22, 163, 74, 0.95)",
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  nextStopLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
  },
  nextStopName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});