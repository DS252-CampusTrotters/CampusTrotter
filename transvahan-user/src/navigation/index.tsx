// transvahan-user/src/navigation/index.tsx
import React from "react";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/authContext";
import { useTheme } from "../context/ThemeContext";

import RoleSelect from "../screens/RoleSelect";
import SignupScreen from "../screens/SignupScreen";
import VerifyOtpScreen from "../screens/VerifyOTPScreen";
import LoginScreen from "../screens/LoginScreen";
import DriverLogin from "../screens/DriverLogin";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import RouteMapScreen from "../screens/RouteMapScreen";
import FeedbackScreen from "../screens/FeedbackScreen";
import SettingsScreen from "../screens/SettingsScreen";

import ScheduleTab from "../screens/ScheduleTab";

import DriverAlertsTab from "../screens/DriverAlertsTab";

/* Screens */
import RouteSelectorTab from "../screens/RouteSelectorTab";
import RouteDetailScreen from "../screens/RouteDetailScreen";
import UserAlertsTab from "../screens/UserAlertsTab";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

/* -------------------- User Tabs -------------------- */
function HomeTabs() {
  const { colors: C, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.mutedText,
        tabBarStyle: {
          backgroundColor: C.tabBarBg,
          borderTopColor: C.border,
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Routes")
            return <Ionicons name="map" size={size} color={color} />;
          if (route.name === "Schedules")
            return <Ionicons name="list" size={size} color={color} />;
          if (route.name === "Alerts")
            return (
              <Ionicons name="alert-circle" size={size} color={color} />
            );
          return <Ionicons name="settings" size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Routes" component={RouteSelectorTab} />
      <Tab.Screen name="Schedules" component={ScheduleTab} />
      <Tab.Screen name="Alerts" component={UserAlertsTab} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/* -------------------- Driver Tabs -------------------- */
function DriverTabs() {
  const { colors: C } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.successText,
        tabBarInactiveTintColor: C.mutedText,
        tabBarStyle: {
          backgroundColor: C.tabBarBg,
          borderTopColor: C.border,
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Dashboard")
            return <Ionicons name="speedometer" size={size} color={color} />;
          if (route.name === "Alerts")
            return <Ionicons name="alert-circle" size={size} color={color} />;
          return <Ionicons name="settings" size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={require("../screens/DriverDashboardTab").default}
      />
      <Tab.Screen name="Alerts" component={DriverAlertsTab} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

/* -------------------- Root Navigation -------------------- */
export default function AppNav() {
  const { user, isDriver } = useAuth();
  const { isDark } = useTheme();

  return (
    <NavigationContainer
      theme={isDark ? DarkTheme : DefaultTheme}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user && <Stack.Screen name="RoleSelect" component={RoleSelect} />}
        {!user && <Stack.Screen name="Signup" component={SignupScreen} />}
        {!user && <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />}
        {!user && <Stack.Screen name="Login" component={LoginScreen} />}
        {!user && <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />}
        {!user && <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />}
        {!user && <Stack.Screen name="DriverLogin" component={DriverLogin} />}
        {user && isDriver && <Stack.Screen name="DriverTabs" component={DriverTabs} />}
        {user && !isDriver && <Stack.Screen name="HomeTabs" component={HomeTabs} />}
        {user && !isDriver && <Stack.Screen name="RouteMap" component={RouteMapScreen} />}
        {user && !isDriver && <Stack.Screen name="Feedback" component={FeedbackScreen} />}
        {user && !isDriver && <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
