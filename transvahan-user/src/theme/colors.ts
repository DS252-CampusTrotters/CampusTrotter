// transvahan-user/src/theme/colors.ts
import { ColorSchemeName } from "react-native";

export const lightColors = {
  background: "#f9fafb",
  card: "#ffffff",
  text: "#111827",
  mutedText: "#6b7280",
  border: "#e5e7eb",
  inputBg: "#f9fafb",
  inputBorder: "#d1d5db",
  primary: "#2563eb",
  successBg: "#ecfdf3",
  successText: "#15803d",
  warningBg: "#fef3c7",
  warningText: "#92400e",
  danger: "#b91c1c",
  dangerSoft: "#fee2e2",
  tabBarBg: "#ffffff",
};

export const darkColors: typeof lightColors = {
  background: "#0b1220",
  card: "#0f172a",
  text: "#e5e7eb",
  mutedText: "#9ca3af",
  border: "#243041",
  inputBg: "#111827",
  inputBorder: "#334155",
  primary: "#60a5fa",
  successBg: "#0b2a1a",
  successText: "#86efac",
  warningBg: "#2a1b0b",
  warningText: "#fbbf24",
  danger: "#f87171",
  dangerSoft: "#3a0f14",
  tabBarBg: "#0f172a",
};

export type AppColors = typeof lightColors;

export function getColors(scheme: ColorSchemeName): AppColors {
  return scheme === "dark" ? darkColors : lightColors;
}