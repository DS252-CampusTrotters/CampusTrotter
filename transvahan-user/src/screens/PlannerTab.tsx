// transvahan-user/src/screens/PlannerTab.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import * as Location from "expo-location";
import type { LocationObject } from "expo-location";
import { http } from "../api/client";
import { wsConnect } from "../api/ws";
import BusMarker from "../components/BusMarker";

const { height, width } = Dimensions.get("window");
const ASPECT_RATIO = width / height;

type LatLng = { latitude: number; longitude: number };

type Vehicle = {
  id: string;
  vehicle_id: string;
  lat: number;
  lon: number;
  status?: string;
  capacity?: number;
  occupancy?: number;
  route_id?: string;
  direction?: string;
};

function computeBearing(a: LatLng, b: LatLng): number {
  if (!a || !b) return 0;
  if (a.latitude === b.latitude && a.longitude === b.longitude) return 0;

  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const normalizeVehicle = (raw: any): Vehicle | null => {
  if (!raw) return null;

  const id =
    raw.vehicle_id || raw.id || raw.plateNo || String(Date.now());

  const lat =
    raw.lat ??
    raw.latitude ??
    raw.location?.lat ??
    raw.location?.latitude;
  const lon =
    raw.lon ??
    raw.lng ??
    raw.longitude ??
    raw.location?.lng ??
    raw.location?.longitude;

  if (typeof lat !== "number" || typeof lon !== "number") return null;

  return {
    id,
    vehicle_id: id,
    lat,
    lon,
    status: raw.status ?? "idle",
    capacity: typeof raw.capacity === "number" ? raw.capacity : 4,
    occupancy: typeof raw.occupancy === "number" ? raw.occupancy : 0,
    route_id: raw.route_id ?? raw.currentRoute ?? undefined,
    direction: raw.direction ?? raw.dir ?? undefined,
  };
};

export default function PlannerTab() {
  // 🔹 Trip planner state
  const [origin, setOrigin] = useState("13.0169,77.5635");
  const [dest, setDest] = useState("13.0274,77.5714");
  const [results, setResults] = useState<any | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [nearby, setNearby] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 🔹 Map / location state
  const [region, setRegion] = useState({
    latitude: 13.0205,
    longitude: 77.5655,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  });
  const [userLoc, setUserLoc] = useState<LocationObject | null>(null);
  const [locLoading, setLocLoading] = useState(true);

  // 🔹 Live vehicle state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const prevPosRef = useRef<Record<string, LatLng>>({});

  // Safely parse coordinates
  function parseCoord(s: string) {
    const [lat, lon] = s.split(",").map((x) => Number(x.trim()));
    return { lat, lon };
  }

  // Validate coordinate numbers
  const validCoord = (c: any) =>
    c &&
    typeof c.lat === "number" &&
    typeof c.lon === "number" &&
    !isNaN(c.lat) &&
    !isNaN(c.lon);

  // 🔍 Nearby stops for a typed coordinate
  const fetchNearbyStops = async (coordStr: string) => {
    try {
      const { lat, lon } = parseCoord(coordStr);
      const { data } = await http.get(
        `/stops/nearby?lat=${lat}&lon=${lon}&radius=150`
      );
      setNearby(data.stops || []);
      setError(null);
    } catch {
      setError("Failed to fetch nearby stops");
    }
  };

  // 🧭 Get user location once
  useEffect(() => {
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          alert(
            "Location permission is required to show nearby shuttles"
          );
          setLocLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        setUserLoc(loc);

        setRegion((prev) => ({
          ...prev,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015 * ASPECT_RATIO,
        }));
      } catch (err) {
        console.warn("Location error in PlannerTab:", err);
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  // 🚐 Subscribe to WebSocket live vehicles (same backend feed as MapTab)
  useEffect(() => {
    const disconnect = wsConnect((msg) => {
      if (msg.type !== "vehicle" || !msg.data) return;
      const normalized = normalizeVehicle(msg.data);
      if (!normalized) return;

      setVehicles((prev) => {
        const idx = prev.findIndex(
          (v) => v.id === normalized.id
        );
        if (idx === -1) {
          return [...prev, normalized];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...normalized };
        return copy;
      });
    });

    return () => {
      if (typeof disconnect === "function") disconnect();
    };
  }, []);

  // 📍 Plan a route between origin & dest
  const planRoute = async () => {
    try {
      setPlanLoading(true);
      const o = origin.trim();
      const d = dest.trim();
      const { lat: fromLat, lon: fromLon } = parseCoord(o);
      const { lat: toLat, lon: toLon } = parseCoord(d);
      const { data } = await http.get(
        `/planner/plan?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`
      );
      setResults(data);
      setRegion({
        latitude: (fromLat + toLat) / 2,
        longitude: (fromLon + toLon) / 2,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (err) {
      console.warn("Planner error:", err);
      setError("Unable to find route.");
    } finally {
      setPlanLoading(false);
    }
  };

  // Colors per line
  const routeColors: any = {
    Red: "#ef4444",
    Green: "#22c55e",
    Blue: "#3b82f6",
    Orange: "#f97316",
    Purple: "#a855f7",
  };

  // Build sequential coordinates for map
  const buildCoords = () => {
    if (!results?.steps) return [];
    const lines: any = [];

    results.steps.forEach((step: any) => {
      if (
        step.type === "ride" &&
        validCoord(step.from) &&
        validCoord(step.to)
      ) {
        lines.push({
          type: "ride",
          color: routeColors[step.route_name] || "#6b7280",
          coords: [
            {
              latitude: step.from.lat,
              longitude: step.from.lon,
            },
            { latitude: step.to.lat, longitude: step.to.lon },
          ],
        });
      } else if (step.type === "walk" && validCoord(step.to)) {
        lines.push({
          type: "walk",
          color: "#000",
          coords: [
            { latitude: step.to.lat, longitude: step.to.lon },
          ],
        });
      }
    });
    return lines;
  };

  const lines = buildCoords();
  const vehiclesArr = vehicles;

  if (locLoading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" size="large" />
        <Text>Fetching location…</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🧭 Campus Trip Planner & Live Map</Text>

      {/* Origin input + nearby stops */}
      <TextInput
        style={styles.input}
        value={origin}
        onChangeText={(t) => {
          setOrigin(t);
          fetchNearbyStops(t);
        }}
        placeholder="Origin lat,lng"
      />

      <FlatList
        data={nearby}
        horizontal
        keyExtractor={(item, idx) =>
          `${item.stop_name}_${item.route_id}_${idx}`
        }
        renderItem={({ item }) => (
          <View style={styles.nearChip}>
            <Text style={{ fontSize: 12 }}>
              {item.stop_name} ({item.route_name}) •{" "}
              {Math.round(item.distance)} m
            </Text>
          </View>
        )}
      />

      {/* Destination input */}
      <TextInput
        style={styles.input}
        value={dest}
        onChangeText={(t) => {
          setDest(t);
          fetchNearbyStops(t);
        }}
        placeholder="Destination lat,lng"
      />

      <TouchableOpacity style={styles.btn} onPress={planRoute}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>
          Find Route
        </Text>
      </TouchableOpacity>

      {planLoading && (
        <ActivityIndicator
          color="#2563eb"
          size="large"
          style={{ marginTop: 12 }}
        />
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* 🗺 Merged map: live shuttles + planner paths + stops */}
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        followsUserLocation
      >
        {/* origin / dest markers */}
        {(() => {
          const o = parseCoord(origin);
          const d = parseCoord(dest);
          const valid = (x: number) =>
            typeof x === "number" && !isNaN(x);
          return (
            <>
              {valid(o.lat) && valid(o.lon) && (
                <Marker
                  coordinate={{ latitude: o.lat, longitude: o.lon }}
                  title="Origin"
                  pinColor="#000"
                />
              )}
              {valid(d.lat) && valid(d.lon) && (
                <Marker
                  coordinate={{ latitude: d.lat, longitude: d.lon }}
                  title="Destination"
                  pinColor="#000"
                />
              )}
            </>
          );
        })()}

        {/* Draw walking (dotted) and Transvahan (solid) paths */}
        {lines.map((line: any, i: number) => (
          <Polyline
            key={`poly_${i}`}
            coordinates={line.coords}
            strokeWidth={line.type === "walk" ? 3 : 5}
            lineDashPattern={
              line.type === "walk" ? [6, 4] : undefined
            }
            strokeColor={line.color}
          />
        ))}

        {/* Stop markers in matching route color */}
        {results?.steps
          ?.filter(
            (s: any) =>
              s.type === "ride" &&
              typeof s.from?.lat === "number" &&
              typeof s.from?.lon === "number"
          )
          .map((s: any, i: number) => (
            <Marker
              key={`stop_${i}_${s.from.stop_name}_${s.route_id || i}`}
              coordinate={{
                latitude: s.from.lat,
                longitude: s.from.lon,
              }}
              pinColor={routeColors[s.route_name] || "#6b7280"}
              title={`${s.from.stop_name} (${s.route_name})`}
            />
          ))}

        {/* 🚐 Live shuttle markers using shared BusMarker */}
        {vehiclesArr.map((v, idx) => {
          const label = v.vehicle_id || v.id || `bus_${idx}`;
          const current: LatLng = {
            latitude: v.lat,
            longitude: v.lon,
          };
          const prev = prevPosRef.current[label];
          const heading = prev
            ? computeBearing(prev, current)
            : 0;
          prevPosRef.current[label] = current;

          return (
            <BusMarker
              key={`veh_${label}_${idx}`}
              coordinate={current}
              heading={heading}
            />
          );
        })}
      </MapView>

      {/* “No shuttles” overlay */}
      {vehiclesArr.length === 0 && (
        <View style={styles.overlay}>
          <Text>No active shuttles yet.</Text>
        </View>
      )}

      {/* Itinerary card */}
      {results && (
        <View style={styles.card}>
          <Text
            style={{ fontWeight: "700", marginBottom: 4 }}
          >
            Itinerary
          </Text>
          {results.steps.map((s: any, idx: number) => {
            if (s.type === "walk")
              return (
                <Text key={idx}>
                  🚶 Walk {Math.round(s.distance)} m →{" "}
                  {s.to.stop_name || "destination"}
                </Text>
              );
            if (s.type === "ride")
              return (
                <Text key={idx}>
                  🚌 Take {s.route_name} Line from{" "}
                  {s.from.stop_name} → {s.to.stop_name}
                </Text>
              );
            if (s.type === "transfer")
              return (
                <Text key={idx}>
                  🔁 Transfer between{" "}
                  {s.between[0].stop_name} ↔{" "}
                  {s.between[1].stop_name}
                </Text>
              );
            return null;
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    fontSize: 20,
    fontWeight: "700",
    margin: 10,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    marginHorizontal: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  btn: {
    backgroundColor: "#2563eb",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
  },
  map: {
    width: "100%",
    height: height * 0.45,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  nearChip: {
    backgroundColor: "#e0e7ff",
    padding: 6,
    borderRadius: 6,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  errorText: {
    color: "red",
    textAlign: "center",
    marginVertical: 10,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
