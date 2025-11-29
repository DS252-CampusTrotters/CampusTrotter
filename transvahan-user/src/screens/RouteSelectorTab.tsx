// transvahan-user/src/screens/RouteSelectorTab.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import type { LocationObject } from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiClient as client, http } from "../api/client";
import { useTheme } from "../context/ThemeContext";

type RouteItem = {
  id: string;
  route_id?: string;
  route_name: string;
  start?: string;
  end?: string;
  to_count?: number;
  fro_count?: number;
};

type LocationOption = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  subtitle?: string;
  address?: string;
  place_id?: string;
  routes?: string[];
  source?: "stop" | "google_place" | "current";
};

type PlannerStep = {
  type: "walk" | "ride" | "transfer";
  distance?: number;
  route_name?: string;
  from?: { stop_name: string };
  to?: { stop_name: string };
  between?: { stop_name: string }[];
};

type PlannerResult = {
  steps: PlannerStep[];
};

const ROUTE_COLORS: Record<string, string> = {
  Red: "#ef4444",
  Blue: "#3b82f6",
  Green: "#22c55e",
  Orange: "#f97316",
  Purple: "#a855f7",
};

function normalizeRoutes(list: any[]): RouteItem[] {
  return (list || []).map((r: any) => ({
    id: String(r.id || r.route_id),
    route_id: r.route_id || r.id,
    route_name: r.route_name || r.line || r.name || "Route",
    start: r.start || r.from || r.origin,
    end: r.end || r.to || r.destination,
    to_count: r.to_count ?? r.toTrips,
    fro_count: r.fro_count ?? r.froTrips,
  }));
}

