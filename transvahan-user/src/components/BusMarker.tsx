// transvahan-user/src/components/BusMarker.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";

type Props = {
  coordinate: { latitude: number; longitude: number };
  heading?: number; // degrees, 0 = north
  children?: React.ReactNode;
};

const BusMarker: React.FC<Props> = ({ coordinate, heading = 0, children }) => {
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={heading}
    >
      <View style={styles.wrapper}>
        <View style={styles.body} />
        <View style={styles.tip} />
      </View>
      {children}
    </Marker>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  body: {
    width: 18,
    height: 24,
    backgroundColor: "#ffcc00",
    borderRadius: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 4,
  },
  tip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ffcc00",
    marginTop: -1,
  },
});

export default BusMarker;
