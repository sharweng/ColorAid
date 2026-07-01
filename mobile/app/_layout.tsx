import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Colors } from '../src/constants/theme';
import { AchievementToastContainer } from '../src/components/AchievementToast';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const { isAuthenticated, refreshUser } = useAuthStore();

  // Re-hydrate the user profile from the API on every cold start.
  // This ensures fields like `role` and `isActive` are always up to date,
  // even if the Zustand-persisted object is from a previous app version.
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { fontWeight: '800', color: Colors.textPrimary },
          headerTintColor: Colors.primary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="assessment" options={{ title: 'Color Vision Assessment', presentation: 'modal' }} />
        <Stack.Screen name="scanner" options={{ title: 'Color Scanner', presentation: 'modal' }} />
        <Stack.Screen name="training/[gameType]" options={{ title: 'Training' }} />
      </Stack>
      {/* Global achievement toast overlay — visible on all screens */}
      <AchievementToastContainer />
    </View>
  );
}
