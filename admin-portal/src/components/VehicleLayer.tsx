import React, { useEffect, useRef } from "react";
import { connectLiveVehicles, LiveVehicle } from "../services/live";

export type DirectionKey = "to" | "fro";

export type VehiclePoint = {
  id: string;
  vehicle_id: string;
  vehicle_plate?: string;
  route_id?: string | null;
  direction?: DirectionKey | string | null;
  lat: number;
  lon: number;
  occupancy?: number;
  capacity?: number;
  status?: string;
  driver_name?: string;
  demand_high?: boolean;
  last_updated?: string;
};

type Props = {
  routeId?: string;
  direction: DirectionKey;
  assignedVehicleId?: string;
  onData: (rows: VehiclePoint[]) => void;
};

function normalizeVehicles(
  items: LiveVehicle[],
  opts: { routeId?: string; direction: DirectionKey; assignedVehicleId?: string }
): VehiclePoint[] {
  const { routeId, direction, assignedVehicleId } = opts;
  const routeIdStr = routeId ? String(routeId) : null;
  const assignedIdStr = assignedVehicleId ? String(assignedVehicleId) : null;

  return items
    .map((v) => {
      const lat = Number((v as any).lat ?? (v as any).location?.lat);
      const lon = Number((v as any).lon ?? (v as any).lng ?? (v as any).location?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const idStr = String((v as any).id || (v as any).vehicle_id || "");

      // ✅ HARD FILTER: if assignment exists, ONLY show that vehicle
      if (assignedIdStr && idStr !== assignedIdStr) return null;

      const vRoute =
        (v as any).line_id ??
        (v as any).route_id ??
        (v as any).currentRoute ??
        null;

      // ✅ keep only this route if provided
      if (routeIdStr && vRoute && String(vRoute) !== routeIdStr) return null;

      // ✅ FILTER: Only show vehicles with "active" status (not idle)
      const status = String((v as any).status || "").toLowerCase();
      if (status !== "active") return null;

      return {
        id: idStr,
        vehicle_id: idStr,
        vehicle_plate:
          (v as any).vehicle_plate ||
          (v as any).plateNo ||
          (v as any).vehicle_id ||
          idStr,
        route_id: vRoute,
        direction: (v as any).direction ?? direction,
        lat,
        lon,
        occupancy: (v as any).occupancy,
        capacity: (v as any).capacity,
        status: (v as any).status,
        driver_name: (v as any).driver_name,
        demand_high: (v as any).demand_high ?? false,
        last_updated: (v as any).last_updated,
      } as VehiclePoint;
    })
    .filter(Boolean) as VehiclePoint[];
}

/**
 * VehicleLayer
 * - Keeps a single WebSocket subscription per (routeId, direction).
 * - Pushes normalized data to parent via a stable callback.
 */
export default function VehicleLayer({
  routeId,
  direction,
  assignedVehicleId,
  onData,
}: Props) {
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    if (!routeId) {
      onDataRef.current?.([]);
      return;
    }

    let cleanupWs: (() => void) | null = null;
    let closed = false;

    cleanupWs = connectLiveVehicles({
      lineId: routeId,
      onUpdate: (vehicles) => {
        if (closed) return;

        const rows = normalizeVehicles(vehicles, {
          routeId,
          direction,
          assignedVehicleId,
        });

        onDataRef.current?.(rows);
      },
      onStatusChange: () => {},
    });

    return () => {
      closed = true;
      try {
        cleanupWs?.();
      } catch {}
    };
  }, [routeId, direction, assignedVehicleId]);

  return null;
}