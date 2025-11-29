// transvahan-user/src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useColorScheme, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, AppColors } from "../theme/colors";

export type ThemePreference = "light" | "dark" | "system";

type ThemeContextType = {
  theme: "light" | "dark";
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  colors: AppColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@theme_preference";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === "light" || saved === "dark" || saved === "system") {
          setThemePreferenceState(saved);
        }
      } catch (e) {
        console.warn("Failed to load theme preference:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Calculate actual theme based on preference
  const theme: "light" | "dark" =
    themePreference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : themePreference;

  const isDark = theme === "dark";
  const colors = isDark ? darkColors : lightColors;

  // Save theme preference
  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch (e) {
      console.warn("Failed to save theme preference:", e);
    }
  };

  // Don't render children until we've loaded the preference
  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themePreference,
        setThemePreference,
        colors,
        isDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Hook for components that just need colors
export function useColors() {
  const { colors } = useTheme();
  return colors;
}
