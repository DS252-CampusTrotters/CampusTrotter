// admin-portal/src/components/RouteMapEditor.tsx
import React, { useEffect, useRef, useState } from "react";

type DirectionKey = "to" | "fro";

export type Stop = {
  stop_id?: string;
  stop_name: string;
  location: { latitude: number; longitude: number };
  sequence?: number;
  [k: string]: any;
};

type OverlayRoute = {
  id: string;
  name: string;
  color: string;
  to: Stop[];
  fro: Stop[];
};

type Props = {
  routeId?: string;
  direction: DirectionKey;
  stops: Stop[];
  primaryColor: string;
  overlays: OverlayRoute[];
  vehicles: any[];
  demands: any[];
  onMapClick?: (lat: number, lon: number) => void;
  onMarkerMove?: (stopId: string, lat: number, lon: number) => void; // reserved
  onRenameStop?: (stopId: string) => void;
  onDeleteStop?: (stopId: string) => void;
  loading?: boolean;
};

declare global {
  interface Window {
    google?: any;
    __TV_GMAPS_KEY__?: string; // optional runtime override
    __TV_GMAPS_LOADING__?: boolean;
    __TV_GMAPS_LOADED__?: boolean;
  }
}

const DEFAULT_CENTER = { lat: 13.0213, lng: 77.567 };
const GMAPS_SCRIPT_ID = "tv-google-maps-js";
let mapsLoadAttempted = false;

