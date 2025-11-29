//transvahan-user/src/components/DemandIndicator.tsx
import React from "react";
import { View, Text } from "react-native";

export default function DemandIndicator({ high }: { high?: boolean }) {
  const bg = high ? "#16a34a" : "#ef4444"; // green / red
  const label = high ? "High demand here" : "No demand signal";
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
      <Text style={{ color: "white", fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
