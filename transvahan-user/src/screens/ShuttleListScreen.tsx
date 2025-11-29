// transvahan-user/src/screens/ShuttleListScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import { apiClient } from "../api/client";
import { Vehicle } from "../types";

const API =
  (Constants as any).expoConfig?.extra?.API_BASE_URL ||
  "https://<NGROK_BACKEND_URL>";

export default function ShuttleListScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const navigation = useNavigation<any>();

  // Initial fetch + WS subscription for live updates
  useEffect(() => {
    let disconnect: any;

    (async () => {
      try {
        const data = await apiClient.getVehicles();
        setVehicles(data as any);
      } catch (err) {
        console.warn("⚠️ Could not load vehicles:", err);
      }

      disconnect = await apiClient.subscribeVehicles((msg: any) => {
        if (msg.type === "vehicle" && msg.data) {
          const v = msg.data;
          const id = v.id || v.vehicle_id;
          setVehicles((prev) => {
            const idx = prev.findIndex(
              (x: any) =>
                (x as any).id === id ||
                (x as any).vehicle_id === id
            );
            const shaped = {
              ...(idx >= 0 ? (prev[idx] as any) : {}),
              ...v,
              vacant:
                (v.capacity ?? 0) -
                (v.occupancy ?? 0),
            };
            if (idx >= 0) {
              const copy = [...prev] as any[];
              copy[idx] = shaped;
              return copy as Vehicle[];
            }
            return [...(prev as any), shaped] as Vehicle[];
          });
        }
      });
    })();

    return () => {
      if (disconnect) disconnect();
    };
  }, []);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Available Shuttles
      </Text>
      <FlatList
        data={vehicles as any}
        keyExtractor={(item: any) => item.id || item.vehicle_id}
        ListEmptyComponent={<Text>No shuttles available</Text>}
        renderItem={({ item }: any) => (
          <View
            style={{
              padding: 16,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              marginBottom: 10,
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontWeight: "600", fontSize: 16 }}>
              {item.vehicle_id}
            </Text>
            <Text>Route: {item.route_id}</Text>
            <Text>Status: {item.status}</Text>
            <Text>
              Vacant Seats:{" "}
              {(item.capacity ?? 0) - (item.occupancy ?? 0)}/
              {item.capacity ?? 4}
            </Text>

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity
                style={{
                  padding: 8,
                  backgroundColor: "#2563eb",
                  borderRadius: 6,
                  marginRight: 10,
                }}
                onPress={() =>
                  navigation.navigate("RouteMap", { vehicle: item })
                }
              >
                <Text style={{ color: "white" }}>View Map</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  padding: 8,
                  backgroundColor: "#111827",
                  borderRadius: 6,
                }}
                onPress={() =>
                  navigation.navigate("Feedback", {
                    vehicle_id: item.vehicle_id,
                  })
                }
              >
                <Text style={{ color: "white" }}>Give Feedback</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}
