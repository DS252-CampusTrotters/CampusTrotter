// transvahan-user/src/screens/DriverLoginScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import { useAuth } from "../auth/authContext";

const API = Constants.expoConfig?.extra?.API_BASE_URL;

export default function DriverLoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    try {
      if (!email || !password) {
        Alert.alert("⚠️ Missing Fields", "Please enter email and password.");
        return;
      }

      setLoading(true);

      const { data } = await axios.post(`${API}/auth/login`, {
        email: email.trim().toLowerCase(),
        password, // ✅ plaintext
      });

      if (data?.user?.role !== "driver") {
        Alert.alert("Access denied", "This login is only for drivers.");
        return;
      }

      await signIn(data.token, data.user, true);
    } catch (err: any) {
      Alert.alert(
        "Login failed",
        err?.response?.data?.error || "Check credentials"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "800" }}>Driver Login</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <Pressable
        onPress={login}
        disabled={loading}
        style={{
          backgroundColor: "#111827",
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>
          {loading ? "Logging in…" : "Log In"}
        </Text>
      </Pressable>
    </View>
  );
}