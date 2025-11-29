// transvahan-user/src/screens/MapTab.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Keyboard,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import * as Location from "expo-location";
import type { LocationObject } from "expo-location";
import Constants from "expo-constants";
import { http } from "../api/client";
import { wsConnect } from "../api/ws";
import { useTheme } from "../context/ThemeContext";
import BusMarker from "../components/BusMarker";

type LatLng = { latitude: number; longitude: number };

type Stop = {
  stop_id?: string;
  id?: string;
  stop_name: string;
  route_id?: string | number;
  route_name?: string;
  lat: number;
  lon: number;
  direction?: string;
  distance?: number;
};

type LocationOption = {
  id: string;
  name: string;
  subtitle?: string;
  address?: string;
  place_id?: string;
  lat: number;
  lon: number;
  source: "stop" | "google_place" | "current";
  route_id?: string | number;
  route_name?: string;
  distance?: number;
};

type Vehicle = {
  id: string;
  vehicle_id: string;
  lat: number;
  lon: number;
  status?: string;
  capacity?: number;
  occupancy?: number;
  route_id?: string;
  direction?: string;
};

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

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const normalizeVehicle = (raw: any): Vehicle | null => {
  if (!raw) return null;

  const id =
    raw.vehicle_id || raw.id || raw.plateNo || String(Date.now());

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

  if (typeof lat !== "number" || typeof lon !== "number") return null;

  return {
    id,
    vehicle_id: id,
    lat,
    lon,
    status: raw.status ?? "idle",
    capacity: typeof raw.capacity === "number" ? raw.capacity : 4,
    occupancy: typeof raw.occupancy === "number" ? raw.occupancy : 0,
    route_id: raw.route_id ?? raw.currentRoute ?? undefined,
    direction: raw.direction ?? raw.dir ?? undefined,
  };
};

