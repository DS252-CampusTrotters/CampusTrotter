// transvahan-user/src/screens/SettingsScreen.tsx
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/authContext";
import { useTheme, ThemePreference } from "../context/ThemeContext";

type ThemeOption = {
  value: ThemePreference;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const themeOptions: ThemeOption[] = [
  { value: "light", label: "Light", icon: "sunny" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System Default", icon: "phone-portrait" },
];

export default function SettingsScreen() {
  const { signOut, user } = useAuth();
  const { colors: C, themePreference, setThemePreference, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.header, { color: C.text }]}>Settings</Text>

        {/* User Info */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Account</Text>
          <View style={styles.infoRow}>
            <Ionicons name="person-circle" size={24} color={C.mutedText} />
            <Text style={[styles.infoText, { color: C.text }]}>
              {user?.email || "User"}
            </Text>
          </View>
        </View>

        {/* Theme Selection */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Appearance</Text>
          <Text style={[styles.sectionSubtitle, { color: C.mutedText }]}>
            Choose how the app looks
          </Text>

          <View style={styles.themeOptions}>
            {themeOptions.map((option) => {
              const isSelected = themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: isSelected ? C.primary : C.inputBg,
                      borderColor: isSelected ? C.primary : C.inputBorder,
                    },
                  ]}
                  onPress={() => setThemePreference(option.value)}
                >
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={isSelected ? "#fff" : C.mutedText}
                  />
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: isSelected ? "#fff" : C.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.themeHint, { color: C.mutedText }]}>
            Current: {isDark ? "Dark Mode" : "Light Mode"}
          </Text>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>About</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: C.mutedText }]}>Version</Text>
            <Text style={[styles.infoText, { color: C.text }]}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: C.mutedText }]}>App</Text>
            <Text style={[styles.infoText, { color: C.text }]}>CampusTrotter</Text>
          </View>
        </View>

        {/* Logout Button */}
        <Pressable
          onPress={signOut}
          style={[styles.logoutBtn, { backgroundColor: C.danger }]}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 20,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    flex: 1,
  },
  infoText: {
    fontSize: 14,
    fontWeight: "600",
  },
  themeOptions: {
    gap: 10,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  themeHint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  logoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
