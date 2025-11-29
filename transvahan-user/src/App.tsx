// src/App.tsx
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./auth/authContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppNav from "./navigation";
import silenceLogsForProd from "./utils/silenceLogs";

export default function App() {
  silenceLogsForProd();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AppNav />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
