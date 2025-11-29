// transvahan-user/src/utils/useResponsiveLayout.ts
import { useWindowDimensions } from "react-native";

/**
 * Custom hook for responsive layout calculations.
 * Updates automatically on orientation changes and window resizes.
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;
  const isSmallPhone = width < 360;

  // Calculate responsive map height based on device type and orientation
  const mapHeight = isLandscape
    ? height * 0.7 // More map space in landscape
    : isTablet
    ? height * 0.55 // Tablets get more map space
    : height * 0.45; // Phones get standard 45%

  // Calculate responsive panel heights
  const panelMaxHeight = isLandscape
    ? height * 0.25
    : isTablet
    ? 220
    : 180;

  // Button sizes that scale with screen
  const buttonSize = isSmallPhone ? 44 : isTablet ? 60 : 50;
  const buttonPadding = isSmallPhone ? 10 : isTablet ? 16 : 12;

  // Font sizes
  const fontSizeSmall = isTablet ? 14 : 12;
  const fontSizeNormal = isTablet ? 16 : 14;
  const fontSizeLarge = isTablet ? 20 : 18;
  const fontSizeHeader = isTablet ? 26 : 22;

  // Spacing
  const spacingSmall = isTablet ? 10 : 8;
  const spacingNormal = isTablet ? 16 : 12;
  const spacingLarge = isTablet ? 24 : 16;

  return {
    width,
    height,
    isLandscape,
    isTablet,
    isSmallPhone,
    mapHeight,
    panelMaxHeight,
    buttonSize,
    buttonPadding,
    fontSizeSmall,
    fontSizeNormal,
    fontSizeLarge,
    fontSizeHeader,
    spacingSmall,
    spacingNormal,
    spacingLarge,
    aspectRatio: width / height,
  };
}

/**
 * Get responsive button styles
 */
export function getResponsiveButtonStyle(layout: ReturnType<typeof useResponsiveLayout>) {
  return {
    minWidth: layout.buttonSize,
    minHeight: layout.buttonSize,
    paddingVertical: layout.buttonPadding,
    paddingHorizontal: layout.buttonPadding,
  };
}
