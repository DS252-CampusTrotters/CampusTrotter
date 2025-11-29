//transvahan-user/src/screens/VerifyOTPScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import axios from "axios";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.API_BASE_URL;

export default function VerifyOtpScreen({ route, navigation }: any) {
  const { email } = route.params;
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const onVerify = async () => {
    if (!otp) {
      Alert.alert("⚠️ Missing OTP", "Please enter the OTP sent to your email.");
      return;
    }

    try {
      setLoading(true);
      const { data } = await axios.post(`${API}/auth/verify-otp`, { email, otp });
      console.log("✅ OTP Verified:", data);
      Alert.alert("✅ Verified", "Email verified successfully. Please log in.");
      navigation.replace("Login");
    } catch (err: any) {
      console.log("❌ OTP Verify Error:", err?.response?.data ?? err);
      Alert.alert("Verification Failed", err?.response?.data?.error ?? "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      setResending(true);
      await axios.post(`${API}/auth/resend-otp`, { email });
      Alert.alert("📩 OTP Resent", "A new OTP was sent to your email.");
    } catch (err: any) {
      console.log("❌ Resend Error:", err?.response?.data ?? err);
      Alert.alert("Failed to resend", err?.response?.data?.error ?? "Try again later.");
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 12 }}>
        Verify OTP
      </Text>
      <Text>Enter the OTP sent to {email}</Text>

      <TextInput
        value={otp}
        onChangeText={setOtp}
        placeholder="Enter OTP"
        keyboardType="numeric"
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 12,
          borderRadius: 8,
          marginTop: 12,
        }}
      />

      <Pressable
        onPress={onVerify}
        disabled={loading}
        style={{
          backgroundColor: "#111827",
          padding: 14,
          borderRadius: 12,
          marginTop: 12,
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>
          {loading ? "Verifying…" : "Verify"}
        </Text>
      </Pressable>

      <Pressable
        onPress={onResend}
        disabled={resending}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <Text style={{ color: "#2563eb" }}>
          {resending ? "Resending…" : "Resend OTP"}
        </Text>
      </Pressable>
    </View>
  );
}
