import { Stack } from 'expo-router';
import { Colors } from '../src/constants/theme';

export default function RootLayout() {
  return (
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
  );
}