export default function MapTab() {
  const { colors: C } = useTheme();

  // 🔹 Responsive dimensions (updates on rotation/resize)
  const { width, height } = useWindowDimensions();
  const ASPECT_RATIO = width / height;
  const mapHeight = Math.min(height * 0.4, 350);
  const panelMaxHeight = Math.min(180, height * 0.25);

  // 🔹 Location / map
  const [userLoc, setUserLoc] = useState<LocationObject | null>(null);
  const [locLoading, setLocLoading] = useState(true);

  // Use initialRegion instead of controlled region for better zoom/pan control
  const mapRef = useRef<MapView>(null);
  const initialRegionSetRef = useRef(false);
  const userInteractedRef = useRef(false);

  const defaultRegion: Region = {
    latitude: 13.0205,
    longitude: 77.5655,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  // 🔹 Stops cache (for fallback when search API fails) + nearby chips
  const [allStops, setAllStops] = useState<LocationOption[]>([]);
  const [nearby, setNearby] = useState<LocationOption[]>([]);

  // 🔹 Search state (Google Maps + campus stops)
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStop, setFromStop] = useState<LocationOption | null>(null);
  const [toStop, setToStop] = useState<LocationOption | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<LocationOption[]>([]);
  const [toSuggestions, setToSuggestions] = useState<LocationOption[]>([]);
  const [searching, setSearching] = useState({ from: false, to: false });
  const [plannerSearchAvailable, setPlannerSearchAvailable] = useState(true);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const skipFromSearchRef = useRef(false);
  const skipToSearchRef = useRef(false);

  const [planResult, setPlanResult] = useState<any | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // 🔹 Live vehicles
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const prevPosRef = useRef<Record<string, LatLng>>({});

  // Colors per line (reuse from planner)
  const routeColors: Record<string, string> = {
    Red: "#ef4444",
    Green: "#22c55e",
    Blue: "#3b82f6",
    Orange: "#f97316",
    Purple: "#a855f7",
  };

  const validLatLon = (s: any) =>
    s && Number.isFinite(s.lat) && Number.isFinite(s.lon);

  // 🧭 Get user location once and animate map to it
  useEffect(() => {
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          alert(
            "Location permission is required to show nearby shuttles"
          );
          setLocLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        setUserLoc(loc);

        // Animate to user location only on initial load
        if (!initialRegionSetRef.current && mapRef.current) {
          initialRegionSetRef.current = true;
          mapRef.current.animateToRegion({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015 * ASPECT_RATIO,
          }, 500);
        }
      } catch (err) {
        console.warn("Location error in MapTab:", err);
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  const normalizeLocationOption = (item: any): LocationOption | null => {
    const lat =
      item?.lat ??
      item?.latitude ??
      item?.location?.lat ??
      item?.location?.latitude;
    const lon =
      item?.lon ??
      item?.lng ??
      item?.longitude ??
      item?.location?.lon ??
      item?.location?.lng ??
      item?.location?.longitude;

    if (!validLatLon({ lat, lon })) return null;

    const name = item?.name || item?.stop_name;
    if (!name) return null;

    return {
      id:
        item?.id ||
        item?.stop_id ||
        item?.place_id ||
        `${name}_${lat}_${lon}`,
      name,
      subtitle:
        item?.subtitle ||
        item?.formatted_address ||
        item?.vicinity ||
        undefined,
      address:
        item?.formatted_address ||
        item?.vicinity ||
        item?.address ||
        undefined,
      place_id: item?.place_id,
      lat,
      lon,
      source:
        item?.source ||
        (item?.place_id ? "google_place" : "stop"),
      route_id: item?.route_id,
      route_name: item?.route_name,
      distance: item?.distance,
    };
  };

  const dedupeLocations = (list: LocationOption[]): LocationOption[] => {
    const map = new Map<string, LocationOption>();
    list.forEach((loc) =>
      map.set(
        `${(loc.name || "").toLowerCase()}`,
        loc
      )
    );
    return Array.from(map.values());
  };

  // Cache campus stops for fallback search when planner/search is unavailable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await http.get("/routes/stops/all");
        if (!Array.isArray(data) || cancelled) return;
        const normalized = data
          .map((s: any) =>
            normalizeLocationOption({
              ...s,
              name: s.stop_name,
              subtitle: "Campus stop",
              source: "stop",
            })
          )
          .filter(
            (x: LocationOption | null): x is LocationOption => !!x
          );
        setAllStops(dedupeLocations(normalized));
      } catch (err) {
        console.warn("Stops cache load error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filterFallbackStops = (
    query: string,
    max = 12
  ): LocationOption[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStops
      .filter((s) => {
        const name = (s.name || "").toLowerCase();
        const subtitle = (s.subtitle || "").toLowerCase();
        return name.includes(q) || subtitle.includes(q);
      })
      .slice(0, max);
  };

  const resolveGoogleKey = () => {
    const extraKey = (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY;
    const envKey = (process.env as any)?.GOOGLE_MAPS_API_KEY;
    return extraKey || envKey || "";
  };

  // Places Text Search fallback (REST) when backend planner search fails
  const searchGooglePlacesDirect = async (
    query: string
  ): Promise<LocationOption[]> => {
    const key = resolveGoogleKey();
    if (!key) return [];

    try {
      const centerLat = userLoc?.coords?.latitude ?? 13.0205;
      const centerLon = userLoc?.coords?.longitude ?? 77.5655;

      const url = new URL(
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
      );
      url.searchParams.set("query", query);
      url.searchParams.set("key", key);
      url.searchParams.set("location", `${centerLat},${centerLon}`);
      url.searchParams.set("radius", "5000");

      const resp = await fetch(url.toString());
      if (!resp.ok) return [];
      const json = await resp.json();
      if (json.status !== "OK" && json.status !== "ZERO_RESULTS") return [];

      const results = (json.results || []).slice(0, 8);
      return results
        .filter(
          (r: any) =>
            r?.geometry?.location &&
            typeof r.geometry.location.lat === "number" &&
            typeof r.geometry.location.lng === "number"
        )
        .map((r: any) => ({
          id: r.place_id || r.name,
          name: r.name || query,
          subtitle: r.formatted_address || "Google Maps",
          address: r.formatted_address || undefined,
          lat: r.geometry.location.lat,
          lon: r.geometry.location.lng,
          source: "google_place" as const,
          place_id: r.place_id,
        })) as LocationOption[];
    } catch (err) {
      console.warn("Direct Google Places search failed:", err);
      return [];
    }
  };

  const runSearch = async (
    query: string,
    setter: (list: LocationOption[]) => void,
    key: "from" | "to"
  ) => {
    const q = query.trim();
    if (!q) {
      setter([]);
      return;
    }

    setSearching((prev) => ({ ...prev, [key]: true }));
    try {
      let results: LocationOption[] = [];
      setSearchMessage(null);

      if (plannerSearchAvailable) {
        try {
          const params: Record<string, any> = { q };
          if (userLoc?.coords) {
            params.lat = userLoc.coords.latitude;
            params.lon = userLoc.coords.longitude;
          }

          const { data } = await http.get("/planner/search", { params });
          results = Array.isArray(data?.results)
            ? data.results
                .map(normalizeLocationOption)
                .filter(
                  (x: LocationOption | null): x is LocationOption => !!x
                )
            : [];
          if (results.length) setPlannerSearchAvailable(true);
        } catch (err: any) {
          console.warn("Search error (planner endpoint):", err);
          setPlannerSearchAvailable(false); // avoid repeated 404 spam
        }
      }

      if (!results.length) {
        const places = await searchGooglePlacesDirect(q);
        if (places.length) {
          results = places;
        }
      }

      if (!results.length) {
        results = filterFallbackStops(q);
      } else if (results.length < 8) {
        // Prefer campus stops first, then places
        const campus = filterFallbackStops(q, 8);
        const merged = dedupeLocations([
          ...campus,
          ...results,
          ...filterFallbackStops(q, 8 - results.length),
        ]);
        results = merged;
      } else {
        // Reorder: campus (fallback) first, then places
        const campus = filterFallbackStops(q, results.length);
        results = dedupeLocations([...campus, ...results]);
      }

      if (!results.length) {
        setSearchMessage("No results found. Try a different name.");
      }

      setter(dedupeLocations(results));
    } finally {
      setSearching((prev) => ({ ...prev, [key]: false }));
    }
  };

// 🔎 Debounced search for FROM
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      if (skipFromSearchRef.current) {
        skipFromSearchRef.current = false;
        setFromSuggestions([]);
        return;
      }
      if (!fromQuery.trim() || fromQuery.trim().length < 2) {
        setFromSuggestions([]);
        return;
      }
      runSearch(fromQuery, (list) => {
        if (!cancelled) setFromSuggestions(list);
      }, "from");
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [fromQuery, userLoc]);

  // 🔎 Debounced search for TO
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      if (skipToSearchRef.current) {
        skipToSearchRef.current = false;
        setToSuggestions([]);
        return;
      }
      if (!toQuery.trim() || toQuery.trim().length < 2) {
        setToSuggestions([]);
        return;
      }
      runSearch(toQuery, (list) => {
        if (!cancelled) setToSuggestions(list);
      }, "to");
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [toQuery, userLoc]);

  // 🧭 Nearby stops based on user location
  useEffect(() => {
    if (!userLoc) return;

    (async () => {
      try {
        const { latitude, longitude } = userLoc.coords;
        const { data } = await http.get(
          `/stops/nearby?lat=${latitude}&lon=${longitude}&radius=250`
        );
        if (Array.isArray(data?.stops)) {
          const normalized = data.stops
            .map((s: any) =>
            normalizeLocationOption({
              ...s,
              name: s.stop_name,
              subtitle: "Campus stop",
              source: "stop",
            })
          )
            .filter(
              (x: LocationOption | null): x is LocationOption => !!x
            );
          setNearby(normalized);
        }
      } catch (err) {
        console.warn("Nearby stops error:", err);
      }
    })();
  }, [userLoc]);

  // 🚐 Subscribe to live vehicles
  useEffect(() => {
    const disconnect = wsConnect((msg) => {
      if (msg.type !== "vehicle" || !msg.data) return;
      const normalized = normalizeVehicle(msg.data);
      if (!normalized) return;

      setVehicles((prev) => {
        const idx = prev.findIndex(
          (v) => v.id === normalized.id
        );
        if (idx === -1) {
          return [...prev, normalized];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...normalized };
        return copy;
      });
    });

    return () => {
      if (typeof disconnect === "function") disconnect();
    };
  }, []);

  const labelForLocation = (loc: LocationOption) =>
    loc.subtitle ? `${loc.name} • ${loc.subtitle}` : loc.name;

  const selectFromStop = (stop: LocationOption) => {
    skipFromSearchRef.current = true;
    setFromStop(stop);
    setFromQuery(labelForLocation(stop));
    setFromSuggestions([]);
    setSearchMessage(null);
    setPlanResult(null);
    setPlanError(null);
    Keyboard.dismiss();

    // Center the map on the selected place/location
    if (validLatLon(stop) && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: stop.lat,
        longitude: stop.lon,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01 * ASPECT_RATIO,
      }, 300);
    }

    // Add to cached stops so it appears in future searches
    setAllStops((prev) =>
      dedupeLocations([
        ...prev,
        {
          ...stop,
          source: stop.source || "google_place",
          subtitle: stop.subtitle || stop.address || "Google Maps",
        },
      ])
    );
  };

  const selectToStop = (stop: LocationOption) => {
    skipToSearchRef.current = true;
    setToStop(stop);
    setToQuery(labelForLocation(stop));
    setToSuggestions([]);
    setSearchMessage(null);
    setPlanResult(null);
    setPlanError(null);
    Keyboard.dismiss();

    if (validLatLon(stop) && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: stop.lat,
        longitude: stop.lon,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01 * ASPECT_RATIO,
      }, 300);
    }

    setAllStops((prev) =>
      dedupeLocations([
        ...prev,
        {
          ...stop,
          source: stop.source || "google_place",
          subtitle: stop.subtitle || stop.address || "Google Maps",
        },
      ])
    );
  };

  const handleNearbyTap = (stop: LocationOption) => {
    if (!fromStop) selectFromStop(stop);
    else selectToStop(stop);
  };

  const useCurrentLocation = () => {
    if (!userLoc?.coords) return;
    const { latitude, longitude } = userLoc.coords;
    const currentLoc: LocationOption = {
      id: "current_location",
      name: "Current location",
      subtitle: "Using GPS",
      lat: latitude,
      lon: longitude,
      source: "current",
    };
    selectFromStop(currentLoc);
  };

  const planRoute = async () => {
    if (!fromStop || !toStop) {
      setPlanError("Please select both origin and destination locations.");
      return;
    }

    if (!validLatLon(fromStop) || !validLatLon(toStop)) {
      setPlanError("Selected locations are missing coordinates.");
      return;
    }

    try {
      setPlanLoading(true);
      setPlanError(null);

      const fromLat = fromStop.lat;
      const fromLon = fromStop.lon;
      const toLat = toStop.lat;
      const toLon = toStop.lon;

      const { data } = await http.get(
        `/planner/plan?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`
      );

      setPlanResult(data);

      // Animate to show the planned route
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: (fromLat + toLat) / 2,
          longitude: (fromLon + toLon) / 2,
          latitudeDelta: Math.abs(toLat - fromLat) * 1.5 + 0.01,
          longitudeDelta: Math.abs(toLon - fromLon) * 1.5 + 0.01,
        }, 500);
      }
    } catch (err) {
      console.warn("Planner error:", err);
      setPlanError("Unable to find a route between these locations.");
    } finally {
      setPlanLoading(false);
    }
  };

  // Build sequential coordinates for map
  const buildLines = () => {
    if (!planResult?.steps) return [];
    const lines: any[] = [];

    planResult.steps.forEach((step: any) => {
      if (
        step.type === "ride" &&
        validLatLon(step.from) &&
        validLatLon(step.to)
      ) {
        lines.push({
          type: "ride",
          color: routeColors[step.route_name] || "#6b7280",
          coords: [
            {
              latitude: step.from.lat,
              longitude: step.from.lon,
            },
            { latitude: step.to.lat, longitude: step.to.lon },
          ],
        });
      } else if (step.type === "walk" && validLatLon(step.to)) {
        lines.push({
          type: "walk",
          color: "#000",
          coords: [
            { latitude: step.to.lat, longitude: step.to.lon },
          ],
        });
      }
    });
    return lines;
  };

  const lines = buildLines();
  const vehiclesArr = vehicles;

  if (locLoading)
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <ActivityIndicator color={C.primary} size="large" />
        <Text style={{ color: C.text, marginTop: 8 }}>Fetching location…</Text>
      </View>
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={["top"]}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 🔍 Google-maps style search panel */}
        <View style={[styles.searchPanel, { backgroundColor: C.card }]}>
          <Text style={[styles.title, { color: C.text }]}>
            Plan your trip across campus
          </Text>

          <View style={styles.inputWrapper}>
            <Text style={[styles.label, { color: C.mutedText }]}>From</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: C.inputBg,
                  borderColor: C.inputBorder,
                  color: C.text,
                },
              ]}
              value={fromQuery}
              onChangeText={(t) => {
                setFromQuery(t);
                setFromStop(null);
                setPlanResult(null);
                setPlanError(null);
              }}
              placeholder="Search for a stop or building name"
              placeholderTextColor={C.mutedText}
            />
            {userLoc?.coords && (
              <TouchableOpacity
                style={styles.inlineAction}
                onPress={useCurrentLocation}
              >
                <Text style={[styles.inlineActionText, { color: C.primary }]}>
                  Use current location
                </Text>
              </TouchableOpacity>
            )}
            {fromSuggestions.length > 0 && (
              <View style={[styles.suggestionsBox, { backgroundColor: C.card, borderColor: C.border }]}>
                <ScrollView style={{ maxHeight: panelMaxHeight }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {fromSuggestions.map((s) => (
                    <TouchableOpacity
                      key={`${s.id}_${s.lat}_${s.lon}_from`}
                      style={[styles.suggestionItem, { borderBottomColor: C.border }]}
                      onPress={() => selectFromStop(s)}
                    >
                      <Text style={[styles.suggestionTitle, { color: C.text }]}>
                        {s.name}
                      </Text>
                      <Text style={[styles.suggestionMeta, { color: C.mutedText }]}>
                        {s.subtitle ||
                          (s.source === "google_place"
                            ? "Google Maps"
                            : "Campus stop")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.inputWrapper}>
            <Text style={[styles.label, { color: C.mutedText }]}>To</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: C.inputBg,
                  borderColor: C.inputBorder,
                  color: C.text,
                },
              ]}
              value={toQuery}
              onChangeText={(t) => {
                setToQuery(t);
                setToStop(null);
                setPlanResult(null);
                setPlanError(null);
              }}
              placeholder="Search for a stop or building name"
              placeholderTextColor={C.mutedText}
            />
            {toSuggestions.length > 0 && (
              <View style={[styles.suggestionsBox, { backgroundColor: C.card, borderColor: C.border }]}>
                <ScrollView style={{ maxHeight: panelMaxHeight }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {toSuggestions.map((s) => (
                    <TouchableOpacity
                      key={`${s.id}_${s.lat}_${s.lon}_to`}
                      style={[styles.suggestionItem, { borderBottomColor: C.border }]}
                      onPress={() => selectToStop(s)}
                    >
                      <Text style={[styles.suggestionTitle, { color: C.text }]}>
                        {s.name}
                      </Text>
                      <Text style={[styles.suggestionMeta, { color: C.mutedText }]}>
                        {s.subtitle ||
                          (s.source === "google_place"
                            ? "Google Maps"
                            : "Campus stop")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Nearby stops chips */}
          {nearby.length > 0 && (
            <View style={styles.nearbyContainer}>
              <Text style={[styles.nearbyLabel, { color: C.mutedText }]}>Nearby stops</Text>
              <FlatList
                data={nearby}
                horizontal
                keyExtractor={(item, idx) =>
                  `${item.id || item.name}_${idx}`
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.nearChip, { backgroundColor: C.successBg }]}
                    onPress={() => handleNearbyTap(item)}
                  >
                    <Text style={{ fontSize: 12, color: C.text }}>
                      {item.name} •{" "}
                      {item.distance != null
                        ? `${Math.round(item.distance)} m`
                        : ""}
                    </Text>
                  </TouchableOpacity>
                )}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.planButton, { backgroundColor: C.primary }]}
            onPress={planRoute}
          >
            <Text style={styles.planButtonText}>
              {planLoading ? "Planning…" : "Plan trip"}
            </Text>
          </TouchableOpacity>
          {planError && (
            <Text style={[styles.errorText, { color: C.danger }]}>{planError}</Text>
          )}
          {searchMessage && (
            <Text style={[styles.errorText, { color: C.danger }]}>{searchMessage}</Text>
          )}
        </View>

        {/* 🗺 Map: live shuttles + planned route */}
        <View style={[styles.mapContainer, { height: mapHeight }]}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={defaultRegion}
            showsUserLocation
          >
            {/* origin / dest markers */}
            {fromStop && validLatLon(fromStop) && (
              <Marker
                coordinate={{
                  latitude: fromStop.lat,
                  longitude: fromStop.lon,
                }}
                title={`From: ${fromStop.name || "Origin"}`}
                pinColor="#000"
              />
            )}
            {toStop && validLatLon(toStop) && (
              <Marker
                coordinate={{
                  latitude: toStop.lat,
                  longitude: toStop.lon,
                }}
                title={`To: ${toStop.name || "Destination"}`}
                pinColor="#000"
              />
            )}

            {/* Draw walking (dotted) and Transvahan (solid) paths */}
            {lines.map((line: any, i: number) => (
              <Polyline
                key={`poly_${i}`}
                coordinates={line.coords}
                strokeWidth={line.type === "walk" ? 3 : 5}
                lineDashPattern={
                  line.type === "walk" ? [6, 4] : undefined
                }
                strokeColor={line.color}
              />
            ))}

            {/* Stop markers for ride segments */}
            {planResult?.steps
              ?.filter(
                (s: any) =>
                  s.type === "ride" &&
                  validLatLon(s.from)
              )
              .map((s: any, i: number) => (
                <Marker
                  key={`stop_${i}_${s.from.stop_name}_${s.route_id || i}`}
                  coordinate={{
                    latitude: s.from.lat,
                    longitude: s.from.lon,
                  }}
                  pinColor={routeColors[s.route_name] || "#6b7280"}
                  title={`${s.from.stop_name} (${s.route_name})`}
                />
              ))}

            {/* 🚐 Live shuttle markers using shared BusMarker */}
            {vehiclesArr.map((v, idx) => {
              const label = v.vehicle_id || v.id || `bus_${idx}`;
              const current: LatLng = {
                latitude: v.lat,
                longitude: v.lon,
              };
              const prev = prevPosRef.current[label];
              const heading = prev
                ? computeBearing(prev, current)
                : 0;
              prevPosRef.current[label] = current;

              return (
                <BusMarker
                  key={`veh_${label}_${idx}`}
                  coordinate={current}
                  heading={heading}
                />
              );
            })}
          </MapView>

          {/* Live shuttle count overlay */}
          <View style={[styles.mapOverlay, { backgroundColor: C.card }]}>
            <Text style={[styles.muted, { color: C.mutedText }]}>
              {vehiclesArr.length === 0
                ? "No active shuttles yet"
                : `${vehiclesArr.length} active shuttle${vehiclesArr.length === 1 ? "" : "s"} live`}
            </Text>
          </View>
        </View>

        {/* Itinerary card */}
        {planResult && (
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Itinerary</Text>
            {planResult.steps.map((s: any, idx: number) => {
              if (s.type === "walk")
                return (
                  <Text key={idx} style={[styles.cardLine, { color: C.text }]}>
                    Walk {Math.round(s.distance)} m → {s.to.stop_name || "destination"}
                  </Text>
                );
              if (s.type === "ride")
                return (
                  <Text key={idx} style={[styles.cardLine, { color: C.text }]}>
                    Take {s.route_name} Line from {s.from.stop_name} → {s.to.stop_name}
                  </Text>
                );
              if (s.type === "transfer")
                return (
                  <Text key={idx} style={[styles.cardLine, { color: C.text }]}>
                    Transfer between {s.between[0].stop_name} ↔ {s.between[1].stop_name}
                  </Text>
                );
              return null;
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  searchPanel: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  inputWrapper: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  inlineAction: {
    marginTop: 6,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  suggestionsBox: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionMeta: {
    fontSize: 11,
  },
  nearbyContainer: {
    marginTop: 6,
    marginBottom: 6,
  },
  nearbyLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  nearChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  planButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  planButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  muted: {
    fontSize: 12,
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    marginTop: 8,
    fontSize: 12,
  },

  mapContainer: {
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  mapOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
  },

  card: {
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  cardTitle: {
    fontWeight: "700",
    marginBottom: 6,
    fontSize: 14,
  },
  cardLine: {
    fontSize: 13,
    marginBottom: 4,
  },
});