export default function RouteSelectorTab() {
  const navigation = useNavigation<any>();
  const { colors: C, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLoc(loc);
      } catch (err) {
        console.warn("Location permission error (RouteSelectorTab):", err);
      }
    })();
  }, []);

  // Cache stops for fallback search when planner/search is unavailable.
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
        console.warn("Stops cache load error (RouteSelectorTab):", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // All lines
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [plannerSearchAvailable, setPlannerSearchAvailable] = useState(true);

  // Planner search UX
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStop, setFromStop] = useState<LocationOption | null>(null);
  const [toStop, setToStop] = useState<LocationOption | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<LocationOption[]>([]);
  const [toSuggestions, setToSuggestions] = useState<LocationOption[]>([]);
  const [searching, setSearching] = useState({ from: false, to: false });
  const [userLoc, setUserLoc] = useState<LocationObject | null>(null);
  const [allStops, setAllStops] = useState<LocationOption[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const skipFromSearchRef = useRef(false);
  const skipToSearchRef = useRef(false);

  const [planResult, setPlanResult] = useState<PlannerResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Load routes
  useEffect(() => {
    (async () => {
      try {
        setRoutesLoading(true);
        setRoutesError(null);
        const list = await client.getRoutes();
        console.log("📡 Routes fetched:", JSON.stringify(list));
        setRoutes(normalizeRoutes(Array.isArray(list) ? list : []));
      } catch (err: any) {
        console.warn("Routes load error:", err);
        setRoutesError(err?.response?.data?.error || "Failed to load routes.");
      } finally {
        setRoutesLoading(false);
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
      item?.longitude ??
      item?.location?.lon ??
      item?.location?.lng ??
      item?.location?.longitude;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const name = item?.name || item?.stop_name;
    if (!name) return null;

    const subtitle =
      item?.subtitle ||
      item?.formatted_address ||
      item?.vicinity ||
      undefined;
    const address =
      item?.formatted_address ||
      item?.vicinity ||
      item?.address ||
      undefined;

    const routesArr =
      Array.isArray(item?.routes) && item.routes.length
        ? item.routes.map((r: any) => String(r))
        : item?.route_name
        ? [String(item.route_name)]
        : undefined;

    return {
      id: String(
        item?.id || item?.stop_id || item?.place_id || `${name}_${lat}_${lon}`
      ),
      name,
      lat,
      lon,
      subtitle,
      address,
      place_id: item?.place_id,
      routes: routesArr,
      source: item?.source || (item?.place_id ? "google_place" : "stop"),
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

  // Places Text Search fallback (REST) when backend search is missing
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
    setSearchMessage(null);
    try {
      let results: LocationOption[] = [];

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
          console.warn("Search error:", err);
          setPlannerSearchAvailable(false); // avoid repeat 404 spam
        }
      }

      if (!results.length) {
        // Fallback directly to Google Places when backend search is missing
        const placesOnly = await searchGooglePlacesDirect(q);
        if (placesOnly.length) {
          results = placesOnly;
        }
      }

      if (!results.length) {
        results = filterFallbackStops(q);
      } else if (results.length < 8) {
        const campus = filterFallbackStops(q, 8);
        const merged = dedupeLocations([
          ...campus,
          ...results,
          ...filterFallbackStops(q, 8 - results.length),
        ]);
        results = merged;
      } else {
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

  const validLatLon = (loc: any) =>
    loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon);

  const labelForLocation = (stop: LocationOption) => {
    if (stop.subtitle) return `${stop.name} (${stop.subtitle})`;
    if (stop.routes?.length)
      return `${stop.name} (${stop.routes.join(", ")})`;
    return stop.name;
  };

  const selectFromStop = (stop: LocationOption) => {
    skipFromSearchRef.current = true;
    setFromStop(stop);
    setFromQuery(labelForLocation(stop));
    setFromSuggestions([]);
    setPlanResult(null);
    setPlanError(null);

    // Center map-equivalent context by promoting this into cached stops
    setAllStops((prev) =>
      dedupeLocations([
        ...prev,
        { ...stop, source: stop.source || "google_place" },
      ])
    );
  };

  const selectToStop = (stop: LocationOption) => {
    skipToSearchRef.current = true;
    setToStop(stop);
    setToQuery(labelForLocation(stop));
    setToSuggestions([]);
    setPlanResult(null);
    setPlanError(null);

    setAllStops((prev) =>
      dedupeLocations([
        ...prev,
        { ...stop, source: stop.source || "google_place" },
      ])
    );
  };

  const useCurrentLocation = () => {
    if (!userLoc?.coords) return;
    const { latitude, longitude } = userLoc.coords;
    const current: LocationOption = {
      id: "current_location",
      name: "Current location",
      subtitle: "Using GPS",
      lat: latitude,
      lon: longitude,
      source: "current",
    };
    selectFromStop(current);
  };

  const planRoute = async () => {
    if (!fromStop || !toStop) {
      setPlanError("Please select both origin and destination.");
      return;
    }

    if (!validLatLon(fromStop) || !validLatLon(toStop)) {
      setPlanError("Selected locations are missing coordinates.");
      return;
    }

    try {
      setPlanLoading(true);
      setPlanError(null);

      const { lat: fromLat, lon: fromLon } = fromStop;
      const { lat: toLat, lon: toLon } = toStop;

      const { data } = await http.get(
        `/planner/plan?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`
      );

      setPlanResult(data || null);
    } catch (err: any) {
      console.warn("Planner error:", err);
      setPlanError(
        err?.response?.data?.error ||
          "Unable to find a trip for these locations."
      );
      setPlanResult(null);
    } finally {
      setPlanLoading(false);
    }
  };

  // Extract recommended lines from itinerary
  const recommendedLineNames = useMemo(() => {
    const set = new Set<string>();
    if (planResult?.steps) {
      planResult.steps.forEach((s) => {
        if (s.type === "ride" && s.route_name) {
          set.add(String(s.route_name));
        }
      });
    }
    return set;
  }, [planResult]);

  const handleRoutePress = (r: RouteItem) => {
    const color = ROUTE_COLORS[r.route_name] || C.primary;

    navigation.navigate("RouteDetail", {
      routeData: {
        id: r.id,
        route_id: r.route_id,
        name: r.route_name,
        start: r.start,
        end: r.end,
      },
      color,
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Planner search area */}
      <View style={[styles.searchCard, { backgroundColor: C.card }]}>
        <Text style={[styles.searchTitle, { color: C.text }]}>
          🧭 Plan your campus trip
        </Text>
        <Text style={[styles.searchSubtitle, { color: C.mutedText }]}>
          Search using stop or landmark names. We’ll show an itinerary and
          highlight the lines that work best.
        </Text>

        {/* FROM */}
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
            placeholder="e.g. Main Gate, New Hostel Complex…"
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
            <View
              style={[
                styles.suggestionsBox,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
            >
              <ScrollView
                style={{ maxHeight: 180 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {fromSuggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={`${s.id}_from_${idx}`}
                    style={[
                      styles.suggestionItem,
                      { borderBottomColor: C.border },
                    ]}
                    onPress={() => selectFromStop(s)}
                  >
                    <Text
                      style={[styles.suggestionTitle, { color: C.text }]}
                    >
                      {s.name}
                    </Text>
                    {(s.subtitle || s.routes?.length) && (
                      <Text
                        style={[styles.suggestionMeta, { color: C.mutedText }]}
                      >
                        {s.subtitle ||
                          (s.routes?.length ? "" : "Google Maps")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* TO */}
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
            placeholder="e.g. Biological Sciences Building…"
            placeholderTextColor={C.mutedText}
          />

          {toSuggestions.length > 0 && (
            <View
              style={[
                styles.suggestionsBox,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
            >
              <ScrollView
                style={{ maxHeight: 180 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {toSuggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={`${s.id}_to_${idx}`}
                    style={[
                      styles.suggestionItem,
                      { borderBottomColor: C.border },
                    ]}
                    onPress={() => selectToStop(s)}
                  >
                    <Text
                      style={[styles.suggestionTitle, { color: C.text }]}
                    >
                      {s.name}
                    </Text>
                    {(s.subtitle || s.routes?.length) && (
                      <Text
                        style={[styles.suggestionMeta, { color: C.mutedText }]}
                      >
                        {s.subtitle ||
                          (s.routes?.length ? "" : "Google Maps")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.planButton, { backgroundColor: C.primary }]}
          onPress={planRoute}
          disabled={planLoading}
        >
          <Text style={styles.planButtonText}>
            {planLoading ? "Planning…" : "Show itinerary"}
          </Text>
        </TouchableOpacity>

        {planError && (
          <Text style={[styles.errorText, { color: C.danger }]}>
            {planError}
          </Text>
        )}
        {searchMessage && (
          <Text style={[styles.errorText, { color: C.danger }]}>
            {searchMessage}
          </Text>
        )}

        {/* Itinerary summary */}
        {planResult && (
          <View style={[styles.itineraryCard, { borderTopColor: C.border }]}>
            <Text style={[styles.itineraryTitle, { color: C.text }]}>
              Itinerary
            </Text>

            {planResult.steps.map((s, idx) => {
              if (s.type === "walk")
                return (
                  <Text key={idx} style={[styles.itineraryLine, { color: C.text }]}>
                    🚶 Walk {Math.round(s.distance || 0)} m →{" "}
                    {s.to?.stop_name || "destination"}
                  </Text>
                );
              if (s.type === "ride")
                return (
                  <Text key={idx} style={[styles.itineraryLine, { color: C.text }]}>
                    🚌 Take {s.route_name} Line from{" "}
                    {s.from?.stop_name} → {s.to?.stop_name}
                  </Text>
                );
              if (s.type === "transfer")
                return (
                  <Text key={idx} style={[styles.itineraryLine, { color: C.text }]}>
                    🔁 Transfer between{" "}
                    {s.between?.[0]?.stop_name} ↔{" "}
                    {s.between?.[1]?.stop_name}
                  </Text>
                );
              return null;
            })}

            {recommendedLineNames.size > 0 && (
              <Text style={[styles.itineraryHint, { color: C.mutedText }]}>
                Suggested lines for this trip:{" "}
                {Array.from(recommendedLineNames).join(", ")}.
                Tap one of these lines below to view live buses and
                reserve your seat.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Route list area */}
      <View style={styles.routesHeaderRow}>
        <Text style={[styles.routesTitle, { color: C.text }]}>All Lines</Text>
        {routesLoading && (
          <ActivityIndicator color={C.primary} size="small" />
        )}
      </View>

      {routesError && (
        <Text style={[styles.errorText, { marginHorizontal: 12, color: C.danger }]}>
          {routesError}
        </Text>
      )}

      {!routesLoading && !routes.length && !routesError && (
        <Text style={[styles.mutedText, { marginHorizontal: 12, color: C.mutedText }]}>
          No routes configured yet.
        </Text>
      )}

      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4 }}
        renderItem={({ item }) => {
          const isRecommended = recommendedLineNames.has(item.route_name);
          const color = ROUTE_COLORS[item.route_name] || C.primary;

          return (
            <TouchableOpacity
              style={[
                styles.routeCard,
                {
                  borderLeftColor: color,
                  backgroundColor: C.card,
                  shadowColor: "#000",
                },
              ]}
              onPress={() => handleRoutePress(item)}
            >
              <View style={styles.routeCardMainRow}>
                <Text style={[styles.routeName, { color }]}>
                  {item.route_name} Line
                </Text>

                {isRecommended && (
                  <View style={[styles.routeChip, { backgroundColor: C.successBg }]}>
                    <Text style={[styles.routeChipText, { color: C.successText }]}>
                      Recommended
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.routeMeta, { color: C.mutedText }]}>
                {item.start || "Start"} → {item.end || "End"}
              </Text>
              <Text style={[styles.routeMeta, { color: C.mutedText }]}>
                To trips: {item.to_count ?? "—"} · Fro trips:{" "}
                {item.fro_count ?? "—"}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  searchCard: {
    margin: 12,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  searchSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  inputWrapper: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
  },
  inlineAction: {
    marginTop: 4,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  inlineAction: {
    marginTop: 4,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionsBox: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionMeta: {
    fontSize: 11,
  },
  planButton: {
    marginTop: 2,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  planButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  mutedText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  itineraryCard: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  itineraryTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  itineraryLine: {
    fontSize: 13,
    marginBottom: 2,
  },
  itineraryHint: {
    fontSize: 12,
    marginTop: 6,
  },

  routesHeaderRow: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routesTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  routeCard: {
    marginBottom: 8,
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 4,
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  routeCardMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeName: {
    fontSize: 16,
    fontWeight: "700",
  },
  routeMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  routeChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  routeChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
