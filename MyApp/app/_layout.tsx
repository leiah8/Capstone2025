import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { TouchableOpacity, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { AuthProvider } from "../contexts/AuthContext";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // hide once your initial check (index gate) renders something
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack screenOptions={{ headerShown: false }}>
            {/* index.tsx will run first and Redirect appropriately */}
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="setup" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen
              name="create-project"
              options={{
                headerShown: true,
                title: "Create Project",
                presentation: "modal",
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                ),
              }}
            />
            <Stack.Screen
              name="edit-project"
              options={{
                headerShown: true,
                title: "Edit Project",
                presentation: "modal",
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                ),
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
