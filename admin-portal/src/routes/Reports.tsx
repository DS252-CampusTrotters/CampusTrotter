// admin-portal/src/routes/Reports.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getReportSummary,
  getReportTemporal,
  getReportDrivers,
  getReportGeo,
  getReportAnomalies,
  getReportForecast,
  getAllFeedback, // ✅ NEW
} from "../services/admin";
import { listRoutes } from "../services/routes";
import { connectLiveVehicles, LiveVehicle } from "../services/live";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import "../styles/dashboard.css";

type RouteOption = { id: string; route_name: string };

type Summary = {
  totalTrips: number;
  totalDistance: number;
  avgDuration: number;
  activeDrivers: number;
  peakUsage: string;
  // ⭐ New – optional, provided by /reports/summary
  feedback?: {
    count: number;
    avgRating: number | null;
    netScore: number;
    score: number; // 0–100
  };
};
type HourBucket = { hour: number; trips: number };

type DriverRow = {
  driver_id: string;
  name: string;
  rating: number | null;
  trips: number;
  distance_km: number;
};

type GeoBucket = { lat: number; lon: number; count: number };

// 🔹 Dummy geo hotspots used when backend returns no data
const DUMMY_GEO: GeoBucket[] = [
  // Campus / Bengaluru cluster
  { lat: 12.9716, lon: 77.5946, count: 80 },
  { lat: 12.975, lon: 77.6, count: 65 },
  { lat: 12.965, lon: 77.59, count: 42 },
  { lat: 12.9825, lon: 77.5885, count: 30 },
  // Other metro clusters – to make the India map more interesting
  { lat: 28.6139, lon: 77.209, count: 55 }, // Delhi
  { lat: 19.076, lon: 72.8777, count: 50 }, // Mumbai
  { lat: 17.385, lon: 78.4867, count: 42 }, // Hyderabad
  { lat: 13.0827, lon: 80.2707, count: 38 }, // Chennai
  { lat: 22.5726, lon: 88.3639, count: 34 }, // Kolkata
];

type Anomalies = {
  longTrips: Array<{
    id: string;
    line_id: string | null;
    duration_s: number;
    distance_km: number;
    start_time: string;
  }>;
  shortTrips: Array<{
    id: string;
    line_id: string | null;
    duration_s: number;
    distance_km: number;
    start_time: string;
  }>;
  p95: number;
};

type ForecastRow = { day: string; trips: number };

type MapTarget = {
  center: [number, number];
  zoom?: number;
  bump: number;
};

type SearchResult = {
  type: "line" | "vehicle" | "driver";
  label: string;
  meta: Record<string, any>;
};

type Tone = "excellent" | "good" | "warn" | "bad";

type CompareRow = {
  lineId: string;
  routeName: string;
  trips: number;
  distance: number;
  healthScore: number;
  label: string;
  tone: Tone;
  anomalyRate: number;
};

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

// Default "service day" window: latest 8 AM → 7 AM (next day)
const getDefaultServiceWindow = () => {
  const now = new Date();
  const today8 = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    8,
    0,
    0,
    0
  );

  let from: Date;
  let to: Date;

  if (now >= today8) {
    from = today8;
    to = new Date(today8.getTime() + 23 * 60 * 60 * 1000); // 7 AM next day
  } else {
    const yesterday8 = new Date(today8.getTime() - 24 * 60 * 60 * 1000);
    from = yesterday8;
    to = new Date(yesterday8.getTime() + 23 * 60 * 60 * 1000);
  }

  return {
    from: toLocalInput(from),
    to: toLocalInput(to),
  };
};

const isWithinServiceHours = (d: Date) => {
  const h = d.getHours();
  return h >= 8 || h < 7;
};

// Classify score into label + tone
const classifyScore = (score: number): { label: string; tone: Tone } => {
  if (score >= 85) return { label: "Excellent", tone: "excellent" };
  if (score >= 70) return { label: "Healthy", tone: "good" };
  if (score >= 55) return { label: "Needs attention", tone: "warn" };
  return { label: "At risk", tone: "bad" };
};

// Heatmap layer for Geo Hotspots using leaflet.heat
const GeoHeatLayer: React.FC<{
  points: { lat: number; lon: number; intensity?: number }[];
}> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !points.length) return;

    const heatPoints: [number, number, number][] = points.map((p) => [
      p.lat,
      p.lon,
      typeof p.intensity === "number" ? p.intensity : 0.5,
    ]);

    const layer = (L as any).heatLayer(heatPoints, {
      radius: 30,
      blur: 18,
      maxZoom: 19,
      minOpacity: 0.35,
      gradient: {
        0.2: "#bfdbfe",
        0.4: "#60a5fa",
        0.65: "#3b82f6",
        0.8: "#2563eb",
        1.0: "#1d4ed8",
      },
    });

    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, JSON.stringify(points)]);

  return null;
};

const MapViewController: React.FC<{ target: MapTarget | null }> = ({
  target,
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.flyTo(target.center, target.zoom ?? map.getZoom(), {
      duration: 0.7,
    });
  }, [
    map,
    target?.center[0],
    target?.center[1],
    target?.zoom,
    target?.bump,
  ]);

  return null;
};

