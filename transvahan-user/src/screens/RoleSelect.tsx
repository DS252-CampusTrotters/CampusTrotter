import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";

export default function RoleSelect() {
  const navigation = useNavigation<any>();
  const { colors: C } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={styles.content}>
        {/* Logo */}
        <Image
          source={require("../assets/transvahan_logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={[styles.title, { color: C.text }]}>CampusTrotter</Text>
        <Text style={[styles.subtitle, { color: C.mutedText }]}>
          Choose your role to continue
        </Text>

        {/* User Signup Flow */}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.primary }]}
          onPress={() => navigation.navigate("Signup")}
        >
          <Text style={styles.btnText}>User</Text>
        </TouchableOpacity>

        {/* Driver Login Flow */}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.successText }]}
          onPress={() => navigation.navigate("DriverLogin")}
        >
          <Text style={styles.btnText}>Driver</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: "center",
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
    width: "80%",
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
