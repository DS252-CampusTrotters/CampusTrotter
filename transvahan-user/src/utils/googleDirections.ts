// backend/src/utils/googleDirections.js
/**
 * Road-following routing using OSRM (driving profile).
 *
 * This replaces the previous Google Directions implementation.
 * There is NO haversine and NO straight-line fallback.
 *
 * For each consecutive pair of stops we call OSRM /route and
 * concatenate the returned geometry.
 */

const fetch = (...args: unknown[]) =>
    import("node-fetch").then(({ default: fetch }) => (fetch as any)(...args));
  
  // You can point this to your own OSRM instance if you deploy one.
  const OSRM_BASE =
    process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
  
  /**
   * Call OSRM route service for a single segment: origin → destination
   * using the "driving" profile and GeoJSON geometry.
   *
   * Returns an array of { lat, lon } following the road network.
   */
  async function fetchOsrmSegment(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<{ lat: number; lon: number }[]> {
    const oLat = Number(origin.latitude);
    const oLon = Number(origin.longitude);
    const dLat = Number(destination.latitude);
    const dLon = Number(destination.longitude);
  
    if (
      !Number.isFinite(oLat) ||
      !Number.isFinite(oLon) ||
      !Number.isFinite(dLat) ||
      !Number.isFinite(dLon)
    ) {
      throw new Error("Invalid coordinates for OSRM segment");
    }
  
    // OSRM wants lon,lat
    const coordStr = `${oLon},${oLat};${dLon},${dLat}`;
    const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(
        `OSRM HTTP ${res.status}: ${txt.slice(0, 200)}`
      );
    }
  
    const json = await res.json();
  
    if (json.code !== "Ok" || !json.routes || !json.routes.length) {
      throw new Error(
        `OSRM error: code=${json.code || "unknown"}`
      );
    }
  
    const route = json.routes[0];
    const coords: [number, number][] = (route.geometry?.coordinates as [number, number][]) || [];
  
    // coords are [lon, lat]; convert → {lat, lon}
    return coords.map((pair: [number, number]) => {
      const [lon, lat] = pair;
      return {
        lat,
        lon,
      };
    });
  }
  
  /**
   * Build a full route polyline that visits ALL stops in order.
   *
   * We:
   *  - Take stop locations in sequence.
   *  - For every pair (stop i → stop i+1), call OSRM /route.
   *  - Concatenate all returned segments, de-duplicating junction points.
   *
   * NO straight-line approximation is ever used.
   */
  export async function getRoutePolylineForStops(
    stops: Array<{ location?: { latitude?: number | string; longitude?: number | string } }>
  ): Promise<{ lat: number; lon: number }[]> {
    if (!Array.isArray(stops) || stops.length < 2) {
      return [];
    }
  
    const coords = stops
      .map((s) => ({
        latitude: Number(s.location?.latitude),
        longitude: Number(s.location?.longitude),
      }))
      .filter(
        (c) =>
          Number.isFinite(c.latitude) && Number.isFinite(c.longitude)
      );
  
    if (coords.length < 2) {
      return [];
    }
  
    const allPoints = [];
  
    for (let i = 0; i < coords.length - 1; i++) {
      const origin = coords[i];
      const dest = coords[i + 1];
  
      try {
        const seg = await fetchOsrmSegment(origin, dest);
        if (!Array.isArray(seg) || !seg.length) {
          console.warn(
            `[OSRM] Empty segment for ${i} → ${i + 1}`
          );
          continue;
        }
  
        // De-duplicate junction point if it matches last point
        if (allPoints.length) {
          const first = seg[0];
          const last = allPoints[allPoints.length - 1];
          if (
            first &&
            last &&
            first.lat === last.lat &&
            first.lon === last.lon
          ) {
            seg.shift();
          }
        }
  
        allPoints.push(...seg);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[OSRM] Failed segment ${i} → ${i + 1}:`,
          errMsg
        );
        // IMPORTANT: do NOT fabricate a straight line; just skip.
      }
    }
  
    return allPoints;
  }
  