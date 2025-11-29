// admin-portal/src/services/routes.ts
import api from "./admin";

// Normalize to arrays so UI can always .map()
export async function listRoutes() {
  const res = await api.get("/routes");
  const raw = res.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.routes)) return raw.routes;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

export async function getRoute(id: string) {
  const res = await api.get(`/routes/${id}`);
  return res.data;
}

// NEW: road-following route shape using backend Google Directions wrapper
export async function getRouteShape(
  id: string,
  direction: "to" | "fro",
  opts?: { force?: boolean }
) {
  const res = await api.get(`/routes/${id}/shape`, {
    params: {
      direction,
      force: opts?.force ? "1" : undefined,
    },
  });
  return res.data;
}

export async function createRoute(payload: { route_name: string }) {
  const res = await api.post("/routes", payload);
  return res.data;
}

export async function updateRoute(id: string, payload: any) {
  const res = await api.put(`/routes/${id}`, payload);
  return res.data;
}

export async function deleteRoute(id: string) {
  const res = await api.delete(`/routes/${id}`);
  return res.data;
}

/**
 * Add a single stop on the backend
 * POST /routes/:routeId/stops
 */
export async function addStop(
  routeId: string,
  payload: {
    direction: "to" | "fro";
    stop_name: string;
    latitude: number;
    longitude: number;
  }
) {
  const res = await api.post(`/routes/${routeId}/stops`, payload);
  return res.data;
}

/**
 * Update a single stop (rename / move / reposition) on the backend
 * PUT /routes/:routeId/stops/:stopId
 */
export async function updateStop(
  routeId: string,
  stopId: string,
  payload: Partial<{
    direction: "to" | "fro";
    stop_name: string;
    latitude: number;
    longitude: number;
    sequence: number;
  }>
) {
  const res = await api.put(`/routes/${routeId}/stops/${stopId}`, payload);
  return res.data;
}

/**
 * Delete a single stop on the backend
 * DELETE /routes/:routeId/stops/:stopId?direction=to|fro
 */
export async function deleteStop(
  routeId: string,
  stopId: string,
  direction: "to" | "fro"
) {
  const res = await api.delete(`/routes/${routeId}/stops/${stopId}`, {
    params: { direction },
  });
  return res.data;
}

// OpenStreetMap geocoding helper
export async function geocodeName(q: string) {
  if (!q || !q.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    q
  )}&limit=5&addressdetails=1`;

  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  const data = await res.json();

  return (Array.isArray(data) ? data : []).map((x: any) => ({
    display: x.display_name,
    lat: parseFloat(x.lat),
    lon: parseFloat(x.lon),
    bbox: x.boundingbox?.map((n: string) => parseFloat(n)) || null,
    type: x.type,
  }));
}

// -------------------- Schedules --------------------

export async function getSchedule(routeId: string) {
  const res = await api.get(`/routes/${routeId}/schedule`);
  const raw = res.data?.schedule ?? res.data;
  return Array.isArray(raw) ? raw : [];
}

export async function saveSchedule(routeId: string, schedule: any[]) {
  const res = await api.put(`/routes/${routeId}/schedule`, { schedule });
  return res.data?.schedule ?? [];
}

export async function createScheduleEntry(routeId: string, entry: any) {
  const res = await api.post(`/routes/${routeId}/schedule`, entry);
  return res.data?.schedule ?? [];
}

export async function updateScheduleEntry(
  routeId: string,
  scheduleId: string,
  entry: any
) {
  const res = await api.patch(
    `/routes/${routeId}/schedule/${scheduleId}`,
    entry
  );
  return res.data?.schedule ?? [];
}

export async function deleteScheduleEntry(routeId: string, scheduleId: string) {
  const res = await api.delete(`/routes/${routeId}/schedule/${scheduleId}`);
  return res.data?.schedule ?? [];
}
