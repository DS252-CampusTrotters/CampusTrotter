// src/screens/ScheduleTab.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiClient as client } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import ShuttleCard from "../components/ShuttleCard";
import { ScheduleEntry } from "../types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function normalizeTime(raw: any): string {
  if (raw === null || raw === undefined) return "";
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.min(Math.max(parseInt(m[1], 10), 0), 23);
  const min = Math.min(Math.max(parseInt(m[2], 10), 0), 59);
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

function normalizeSchedule(raw: any): ScheduleEntry[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((r: any, idx: number) => {
      const startTime =
        normalizeTime(
          r.startTime ||
            r.start_time ||
            r.departTime ||
            r.depart_time ||
            r.time
        ) || "";
      if (!startTime) return null;
      const endTime =
        normalizeTime(
          r.endTime || r.end_time || r.arrivalTime || r.arrival_time
        ) || "";
      const direction =
        (r.direction || r.dir || "to").toString().toLowerCase() === "fro"
          ? "fro"
          : "to";
      return {
        id:
          r.id ||
          r.schedule_id ||
          r.trip_id ||
          `sch-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        startTime,
        endTime: endTime || undefined,
        direction,
        note: r.note || r.label || r.remark || "",
      };
    })
    .filter(Boolean) as ScheduleEntry[];
}

/**
 * Convert current time to minutes since midnight for comparison
 */
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if a schedule entry has passed based on current time
 * A schedule is considered "passed" if its endTime (or startTime if no endTime)
 * is before or equal to the current time
 */
function isSchedulePassed(schedule: ScheduleEntry, currentTimeMinutes: number): boolean {
  const timeToCompare = schedule.endTime || schedule.startTime;
  if (!timeToCompare) return false;

  const [hours, minutes] = timeToCompare.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;

  const scheduleTimeMinutes = hours * 60 + minutes;
  return scheduleTimeMinutes <= currentTimeMinutes;
}

/**
 * Filter out schedules that have passed
 */
function filterActiveSchedules(schedules: ScheduleEntry[], currentTimeMinutes: number): ScheduleEntry[] {
  return schedules.filter((s) => !isSchedulePassed(s, currentTimeMinutes));
}

export default function ScheduleTab() {
  const { colors: C } = useTheme();

  // Store all routes with all schedules (unfiltered)
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Current time in minutes - updates every minute for real-time filtering
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(getCurrentTimeInMinutes());

  // Update current time every minute for real-time schedule hiding
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const updateTime = () => {
      const newTime = getCurrentTimeInMinutes();
      setCurrentTimeMinutes(newTime);
    };

    // Calculate ms until the next minute starts
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    // Set initial timeout to sync with minute boundary
    const timeoutId = setTimeout(() => {
      updateTime();
      // Then set interval to update every minute
      intervalId = setInterval(updateTime, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Fetch routes (without server-side filtering - we filter client-side for real-time updates)
  useEffect(() => {
    (async () => {
      try {
        console.log("📡 Fetching all routes...");
        const routesData = await client.getRoutes();
        const shaped =
          (routesData || []).map((r: any) => ({
            ...r,
            schedule: normalizeSchedule(r.schedule || []),
          })) || [];
        setAllRoutes(shaped);
      } catch (err) {
        console.warn("Schedules fetch error:", err);
      }

      try {
        const vehiclesData = await client.getVehicles();
        const norm = (vehiclesData || []).map((v: any) => ({
          ...v,
          route_id: v.route_id || v.currentRoute || null,
          occupancy:
            typeof v.occupancy === "number" && Number.isFinite(v.occupancy)
              ? v.occupancy
              : 0,
          capacity:
            typeof v.capacity === "number" && Number.isFinite(v.capacity)
              ? v.capacity
              : 4,
        }));
        setVehicles(norm);
      } catch (err) {
        console.warn("Vehicles fetch error:", err);
      }
    })();
  }, []);

  // Subscribe to WebSocket schedule updates
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!client.subscribeSchedules) return;
      try {
        cleanup = await client.subscribeSchedules((msg: any) => {
          const routeId = msg?.route_id || msg?.id;
          if (!routeId) return;
          const nextSchedule = normalizeSchedule(msg?.schedule || []);
          setAllRoutes((prev) =>
            (prev || []).map((r) =>
              r.id === routeId || r.route_id === routeId
                ? { ...r, schedule: nextSchedule }
                : r
            )
          );
        });
      } catch (err) {
        console.warn("Schedule WS subscription failed", err);
      }
    })();

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  // Compute routes with filtered schedules based on current time
  // This recalculates whenever currentTimeMinutes changes (every minute)
  const routes = useMemo(() => {
    return allRoutes.map((route) => ({
      ...route,
      schedule: filterActiveSchedules(route.schedule || [], currentTimeMinutes),
    }));
  }, [allRoutes, currentTimeMinutes]);

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const formatTripLabel = useCallback((trip: any) => {
    if (!trip) return "—";
    if (typeof trip === "string") return trip;
    const direction =
      (trip.direction || trip.dir) === "fro" ? "FRO" : "TO";
    const start = trip.startTime || trip.start_time || trip.time || "";
    const end = trip.endTime || trip.end_time || "";
    const window = start ? `${start}${end ? ` → ${end}` : ""}` : "—";
    const note = trip.note ? ` · ${trip.note}` : "";
    return `${direction} ${window}${note}`;
  }, []);

  const renderRouteCard = useCallback(({ item }: any) => {
    const isOpen = expanded === item.id;
    const routeKey = item.id || item.route_id;
    const assignedVehicles = vehicles.filter((v) => {
      const vr = v.route_id || v.currentRoute;
      return routeKey && vr && String(vr) === String(routeKey);
    });
    const scheduleRows = (item.schedule || []).slice().sort((a: any, b: any) => {
      const dirA = (a.direction || "to") === "fro" ? 1 : 0;
      const dirB = (b.direction || "to") === "fro" ? 1 : 0;
      if (dirA !== dirB) return dirA - dirB;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

    return (
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
        <TouchableOpacity onPress={() => toggleExpand(item.id)}>
          <Text style={[styles.routeName, { color: C.text }]}>{item.name || item.route_name}</Text>
          <Text style={[styles.routeSub, { color: C.mutedText }]}>
            {item.start} → {item.end}
          </Text>
          <Text style={[styles.routeSub, { color: C.mutedText }]}>
            Stops: {item.stops?.length ?? item.to_count ?? 0} | Active Trips: {scheduleRows.length}
          </Text>
        </TouchableOpacity>

        {isOpen && (
          <View style={[styles.details, { borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Schedule</Text>
            {scheduleRows.length ? (
              scheduleRows.map((trip: any, idx: number) => (
                <Text key={trip.id || idx} style={[styles.tripText, { color: C.text }]}>
                  {formatTripLabel(trip)}
                </Text>
              ))
            ) : (
              <Text style={[styles.muted, { color: C.mutedText }]}>No upcoming trips for today</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 10, color: C.text }]}>Assigned Vehicles</Text>
            {assignedVehicles.length ? (
              assignedVehicles.map((v) => <ShuttleCard key={v.id} vehicle={v} />)
            ) : (
              <Text style={[styles.muted, { color: C.mutedText }]}>No vehicles assigned</Text>
            )}
          </View>
        )}
      </View>
    );
  }, [expanded, vehicles, toggleExpand, formatTripLabel, C]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={["top"]}>
      <Text style={[styles.header, { color: C.text }]}>Shuttle Schedules</Text>
      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        renderItem={renderRouteCard}
        extraData={currentTimeMinutes} // Re-render when time changes
        ListEmptyComponent={
          <Text style={[styles.muted, { color: C.mutedText }]}>No routes available yet.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  card: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
  },
  routeName: { fontSize: 18, fontWeight: "700" },
  routeSub: { fontSize: 14 },
  details: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  tripText: { marginBottom: 4 },
  muted: { fontStyle: "italic", marginTop: 4 },
});