// ------------------------------------------------------
// Google Maps JS loader (fixed for Vite env + retry-safe)
// ------------------------------------------------------
function ensureGoogleMapsScript(
  onLoaded?: () => void,
  onError?: (msg: string) => void
) {
  if (typeof window === "undefined") return;

  // already loaded
  if (window.google && window.google.maps) {
    onLoaded?.();
    return;
  }

  const existing = document.getElementById(GMAPS_SCRIPT_ID) as
    | HTMLScriptElement
    | null;
  if (existing) return;

  // ✅ Direct Vite env access (guaranteed injection)
  const urlFromEnv = (import.meta.env.VITE_GOOGLE_MAPS_URL || "").trim();
  const keyFromEnv = (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    window.__TV_GMAPS_KEY__ ||
    ""
  ).trim();

  console.log("[RouteMapEditor] env snapshot", {
    VITE_GOOGLE_MAPS_URL: urlFromEnv || "(empty)",
    VITE_GOOGLE_MAPS_API_KEY_present: !!keyFromEnv,
    VITE_GOOGLE_MAPS_API_KEY_length: keyFromEnv.length,
  });

  let src: string | null = null;

  if (urlFromEnv) {
    if (urlFromEnv.includes("VITE_GOOGLE_MAPS_KEY") && keyFromEnv) {
      src = urlFromEnv.replace(
        "VITE_GOOGLE_MAPS_KEY",
        encodeURIComponent(keyFromEnv)
      );
    } else {
      src = urlFromEnv;
    }
  } else if (keyFromEnv) {
    src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      keyFromEnv
    )}&libraries=places&v=weekly`;
  }

  // ✅ If we still don't have src, DO NOT lock attempts forever.
  if (!src) {
    mapsLoadAttempted = false; // allow retry on next render
    const msg =
      "Google Maps key missing. Set VITE_GOOGLE_MAPS_API_KEY in admin-portal/.env and restart the dev server.";
    console.error("[RouteMapEditor]", msg);
    onError?.(msg);
    return;
  }

  // ✅ Only now mark attempted
  if (mapsLoadAttempted) return;
  mapsLoadAttempted = true;

  const script = document.createElement("script");
  script.id = GMAPS_SCRIPT_ID;
  script.src = src;
  script.async = true;
  script.defer = true;

  script.onload = () => {
    console.log("[RouteMapEditor] Google Maps JS loaded.");
    onLoaded?.();
  };

  script.onerror = () => {
    mapsLoadAttempted = false; // allow retry if load failed
    const msg =
      "Failed to load Google Maps JS. Check API key, billing, or referrer restrictions.";
    console.error("[RouteMapEditor] " + msg, src);
    onError?.(msg);
  };

  document.head.appendChild(script);
  console.log("[RouteMapEditor] Injected Google Maps JS:", src);
}

const RouteMapEditor: React.FC<Props> = ({
  routeId,
  direction,
  stops,
  primaryColor,
  overlays,
  vehicles,
  demands,
  onMapClick,
  onMarkerMove, // not used yet
  onRenameStop,
  onDeleteStop,
  loading,
}) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<any>(null);

  const stopMarkersRef = useRef<any[]>([]);
  const overlayLinesRef = useRef<any[]>([]);
  const mainLineRef = useRef<any | null>(null);

  // vehicle markers keyed by vehicle id to avoid blinking
  const vehicleMarkersRef = useRef<Record<string, any>>({});
  const demandCirclesRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any | null>(null);
  const mapClickListenerRef = useRef<any | null>(null);

  const [shapePoints, setShapePoints] = useState<{ lat: number; lng: number }[]>(
    []
  );
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  // Track if user has interacted with the map (zoom/pan) to prevent auto-fit from overriding
  const userInteractedRef = useRef(false);
  // Track if we've done initial bounds fit
  const initialBoundsFitRef = useRef(false);
  // Track the previous route/direction to detect changes
  const prevRouteKeyRef = useRef<string>("");

  // Reset user interaction flag when route or direction changes
  useEffect(() => {
    const newKey = `${routeId}-${direction}`;
    if (prevRouteKeyRef.current && prevRouteKeyRef.current !== newKey) {
      // Route changed - reset flags to allow auto-fit for new route
      userInteractedRef.current = false;
      initialBoundsFitRef.current = false;
    }
    prevRouteKeyRef.current = newKey;
  }, [routeId, direction]);

  // ---------------------- init map (load & wait for JS) ----------------------
  useEffect(() => {
    if (mapObjRef.current || !mapRef.current) return;

    let cancelled = false;

    ensureGoogleMapsScript(
      () => {
        if (cancelled || mapObjRef.current || !mapRef.current) return;

        if (window.google && window.google.maps) {
          const map = new window.google.maps.Map(mapRef.current, {
            center: DEFAULT_CENTER,
            zoom: 15,
            mapTypeId: window.google.maps.MapTypeId.ROADMAP,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
          });
          mapObjRef.current = map;

          // Listen for user interactions to prevent auto-fit from overriding manual zoom/pan
          map.addListener("dragstart", () => {
            userInteractedRef.current = true;
          });
          map.addListener("zoom_changed", () => {
            // Only mark as user-interacted after initial fit
            if (initialBoundsFitRef.current) {
              userInteractedRef.current = true;
            }
          });

          setMapsReady(true);
          setMapsError(null);
        }
      },
      (msg) => {
        if (cancelled) return;
        setMapsError(msg);
      }
    );

    // fallback poll if onload doesn't fire for some reason
    const startTime = Date.now();
    const poll = () => {
      if (cancelled || mapObjRef.current || !mapRef.current) return;
      if (window.google && window.google.maps) {
        const map = new window.google.maps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: 15,
          mapTypeId: window.google.maps.MapTypeId.ROADMAP,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
        });
        mapObjRef.current = map;

        // Listen for user interactions
        map.addListener("dragstart", () => {
          userInteractedRef.current = true;
        });
        map.addListener("zoom_changed", () => {
          if (initialBoundsFitRef.current) {
            userInteractedRef.current = true;
          }
        });

        setMapsReady(true);
        setMapsError(null);
        return;
      }
      if (Date.now() - startTime < 15000) {
        window.setTimeout(poll, 250);
      }
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------- bind/unbind map click handler ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    if (mapClickListenerRef.current) {
      window.google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }

    if (!onMapClick) return;

    mapClickListenerRef.current = map.addListener("click", (e: any) => {
      if (!e.latLng) return;
      onMapClick(e.latLng.lat(), e.latLng.lng());
    });
  }, [onMapClick]);

  // ---------------------- ROAD-FOLLOWING SHAPE (live Directions) ----------------------
  useEffect(() => {
    if (!mapsReady) return;
    if (!window.google || !window.google.maps) return;

    if (!stops || stops.length < 2) {
      setShapePoints([]);
      return;
    }

    const validStops = stops.filter(
      (s) =>
        typeof s.location?.latitude === "number" &&
        typeof s.location?.longitude === "number"
    );
    if (validStops.length < 2) {
      setShapePoints([]);
      return;
    }

    const svc = new window.google.maps.DirectionsService();
    let cancelled = false;

    const origin = {
      lat: validStops[0].location.latitude,
      lng: validStops[0].location.longitude,
    };
    const destination = {
      lat: validStops[validStops.length - 1].location.latitude,
      lng: validStops[validStops.length - 1].location.longitude,
    };

    const waypoints =
      validStops.length > 2
        ? validStops.slice(1, validStops.length - 1).map((s) => ({
            location: {
              lat: s.location.latitude,
              lng: s.location.longitude,
            },
            stopover: true,
          }))
        : [];

    svc.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
        provideRouteAlternatives: false,
      },
      (result: any, status: any) => {
        if (cancelled) return;

        const okStatus =
          status === "OK" ||
          status === window.google.maps.DirectionsStatus?.OK;

        if (!okStatus || !result?.routes?.length) {
          console.warn(
            "[RouteMapEditor] Directions failed, falling back to straight lines:",
            status,
            result
          );
          setShapePoints([]);
          return;
        }

        const route = result.routes[0];
        const path = route.overview_path || [];

        const pts =
          path && path.length
            ? path.map((p: any) => ({
                lat: p.lat(),
                lng: p.lng(),
              }))
            : [];

        setShapePoints(pts);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [stops, direction, mapsReady]);

  // ---------------------- draw stops ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    // clear old markers
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];

    stops.forEach((s, idx) => {
      const lat = s.location?.latitude;
      const lng = s.location?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map,
        label: String(idx + 1),
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: primaryColor,
          strokeWeight: 3,
        },
      });

      if (onRenameStop) {
        marker.addListener("click", () => {
          if (s.stop_id) onRenameStop(s.stop_id);
        });
      }

      if (onDeleteStop) {
        marker.addListener("rightclick", () => {
          if (s.stop_id) onDeleteStop(s.stop_id);
        });
      }

      stopMarkersRef.current.push(marker);
    });
  }, [stops, primaryColor, onRenameStop, onDeleteStop]);

  // ---------------------- draw main route polyline ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    if (mainLineRef.current) {
      mainLineRef.current.setMap(null);
      mainLineRef.current = null;
    }

    const coordsSource =
      shapePoints.length > 1
        ? shapePoints
        : stops
            .map((s) => ({
              lat: s.location?.latitude,
              lng: s.location?.longitude,
            }))
            .filter(
              (p) => typeof p.lat === "number" && typeof p.lng === "number"
            );

    if (!coordsSource.length) return;

    const line = new window.google.maps.Polyline({
      path: coordsSource,
      map,
      strokeColor: primaryColor,
      strokeOpacity: 1,
      strokeWeight: 5,
    });

    mainLineRef.current = line;
  }, [shapePoints, stops, primaryColor]);

  // ---------------------- draw overlay routes ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    overlayLinesRef.current.forEach((l) => l.setMap(null));
    overlayLinesRef.current = [];

    overlays.forEach((r) => {
      const dirStops: Stop[] = (r as any)?.directions
        ? (r as any).directions[direction] || []
        : direction === "to"
        ? r.to
        : r.fro;

      const coords = (dirStops || [])
        .map((s: Stop) => ({
          lat: s.location?.latitude,
          lng: s.location?.longitude,
        }))
        .filter(
          (p) => typeof p.lat === "number" && typeof p.lng === "number"
        );

      if (!coords.length) return;

      const line = new window.google.maps.Polyline({
        path: coords,
        map,
        strokeColor: r.color,
        strokeOpacity: 0.45,
        strokeWeight: 3,
      });
      overlayLinesRef.current.push(line);
    });
  }, [overlays, direction]);

  // ---------------------- live vehicle markers (smooth, non-blinking) ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new window.google.maps.InfoWindow();
    }

    const activeIds = new Set<string>();

    (vehicles || []).forEach((v: any) => {
      const lat = Number(v.lat);
      const lng = Number((v.lng ?? v.lon) ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const id = String(
        v.id || v.vehicle_id || v.vehicle_plate || v.plateNo || ""
      );
      if (!id) return;
      activeIds.add(id);

      let marker = vehicleMarkersRef.current[id];

      if (!marker) {
        marker = new window.google.maps.Marker({
          position: { lat, lng },
          map,
          icon: {
            path:
              "M -14 -6 L -4 -6 L -2 -10 L 6 -10 L 10 -4 L 10 4 L 6 10 L -2 10 L -4 6 L -14 6 z",
            fillColor: v.demand_high ? "#ef4444" : "#2563eb",
            fillOpacity: 0.98,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 1,
          },
          zIndex: 1000,
        });

        (marker as any).__infoData = v;

        marker.addListener("click", () => {
          const data = (marker as any).__infoData || v;

          const occ =
            typeof data.occupancy === "number" ? data.occupancy : undefined;
          const cap =
            typeof data.capacity === "number" ? data.capacity : undefined;

          const occStr =
            occ != null && cap != null
              ? `${occ} / ${cap}`
              : occ != null
              ? String(occ)
              : "n/a";

          const html = `
            <div style="min-width:200px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px">
              <div style="font-weight:600;margin-bottom:4px;">Vehicle ${
                data.vehicle_plate ||
                data.plateNo ||
                data.id ||
                data.vehicle_id ||
                ""
              }</div>
              <div>Status: <strong>${String(
                data.status || "unknown"
              ).toUpperCase()}</strong></div>
              <div>Occupancy: <strong>${occStr}</strong></div>
              ${
                data.route_id
                  ? `<div>Route: <strong>${data.route_id}</strong></div>`
                  : ""
              }
              ${
                data.direction
                  ? `<div>Direction: <strong>${String(
                      data.direction
                    ).toUpperCase()}</strong></div>`
                  : ""
              }
              ${
                data.driver_name
                  ? `<div>Driver: <strong>${data.driver_name}</strong></div>`
                  : ""
              }
            </div>
          `;

          infoWindowRef.current!.setContent(html);
          infoWindowRef.current!.open({
            map,
            anchor: marker,
            shouldFocus: false,
          });
        });

        vehicleMarkersRef.current[id] = marker;
      }

      // smooth update = just move existing marker; no recreate (no blink)
      marker.setPosition({ lat, lng });

      // ✅ Safe icon update even if getIcon() returns a string
      const currentIcon = marker.getIcon();
      let newIcon: any;

      if (typeof currentIcon === "string") {
        newIcon = {
          path:
            "M -14 -6 L -4 -6 L -2 -10 L 6 -10 L 10 -4 L 10 4 L 6 10 L -2 10 L -4 6 L -14 6 z",
          fillColor: v.demand_high ? "#ef4444" : "#2563eb",
          fillOpacity: 0.98,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 1,
        };
      } else {
        newIcon = { ...(currentIcon || {}) };
        newIcon.fillColor = v.demand_high ? "#ef4444" : "#2563eb";
      }

      marker.setIcon(newIcon);
      (marker as any).__infoData = v;
      marker.setMap(map);
    });

    // remove markers for vehicles that disappeared
    Object.keys(vehicleMarkersRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        const m = vehicleMarkersRef.current[id];
        if (m) m.setMap(null);
        delete vehicleMarkersRef.current[id];
      }
    });
  }, [vehicles]);

  // ---------------------- demand circles ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    demandCirclesRef.current.forEach((c) => c.setMap(null));
    demandCirclesRef.current = [];

    if (!demands || demands.length === 0) return;

    demands.forEach((d) => {
      const lat = Number(d.lat);
      const lng = Number(d.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const circle = new window.google.maps.Circle({
        map,
        center: { lat, lng },
        radius: 35 + Math.min(10 * (d.waiting ?? 0), 80),
        fillColor: d.high ? "#f97316" : "#22c55e",
        fillOpacity: 0.25,
        strokeColor: d.high ? "#ea580c" : "#16a34a",
        strokeWeight: 1.5,
      });

      demandCirclesRef.current.push(circle);
    });
  }, [demands]);

  // ---------------------- auto-fit bounds (only on stops change, not vehicle updates) ----------------------
  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    // Skip auto-fit if user has manually interacted with the map
    if (userInteractedRef.current) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasAny = false;

    stops.forEach((s) => {
      const lat = s.location?.latitude;
      const lng = s.location?.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        bounds.extend({ lat, lng });
        hasAny = true;
      }
    });

    if (!hasAny) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds);
      const listener = window.google.maps.event.addListenerOnce(
        map,
        "bounds_changed",
        () => {
          if (map.getZoom() > 17) map.setZoom(17);
          // Mark initial fit as done
          initialBoundsFitRef.current = true;
        }
      );
      return () => window.google?.maps.event.removeListener(listener);
    }

    // Mark initial fit as done even if no stops
    initialBoundsFitRef.current = true;
  }, [stops, routeId, direction]); // Only re-fit on stops/route/direction change, NOT vehicles

  // Function to reset view to fit all stops
  const resetView = () => {
    const map = mapObjRef.current;
    if (!map || !window.google) return;

    userInteractedRef.current = false;

    const bounds = new window.google.maps.LatLngBounds();
    let hasAny = false;

    stops.forEach((s) => {
      const lat = s.location?.latitude;
      const lng = s.location?.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        bounds.extend({ lat, lng });
        hasAny = true;
      }
    });

    if (hasAny) {
      map.fitBounds(bounds);
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(14);
    }
  };

  return (
    <div className="route-map-editor">
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      {loading && <div className="map-loading">Loading map &amp; route…</div>}

      {/* Reset View button */}
      {mapsReady && (
        <button
          onClick={resetView}
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            background: "linear-gradient(135deg, #2563eb, #3b82f6)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #1d4ed8, #2563eb)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #2563eb, #3b82f6)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
          title="Reset map view to fit all stops"
        >
          Reset View
        </button>
      )}

      {!mapsReady && mapsError && (
        <div
          className="map-loading"
          style={{
            left: 10,
            right: "auto",
            maxWidth: 320,
            fontSize: 12,
            color: "#b91c1c",
          }}
        >
          {mapsError}
        </div>
      )}
    </div>
  );
};

export default RouteMapEditor;