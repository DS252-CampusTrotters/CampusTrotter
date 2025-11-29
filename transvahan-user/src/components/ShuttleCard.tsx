import React from "react";
import { View, Text, Pressable } from "react-native";
import OccupancyBadge from "./OccupancyBadge";
import { Vehicle, Route } from "../types";

/**
 * ShuttleCard Component
 * Displays basic info about a shuttle:
 * - Vehicle ID + route name
 * - Last update time
 * - Occupancy badge
 */
export default function ShuttleCard({
  vehicle,
  route,
  onPress,
}: {
  vehicle: Vehicle;
  route?: Route;
  onPress?: () => void;
}) {
  // Graceful fallback values
  const vehicleId = vehicle?.vehicle_id || "Unknown Vehicle";
  const routeName = route?.name ?? vehicle?.route_id ?? "Unknown Route";
  const updatedAt = vehicle?.updated_at
    ? new Date(vehicle.updated_at).toLocaleTimeString()
    : "Not Updated";
  const occupancy = vehicle?.occupancy ?? 0;
  const capacity = vehicle?.capacity ?? 4;
  const vacant = capacity - occupancy;

  const isFull = vacant <= 0;

  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#fff",
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
        borderWidth: 1,
        borderColor: isFull ? "#dc2626" : "#e5e7eb", // red if full
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: isFull ? "#dc2626" : "#111827",
            }}
          >
            {vehicleId} • {routeName}
          </Text>
          <Text style={{ color: "#555", marginTop: 4, fontSize: 13 }}>
            Updated: {updatedAt}
          </Text>
          <Text
            style={{
              color: isFull ? "#dc2626" : "#16a34a",
              marginTop: 4,
              fontWeight: "600",
            }}
          >
            {isFull
              ? "🚫 No vacant seats"
              : `🟢 Vacant Seats: ${vacant}/${capacity}`}
          </Text>
        </View>

        {/* Occupancy badge on right */}
        <OccupancyBadge occupancy={occupancy} capacity={capacity} />
      </View>
    </Pressable>
  );
}
