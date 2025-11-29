import React from "react";
import { View, Text, Pressable } from "react-native";

export default function AuthPortal({ navigation }: any) {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "800", marginBottom: 20 }}>Welcome to Transvahan</Text>
      
      <Pressable
        onPress={() => navigation.navigate("Signup")}
        style={{ backgroundColor: "#2563eb", padding: 14, borderRadius: 12, width: 200 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>Sign Up</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate("Login")}
        style={{ backgroundColor: "#111827", padding: 14, borderRadius: 12, width: 200 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>Login</Text>
      </Pressable>
    </View>
  );
}
