// transvahan-user/src/screens/RouteMapScreen.tsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Alert,
  StyleSheet,
  useColorScheme,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import Constants from "expo-constants";
import axios from "axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/authContext";
import { apiClient } from "../api/client";
import { getColors } from "../theme/colors";

const API = (Constants as any).expoConfig?.extra?.API_BASE_URL;

type LatLng = { latitude: number; longitude: number };

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

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

export default function RouteMapScreen({ route }: any) {
  const { vehicle: initialVehicle } = route.params;
  const { token } = useAuth();
  const scheme = useColorScheme();
  const C = getColors(scheme);
  const insets = useSafeAreaInsets();

  const [vehicle, setVehicle] = useState<any>(initialVehicle);

  // Use initialRegion for better zoom/pan control
  const mapRef = useRef<MapView>(null);
  const initialFitDoneRef = useRef(false);

  const initialRegion: Region = {
    latitude: initialVehicle.lat || 12.9716,
    longitude: initialVehicle.lng || 77.5946,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const [stops, setStops] = useState<any[]>([]);
  const [shapePoints, setShapePoints] = useState<{ lat: number; lon: number }[]>(
    []
  );

  const prevPosRef = useRef<LatLng | null>(null);
  const [heading, setHeading] = useState(0);

  // Fetch route stops (for markers)
  useEffect(() => {
    async function fetchRoute() {
      try {
        const { data } = await axios.get(
          `${API}/routes/${vehicle.route_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const allStops =
          data?.directions?.to?.concat(data?.directions?.fro || []) ||
          data?.stops ||
          [];
        setStops(allStops);
      } catch (err: any) {
        console.error("Route fetch failed:", err?.response?.data || err);
        Alert.alert(
          "❌ Route fetch failed",
          err?.response?.data?.error || "Error"
        );
      }
    }
    fetchRoute();
  }, [vehicle.route_id, token]);

  // Fetch Google-road-following shape for this route + vehicle.direction
  useEffect(() => {
    async function fetchShape() {
      try {
        const dir =
          typeof vehicle.direction === "string" &&
          (vehicle.direction.toLowerCase() === "fro" ||
            vehicle.direction.toLowerCase() === "to")
            ? vehicle.direction.toLowerCase()
            : "to";

        const { data } = await axios.get(`${API}/routes/${vehicle.route_id}/shape`, {
          params: { direction: dir, force: "1" },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (data && Array.isArray(data.points)) {
          const clean = data.points.filter(
            (p: any) => typeof p.lat === "number" && typeof p.lon === "number"
          );
          setShapePoints(clean);

          // Only fit bounds on initial load, not on subsequent updates
          if (clean.length > 1 && !initialFitDoneRef.current && mapRef.current) {
            initialFitDoneRef.current = true;

            const lats = clean.map((p: any) => p.lat);
            const lons = clean.map((p: any) => p.lon);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);

            const midLat = (minLat + maxLat) / 2;
            const midLon = (minLon + maxLon) / 2;

            const latDelta = (maxLat - minLat) * 1.4 || 0.02;
            const lonDelta = (maxLon - minLon) * 1.4 || 0.02;

            mapRef.current.animateToRegion({
              latitude: midLat,
              longitude: midLon,
              latitudeDelta: latDelta,
              longitudeDelta: lonDelta,
            }, 500);
          }
        } else {
          setShapePoints([]);
        }
      } catch (err: any) {
        console.error("Route shape fetch failed:", err?.response?.data || err);
        setShapePoints([]);
      }
    }
    fetchShape();
  }, [vehicle.route_id, vehicle.direction, token]);

  // 🔴 LIVE VEHICLE SUBSCRIPTION
  useEffect(() => {
    const targetId = vehicle.id || vehicle.vehicle_id;
    const unsubscribePromise = awaitableSubscribe();

    async function awaitableSubscribe() {
      const disconnect = await apiClient.subscribeVehicles!((msg: any) => {
        if (msg.type === "vehicle" && msg.data) {
          const v = msg.data;
          const id = v.id || v.vehicle_id;
          if (
            String(id).trim().toLowerCase() ===
            String(targetId).trim().toLowerCase()
          ) {
            const lat = v.lat ?? v.location?.lat;
            const lng = v.lng ?? v.location?.lng;
            if (typeof lat === "number" && typeof lng === "number") {
              const current: LatLng = { latitude: lat, longitude: lng };
              if (prevPosRef.current) {
                const h = computeBearing(prevPosRef.current, current);
                setHeading(h);
              }
              prevPosRef.current = current;

              setVehicle((prev: any) => ({
                ...prev,
                ...v,
                lat,
                lng,
              }));
            }
          }
        }
      });
      return disconnect;
    }

    return () => {
      if (unsubscribePromise && typeof (unsubscribePromise as any).then === "function") {
        (unsubscribePromise as any)
          .then((fn: any) => typeof fn === "function" && fn())
          .catch(() => {});
      }
    };
  }, [initialVehicle.id, initialVehicle.vehicle_id]);

  const toCoord = (s: any) => {
    const lat = s?.lat ?? s?.location?.lat ?? s?.location?.latitude;
    const lng = s?.lng ?? s?.lon ?? s?.location?.lng ?? s?.location?.longitude;
    return typeof lat === "number" && typeof lng === "number"
      ? { latitude: lat, longitude: lng }
      : null;
  };

  const polyCoords =
    shapePoints.length > 1
      ? shapePoints.map((p) => ({ latitude: p.lat, longitude: p.lon }))
      : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
      >
        {typeof vehicle.lat === "number" && typeof vehicle.lng === "number" && (
          <Marker
            coordinate={{ latitude: vehicle.lat, longitude: vehicle.lng }}
            title={`Shuttle ${vehicle.vehicle_id}`}
            description={`Vacant: ${
              (vehicle.capacity ?? 0) - (vehicle.occupancy ?? 0)
            }/${vehicle.capacity ?? "?"}`}
            rotation={heading}
          />
        )}

        {stops.map((s, idx) => {
          const c = toCoord(s);
          if (!c) return null;
          return (
            <Marker
              key={idx}
              coordinate={c}
              title={`Stop: ${s.name || s.stop_name || idx + 1}`}
            />
          );
        })}

        {polyCoords.length > 1 && (
          <Polyline coordinates={polyCoords} strokeColor={C.primary} strokeWidth={4} />
        )}
      </MapView>

      <View
        style={{
          padding: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: C.card,
          borderTopWidth: 1,
          borderTopColor: C.border,
        }}
      >
        <Text style={{ fontWeight: "700", color: C.text }}>Route Info</Text>
        <Text style={{ color: C.text }}>Route ID: {vehicle.route_id}</Text>
        <Text style={{ color: C.text }}>Status: {vehicle.status}</Text>
        <Text style={{ color: C.text }}>
          Occupancy: {vehicle.occupancy ?? 0}/{vehicle.capacity ?? 4}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({});