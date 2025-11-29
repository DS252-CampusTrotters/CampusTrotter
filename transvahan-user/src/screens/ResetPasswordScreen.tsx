import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import axios from "axios";
import Constants from "expo-constants";

const API = Constants.expoConfig?.extra?.API_BASE_URL;

export default function ResetPasswordScreen({ route, navigation }: any) {
  const emailFromRoute = route?.params?.email || "";
  const [email, setEmail] = useState(emailFromRoute);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const onReset = async () => {
    try {
      if (!email || !otp || !newPassword || !confirm) {
        Alert.alert("⚠️ Missing Fields", "Fill all fields.");
        return;
      }
      if (newPassword.length < 6) {
        Alert.alert("Weak Password", "Password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirm) {
        Alert.alert("Mismatch", "Passwords do not match.");
        return;
      }

      setLoading(true);

      await axios.post(`${API}/auth/reset-password`, {
        email: email.trim().toLowerCase(),
        otp,
        newPassword,
        confirmPassword: confirm,
      });

      Alert.alert("✅ Success", "Password reset. Please login.");
      navigation.replace("Login");
    } catch (e: any) {
      Alert.alert(
        "Reset failed",
        e?.response?.data?.error || "Invalid/expired OTP"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: "800" }}>Reset Password</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="OTP"
        value={otp}
        onChangeText={setOtp}
        keyboardType="numeric"
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry={!show}
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="Confirm New Password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry={!show}
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <Pressable onPress={() => setShow((v) => !v)}>
        <Text style={{ color: "#2563eb", fontWeight: "600" }}>
          {show ? "Hide Password" : "Show Password"}
        </Text>
      </Pressable>

      <Pressable
        onPress={onReset}
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
          {loading ? "Resetting…" : "Reset Password"}
        </Text>
      </Pressable>

      <Pressable onPress={() => navigation.replace("ForgotPassword")}>
        <Text style={{ color: "#ef4444", fontWeight: "600", textAlign: "center" }}>
          OTP expired? Restart reset flow
        </Text>
      </Pressable>
    </View>
  );
}