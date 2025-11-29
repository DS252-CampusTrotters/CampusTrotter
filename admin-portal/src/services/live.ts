// admin-portal/src/services/live.ts
// Shared WebSocket client for live vehicles (admin web).

import api from "./admin";

export type LiveVehicle = {
  id: string;
  line_id: string | null;      // logical line / route grouping
  route_id?: string | null;    // explicit route id if present
  direction?: string | null;   // "to" | "fro" | etc.
  status?: string | null;      // ACTIVE / IDLE / etc.
  lat: number;
  lon: number;
  occupancy?: number;
  capacity?: number;
  heading_deg?: number;
  last_updated?: string;
  driver_name?: string;
  demand_high?: boolean;
};

type LiveOptions = {
  lineId?: string;
  onUpdate: (vehicles: LiveVehicle[]) => void;
  onStatusChange?: (connected: boolean) => void;
};

function computeWsUrl(): string {
  const envUrl =
    ((import.meta as any).env?.VITE_LIVE_WS_URL as string | undefined) ||
    undefined;

  // If env is configured and not a placeholder, trust it.
  if (envUrl && !envUrl.includes("<URL>")) {
    return envUrl;
  }

  // Fallback: derive from Admin API baseURL
  const base = (api.defaults as any)?.baseURL as string | undefined;
  if (base) {
    try {
      const u = new URL(base);
      const proto = u.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${u.host}/ws?role=admin`;
    } catch {
      // ignore, fall through to window.location
    }
  }

  // Last-resort: window.location
  const { protocol, hostname, port } = window.location;
  const proto = protocol === "https:" ? "wss:" : "ws:";
  const portPart = port ? `:${port}` : "";
  return `${proto}//${hostname}${portPart}/ws?role=admin`;
}

const WS_URL = computeWsUrl();

export function connectLiveVehicles(opts: LiveOptions) {
  const { lineId, onUpdate, onStatusChange } = opts;
  let closed = false;

  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    if (closed) return;
    onStatusChange?.(true);
    // Optional filter message – backend ignores unknown types safely
    if (lineId) {
      try {
        ws.send(JSON.stringify({ type: "filter", line_id: lineId }));
      } catch {
        // ignore
      }
    }
  };

  ws.onclose = () => {
    if (closed) return;
    onStatusChange?.(false);
  };

  ws.onerror = () => {
    if (closed) return;
    onStatusChange?.(false);
  };

  ws.onmessage = (event) => {
    if (closed) return;
    try {
      const data = JSON.parse(event.data);

      let rawVehicles: any[] = [];
      if (Array.isArray(data)) rawVehicles = data;
      else if (Array.isArray(data?.vehicles)) rawVehicles = data.vehicles;
      else if (data?.type === "vehicle" && data.data)
        rawVehicles = [data.data];

      if (!rawVehicles.length) return;

      let vehicles: LiveVehicle[] = rawVehicles.map((vRaw: any) => {
        const lat =
          vRaw.lat ??
          vRaw.location?.lat ??
          vRaw.location?.latitude ??
          0;
        const lon =
          vRaw.lon ??
          vRaw.lng ??
          vRaw.location?.lng ??
          vRaw.location?.longitude ??
          0;

        const line_id =
          vRaw.line_id ??
          vRaw.route_id ??
          vRaw.currentRoute ??
          null;

        const route_id =
          vRaw.route_id ??
          line_id ??
          null;

        const capacity =
          typeof vRaw.capacity === "number" && vRaw.capacity > 0
            ? vRaw.capacity
            : 12;

        const occupancy =
          typeof vRaw.occupancy === "number" ? vRaw.occupancy : 0;

        const last_updated =
          vRaw.last_updated ??
          vRaw.updated_at ??
          (vRaw.location?.timestamp
            ? new Date(vRaw.location.timestamp).toISOString()
            : undefined);

        const driver_name =
          vRaw.driver_name ?? vRaw.driver ?? undefined;

        const id =
          vRaw.id ??
          vRaw.vehicle_id ??
          vRaw.plateNo ??
          Math.random().toString(36).slice(2);

        const status = vRaw.status ?? vRaw.state ?? null;
        const direction = vRaw.direction ?? null;
        const demand_high = !!vRaw.demand_high;

        return {
          id: String(id),
          line_id,
          route_id,
          direction,
          status,
          lat,
          lon,
          occupancy,
          capacity,
          heading_deg: vRaw.heading_deg,
          last_updated,
          driver_name,
          demand_high,
        };
      });

      if (lineId) {
        vehicles = vehicles.filter(
          (v) => !v.line_id || String(v.line_id) === String(lineId)
        );
      }

      if (!vehicles.length) return;
      onStatusChange?.(true);
      onUpdate(vehicles);
    } catch (err) {
      console.error("Live vehicles: failed to parse message", err);
    }
  };

  return () => {
    closed = true;
    try {
      ws.close();
    } catch {
      // ignore
    }
  };
}
