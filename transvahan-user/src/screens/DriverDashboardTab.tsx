import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "../auth/authContext";
import { useTheme } from "../context/ThemeContext";
import DemandIndicator from "../components/DemandIndicator";
import { apiClient, http } from "../api/client";

const ASPECT_RATIO =
  Dimensions.get("window").width / Dimensions.get("window").height;

const DEFAULT_REGION: Region = {
  latitude: 13.0213,
  longitude: 77.567,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01 * ASPECT_RATIO,
};

// Distance in meters to maintain "high demand" freeze after button click
const DEMAND_FREEZE_DISTANCE_METERS = 50;

// Haversine distance calculation
function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverDashboardTab() {
  const { user } = useAuth();
  const { colors: C } = useTheme();

  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"to" | "fro">("to");

  const [occupancy, setOccupancy] = useState<number>(0);
  const [capacity, setCapacity] = useState<number>(4);
  const [tripActive, setTripActive] = useState<boolean>(false);
  const [tripBusy, setTripBusy] = useState<boolean>(false);
  const [demandHigh, setDemandHigh] = useState<boolean>(false);

  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [reservationSummary, setReservationSummary] = useState<any[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(false);

  const gpsWatchRef = useRef<null | Location.LocationSubscription>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const manualLockRef = useRef<number>(0);
  const lastServerStatusRef = useRef<string | null>(null);
  const serverStatusStreakRef = useRef<number>(0);

  // Map refs for zoom control
  const mapRef = useRef<MapView>(null);
  const initialRegionSetRef = useRef(false);

  // Demand freeze: track the location where demand signal was sent
  // Demand stays "high" until driver moves 50m away from this point
  const demandFreezeLocationRef = useRef<{ lat: number; lon: number } | null>(null);

  // ------------------------ helper: send 1-shot telemetry quickly ------------------------
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
          status: statusOverride || (tripActive ? "active" : "idle"),
          route_id: routeId || undefined,
          direction,
        });
      } catch (err: any) {
        console.warn("❌ Telemetry burst failed:", err?.message || err);
      }
    },
    [vehicleId, routeId, direction, tripActive, location]
  );

  // ------------------------ 1) Load driver assignment + vehicle ------------------------
  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.getDriverAssignment?.();
        const a = data?.assignment || data;
        if (a) {
          setVehicleId(a.vehicle_id);
          setRouteId(String(a.route_id));
          setDirection(
            a.direction === "fro" || a.direction === "FRO" ? "fro" : "to"
          );
        }
      } catch (err: any) {
        console.warn(
          "⚠️ Could not load driver assignment:",
          err?.message || err
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!vehicleId) return;
    (async () => {
      try {
        const res = await apiClient.getVehicles();
        const found = (res as any[])?.find(
          (v) => v.id === vehicleId || v.vehicle_id === vehicleId
        );
        if (found) {
          setOccupancy(found.occupancy ?? 0);
          setCapacity(found.capacity ?? 4);
          setDemandHigh(!!found.demand_high);
          setTripActive(found.status === "active");
        }
      } catch (err) {
        console.warn(
          "⚠️ Could not load vehicle:",
          (err as any)?.message || err
        );
      }
    })();
  }, [vehicleId]);

  // ------------------------ 1b) Load stops + reservation summary for this route+direction ------------------------
  useEffect(() => {
    if (!routeId) {
      setRouteStops([]);
      setReservationSummary([]);
      return;
    }

    (async () => {
      try {
        setLoadingReservations(true);

        const [routeRes, summaryRes] = await Promise.all([
          http.get(`/routes/${routeId}`),
          http.get(`/routes/${routeId}/reservations/summary`, {
            params: { direction },
          }),
        ]);

        const routeData = routeRes.data;
        const dirStops = routeData?.directions?.[direction] || [];
        setRouteStops(dirStops);
        setReservationSummary(summaryRes.data?.stops || []);
      } catch (err: any) {
        console.warn(
          "⚠️ Could not load route/reservations:",
          err?.message || err
        );
        setRouteStops([]);
        setReservationSummary([]);
      } finally {
        setLoadingReservations(false);
      }
    })();
  }, [routeId, direction]);

  // ------------------------ 1c) WS: live reservation updates for this route+direction ------------------------
  useEffect(() => {
    if (!routeId) return;

    let cleanup: any;

    (async () => {
      if (!apiClient.subscribeReservations) return;
      cleanup = await apiClient.subscribeReservations((msg: any) => {
        if (msg.type !== "reservation_update" || !msg.data) return;
        const d = msg.data;
        const sameRoute =
          String(d.route_id).trim().toLowerCase() ===
          String(routeId).trim().toLowerCase();
        const sameDir =
          (d.direction || "to").toString().toLowerCase() ===
          direction.toLowerCase();
        if (!sameRoute || !sameDir) return;

        setReservationSummary(d.stops || []);
      });
    })();

    return () => {
      if (cleanup) cleanup();
    };
  }, [routeId, direction]);

  // ------------------------ 2) WS: live vehicle updates ------------------------
  useEffect(() => {
    if (!vehicleId) return;

    (async () => {
      wsCleanupRef.current = await apiClient.subscribeVehicles(
        async (msg: any) => {
          const v = msg?.data;
          if (!v) return;

          if (msg.type === "vehicle" || msg.type === "vehicle_update") {
            const id = v.id || v.vehicle_id;
            if (String(id) === String(vehicleId)) {
              if (typeof v.occupancy === "number") setOccupancy(v.occupancy);
              if (typeof v.capacity === "number") setCapacity(v.capacity);
              if (typeof v.status === "string") {
                const s = v.status.toLowerCase();
                const now = Date.now();
              
                // track stability
                if (lastServerStatusRef.current === s) {
                  serverStatusStreakRef.current += 1;
                } else {
                  lastServerStatusRef.current = s;
                  serverStatusStreakRef.current = 1;
                }
              
                const stableEnough = serverStatusStreakRef.current >= 2;
                const manualLockExpired = now > manualLockRef.current;
              
                // ✅ only trust server when stable AND not right after manual click
                if (stableEnough && manualLockExpired) {
                  if (s === "active") setTripActive(true);
                  if (s === "idle" || s === "stopped" || s === "stop") setTripActive(false);
                }
              }
              // Only update demand state if NOT in freeze zone
              // If freeze location is set, ignore server updates until driver moves 50m away
              if (!demandFreezeLocationRef.current) {
                const newDemandHigh = !!v.demand_high;
                setDemandHigh((prev) => (prev !== newDemandHigh ? newDemandHigh : prev));
              }
            }
          }

          if (msg.type === "demand_update") {
            const d = msg.data;
            if (d?.vehicle_id && String(d.vehicle_id) === String(vehicleId)) {
              // Only update if NOT in freeze zone
              if (!demandFreezeLocationRef.current) {
                const newDemandHigh = !!d.demand_high;
                setDemandHigh((prev) => (prev !== newDemandHigh ? newDemandHigh : prev));
              }
            }
          }
        }
      );
    })();

    return () => {
      if (wsCleanupRef.current) wsCleanupRef.current();
    };
  }, [vehicleId]);

  // ------------------------ 3) High-frequency telemetry loop ------------------------
  useEffect(() => {
    (async () => {
      if (!vehicleId) {
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Location access is required to update shuttle position."
        );
        setLoading(false);
        return;
      }

      const first = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation(first);
      setLoading(false);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 800,
          distanceInterval: 2,
        },
        async (pos) => {
          setLocation(pos);

          // Check if driver has moved 50m away from demand freeze location
          // If so, clear the freeze and reset demand indicator to normal state
          if (demandFreezeLocationRef.current) {
            const dist = getDistanceMeters(
              demandFreezeLocationRef.current.lat,
              demandFreezeLocationRef.current.lon,
              pos.coords.latitude,
              pos.coords.longitude
            );
            if (dist >= DEMAND_FREEZE_DISTANCE_METERS) {
              demandFreezeLocationRef.current = null;
              setDemandHigh(false);
            }
          }

          try {
            await apiClient.sendTelemetry?.({
              vehicleId,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              status: tripActive ? "active" : "idle",
              route_id: routeId || undefined,
              direction,
            });
          } catch (err: any) {
            console.warn("❌ Telemetry failed:", err?.message || err);
          }
        }
      );

      gpsWatchRef.current = sub;
    })();

    return () => {
      if (gpsWatchRef.current) {
        gpsWatchRef.current.remove();
        gpsWatchRef.current = null;
      }
    };
  }, [vehicleId, routeId, direction, tripActive]);

  // ------------------------ 4) Occupancy control (+1 / -1) ------------------------
  const updateOccupancy = async (delta: number) => {
    if (!vehicleId) return;
    try {
      const next = Math.max(0, Math.min(capacity, occupancy + delta));
      setOccupancy(next); // optimistic UI
      await apiClient.updateOccupancy?.({ vehicleId, delta });
    } catch (err) {
      Alert.alert("Update Failed", "Could not update occupancy.");
      console.error("❌ occupancy update:", err);
    }
  };

  /* ------------------------ 5) Trip control (FAST + optimistic) ------------------------ */
  const toggleTrip = async () => {
    if (!vehicleId || tripBusy) return;

    const nextActive = !tripActive;
    const action = nextActive ? "start" : "stop";

    // ✅ instant UI response
    setTripActive(nextActive);
    setTripBusy(true);
    manualLockRef.current = Date.now() + 8000; // ✅ ignore server flips for 8s

    // capture best GPS at click-time for start inference
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
      let resp: any;
      if (apiClient.controlTrip) {
        resp = await apiClient.controlTrip({
          vehicleId,
          action,
          route_id: routeId || undefined,
          lat: startLat,
          lng: startLng,
        });
      } else {
        resp = await http.post("/driver/trip", {
          vehicleId,
          action,
          route_id: routeId || undefined,
          lat: startLat,
          lng: startLng,
        });
      }

      const newDir =
        resp?.data?.direction ||
        resp?.direction ||
        resp?.data?.data?.direction ||
        null;

      if (action === "start" && (newDir === "to" || newDir === "fro")) {
        setDirection(newDir);
      }

      // ✅ Reset occupancy to 0 when stopping the trip (backend also resets it)
      if (action === "stop") {
        setOccupancy(0);
      }

      // ✅ immediate backend-visible update (no waiting for next GPS tick)
      await sendTelemetryBurst(startLat, startLng, nextActive ? "active" : "idle");
    } catch (err) {
      // rollback on failure
      setTripActive(!nextActive);
      Alert.alert("Trip Control Failed", "Could not update trip status.");
      console.error(err);
    } finally {
      setTripBusy(false);
    }
  };

  // ------------------------ 6) Demand (heat) signal button ------------------------
  const sendDemand = async () => {
    try {
      if (!vehicleId) {
        Alert.alert("Missing vehicle", "No vehicle assigned to this driver.");
        return;
      }
      if (!routeId) {
        Alert.alert("Missing route", "No route assigned. Contact admin.");
        return;
      }
      if (!location?.coords) {
        Alert.alert("Location missing", "Current GPS fix not available.");
        return;
      }

      const lat = location.coords.latitude;
      const lon = location.coords.longitude;

      const body = {
        vehicle_id: vehicleId,
        route_id: routeId,
        direction,
        stop_id: null,
        lat,
        lon,
        high: true,
      };

      // Set freeze location - demand indicator will stay "high" until driver moves 50m away
      demandFreezeLocationRef.current = { lat, lon };
      setDemandHigh(true);

      await apiClient.sendDemand?.(body);
    } catch (err) {
      // On failure, clear freeze and reset UI
      demandFreezeLocationRef.current = null;
      setDemandHigh(false);
      Alert.alert("Failed", "Could not send demand signal.");
    }
  };

  // ------------------------ Derived: stops with active reservations ------------------------
  const stopsWithWaiting = (() => {
    if (!routeStops.length || !reservationSummary.length) return [];

    const bySeq: Record<number, number> = {};
    reservationSummary.forEach((s: any) => {
      const seq = Number(s.sequence);
      if (!Number.isFinite(seq)) return;
      bySeq[seq] = Number(s.waiting_count ?? 0);
    });

    return routeStops
      .map((s: any, idx: number) => {
        const seq = Number(Number.isFinite(s.sequence) ? s.sequence : idx);
        return {
          ...s,
          sequence: seq,
          waiting_count: bySeq[seq] || 0,
        };
      })
      .filter((s: any) => s.waiting_count > 0);
  })();

  // ------------------------ UI ------------------------
  // Center map on first valid location (only once)
  useEffect(() => {
    if (location && !initialRegionSetRef.current && mapRef.current) {
      initialRegionSetRef.current = true;
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01 * ASPECT_RATIO,
      }, 500);
    }
  }, [location]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.successText} />
        <Text style={{ color: C.text, marginTop: 12 }}>Fetching GPS location…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 0.5 }}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
      >
        {location && (
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title={user?.name || "Driver"}
            description={
              vehicleId
                ? `Vehicle ${vehicleId}${routeId ? ` • Route ${routeId}` : ""}`
                : "No vehicle assigned"
            }
          />
        )}
      </MapView>

      <View style={[styles.panel, { backgroundColor: C.card, borderColor: C.border }]}>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.driverName, { color: C.text }]}>{user?.name || "Driver"}</Text>
          <Text style={[styles.subText, { color: C.mutedText }]}>{user?.email}</Text>
          <Text style={[styles.subText, { color: C.mutedText }]}>
            Vehicle: {vehicleId || "—"}{" "}
            {routeId ? `• Route ${routeId} (${direction.toUpperCase()})` : ""}
          </Text>

          <View style={{ marginTop: 8, marginBottom: 12 }}>
            <DemandIndicator high={demandHigh} />
          </View>

          <View style={styles.occRow}>
            <TouchableOpacity
              style={[styles.occBtn, { backgroundColor: C.successText }]}
              onPress={() => updateOccupancy(-1)}
            >
              <Text style={styles.occBtnText}>−</Text>
            </TouchableOpacity>

            <Text style={[styles.occValue, { color: C.text }]}>
              {occupancy} / {capacity}
            </Text>

            <TouchableOpacity
              style={[styles.occBtn, { backgroundColor: C.successText }]}
              onPress={() => updateOccupancy(+1)}
            >
              <Text style={styles.occBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <TouchableOpacity
              style={[styles.tripBtn, { backgroundColor: C.successText, flex: 1, opacity: tripBusy ? 0.6 : 1 }]}
              onPress={toggleTrip}
              disabled={!vehicleId || tripBusy}
            >
              <Text style={styles.tripBtnText}>
                {tripActive ? "Stop Trip" : "Start Trip"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tripBtn, { backgroundColor: C.primary, flex: 1 }]}
              onPress={sendDemand}
              disabled={!vehicleId || !routeId}
            >
              <Text style={styles.tripBtnText}>High demand here</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 16, paddingBottom: 20 }}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Upcoming reservations</Text>
            {loadingReservations ? (
              <Text style={[styles.subText, { color: C.mutedText }]}>Loading reservations…</Text>
            ) : stopsWithWaiting.length === 0 ? (
              <Text style={[styles.subText, { color: C.mutedText }]}>
                No active reservations on this route.
              </Text>
            ) : (
              stopsWithWaiting.map((s: any) => (
                <Text key={s.stop_id || s.sequence} style={[styles.subText, { color: C.mutedText }]}>
                  • {s.stop_name || `Stop ${s.sequence}`} — {s.waiting_count} waiting
                </Text>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  panel: {
    flex: 0.5,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  panelContent: {
    padding: 20,
    paddingBottom: 40,
  },
  driverName: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  subText: { marginBottom: 4 },
  occRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  occBtn: {
    borderRadius: 30,
    minWidth: 50,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  occBtnText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  occValue: { fontSize: 24, fontWeight: "800", marginHorizontal: 16 },
  tripBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  tripBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
});