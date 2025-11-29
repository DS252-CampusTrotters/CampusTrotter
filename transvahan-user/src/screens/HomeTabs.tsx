// src/screens/HomeTabs.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MapTab from "./MapTab";
import ScheduleTab from "./ScheduleTab";
import PlannerTab from "./PlannerTab";
import { Ionicons } from "@expo/vector-icons";

const Tab = createBottomTabNavigator();

export default function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Map") return <Ionicons name="map" size={size} color={color} />;
          if (route.name === "Schedules") return <Ionicons name="list" size={size} color={color} />;
          return <Ionicons name="navigate" size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Map" component={MapTab} />
      <Tab.Screen name="Schedules" component={ScheduleTab} />
      <Tab.Screen name="Planner" component={PlannerTab} />
    </Tab.Navigator>
  );
}
