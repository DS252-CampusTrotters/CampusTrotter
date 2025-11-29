// transvahan-user/src/screens/DriverLogin.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../auth/authContext";
import { apiClient } from "../api/client";
import { useTheme } from "../context/ThemeContext";

export default function DriverLogin({ navigation }: any) {
  const { signIn } = useAuth();
  const { colors: C } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      if (!email || !password) {
        Alert.alert("Missing Fields", "Please enter both email and password.");
        return;
      }

      setLoading(true);

      const data = await apiClient.loginDriver!({ email, password });

      await AsyncStorage.setItem(
        "auth_user",
        JSON.stringify({
          ...data.user,
          token: data.token,
          role: "driver",
        })
      );
      await AsyncStorage.setItem("last_login_endpoint", "/auth/driver/login");

      await signIn(data.token, { ...data.user, role: "driver" }, true);

      Alert.alert("Success", "Driver logged in successfully!");
    } catch (err: any) {
      console.error("Driver login error:", err);
      Alert.alert(
        "Login Failed",
        err.response?.data?.error || "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            <Text style={[styles.title, { color: C.text }]}>Driver Login</Text>
            <Text style={[styles.subtitle, { color: C.mutedText }]}>
              Sign in to your driver account
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: C.text }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={C.mutedText}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[
                  styles.input,
                  {
                    backgroundColor: C.inputBg,
                    borderColor: C.inputBorder,
                    color: C.text,
                  },
                ]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: C.text }]}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={C.mutedText}
                secureTextEntry={!showPassword}
                style={[
                  styles.input,
                  {
                    backgroundColor: C.inputBg,
                    borderColor: C.inputBorder,
                    color: C.text,
                  },
                ]}
              />
            </View>

            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={[styles.link, { color: C.primary }]}>
                {showPassword ? "Hide Password" : "Show Password"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                {
                  backgroundColor: C.successText,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Signing in..." : "Login as Driver"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backLink}
            >
              <Text style={[styles.backText, { color: C.mutedText }]}>
                Back to role selection
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  form: {
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
  },
  link: {
    fontWeight: "600",
    fontSize: 14,
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  backLink: {
    alignItems: "center",
    marginTop: 16,
  },
  backText: {
    fontSize: 14,
  },
});
