import { http } from "./client";

export interface StopLike {
  stop_id?: string;
  id?: string;
  sequence?: number;
  stop_name?: string;
  lat: number;
  lon: number;
}

/**
 * Call backend to compute ETA from a vehicle's current location
 * to a target stop on a given route/direction.
 *
 * This calls /eta/stop → **shortest-path** ETA.
 */
export async function fetchETAForStop(params: {
  routeId: string | number;
  direction: "to" | "fro";
  vehicleLabel: string;
  vehicleLat: number;
  vehicleLon: number;
  stop: StopLike;
}) {
  const { routeId, direction, vehicleLabel, vehicleLat, vehicleLon, stop } =
    params;

  const stopId =
    stop.stop_id ||
    stop.id ||
    `${routeId}_${direction}_${
      typeof stop.sequence === "number" ? stop.sequence : "x"
    }`;

  const payload = {
    route_id: String(routeId),
    stop_id: String(stopId),
    direction,
    vehicle_label: vehicleLabel,
    current_lat: vehicleLat,
    current_lon: vehicleLon,
    target_lat: stop.lat,
    target_lon: stop.lon,
  };

  const { data } = await http.post("/eta/stop", payload);
  return data;
}

/**
 * Route-aware ETA: follow the Transvahan route via intermediate stops.
 *
 * This calls /eta/stop-along-route → uses Google Directions with via: waypoints.
 * Use this when you want "ETA along the shuttle's real path", e.g.
 * in the stop popup/card.
 */
export async function fetchETAForStopAlongRoute(params: {
  routeId: string | number;
  direction: "to" | "fro";
  vehicleLabel: string;
  vehicleLat: number;
  vehicleLon: number;
  stop: StopLike;
}) {
  const { routeId, direction, vehicleLabel, vehicleLat, vehicleLon, stop } =
    params;

  const stopId =
    stop.stop_id ||
    stop.id ||
    `${routeId}_${direction}_${
      typeof stop.sequence === "number" ? stop.sequence : "x"
    }`;

  const payload = {
    route_id: String(routeId),
    stop_id: String(stopId),
    direction,
    vehicle_label: vehicleLabel,
    current_lat: vehicleLat,
    current_lon: vehicleLon,
    target_lat: stop.lat,
    target_lon: stop.lon,
  };

  const { data } = await http.post("/eta/stop-along-route", payload);
  return data;
}
