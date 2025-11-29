// transvahan-user/src/screens/LoginScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../auth/authContext";
import { setToken as setApiToken } from "../api/client";
import { useTheme } from "../context/ThemeContext";

const API = "https://<NGROK_BACKEND_URL>";

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const { colors: C, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    try {
      if (!email || !password) {
        Alert.alert("Missing Fields", "Please enter both email and password.");
        return;
      }

      setLoading(true);

      const { data } = await axios.post(`${API}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      });

      setApiToken(data.token);
      await AsyncStorage.setItem("last_login_endpoint", "/auth/login");
      await AsyncStorage.setItem("auth_user", JSON.stringify({ ...data.user, role: "user" }));
      await signIn(data.token, data.user, false);
      Alert.alert("Logged in", `Welcome back, ${data.user.name}`);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ??
        (e.message?.includes("Network") ? "Network error" : "Login failed");
      Alert.alert("Login failed", msg);
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
            <Text style={[styles.title, { color: C.text }]}>Login</Text>
            <Text style={[styles.subtitle, { color: C.mutedText }]}>
              Sign in to your account
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

            <View style={styles.linkRow}>
              <Pressable onPress={() => setShowPassword((v) => !v)}>
                <Text style={[styles.link, { color: C.primary }]}>
                  {showPassword ? "Hide Password" : "Show Password"}
                </Text>
              </Pressable>

              <Pressable onPress={() => navigation.navigate("ForgotPassword")}>
                <Text style={[styles.link, { color: C.danger }]}>
                  Forgot Password?
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onLogin}
              disabled={loading}
              style={[
                styles.button,
                {
                  backgroundColor: C.primary,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.buttonText}>
                {loading ? "Signing in..." : "Sign In"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backLink}
            >
              <Text style={[styles.backText, { color: C.mutedText }]}>
                Back to role selection
              </Text>
            </Pressable>
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
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
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
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  link: {
    fontWeight: "600",
    fontSize: 14,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
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
