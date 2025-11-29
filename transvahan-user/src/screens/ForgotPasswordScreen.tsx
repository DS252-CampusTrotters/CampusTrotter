import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import axios from "axios";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.API_BASE_URL;

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    try {
      if (!email) {
        Alert.alert("⚠️ Missing Email", "Enter your registered email.");
        return;
      }
      setLoading(true);

      await axios.post(`${API}/auth/forgot-password`, {
        email: email.trim().toLowerCase(),
      });

      Alert.alert(
        "Check your email",
        "If an account exists, a reset code has been sent."
      );
      navigation.navigate("ResetPassword", { email: email.trim().toLowerCase() });
    } catch (e: any) {
      Alert.alert("Error", "Try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: "800" }}>Forgot Password</Text>
      <Text>Enter your registered email to receive a reset OTP.</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <Pressable
        onPress={onSend}
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
          {loading ? "Sending…" : "Send Reset OTP"}
        </Text>
      </Pressable>
    </View>
  );
}