export default function Reports() {
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("");

  const defaultWindow = getDefaultServiceWindow();
  const [from, setFrom] = useState<string>(defaultWindow.from);
  const [to, setTo] = useState<string>(defaultWindow.to);
  const [direction, setDirection] = useState<string>("all"); // "all" | "to" | "fro"

  const [summary, setSummary] = useState<Summary | null>(null);
  const [hourly, setHourly] = useState<HourBucket[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [geo, setGeo] = useState<GeoBucket[]>([]);
  const [anoms, setAnoms] = useState<Anomalies | null>(null);
  const [forecast, setForecast] = useState<ForecastRow[]>([]);

  // baseline (previous service day) for benchmark panel
  const [baselineSummary, setBaselineSummary] = useState<Summary | null>(
    null
  );
  const [baselineAnoms, setBaselineAnoms] = useState<Anomalies | null>(
    null
  );

  // route comparison state
  const [compareLines, setCompareLines] = useState<string[]>([]);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // live vehicles state
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);

  // auto-refresh meta
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // map search state
  const [searchQuery, setSearchQuery] = useState("");
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);

  // AI copilot state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { from: "user" | "bot"; text: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // load routes for filter
  useEffect(() => {
    (async () => {
      try {
        const list = await listRoutes();
        const opts = (Array.isArray(list) ? list : []).map((r: any) => ({
          id: String(r.id || r.route_id),
          route_name: r.route_name || r.line || r.route_id || "Route",
        }));
        setRoutes(opts);
      } catch (err) {
        console.error("Reports: failed to load routes", err);
      }
    })();
  }, []);

  const params = useMemo(
    () => ({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      line_id: selectedRoute || undefined,
      direction: direction === "all" ? undefined : direction,
    }),
    [from, to, selectedRoute, direction]
  );

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);

      const fromDate = new Date(from);
      const toDate = new Date(to);
      const prevFrom = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
      const prevTo = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

      const baseParams = {
        ...params,
        from: prevFrom.toISOString(),
        to: prevTo.toISOString(),
      };

      const [
        sumRes,
        tempRes,
        drvRes,
        geoRes,
        anomRes,
        fcRes,
        baseSumRes,
        baseAnomRes,
      ] = await Promise.all([
        getReportSummary(params),
        getReportTemporal(params),
        getReportDrivers(params),
        getReportGeo(params),
        getReportAnomalies(params),
        getReportForecast(),
        getReportSummary(baseParams),
        getReportAnomalies(baseParams),
      ]);

      const hourlyData: HourBucket[] = Array.isArray(tempRes.data)
        ? tempRes.data
        : tempRes.data?.hourly || [];

      setSummary(sumRes.data || null);
      setHourly(hourlyData || []);
      setDrivers((Array.isArray(drvRes.data) ? drvRes.data : []) || []);

      // 🔹 Geo fallback: if backend returns no hotspots, use DUMMY_GEO
      const geoRaw: GeoBucket[] = Array.isArray(geoRes.data)
        ? geoRes.data
        : geoRes.data?.hotspots || [];
      setGeo(geoRaw.length ? geoRaw : DUMMY_GEO);

      const anomaliesRaw = anomRes.data || {};
      setAnoms({
        ...anomaliesRaw,
        longTrips: (anomaliesRaw.longTrips || []).map((t: any) => ({
          ...t,
          start_time: t.start_time
            ? new Date(t.start_time).toLocaleString()
            : "",
        })),
        shortTrips: (anomaliesRaw.shortTrips || []).map((t: any) => ({
          ...t,
          start_time: t.start_time
            ? new Date(t.start_time).toLocaleString()
            : "",
        })),
      });

      const baseAnomsRaw = baseAnomRes.data || {};
      setBaselineSummary(baseSumRes.data || null);
      setBaselineAnoms({
        ...baseAnomsRaw,
        longTrips: (baseAnomsRaw.longTrips || []).map((t: any) => ({
          ...t,
          start_time: t.start_time
            ? new Date(t.start_time).toLocaleString()
            : "",
        })),
        shortTrips: (baseAnomsRaw.shortTrips || []).map((t: any) => ({
          ...t,
          start_time: t.start_time
            ? new Date(t.start_time).toLocaleString()
            : "",
        })),
      });

      const fcData: ForecastRow[] = Array.isArray(fcRes.data)
        ? fcRes.data
        : fcRes.data?.forecast || [];
      setForecast(fcData || []);

      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Reports refresh error:", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to load reports."
      );
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-refresh during service window
  useEffect(() => {
    if (!autoRefresh) return;

    const id = setInterval(() => {
      if (isWithinServiceHours(new Date())) {
        refresh();
      }
    }, 60_000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, from, to, selectedRoute, direction]);

  // subscribe to live vehicles
  useEffect(() => {
    const cleanup = connectLiveVehicles({
      lineId: selectedRoute || undefined,
      onUpdate: (vehicles) => setLiveVehicles(vehicles || []),
      onStatusChange: (connected) => setLiveConnected(connected),
    });

    return cleanup;
  }, [selectedRoute]);

  const maxTripsHour = hourly.reduce(
    (m, h) => (h.trips > m ? h.trips : m),
    0
  );
  const maxForecastTrips = forecast.reduce(
    (m, d) => (d.trips > m ? d.trips : m),
    0
  );
  const maxGeoCount = geo.reduce(
    (m, g) => (g.count > m ? g.count : m),
    0
  );

  const geoHeatPoints = useMemo(
    () =>
      geo.map((g) => {
        const raw = maxGeoCount ? g.count / maxGeoCount : 0.5;
        const intensity = Math.max(0.2, Math.min(1, raw));
        return { lat: g.lat, lon: g.lon, intensity };
      }),
    [geo, maxGeoCount]
  );

  const liveStats = useMemo(() => {
    if (!liveVehicles.length) {
      return { active: 0, avgUtilization: 0 };
    }

    let totalOcc = 0;
    let totalCap = 0;

    liveVehicles.forEach((v) => {
      const occ = typeof v.occupancy === "number" ? v.occupancy : 0;
      const cap =
        typeof v.capacity === "number" && v.capacity > 0 ? v.capacity : 1;

      if (occ <= 1 && cap <= 1) {
        totalOcc += occ;
        totalCap += 1;
      } else {
        totalOcc += occ;
        totalCap += cap || 1;
      }
    });

    const avg = totalCap ? totalOcc / totalCap : 0;
    return { active: liveVehicles.length, avgUtilization: avg };
  }, [liveVehicles]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (geo.length) {
      const { latSum, lonSum } = geo.reduce(
        (acc, g) => ({
          latSum: acc.latSum + g.lat,
          lonSum: acc.lonSum + g.lon,
        }),
        { latSum: 0, lonSum: 0 }
      );
      return [latSum / geo.length, lonSum / geo.length] as [number, number];
    }
    if (liveVehicles.length) {
      const { latSum, lonSum } = liveVehicles.reduce(
        (acc, v) => ({
          latSum: acc.latSum + v.lat,
          lonSum: acc.lonSum + v.lon,
        }),
        { latSum: 0, lonSum: 0 }
      );
      return [
        latSum / liveVehicles.length,
        lonSum / liveVehicles.length,
      ] as [number, number];
    }
    return [22.9734, 78.6569];
  }, [geo, liveVehicles]);

  const searchResults: SearchResult[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];

    routes.forEach((r) => {
      if (
        r.route_name.toLowerCase().includes(q) ||
        String(r.id).toLowerCase().includes(q)
      ) {
        results.push({
          type: "line",
          label: `Line ${r.route_name} (${r.id})`,
          meta: { lineId: r.id },
        });
      }
    });

    liveVehicles.forEach((v) => {
      if (String(v.id).toLowerCase().includes(q)) {
        results.push({
          type: "vehicle",
          label: `Vehicle ${v.id} (line ${v.line_id ?? "—"})`,
          meta: { vehicleId: v.id },
        });
      }
    });

    liveVehicles.forEach((v) => {
      if (v.driver_name && v.driver_name.toLowerCase().includes(q)) {
        results.push({
          type: "driver",
          label: `Driver ${v.driver_name} (vehicle ${v.id})`,
          meta: { vehicleId: v.id, driverName: v.driver_name },
        });
      }
    });

    return results.slice(0, 10);
  }, [searchQuery, routes, liveVehicles]);

  const handleSearchResultClick = (res: SearchResult) => {
    let center: [number, number] | null = null;
    let zoom = 17;

    if (res.type === "vehicle" || res.type === "driver") {
      const vehicle = liveVehicles.find(
        (v) => String(v.id) === String(res.meta.vehicleId)
      );
      if (vehicle) {
        center = [vehicle.lat, vehicle.lon];
      }
    } else if (res.type === "line") {
      const lineId = res.meta.lineId;
      const vehiclesOnLine = liveVehicles.filter(
        (v) => String(v.line_id) === String(lineId)
      );
      if (vehiclesOnLine.length) {
        const { latSum, lonSum } = vehiclesOnLine.reduce(
          (acc, v) => ({
            latSum: acc.latSum + v.lat,
            lonSum: acc.lonSum + v.lon,
          }),
          { latSum: 0, lonSum: 0 }
        );
        center = [
          latSum / vehiclesOnLine.length,
          lonSum / vehiclesOnLine.length,
        ];
        zoom = 15;
      } else if (geo.length) {
        center = mapCenter;
        zoom = 14;
      }
    }

    if (center) {
      setMapTarget({
        center,
        zoom,
        bump: Date.now(),
      });
    }

    setSearchQuery("");
  };

  // Route health (current window)
  const routeHealth = useMemo(() => {
    if (!summary) return null;

    const totalTrips = summary.totalTrips || 0;
    const longTrips = anoms?.longTrips?.length || 0;
    const shortTrips = anoms?.shortTrips?.length || 0;
    const anomalyCount = longTrips + shortTrips;
    const anomalyRate = totalTrips ? anomalyCount / totalTrips : 0;

    const durationScore = (() => {
      if (!anoms?.p95 || !summary.avgDuration) return 0.8;
      const ratio = summary.avgDuration / anoms.p95;

      if (ratio <= 0.5) return 1.0;
      if (ratio <= 0.8) return 0.9;
      if (ratio <= 1.0) return 0.8;
      if (ratio <= 1.3) return 0.6;
      return 0.4;
    })();

    const occupancyScore = (() => {
      const util = liveStats.avgUtilization;
      if (!util) return 0.7;

      if (util < 0.25) return 0.6;
      if (util < 0.45) return 0.8;
      if (util < 0.7) return 1.0;
      if (util < 0.9) return 0.8;
      return 0.6;
    })();

    const anomalyPenalty = Math.min(anomalyRate / 0.3, 1);
    const anomalyScore = 1 - 0.7 * anomalyPenalty;

    const volumeScore =
      totalTrips < 10 ? 0.6 : totalTrips < 40 ? 0.8 : 1.0;

    // ⭐ New: map feedback to a 0–1 score
    const feedbackScore = (() => {
      const fb = summary.feedback;
      if (!fb) {
        // No feedback yet – slightly optimistic neutral
        return 0.75;
      }
      if (typeof fb.score === "number") {
        const s = fb.score / 100;
        if (s < 0) return 0;
        if (s > 1) return 1;
        return s;
      }
      if (typeof fb.avgRating === "number" && fb.count > 0) {
        const clamped = Math.max(-1, Math.min(1, fb.avgRating));
        return (clamped + 1) / 2;
      }
      return 0.75;
    })();

    // Adjusted weights to include user feedback
    const rawScore =
      0.3 * durationScore +
      0.2 * occupancyScore +
      0.2 * anomalyScore +
      0.15 * volumeScore +
      0.15 * feedbackScore;

    const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);
    const { label, tone } = classifyScore(score);

    const bullets: string[] = [];

    if (anomalyRate > 0.2) {
      bullets.push(
        "High anomaly rate – investigate frequent long or ultra-short trips on this route."
      );
    } else if (anomalyRate > 0.1) {
      bullets.push(
        "Some trips are flagged as anomalies – worth reviewing driver behaviour or congestion."
      );
    }

    if (liveStats.avgUtilization > 0.85 && liveStats.active > 0) {
      bullets.push(
        "Vehicles are frequently overloaded – consider adding capacity or redistributing vehicles."
      );
    } else if (
      liveStats.avgUtilization < 0.3 &&
      liveStats.active > 0 &&
      totalTrips > 15
    ) {
      bullets.push(
        "Route looks underutilized – you might be able to reduce frequency at off-peak hours."
      );
    }

    if (hourly.length >= 3) {
      const peak = maxTripsHour || 0;
      const avg =
        hourly.reduce((acc, h) => acc + h.trips, 0) /
        (hourly.length || 1);
      if (avg > 0 && peak / avg >= 2.5) {
        bullets.push(
          "Very sharp peak-hour demand – consider targeted additional trips only in those hours."
        );
      }
    }

    // ⭐ New: feedback bullet
    if (summary.feedback && summary.feedback.count > 0) {
      if (feedbackScore > 0.8) {
        bullets.push(
          `Passengers are generally happy on this route (based on ${summary.feedback.count} recent feedback entries).`
        );
      } else if (feedbackScore < 0.5) {
        bullets.push(
          `User feedback suggests this route needs attention (based on ${summary.feedback.count} recent feedback entries).`
        );
      }
    }

    if (!bullets.length) {
      bullets.push(
        "No major issues detected – keep monitoring anomalies and utilization to stay ahead."
      );
    }

    return {
      score,
      label,
      tone,
      anomalyRate,
      anomalyCount,
      totalTrips,
      durationScore,
      occupancyScore,
      anomalyScore,
      volumeScore,
      bullets,
    };
  }, [summary, anoms, liveStats, hourly, maxTripsHour]);

  // Baseline route health (previous window)
  const baselineHealth = useMemo(() => {
    if (!baselineSummary) return null;

    const totalTrips = baselineSummary.totalTrips || 0;
    const longTrips = baselineAnoms?.longTrips?.length || 0;
    const shortTrips = baselineAnoms?.shortTrips?.length || 0;
    const anomalyCount = longTrips + shortTrips;
    const anomalyRate = totalTrips ? anomalyCount / totalTrips : 0;

    const durationScore = (() => {
      if (!baselineAnoms?.p95 || !baselineSummary.avgDuration) return 0.8;
      const ratio = baselineSummary.avgDuration / baselineAnoms.p95;

      if (ratio <= 0.5) return 1.0;
      if (ratio <= 0.8) return 0.9;
      if (ratio <= 1.0) return 0.8;
      if (ratio <= 1.3) return 0.6;
      return 0.4;
    })();

    const util = liveStats.avgUtilization;
    const occupancyScore = (() => {
      if (!util) return 0.7;
      if (util < 0.25) return 0.6;
      if (util < 0.45) return 0.8;
      if (util < 0.7) return 1.0;
      if (util < 0.9) return 0.8;
      return 0.6;
    })();

    const anomalyPenalty = Math.min(anomalyRate / 0.3, 1);
    const anomalyScore = 1 - 0.7 * anomalyPenalty;

    const volumeScore =
      totalTrips < 10 ? 0.6 : totalTrips < 40 ? 0.8 : 1.0;

    const rawScore =
      0.35 * durationScore +
      0.25 * occupancyScore +
      0.25 * anomalyScore +
      0.15 * volumeScore;

    const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

    return { score, totalTrips };
  }, [baselineSummary, baselineAnoms, liveStats]);

  const benchmark = useMemo(() => {
    if (!summary || !baselineSummary || !routeHealth || !baselineHealth) {
      return null;
    }

    const pct = (current: number, prev: number) => {
      if (!prev) return null;
      return ((current - prev) / prev) * 100;
    };

    return {
      tripsChange: pct(summary.totalTrips, baselineSummary.totalTrips),
      distanceChange: pct(
        summary.totalDistance,
        baselineSummary.totalDistance
      ),
      durationChange: pct(
        summary.avgDuration,
        baselineSummary.avgDuration
      ),
      healthDelta: routeHealth.score - baselineHealth.score,
      prevScore: baselineHealth.score,
    };
  }, [summary, baselineSummary, routeHealth, baselineHealth]);

  // Route comparison across lines
  const toggleCompareLine = (lineId: string) => {
    setCompareLines((prev) => {
      if (prev.includes(lineId)) {
        return prev.filter((id) => id !== lineId);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), lineId];
      }
      return [...prev, lineId];
    });
  };

  useEffect(() => {
    if (!compareLines.length) {
      setCompareRows([]);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);

    const run = async () => {
      try {
        const fromIso = new Date(from).toISOString();
        const toIso = new Date(to).toISOString();
        const dirParam = direction === "all" ? undefined : direction;

        const all = await Promise.all(
          compareLines.map(async (lineId) => {
            const perParams = {
              from: fromIso,
              to: toIso,
              line_id: lineId,
              direction: dirParam,
            };

            const [sumRes, anomRes] = await Promise.all([
              getReportSummary(perParams),
              getReportAnomalies(perParams),
            ]);

            const sum: Summary | null = sumRes.data || null;
            const an: any = anomRes.data || null;

            if (!sum || !sum.totalTrips) {
              return {
                lineId,
                routeName:
                  routes.find((r) => String(r.id) === String(lineId))
                    ?.route_name || lineId,
                trips: 0,
                distance: 0,
                healthScore: 0,
                label: "No data",
                tone: "warn" as Tone,
                anomalyRate: 0,
              };
            }

            const totalTrips = sum.totalTrips || 0;
            const longTrips = an?.longTrips?.length || 0;
            const shortTrips = an?.shortTrips?.length || 0;
            const anomalyCount = longTrips + shortTrips;
            const anomalyRate = totalTrips
              ? anomalyCount / totalTrips
              : 0;

            const durationScore = (() => {
              if (!an?.p95 || !sum.avgDuration) return 0.8;
              const ratio = sum.avgDuration / an.p95;
              if (ratio <= 0.5) return 1.0;
              if (ratio <= 0.8) return 0.9;
              if (ratio <= 1.0) return 0.8;
              if (ratio <= 1.3) return 0.6;
              return 0.4;
            })();

            const occupancyScore = 0.8;

            const anomalyPenalty = Math.min(
              (anomalyRate || 0) / 0.3,
              1
            );
            const anomalyScore = 1 - 0.7 * anomalyPenalty;

            const volumeScore =
              totalTrips < 10 ? 0.6 : totalTrips < 40 ? 0.8 : 1.0;

            // ⭐ New: feedback score per line
            const feedbackScore = (() => {
              const fb = (sum as any).feedback;
              if (!fb) return 0.75;
              if (typeof fb.score === "number") {
                const s = fb.score / 100;
                if (s < 0) return 0;
                if (s > 1) return 1;
                return s;
              }
              if (
                typeof fb?.avgRating === "number" &&
                fb.count > 0
              ) {
                const clamped = Math.max(-1, Math.min(1, fb.avgRating));
                return (clamped + 1) / 2;
              }
              return 0.75;
            })();

            const rawScore =
              0.3 * durationScore +
              0.2 * occupancyScore +
              0.2 * anomalyScore +
              0.15 * volumeScore +
              0.15 * feedbackScore;

            const healthScore = Math.round(
              Math.max(0, Math.min(1, rawScore)) * 100
            );

            const { label, tone } = classifyScore(healthScore);

            return {
              lineId,
              routeName:
                routes.find((r) => String(r.id) === String(lineId))
                  ?.route_name || lineId,
              trips: sum.totalTrips,
              distance: sum.totalDistance,
              healthScore,
              label,
              tone,
              anomalyRate,
            } as CompareRow;
          })
        );

        if (!cancelled) {
          setCompareRows(all);
        }
      } catch (err) {
        console.error("Route comparison error:", err);
        if (!cancelled) {
          setCompareRows([]);
        }
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareLines, from, to, direction, routes]);

  // ===== Export to PDF (print) =====
  const handleExportPDF = () => {
    window.print();
  };

  const formatLocal = (value: string) =>
    value ? new Date(value).toLocaleString() : "";

  const fromDisplay = formatLocal(from);
  const toDisplay = formatLocal(to);

  const lineDisplay = useMemo(() => {
    if (!selectedRoute) return "All lines";
    const match = routes.find((r) => String(r.id) === String(selectedRoute));
    return match ? `${match.route_name} (${match.id})` : selectedRoute;
  }, [selectedRoute, routes]);

  const directionDisplay =
    direction === "all"
      ? "Both directions"
      : direction === "to"
      ? "To"
      : "Fro";

  const generatedAt = useMemo(
    () => new Date().toLocaleString(),
    [lastRefreshed]
  );

  // ===== Report context for copilot + guardrail =====

  const buildReportContext = () => ({
    filters: {
      from: fromDisplay,
      to: toDisplay,
      line: lineDisplay,
      direction: directionDisplay,
    },
    summary,
    routeHealth,
    liveStats,
    hourly,
    drivers: drivers.slice(0, 10),
    anomalies: anoms,
    forecast,
    geoTop: geo.slice(0, 10),
    comparison: compareRows,
  });

  const OFF_TOPIC_RE =
    /(weather|temperature|rain|sunny|cloudy|news|headline|cricket|football|stock|share market|movie|politics|election|instagram|twitter|youtube)/i;

  // Simple “analytics copilot” that answers from report context only
  const buildCopilotAnswer = (question: string): string => {
    const ctx = buildReportContext();
    const q = question.toLowerCase();

    if (!ctx.summary) {
      return "Load a report first (pick a window and click Refresh), then ask questions about that report.";
    }

    // Off-topic guardrail
    if (OFF_TOPIC_RE.test(q)) {
      return "I can only answer questions about this route report. Please ask a report-related question.";
    }

    const {
      summary,
      routeHealth,
      liveStats,
      hourly,
      drivers,
      anomalies,
      forecast,
      filters,
      comparison,
    } = ctx;

    const parts: string[] = [];

    // Trips / volume questions
    if (
      /(how many|number of|count of).*(trip|ride)/i.test(question) ||
      /trip(s)?\b/i.test(q)
    ) {
      parts.push(
        `There were ${summary.totalTrips} trips between ${filters.from} and ${filters.to} for ${filters.line} (${filters.direction}).`
      );
      if (summary.peakUsage) {
        parts.push(`The busiest hour block was ${summary.peakUsage}.`);
      }
    }

    // Duration questions
    if (
      /(avg|average|typical).*duration|travel time|journey time/i.test(
        question
      )
    ) {
      parts.push(
        `Average trip duration in this window is about ${Math.round(
          summary.avgDuration
        )} seconds.`
      );
      if (anomalies?.p95) {
        parts.push(
          `Trips longer than roughly ${Math.round(
            anomalies.p95
          )} seconds are considered long-tail (95th percentile).`
        );
      }
    }

    // Utilization / load
    if (/utilisation|utilization|occupancy|load factor|capacity/i.test(q)) {
      if (liveStats.active === 0) {
        parts.push(
          "There are no active vehicles in the live feed right now, so live utilization is not available."
        );
      } else {
        parts.push(
          `Live vehicles are averaging about ${Math.round(
            liveStats.avgUtilization * 100
          )}% utilization across ${liveStats.active} active vehicle${
            liveStats.active === 1 ? "" : "s"
          }.`
        );
      }
      if (routeHealth) {
        parts.push(
          `The utilization sub-score in the Route Health Analyzer is ${Math.round(
            routeHealth.occupancyScore * 100
          )} / 100.`
        );
      }
    }

    // Anomalies / delays
    if (/anomal(y|ies)|delay|delays|long trip|short trip|outlier/i.test(q)) {
      const longCount = anomalies?.longTrips?.length || 0;
      const shortCount = anomalies?.shortTrips?.length || 0;
      parts.push(
        `There are ${longCount} long-duration trips and ${shortCount} very short trips flagged in this window.`
      );
      if (anomalies?.p95) {
        parts.push(
          `The long-duration threshold is around ${Math.round(
            anomalies.p95
          )} seconds (95th percentile).`
        );
      }
      if (routeHealth) {
        parts.push(
          `Anomaly hygiene score is ${Math.round(
            routeHealth.anomalyScore * 100
          )} / 100.`
        );
      }
    }

    // Drivers
    if (/driver|who.*drive|which.*driver|top driver/i.test(q)) {
      if (!drivers || !drivers.length) {
        parts.push(
          "No driver trips are recorded in this window, so there is no driver ranking yet."
        );
      } else {
        const top = drivers
          .slice(0, 3)
          .map(
            (d) =>
              `${d.name} (${d.trips} trip${d.trips === 1 ? "" : "s"}, ${
                d.distance_km
              } km${d.rating ? `, rating ${d.rating}` : ""})`
          )
          .join("; ");
        parts.push(`Top drivers in this window are: ${top}.`);
      }
    }

    // Forecast
    if (/forecast|next week|next 7 days|expected trips/i.test(q)) {
      if (!forecast || !forecast.length) {
        parts.push(
          "The forecast chart does not have enough history yet to show a clear pattern."
        );
      } else {
        const best = [...forecast].sort((a, b) => b.trips - a.trips)[0];
        parts.push(
          `Based on the 7-day sketch, ${best.day} is expected to be the busiest with about ${best.trips} trips.`
        );
      }
    }

    // Geo / hotspots
    if (/hotspot|pickup zone|geo|location|where.*start|from where/i.test(q)) {
      if (!ctx.geoTop || !ctx.geoTop.length) {
        parts.push(
          "No geo hotspots have been detected yet for this window. As trips accumulate, the map will highlight dense pickup zones."
        );
      } else {
        const top = ctx.geoTop
          .slice(0, 3)
          .map(
            (g) =>
              `(${g.lat.toFixed(4)}, ${g.lon.toFixed(
                4
              )}) with ${g.count} trips`
          )
          .join("; ");
        parts.push(`Top pickup hotspots are around: ${top}.`);
      }
    }

    // Route health / comparison
    if (/health|score|compare|which route|which line/i.test(q)) {
      if (routeHealth) {
        parts.push(
          `Overall route health for the selected filters is ${routeHealth.score}/100 (${routeHealth.label}).`
        );
      }
      if (comparison && comparison.length) {
        const ordered = [...comparison].sort(
          (a, b) => b.healthScore - a.healthScore
        );
        const best = ordered[0];
        parts.push(
          `Among the compared lines, ${best.routeName} (${best.lineId}) currently has the best health at ${best.healthScore}/100 with ${best.trips} trips.`
        );
      }
    }

    // If nothing matched but the question still looks on-topic
    if (!parts.length) {
      if (
        /(trip|driver|route|line|utilization|health|delay|anomaly|pickup|stop|forecast|demand)/i.test(
          q
        )
      ) {
        parts.push(
          "I couldn't find an exact template for that question, but here is a quick summary of the current report:"
        );
        if (routeHealth) {
          parts.push(
            `Route health is ${routeHealth.score}/100 (${routeHealth.label}).`
          );
        }
        parts.push(
          `Trips: ${summary.totalTrips}, total distance: ${summary.totalDistance.toFixed(
            1
          )} km, avg duration: ${Math.round(
            summary.avgDuration
          )} seconds, peak hour: ${summary.peakUsage}.`
        );
        if (anomalies) {
          const longCount = anomalies.longTrips.length;
          const shortCount = anomalies.shortTrips.length;
          parts.push(
            `Anomalies: ${longCount} long trips and ${shortCount} very short trips (p95 ≈ ${Math.round(
              anomalies.p95 || 0
            )} seconds).`
          );
        }
      } else {
        // Fully off-topic but not caught earlier
        return "I can only answer questions about this route report. Please ask a report-related question.";
      }
    }

    return parts.join(" ");
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question) return;

    setChatInput("");
    setChatError(null);
    setChatHistory((prev) => [...prev, { from: "user", text: question }]);

    try {
      setChatLoading(true);
      const answer = buildCopilotAnswer(question);
      setChatHistory((prev) => [...prev, { from: "bot", text: answer }]);
    } catch (err: any) {
      console.error("Report copilot error:", err);
      setChatError(
        err?.message || "Failed to generate an answer from the report."
      );
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="reports-page">
      {/* Print-only header */}
      <div className="print-only print-report-header">
        <h1>Transvahan – Route Report</h1>
        <div className="line">
          Window: <strong>{fromDisplay}</strong> →{" "}
          <strong>{toDisplay}</strong>
        </div>
        <div className="line">
          Line: <strong>{lineDisplay}</strong> · Direction:{" "}
          <strong>{directionDisplay}</strong>
        </div>
        <div className="line">
          Generated at: <strong>{generatedAt}</strong>
        </div>
      </div>

      {/* Screen header */}
      <div className="reports-header no-print">
        <div>
          <h2>Route Health &amp; Trip Analytics</h2>
          <p className="muted reports-subtitle">
            Single view of historical performance, live vehicle utilization and
            geo hotspots – per line &amp; direction.
          </p>
        </div>
        <div className="reports-header-right">
          <button
            type="button"
            className="btn secondary export-btn"
            onClick={handleExportPDF}
          >
            Export PDF
          </button>

          <div className="reports-chip">
            <span
              className={`status-dot ${liveConnected ? "on" : "off"}`}
            />
            {liveConnected ? "Live feed connected" : "Live feed offline"}
          </div>
          <div className="reports-chip">
            Auto-refresh
            <button
              type="button"
              className={`toggle ${autoRefresh ? "on" : "off"}`}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <span className="knob" />
            </button>
          </div>
          <div className="reports-meta-text">
            {lastRefreshed
              ? `Last refresh: ${lastRefreshed.toLocaleTimeString()}`
              : "Loaded from Firestore"}
          </div>
        </div>
      </div>

      {/* Filters – screen only */}
      <div className="card reports-filters no-print">
        <div className="field">
          <label>From</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field">
          <label>To</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="field field-grow">
          <label>Line</label>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
          >
            <option value="">All lines</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_name} ({r.id})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="all">Both</option>
            <option value="to">To</option>
            <option value="fro">Fro</option>
          </select>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error && (
          <div className="field field-error">
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* KPI Summary */}
      {summary && (
        <section className="reports-kpis">
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total Trips</span>
              <span className="kpi-value">{summary.totalTrips}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Total Distance (km)</span>
              <span className="kpi-value">{summary.totalDistance}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Avg Duration (s)</span>
              <span className="kpi-value">{summary.avgDuration}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Active Drivers</span>
              <span className="kpi-value">
                {summary.activeDrivers ?? "—"}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Peak Hour</span>
              <span className="kpi-value">{summary.peakUsage}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">
                Live Utilization{" "}
                <span
                  style={{
                    fontSize: 10,
                    color: liveConnected ? "#16a34a" : "#9ca3af",
                    marginLeft: 4,
                  }}
                >
                  ● {liveConnected ? "Live" : "Offline"}
                </span>
              </span>
              <span className="kpi-value">
                {liveStats.active === 0
                  ? "—"
                  : `${Math.round(liveStats.avgUtilization * 100)}%`}
              </span>
              <span className="kpi-subtext">
                {liveStats.active} active vehicle
                {liveStats.active === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Route Health Analyzer */}
      <div className="card route-health-card">
        <div className="route-health-layout">
          <div className="route-health-main">
            <h3>Route Health Analyzer</h3>
            <p className="muted route-health-subtitle">
              Combined view of reliability, anomalies and live utilization for{" "}
              {selectedRoute
                ? `line ${selectedRoute}`
                : "all lines in this window"}
              {direction !== "all" ? ` (${direction})` : ""}.
            </p>

            {!routeHealth ? (
              <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                Adjust the time window and click <strong>Refresh</strong> to
                compute health.
              </p>
            ) : (
              <>
                <div className="route-health-score">
                  {routeHealth.score}
                  <span>/100</span>
                </div>
                <div
                  className={`route-health-badge tone-${routeHealth.tone}`}
                >
                  <span className="dot" />
                  {routeHealth.label}
                </div>
                <p className="muted route-health-caption">
                  Based on travel time vs p95, anomaly rate, live utilization
                  and observed volume.
                </p>
              </>
            )}
          </div>

          {routeHealth && (
            <div className="route-health-details">
              <div className="route-health-bar">
                <div className="label">Overall health</div>
                <div className="track">
                  <div
                    className={`fill tone-${routeHealth.tone}`}
                    style={{ width: `${routeHealth.score}%` }}
                  />
                </div>
                <div className="scale">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>

              <div className="route-health-subgrid">
                <div className="subcard">
                  <div className="title">Travel time</div>
                  <div className="value">
                    {Math.round(routeHealth.durationScore * 100)} / 100
                  </div>
                  <div className="hint">Avg vs 95th percentile</div>
                </div>
                <div className="subcard">
                  <div className="title">Live utilization</div>
                  <div className="value">
                    {Math.round(routeHealth.occupancyScore * 100)} / 100
                  </div>
                  <div className="hint">Sweet spot around 40–70%</div>
                </div>
                <div className="subcard">
                  <div className="title">Anomaly hygiene</div>
                  <div className="value">
                    {Math.round(routeHealth.anomalyScore * 100)} / 100
                  </div>
                  <div className="hint">
                    {routeHealth.anomalyCount} anomalies (
                    {Math.round(routeHealth.anomalyRate * 100)}%)
                  </div>
                </div>
                <div className="subcard">
                  <div className="title">Volume confidence</div>
                  <div className="value">
                    {Math.round(routeHealth.volumeScore * 100)} / 100
                  </div>
                  <div className="hint">
                    {routeHealth.totalTrips} trips in window
                  </div>
                </div>
              </div>
            </div>
          )}

          {routeHealth && (
            <div className="route-health-signals">
              <div className="title">Quick signals</div>
              <ul>
                {routeHealth.bullets.slice(0, 3).map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Service Day Benchmark */}
      {summary && baselineSummary && benchmark && (
        <div className="card benchmark-card">
          <div className="benchmark-header">
            <div>
              <h3>Service Day Benchmark</h3>
              <p className="muted">
                Current window vs previous service day (same duration, −24h
                shift) for the selected line &amp; direction.
              </p>
            </div>
            <div className="muted benchmark-note">
              Previous score:{" "}
              <strong>{benchmark.prevScore.toFixed(0)}/100</strong>
            </div>
          </div>
          <div className="benchmark-grid">
            <div className="benchmark-metric">
              <span className="label">Trips</span>
              <div className="values">
                <span className="current">{summary.totalTrips}</span>
                <span className="previous">
                  Prev: {baselineSummary.totalTrips}
                </span>
              </div>
              {benchmark.tripsChange !== null && (
                <span
                  className={
                    benchmark.tripsChange > 3
                      ? "delta delta-positive"
                      : benchmark.tripsChange < -3
                      ? "delta delta-negative"
                      : "delta delta-neutral"
                  }
                >
                  {benchmark.tripsChange > 3
                    ? "▲"
                    : benchmark.tripsChange < -3
                    ? "▼"
                    : "■"}{" "}
                  {Math.abs(benchmark.tripsChange).toFixed(1)}%
                </span>
              )}
            </div>

            <div className="benchmark-metric">
              <span className="label">Total distance (km)</span>
              <div className="values">
                <span className="current">
                  {summary.totalDistance.toFixed(1)}
                </span>
                <span className="previous">
                  Prev: {baselineSummary.totalDistance.toFixed(1)}
                </span>
              </div>
              {benchmark.distanceChange !== null && (
                <span
                  className={
                    benchmark.distanceChange > 3
                      ? "delta delta-positive"
                      : benchmark.distanceChange < -3
                      ? "delta delta-negative"
                      : "delta delta-neutral"
                  }
                >
                  {benchmark.distanceChange > 3
                    ? "▲"
                    : benchmark.distanceChange < -3
                    ? "▼"
                    : "■"}{" "}
                  {Math.abs(benchmark.distanceChange).toFixed(1)}%
                </span>
              )}
            </div>

            <div className="benchmark-metric">
              <span className="label">Avg duration (s)</span>
              <div className="values">
                <span className="current">
                  {summary.avgDuration.toFixed(0)}
                </span>
                <span className="previous">
                  Prev: {baselineSummary.avgDuration.toFixed(0)}
                </span>
              </div>
              {benchmark.durationChange !== null && (
                <span
                  className={
                    benchmark.durationChange < -3
                      ? "delta delta-positive"
                      : benchmark.durationChange > 3
                      ? "delta delta-negative"
                      : "delta delta-neutral"
                  }
                >
                  {benchmark.durationChange < -3
                    ? "▲"
                    : benchmark.durationChange > 3
                    ? "▼"
                    : "■"}{" "}
                  {Math.abs(benchmark.durationChange).toFixed(1)}%
                </span>
              )}
            </div>

            <div className="benchmark-metric">
              <span className="label">Route health</span>
              <div className="values">
                <span className="current">
                  {routeHealth?.score ?? "—"}/100
                </span>
                <span className="previous">
                  Prev: {benchmark.prevScore.toFixed(0)}/100
                </span>
              </div>
              <span
                className={
                  benchmark.healthDelta > 2
                    ? "delta delta-positive"
                    : benchmark.healthDelta < -2
                    ? "delta delta-negative"
                    : "delta delta-neutral"
                }
              >
                {benchmark.healthDelta > 2
                  ? "▲"
                  : benchmark.healthDelta < -2
                  ? "▼"
                  : "■"}{" "}
                {benchmark.healthDelta > 0 ? "+" : ""}
                {benchmark.healthDelta.toFixed(1)} pts
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Route Comparison */}
      {routes.length > 0 && (
        <div className="card route-compare-card">
          <div className="route-compare-header">
            <div>
              <h3>Route Comparison</h3>
              <p className="muted">
                Compare up to 4 lines for this time window to see which ones
                are healthiest.
              </p>
            </div>
            <div className="muted route-compare-hint">
              Tap to toggle lines · using the same window &amp; direction
            </div>
          </div>

          <div className="route-compare-selector no-print">
            {routes.map((r) => {
              const active = compareLines.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={
                    active
                      ? "route-compare-chip active"
                      : "route-compare-chip"
                  }
                  onClick={() => toggleCompareLine(r.id)}
                >
                  <span className="name">{r.route_name}</span>
                  <span className="id">{r.id}</span>
                </button>
              );
            })}
          </div>

          {!compareLines.length ? (
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Select one or more lines above to see their health, anomaly rate
              and volume side-by-side.
            </p>
          ) : (
            <div className="route-compare-grid">
              {compareLines.map((lineId) => {
                const row = compareRows.find(
                  (r) => String(r.lineId) === String(lineId)
                );
                const routeName =
                  row?.routeName ||
                  routes.find((r) => String(r.id) === String(lineId))
                    ?.route_name ||
                  lineId;

                if (!row) {
                  return (
                    <div key={lineId} className="route-compare-item">
                      <div className="route-compare-title">
                        <span className="route-name">{routeName}</span>
                        <span className="route-id">{lineId}</span>
                      </div>
                      <div className="route-compare-loading muted">
                        Loading metrics…
                      </div>
                    </div>
                  );
                }

                const anomalyPct = row.anomalyRate
                  ? Math.round(row.anomalyRate * 100)
                  : 0;

                return (
                  <div
                    key={lineId}
                    className={`route-compare-item tone-${row.tone}`}
                  >
                    <div className="route-compare-title">
                      <span className="route-name">{routeName}</span>
                      <span className="route-id">{lineId}</span>
                    </div>

                    <div className="route-compare-score-row">
                      <div className="score-main">
                        <span className="score">
                          {row.healthScore}
                          <span className="suffix">/100</span>
                        </span>
                        <span className={`pill tone-${row.tone}`}>
                          {row.label}
                        </span>
                      </div>
                      <div className="score-bar">
                        <div
                          className={`fill tone-${row.tone}`}
                          style={{ width: `${row.healthScore}%` }}
                        />
                      </div>
                    </div>

                    <div className="route-compare-metrics">
                      <div className="metric">
                        <span className="label">Trips</span>
                        <span className="value">{row.trips}</span>
                      </div>
                      <div className="metric">
                        <span className="label">Distance (km)</span>
                        <span className="value">
                          {row.distance.toFixed(1)}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="label">Anomaly rate</span>
                        <span className="value">
                          {anomalyPct}
                          <span className="suffix">%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {compareLoading && compareLines.length > 0 && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Updating comparison…
            </div>
          )}
        </div>
      )}

      {/* Route AI Copilot */}
      <div className="card reports-chat-card">
        <h3>Route AI Copilot</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          Ask questions about this report – for example:{" "}
          <em>“Are vehicles overloaded in the peak hour?”</em> or{" "}
          <em>“Which drivers look most active?”</em>.
        </p>

        <div className="chat-window">
          {chatHistory.length === 0 && !chatLoading && (
            <p className="muted" style={{ fontSize: 12 }}>
              Start by asking a question about the current report window.
            </p>
          )}

          {chatHistory.map((m, idx) => (
            <div
              key={idx}
              className={
                m.from === "user" ? "chat-bubble user" : "chat-bubble bot"
              }
            >
              {m.text}
            </div>
          ))}

          {chatLoading && (
            <div className="chat-bubble bot">Thinking…</div>
          )}

          {chatError && <div className="chat-error">{chatError}</div>}
        </div>

        <form className="chat-input-row" onSubmit={handleChatSubmit}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask something about this route report…"
          />
          <button type="submit" disabled={chatLoading}>
            Ask
          </button>
        </form>

        {!summary && (
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            No report loaded yet – pick a window and click{" "}
            <strong>Refresh</strong> first.
          </p>
        )}
      </div>

      {/* Live Map – screen only */}
      <div className="card no-print">
        <div className="map-header">
          <div>
            <h3>Live Route Utilization &amp; Geo Hotspots</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              Live vehicles over historical pickup density.
            </span>
          </div>

          <div className="map-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search line, vehicle, driver…"
            />
            {!!searchResults.length && (
              <div className="map-search-dropdown">
                {searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSearchResultClick(res)}
                  >
                    <span className="tag">{res.type}</span>
                    {res.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="reports-map-wrapper">
          <MapContainer
            center={mapCenter}
            zoom={15}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%", borderRadius: 12 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapViewController target={mapTarget} />
            <GeoHeatLayer points={geoHeatPoints} />

            {liveVehicles.map((v) => {
              const occ =
                typeof v.occupancy === "number" ? v.occupancy : 0;
              const cap =
                typeof v.capacity === "number" && v.capacity > 0
                  ? v.capacity
                  : 1;
              const ratio =
                occ <= 1 && cap <= 1
                  ? occ
                  : cap
                  ? occ / cap
                  : 0;

              let liveColor = "#22c55e";
              if (ratio > 0.8) liveColor = "#dc2626";
              else if (ratio > 0.5) liveColor = "#eab308";

              return (
                <CircleMarker
                  key={v.id}
                  center={[v.lat, v.lon]}
                  radius={8}
                  pathOptions={{
                    color: "#111827",
                    weight: 2,
                    fillColor: liveColor,
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: 12 }}>
                      <strong>Vehicle {v.id}</strong>
                      <br />
                      Line: {v.line_id ?? "—"}
                      <br />
                      {v.driver_name && (
                        <>
                          Driver: {v.driver_name}
                          <br />
                        </>
                      )}
                      Utilization:{" "}
                      {ratio ? `${Math.round(ratio * 100)}%` : "n/a"}
                      <br />
                      Last update:{" "}
                      {v.last_updated
                        ? new Date(
                            v.last_updated
                          ).toLocaleTimeString()
                        : "—"}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="map-footer">
          <div>
            <strong>Legend:</strong> Blue heat = dense pickup zones · Colored
            circles = live vehicles (green &lt;50%, amber 50–80%, red
            &gt;80% utilization)
          </div>
          <div>
            Live connection:{" "}
            <span
              style={{
                color: liveConnected ? "#16a34a" : "#9ca3af",
                fontWeight: 600,
              }}
            >
              {liveConnected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>
      </div>

      {/* Trends + Drivers */}
      <div className="grid reports-row">
        <div className="card">
          <h3>Trips per Hour</h3>
          {!hourly.length ? (
            <p className="muted">No trips in the selected window.</p>
          ) : (
            <div className="mini-bar-chart">
              {hourly.map((h) => (
                <div key={h.hour} className="mini-bar">
                  <div
                    className="mini-bar-fill"
                    style={{
                      height:
                        maxTripsHour > 0
                          ? `${(h.trips / maxTripsHour) * 100 || 0}%`
                          : "0%",
                    }}
                  />
                  <span className="mini-bar-x">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Top Drivers</h3>
          {!drivers.length ? (
            <p className="muted">No driver trips recorded in this window.</p>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trips</th>
                  <th>Distance (km)</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {drivers.slice(0, 5).map((d) => (
                  <tr key={d.driver_id}>
                    <td>{d.name}</td>
                    <td>{d.trips}</td>
                    <td>{d.distance_km}</td>
                    <td>{d.rating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card feedback-card">
        <h3>Passenger Feedback & Reviews</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          Aggregated anonymous feedback from riders — no user data is displayed.
        </p>

        {(() => {
          const [feedback, setFeedback] = React.useState<
            { id: string; vehicle_id: string; rating: number; comment: string; timestamp: string }[]
          >([]);
          const [loadingFb, setLoadingFb] = React.useState(true);
          const [errFb, setErrFb] = React.useState<string | null>(null);

          React.useEffect(() => {
            (async () => {
              try {
                const fb = await getAllFeedback();
                setFeedback(fb);
              } catch (err: any) {
                console.error("Feedback fetch failed:", err);
                setErrFb(err?.message || "Failed to fetch feedback");
              } finally {
                setLoadingFb(false);
              }
            })();
          }, []);

          if (loadingFb) return <p className="muted">Loading feedback…</p>;
          if (errFb) return <p className="muted">{errFb}</p>;
          if (!feedback.length)
            return <p className="muted">No feedback received yet.</p>;

          return (
            <div className="feedback-list">
              {feedback.slice(0, 30).map((fb) => (
                <div key={fb.id} className="feedback-item">
                  <div className="feedback-header">
                    <span className="feedback-rating">
                      {fb.rating > 0 ? "👍" : "👎"}
                    </span>
                    <span className="feedback-meta">
                      Route/Vehicle: <strong>{fb.vehicle_id}</strong> ·{" "}
                      {new Date(fb.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {fb.comment && (
                    <div className="feedback-comment">“{fb.comment}”</div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ======= END FEEDBACK CARD ======= */}



      {/* Geo + Anomalies + Forecast */}
      <div className="grid reports-row">
        <div className="card">
          <h3>Geo Hotspots (Trip Starts)</h3>
          <p>
            <strong>{geo.length}</strong> campus zones recorded.
          </p>
          {geo.length ? (
            <ul className="muted hotspot-list">
              {geo
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map((g, idx) => (
                  <li key={idx}>
                    Lat {g.lat.toFixed(5)}, Lon {g.lon.toFixed(5)} —{" "}
                    {g.count} trips
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">
              As trips accumulate, this will highlight hot pickup zones used in
              the map heat layer above.
            </p>
          )}
        </div>

        <div className="card">
          <h3>Anomalies &amp; Forecast</h3>
          {!anoms ||
          (!anoms.longTrips.length && !anoms.shortTrips.length) ? (
            <p className="muted">
              No anomalies detected for the selected window.
            </p>
          ) : (
            <>
              <p className="muted">
                Long-duration threshold (95th percentile):{" "}
                <strong>{anoms.p95.toFixed(0)} s</strong>
              </p>
              <p className="anoms-counts">
                <strong>{anoms.longTrips.length}</strong> long trips ·{" "}
                <strong>{anoms.shortTrips.length}</strong> very short trips.
              </p>
              <ul className="muted anoms-list">
                {anoms.longTrips.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    Long trip on line {t.line_id ?? "—"} —{" "}
                    {t.distance_km.toFixed(2)} km, {t.duration_s}s
                  </li>
                ))}
                {anoms.shortTrips.slice(0, 2).map((t) => (
                  <li key={t.id}>
                    Very short trip on line {t.line_id ?? "—"} —{" "}
                    {t.distance_km.toFixed(3)} km
                  </li>
                ))}
              </ul>
            </>
          )}

          <hr className="divider" />

          <h4 className="forecast-title">Next 7 Days – Pattern by Weekday</h4>
          {!forecast.length ? (
            <p className="muted">
              Forecast will appear after a few days of trip history.
            </p>
          ) : (
            <div className="mini-bar-chart-horizontal">
              {forecast.map((d) => (
                <div key={d.day} className="mini-bar-horizontal">
                  <span className="mini-bar-x">{d.day}</span>
                  <div className="mini-bar-horizontal-track">
                    <div
                      className="mini-bar-horizontal-fill"
                      style={{
                        width:
                          maxForecastTrips > 0
                            ? `${(d.trips / maxForecastTrips) * 100 || 0}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="mini-bar-horizontal-value">
                    {d.trips}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
