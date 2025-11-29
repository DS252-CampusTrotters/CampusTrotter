// transvahan-user/src/screens/RouteDetailScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiClient as client, http } from "../api/client";
import BusMarker from "../components/BusMarker";
import haversine from "../utils/haversine";
import { fetchETAForStop } from "../api/eta";
import { submitFeedback } from "../api/feedback";
import { getColors } from "../theme/colors";

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

const normalizeVehicle = (raw: any) => {
  if (!raw) return raw;

  const key = raw.vehicle_id || raw.plateNo || raw.id;

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

  return {
    ...raw,
    vehicle_id: key,
    lat,
    lon,
  };
};

type FeedbackStageReserved =
  | "none"
  | "askCompleted"
  | "askGoodBad"
  | "askComment"
  | "done";

type FeedbackStageUnreserved =
  | "none"
  | "askDidRide"
  | "askGoodBad"
  | "askComment"
  | "done";

export default function RouteDetailScreen({ route }: any) {
  const { routeData, color } = route.params;
  const scheme = useColorScheme();
  const C = getColors(scheme);
  const insets = useSafeAreaInsets();

  const [stopsTo, setStopsTo] = useState<any[]>([]);
  const [stopsFro, setStopsFro] = useState<any[]>([]);
  const [direction, setDirection] = useState<"to" | "fro">("to");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [shapeTo, setShapeTo] = useState<{ lat: number; lon: number }[] | null>(
    null
  );
  const [shapeFro, setShapeFro] = useState<{ lat: number; lon: number }[] | null>(
    null
  );
  const [shapeLoading, setShapeLoading] = useState(false);

  const [selectedStop, setSelectedStop] = useState<any | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaResult, setEtaResult] = useState<{
    etaMin: number;
    vehicleLabel: string;
    distanceText?: string | null;
  } | null>(null);

  const [reservationSummary, setReservationSummary] = useState<
    Record<number, number>
  >({});
  const [reservationDest, setReservationDest] = useState<any | null>(null);
  const [reservationSaving, setReservationSaving] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationStatus, setReservationStatus] = useState<string | null>(
    null
  );
  const [myReservation, setMyReservation] = useState<any | null>(null);

  const [arrivalAlert, setArrivalAlert] = useState<{
    message: string;
    vehicleLabel: string;
  } | null>(null);

  const [reservedStage, setReservedStage] =
    useState<FeedbackStageReserved>("none");
  const [unreservedStage, setUnreservedStage] =
    useState<FeedbackStageUnreserved>("none");
  const [feedbackRating, setFeedbackRating] = useState<1 | -1 | 0>(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  const prevPosRef = useRef<Record<string, LatLng>>({});
  const prevAnyActiveRef = useRef(false);

  const refreshReservationSummary = async (
    routeId: string | number,
    dir: "to" | "fro"
  ) => {
    try {
      const { data } = await http.get(
        `/routes/${routeId}/reservations/summary`,
        { params: { direction: dir } }
      );
      const bySeq: Record<number, number> = {};
      (data?.stops || []).forEach((s: any) => {
        if (typeof s.sequence === "number") {
          bySeq[s.sequence] = Number(s.waiting_count ?? 0);
        }
      });
      setReservationSummary(bySeq);
    } catch {
      setReservationSummary({});
    }
  };

  const refreshMyReservation = async (
    routeId: string | number,
    dir: "to" | "fro"
  ) => {
    try {
      const { data } = await http.get(
        `/routes/${routeId}/reservations/my`,
        { params: { direction: dir } }
      );
      setMyReservation(data || null);
    } catch {
      setMyReservation(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await http.get("/routes/stops/all");
        if (!Array.isArray(data)) return;

        const routeStops = data.filter(
          (s: any) =>
            String(s.route_id).trim().toLowerCase() ===
              String(routeData.id).trim().toLowerCase() ||
            String(s.route_name).trim().toLowerCase() ===
              String(routeData.name).trim().toLowerCase()
        );

        const toStops = routeStops
          .filter((s: any) => s.direction === "to")
          .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

        const froStops = routeStops
          .filter((s: any) => s.direction === "fro")
          .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

        setStopsTo(toStops);
        setStopsFro(froStops);
      } finally {
        setLoading(false);
      }
    })();
  }, [routeData.id, routeData.name]);

  useEffect(() => {
    let cancelled = false;

    const fetchShapeForDirection = async (dir: "to" | "fro") => {
      try {
        const { data } = await http.get(`/routes/${routeData.id}/shape`, {
          params: { direction: dir, force: "1" },
        });
        if (data && Array.isArray(data.points) && data.points.length > 1) {
          return data.points.filter(
            (p: any) => typeof p.lat === "number" && typeof p.lon === "number"
          );
        }
        return null;
      } catch {
        return null;
      }
    };

    (async () => {
      setShapeLoading(true);
      try {
        const [toShape, froShape] = await Promise.all([
          fetchShapeForDirection("to"),
          fetchShapeForDirection("fro"),
        ]);
        if (cancelled) return;

        let finalTo = toShape;
        let finalFro = froShape;

        if (!finalTo && finalFro) finalTo = [...finalFro].slice().reverse();
        if (!finalFro && finalTo) finalFro = [...finalTo].slice().reverse();

        setShapeTo(finalTo || null);
        setShapeFro(finalFro || null);
      } finally {
        if (!cancelled) setShapeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeData.id]);

  useEffect(() => {
    let disconnect: any;
    (async () => {
      try {
        const { data } = await http.get("/routes/drivers");
        if (Array.isArray(data?.vehicles)) {
          setVehicles(data.vehicles.map((v: any) => normalizeVehicle(v)));
        }

        disconnect = await client.subscribeVehicles((msg: any) => {
          if (msg.type === "vehicle" && msg.data) {
            const incoming = normalizeVehicle(msg.data);
            const key = incoming.vehicle_id || incoming.plateNo || incoming.id;

            setVehicles((prev: any[]) => {
              const idx = prev.findIndex(
                (p) => (p.vehicle_id || p.plateNo || p.id) === key
              );
              if (idx !== -1) {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...incoming };
                return copy;
              }
              return [...prev, incoming];
            });
          }
        });
      } catch {}
    })();

    return () => disconnect && disconnect();
  }, []);

  useEffect(() => {
    let disconnect: any;

    (async () => {
      if (!client.subscribeReservations) return;
      try {
        disconnect = await client.subscribeReservations((msg: any) => {
          if (msg.type === "reservation_update" && msg.data) {
            const d = msg.data;
            const sameRoute =
              String(d.route_id).trim().toLowerCase() ===
              String(routeData.id).trim().toLowerCase();
            const sameDir =
              (d.direction || "to").toString().toLowerCase() ===
              direction.toLowerCase();

            if (sameRoute && sameDir) {
              const bySeq: Record<number, number> = {};
              (d.stops || []).forEach((s: any) => {
                if (typeof s.sequence === "number") {
                  bySeq[s.sequence] = Number(s.waiting_count ?? 0);
                }
              });
              setReservationSummary(bySeq);
              refreshMyReservation(routeData.id, direction);
            }
          }
        });
      } catch {}
    })();

    return () => disconnect && disconnect();
  }, [routeData.id, direction]);

  useEffect(() => {
    refreshReservationSummary(routeData.id, direction);
    refreshMyReservation(routeData.id, direction);

    setSelectedStop(null);
    setEtaResult(null);
    setEtaError(null);
    setEtaLoading(false);
    setReservationDest(null);
    setReservationError(null);
    setReservationStatus(null);
    setArrivalAlert(null);
  }, [routeData.id, direction]);

  const stops = direction === "to" ? stopsTo : stopsFro;
  const validStops = stops.filter(
    (s) =>
      typeof s.lat === "number" &&
      typeof s.lon === "number" &&
      !isNaN(s.lat) &&
      !isNaN(s.lon)
  );

  const visibleVehicles = vehicles.filter(
    (v) =>
      String(v.route_id).trim().toLowerCase() ===
        String(routeData.id).trim().toLowerCase() &&
      v.direction?.toLowerCase() === direction.toLowerCase()
  );

  const labeledVehicles = visibleVehicles.filter((v) =>
    ((v.vehicle_id || v.plateNo || "").toString().trim().length > 0)
  );

  useEffect(() => {
    if (!myReservation) {
      setArrivalAlert(null);
      return;
    }

    const srcSeq = Number(myReservation.source_sequence);
    if (!Number.isFinite(srcSeq)) return;

    const srcStop = stops.find((s: any) => Number(s.sequence) === srcSeq);
    if (!srcStop || typeof srcStop.lat !== "number" || typeof srcStop.lon !== "number")
      return;

    let closest: any = null;
    let minDist = Infinity;

    labeledVehicles.forEach((v) => {
      if ((v.direction || "").toLowerCase() !== direction.toLowerCase()) return;
      if (typeof v.lat !== "number" || typeof v.lon !== "number") return;
      const d = haversine(srcStop.lat, srcStop.lon, v.lat, v.lon);
      if (d < minDist) {
        minDist = d;
        closest = v;
      }
    });

    if (closest && minDist <= 120) {
      const label = closest.vehicle_id || closest.plateNo || closest.id || "Bus";
      setArrivalAlert({
        vehicleLabel: label,
        message: `Your shuttle ${label} is arriving at ${srcStop.stop_name}.`,
      });
    } else setArrivalAlert(null);
  }, [myReservation, labeledVehicles, stops, direction]);

  useEffect(() => {
    if (!myReservation) {
      setReservedStage("none");
      return;
    }

    const destSeq = Number(myReservation.dest_sequence);
    if (!Number.isFinite(destSeq)) return;

    const destStop = stops.find((s: any) => Number(s.sequence) === destSeq);
    if (!destStop || typeof destStop.lat !== "number" || typeof destStop.lon !== "number")
      return;

    let closest: any = null;
    let minDist = Infinity;

    labeledVehicles.forEach((v) => {
      if ((v.direction || "").toLowerCase() !== direction.toLowerCase()) return;
      if (typeof v.lat !== "number" || typeof v.lon !== "number") return;
      const d = haversine(destStop.lat, destStop.lon, v.lat, v.lon);
      if (d < minDist) {
        minDist = d;
        closest = v;
      }
    });

    if (closest && minDist <= 80 && reservedStage === "none") {
      setFeedbackStatus(null);
      setFeedbackError(null);
      setFeedbackComment("");
      setFeedbackRating(0);
      setReservedStage("askCompleted");
    }
  }, [myReservation, labeledVehicles, stops, direction, reservedStage]);

  useEffect(() => {
    const anyActiveNow = labeledVehicles.some((v) => {
      const s = (v.status || "").toLowerCase();
      return s === "active" || s === "running";
    });

    if (!prevAnyActiveRef.current && anyActiveNow) {
      setFeedbackStatus(null);
      setFeedbackError(null);
      setFeedbackComment("");
      setFeedbackRating(0);
      setUnreservedStage("askDidRide");
    } else if (!anyActiveNow) {
      setUnreservedStage("none");
    }

    prevAnyActiveRef.current = anyActiveNow;
  }, [labeledVehicles]);

  if (loading)
    return (
      <View style={[styles.loading, { backgroundColor: C.background }]}>
        <ActivityIndicator color={color} size="large" />
        <Text style={{ color: C.text }}>Loading route...</Text>
      </View>
    );

  if (!validStops.length)
    return (
      <View style={[styles.loading, { backgroundColor: C.background }]}>
        <Text style={{ color: C.text }}>No stop data found for this route.</Text>
      </View>
    );

  const center = validStops[Math.floor(validStops.length / 2)];
  const start = validStops[0];
  const end = validStops[validStops.length - 1];

  const distanceFromStart = (lat: number, lon: number) =>
    haversine(start.lat, start.lon, lat, lon);

  const isStopAheadForVehicle = (stop: any, v: any) => {
    if (
      typeof v.lat !== "number" ||
      typeof v.lon !== "number" ||
      typeof stop.lat !== "number" ||
      typeof stop.lon !== "number"
    )
      return false;

    const dStartToBus = distanceFromStart(v.lat, v.lon);
    const dStartToStop = distanceFromStart(stop.lat, stop.lon);
    return dStartToStop + 40 >= dStartToBus;
  };

  const handleStopPress = async (stop: any) => {
    setSelectedStop(stop);
    setEtaError(null);
    setEtaResult(null);
    setReservationDest(null);
    setReservationError(null);
    setReservationStatus(null);

    if (!labeledVehicles.length) {
      setEtaError("No active shuttles in this direction.");
      return;
    }

    const aheadVehicles = labeledVehicles.filter((v) =>
      isStopAheadForVehicle(stop, v)
    );
    if (!aheadVehicles.length) {
      setEtaError("All active shuttles have already passed this stop.");
      return;
    }

    let best = aheadVehicles[0];
    let bestDist = haversine(stop.lat, stop.lon, best.lat, best.lon);
    for (let i = 1; i < aheadVehicles.length; i++) {
      const v = aheadVehicles[i];
      const d = haversine(stop.lat, stop.lon, v.lat, v.lon);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }

    const vehicleLabel = best.vehicle_id || best.plateNo || best.id || "Bus";

    setEtaLoading(true);
    try {
      const etaData = await fetchETAForStop({
        routeId: routeData.id,
        direction,
        vehicleLabel,
        vehicleLat: best.lat,
        vehicleLon: best.lon,
        stop,
      });

      let etaMinRaw: number | null =
        typeof etaData?.predicted_eta_min === "number"
          ? etaData.predicted_eta_min
          : typeof etaData?.predicted_eta_s === "number"
          ? etaData.predicted_eta_s / 60
          : null;

      if (etaMinRaw == null) {
        if (typeof etaData?.eta_minutes === "number") etaMinRaw = etaData.eta_minutes;
        else if (typeof etaData?.eta_seconds === "number") etaMinRaw = etaData.eta_seconds / 60;
        else if (typeof etaData?.eta_s === "number") etaMinRaw = etaData.eta_s / 60;
      }

      if (etaMinRaw == null || !isFinite(etaMinRaw)) {
        setEtaError("Could not compute ETA for this stop.");
      } else {
        const distanceText =
          typeof etaData?.distance_text === "string"
            ? etaData.distance_text
            : typeof etaData?.distance_meters === "number"
            ? `${(etaData.distance_meters / 1000).toFixed(2)} km`
            : null;

        setEtaResult({ etaMin: etaMinRaw, vehicleLabel, distanceText });
      }
    } catch {
      setEtaError("Failed to fetch ETA. Please try again.");
    } finally {
      setEtaLoading(false);
    }
  };

  const handleReserveConfirm = async () => {
    if (
      !selectedStop ||
      !reservationDest ||
      typeof selectedStop.sequence !== "number" ||
      typeof reservationDest.sequence !== "number"
    )
      return;

    if (myReservation) {
      setReservationError(
        "You already have an active reservation. Please cancel it first."
      );
      return;
    }

    setReservationSaving(true);
    setReservationError(null);
    setReservationStatus(null);

    try {
      const body = {
        direction,
        source_stop_id:
          selectedStop.stop_id ||
          selectedStop.id ||
          `${routeData.id}_${direction}_${selectedStop.sequence}`,
        dest_stop_id:
          reservationDest.stop_id ||
          reservationDest.id ||
          `${routeData.id}_${direction}_${reservationDest.sequence}`,
        source_sequence: selectedStop.sequence,
        dest_sequence: reservationDest.sequence,
      };

      await http.post(`/routes/${routeData.id}/reservations`, body);
      await refreshReservationSummary(routeData.id, direction);
      await refreshMyReservation(routeData.id, direction);

      setReservationStatus(
        `Reserved from ${selectedStop.stop_name} → ${reservationDest.stop_name}`
      );
    } catch (err: any) {
      setReservationError(
        err?.response?.data?.error || "Failed to create reservation."
      );
    } finally {
      setReservationSaving(false);
    }
  };

  const handleCancelMyReservation = async () => {
    if (!myReservation) return;
    setReservationSaving(true);
    setReservationError(null);
    setReservationStatus(null);
    try {
      await http.delete(`/routes/${routeData.id}/reservations/my`, {
        params: { direction },
      });
      await refreshReservationSummary(routeData.id, direction);
      await refreshMyReservation(routeData.id, direction);
      setReservationStatus("Your reservation has been cancelled.");
      setReservedStage("none");
    } catch (err: any) {
      setReservationError(
        err?.response?.data?.error || "Failed to cancel reservation."
      );
    } finally {
      setReservationSaving(false);
    }
  };

  const pickActiveShape = () => {
    if (direction === "to") {
      if (shapeTo && shapeTo.length > 1) return shapeTo;
      if (shapeFro && shapeFro.length > 1) return [...shapeFro].reverse();
      return null;
    } else {
      if (shapeFro && shapeFro.length > 1) return shapeFro;
      if (shapeTo && shapeTo.length > 1) return [...shapeTo].reverse();
      return null;
    }
  };

  const activeShape = pickActiveShape();
  const polylineCoords =
    activeShape && activeShape.length > 1
      ? activeShape.map((p) => ({ latitude: p.lat, longitude: p.lon }))
      : [];

  const upcomingStops =
    selectedStop && typeof selectedStop.sequence === "number"
      ? stops.filter(
          (s) => typeof s.sequence === "number" && s.sequence > selectedStop.sequence
        )
      : [];

  const baseBus = labeledVehicles[0];
  const baseOcc = typeof baseBus?.occupancy === "number" ? baseBus.occupancy : 0;
  const baseCap = typeof baseBus?.capacity === "number" ? baseBus.capacity : 0;

  const waitingHere =
    selectedStop && typeof selectedStop.sequence === "number"
      ? reservationSummary[selectedStop.sequence] ?? 0
      : 0;

  const estimatedOcc = baseOcc + waitingHere;

  const buildFeedbackPayload = (rating: number) => {
    let vehicleId: string | null = null;
    if (myReservation) {
      const vId =
        myReservation.vehicle_id ||
        myReservation.vehicleId ||
        myReservation.bus_id ||
        null;
      if (vId) vehicleId = String(vId);
    }
    if (!vehicleId) vehicleId = String(routeData.id || routeData.route_id || "unknown");
    return {
      vehicle_id: vehicleId,
      rating,
      comment: feedbackComment.trim() || undefined,
    };
  };

  const submitFeedbackWithRating = async (
    rating: 1 | -1,
    source: "reserved" | "unreserved"
  ) => {
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackStatus(null);

    try {
      const payload = buildFeedbackPayload(rating);
      await submitFeedback(payload);

      setFeedbackStatus("Thanks for your feedback!");
      setFeedbackComment("");
      setFeedbackRating(0);

      if (source === "reserved") setReservedStage("done");
      else setUnreservedStage("done");
    } catch (err: any) {
      setFeedbackError(
        err?.response?.data?.error ||
          "Failed to submit feedback. Please try again."
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleReservedCompletedAnswer = (completed: boolean) => {
    setReservedStage(completed ? "askGoodBad" : "none");
    setFeedbackStatus(null);
    setFeedbackError(null);
    setFeedbackComment("");
    setFeedbackRating(0);
  };

  const handleUnreservedDidRideAnswer = (didRide: boolean) => {
    setUnreservedStage(didRide ? "askGoodBad" : "none");
    setFeedbackStatus(null);
    setFeedbackError(null);
    setFeedbackComment("");
    setFeedbackRating(0);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.container}>
        <View style={[styles.headerBar, { backgroundColor: color + "22" }]}>
          <Text style={[styles.header, { color }]}>{routeData.name} Line</Text>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: C.border },
              direction === "to" && { backgroundColor: color },
            ]}
            onPress={() => setDirection("to")}
          >
            <Text
              style={[
                styles.toggleText,
                { color: direction === "to" ? "#fff" : color },
              ]}
            >
              To
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: C.border },
              direction === "fro" && { backgroundColor: color },
            ]}
            onPress={() => setDirection("fro")}
          >
            <Text
              style={[
                styles.toggleText,
                { color: direction === "fro" ? "#fff" : color },
              ]}
            >
              Fro
            </Text>
          </TouchableOpacity>
        </View>

        {/* Map fixed-height so the bottom can scroll */}
        <MapView
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: center.lat,
            longitude: center.lon,
            latitudeDelta: 0.018,
            longitudeDelta: 0.018,
          }}
        >
          {polylineCoords.length > 1 && (
            <Polyline
              key={`route_${routeData.id}_${direction}`}
              coordinates={polylineCoords}
              strokeWidth={6}
              strokeColor={color}
              zIndex={1}
            />
          )}

          {validStops.map((s, i) => (
            <Marker
              key={`${s.stop_name}_${i}_${direction}`}
              coordinate={{ latitude: s.lat, longitude: s.lon }}
              title={s.stop_name}
              onPress={() => handleStopPress(s)}
            />
          ))}

          {labeledVehicles.map((v, i) => {
            if (typeof v.lat !== "number" || typeof v.lon !== "number")
              return null;

            const label = v.vehicle_id || v.plateNo || v.id || `bus_${i}`;
            const current: LatLng = { latitude: v.lat, longitude: v.lon };
            const prev = prevPosRef.current[label];
            const heading = prev ? computeBearing(prev, current) : 0;
            prevPosRef.current[label] = current;

            return (
              <BusMarker key={`veh_${label}_${i}`} coordinate={current} heading={heading} />
            );
          })}
        </MapView>

        {/* Scrollable Info Card */}
        <ScrollView
          style={[styles.card, { backgroundColor: C.card }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.info, { color: C.text }]}>
            🚌 <Text style={{ fontWeight: "700" }}>Direction:</Text>{" "}
            {start.stop_name} → {end.stop_name}
          </Text>

          {arrivalAlert && (
            <View style={[styles.alertBanner, { borderColor: color, backgroundColor: C.warningBg }]}>
              <Text style={[styles.alertText, { color: C.warningText }]}>
                🚏 {arrivalAlert.message}
              </Text>
            </View>
          )}

          {shapeLoading && (
            <Text style={[styles.info, { color: C.text }]}>
              Building road-following route…
            </Text>
          )}

          {labeledVehicles.length > 0 ? (
            labeledVehicles.map((v, idx) => {
              const label = v.vehicle_id || v.plateNo || v.id || "Bus";
              return (
                <Text key={idx} style={[styles.info, { color: C.text }]}>
                  • {label}: {v.status} — {v.occupancy}/{v.capacity} occupied
                </Text>
              );
            })
          ) : (
            <Text style={[styles.info, { color: C.text }]}>
              No active buses in this direction.
            </Text>
          )}

          {/* Selected stop + ETA + reservations */}
          {selectedStop && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.info, { color: C.text }]}>
                📍 <Text style={{ fontWeight: "700" }}>{selectedStop.stop_name}</Text>
              </Text>

              {etaLoading && <Text style={[styles.info, { color: C.text }]}>⏳ Computing ETA…</Text>}

              {!etaLoading && etaError && (
                <Text style={[styles.info, { color: C.danger }]}>{etaError}</Text>
              )}

              {!etaLoading && etaResult && (
                <Text style={[styles.info, { color: C.text }]}>
                  ⏱ ETA: {Math.max(0, Math.round(etaResult.etaMin * 10) / 10)} min
                  {etaResult.distanceText ? ` (${etaResult.distanceText})` : ""}{" "}
                  (via {etaResult.vehicleLabel})
                </Text>
              )}

              <Text style={[styles.info, { color: C.text }]}>
                🧍 Actual occupancy (driver): {baseOcc}/{baseCap || "?"}
              </Text>
              <Text style={[styles.info, { color: C.text }]}>
                🔮 Estimated occupancy at this stop (with reservations):{" "}
                {estimatedOcc}/{baseCap || "?"}
              </Text>

              {myReservation && (
                <Text style={[styles.info, { marginTop: 4, color: C.text }]}>
                  ✅ Your current reservation: {myReservation.source_sequence} →{" "}
                  {myReservation.dest_sequence} (route {myReservation.route_id})
                </Text>
              )}

              <View style={{ marginTop: 6 }}>
                <Text style={[styles.info, { color: C.text }]}>
                  🪑 Do you want to reserve a seat from this stop?
                </Text>

                {myReservation && (
                  <Text style={[styles.info, { color: "#b45309" }]}>
                    You already have an active reservation. You must cancel it
                    before creating a new one.
                  </Text>
                )}

                {upcomingStops.length === 0 ? (
                  <Text style={[styles.info, { color: C.text }]}>
                    No further stops in this direction to reserve.
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.info, { fontWeight: "600", color: C.text }]}>
                      Choose your destination stop:
                    </Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {upcomingStops.map((s: any) => (
                        <TouchableOpacity
                          key={`${s.stop_name}_${s.sequence}_dest`}
                          style={[
                            styles.destChip,
                            {
                              backgroundColor: C.inputBg,
                              borderColor: C.border,
                            },
                            reservationDest?.sequence === s.sequence && {
                              backgroundColor: C.border,
                              borderColor: color,
                            },
                          ]}
                          onPress={() => setReservationDest(s)}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight:
                                reservationDest?.sequence === s.sequence
                                  ? "700"
                                  : "500",
                              color: C.text,
                            }}
                          >
                            {s.stop_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.reserveButton,
                        { backgroundColor: C.primary },
                        (!reservationDest || reservationSaving || !!myReservation) && {
                          opacity: 0.6,
                        },
                      ]}
                      disabled={
                        !reservationDest || reservationSaving || !!myReservation
                      }
                      onPress={handleReserveConfirm}
                    >
                      <Text style={styles.reserveButtonText}>
                        {reservationSaving ? "Saving..." : "Confirm reservation"}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {myReservation && (
                  <TouchableOpacity
                    style={[
                      styles.cancelButton,
                      reservationSaving && { opacity: 0.6 },
                    ]}
                    disabled={reservationSaving}
                    onPress={handleCancelMyReservation}
                  >
                    <Text style={styles.cancelButtonText}>Cancel my reservation</Text>
                  </TouchableOpacity>
                )}

                {reservationError && (
                  <Text style={[styles.info, { color: C.danger }]}>
                    {reservationError}
                  </Text>
                )}
                {reservationStatus && (
                  <Text style={[styles.info, { color: "#16a34a" }]}>
                    {reservationStatus}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Reserved feedback */}
          {myReservation && (
            <View style={[styles.feedbackCard, { borderTopColor: C.border }]}>
              <Text style={[styles.feedbackSectionTitle, { color: C.text }]}>
                Ride feedback (reserved seat)
              </Text>

              {reservedStage === "askCompleted" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    Have you completed your reserved ride on this line?
                  </Text>
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.primary }]}
                      onPress={() => handleReservedCompletedAnswer(true)}
                    >
                      <Text style={styles.pillButtonText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.border }]}
                      onPress={() => handleReservedCompletedAnswer(false)}
                    >
                      <Text style={[styles.pillButtonGhostText, { color: C.text }]}>
                        Not yet
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {reservedStage === "askGoodBad" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    Was your ride good?
                  </Text>
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={styles.thumbButton}
                      onPress={() => submitFeedbackWithRating(1, "reserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.thumbUp}>👍</Text>
                      <Text style={[styles.thumbLabel, { color: C.text }]}>
                        Yes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.thumbButton}
                      onPress={() => {
                        setFeedbackRating(-1);
                        setReservedStage("askComment");
                        setFeedbackStatus(null);
                        setFeedbackError(null);
                      }}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.thumbDown}>👎</Text>
                      <Text style={[styles.thumbLabel, { color: C.text }]}>
                        No
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {reservedStage === "askComment" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    (Optional) Tell us what could be better.
                  </Text>
                  <TextInput
                    value={feedbackComment}
                    onChangeText={setFeedbackComment}
                    multiline
                    placeholder="Driver behaviour, wait time, bus comfort, crowding…"
                    placeholderTextColor={C.mutedText}
                    style={[
                      styles.feedbackInput,
                      {
                        borderColor: C.border,
                        backgroundColor: C.inputBg,
                        color: C.text,
                      },
                    ]}
                  />
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.primary }]}
                      onPress={() => submitFeedbackWithRating(-1, "reserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.pillButtonText}>Submit review</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.border }]}
                      onPress={() => submitFeedbackWithRating(-1, "reserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={[styles.pillButtonGhostText, { color: C.text }]}>
                        Skip comment
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {reservedStage === "done" && feedbackStatus && (
                <Text style={[styles.feedbackThanksText, { color: "#16a34a" }]}>
                  {feedbackStatus}
                </Text>
              )}
            </View>
          )}

          {/* Unreserved feedback */}
          {!myReservation && unreservedStage !== "none" && (
            <View style={[styles.feedbackCard, { borderTopColor: C.border }]}>
              <Text style={[styles.feedbackSectionTitle, { color: C.text }]}>
                Ride feedback
              </Text>

              {unreservedStage === "askDidRide" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    Did you take a ride on this line recently?
                  </Text>
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.primary }]}
                      onPress={() => handleUnreservedDidRideAnswer(true)}
                    >
                      <Text style={styles.pillButtonText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.border }]}
                      onPress={() => handleUnreservedDidRideAnswer(false)}
                    >
                      <Text style={[styles.pillButtonGhostText, { color: C.text }]}>
                        No
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {unreservedStage === "askGoodBad" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    Was your ride good?
                  </Text>
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={styles.thumbButton}
                      onPress={() => submitFeedbackWithRating(1, "unreserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.thumbUp}>👍</Text>
                      <Text style={[styles.thumbLabel, { color: C.text }]}>
                        Yes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.thumbButton}
                      onPress={() => {
                        setFeedbackRating(-1);
                        setUnreservedStage("askComment");
                        setFeedbackStatus(null);
                        setFeedbackError(null);
                      }}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.thumbDown}>👎</Text>
                      <Text style={[styles.thumbLabel, { color: C.text }]}>
                        No
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {unreservedStage === "askComment" && (
                <>
                  <Text style={[styles.feedbackQuestion, { color: C.text }]}>
                    (Optional) Tell us what could be better.
                  </Text>
                  <TextInput
                    value={feedbackComment}
                    onChangeText={setFeedbackComment}
                    multiline
                    placeholder="Driver behaviour, wait time, bus comfort, crowding…"
                    placeholderTextColor={C.mutedText}
                    style={[
                      styles.feedbackInput,
                      {
                        borderColor: C.border,
                        backgroundColor: C.inputBg,
                        color: C.text,
                      },
                    ]}
                  />
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.primary }]}
                      onPress={() => submitFeedbackWithRating(-1, "unreserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={styles.pillButtonText}>Submit review</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pillButton, { backgroundColor: C.border }]}
                      onPress={() => submitFeedbackWithRating(-1, "unreserved")}
                      disabled={feedbackSubmitting}
                    >
                      <Text style={[styles.pillButtonGhostText, { color: C.text }]}>
                        Skip comment
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {unreservedStage === "done" && feedbackStatus && (
                <Text style={[styles.feedbackThanksText, { color: "#16a34a" }]}>
                  {feedbackStatus}
                </Text>
              )}
            </View>
          )}

          {feedbackError && (
            <Text style={[styles.info, { color: C.danger }]}>
              {feedbackError}
            </Text>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { padding: 12, alignItems: "center" },
  header: { fontSize: 22, fontWeight: "700" },

  map: { height: "45%", width: "100%" }, // ✅ keeps map visible; rest scrolls

  card: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    margin: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },

  info: { fontSize: 14, marginBottom: 4 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: 8,
  },
  toggleBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
    marginHorizontal: 6,
  },
  toggleText: { fontWeight: "600", fontSize: 14 },
  destChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
    marginTop: 4,
  },
  reserveButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  reserveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignSelf: "flex-start",
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  alertBanner: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  alertText: {
    fontSize: 13,
    fontWeight: "600",
  },

  feedbackCard: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  feedbackSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  feedbackQuestion: {
    fontSize: 13,
    marginBottom: 6,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  pillButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  pillButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  pillButtonGhostText: {
    fontWeight: "500",
    fontSize: 13,
  },
  thumbButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 8,
  },
  thumbUp: { fontSize: 20, marginRight: 4 },
  thumbDown: { fontSize: 20, marginRight: 4 },
  thumbLabel: { fontSize: 13, fontWeight: "500" },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    minHeight: 60,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
  },
  feedbackThanksText: {
    fontSize: 13,
    marginTop: 4,
  },
});