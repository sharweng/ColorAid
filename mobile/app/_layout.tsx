import { Stack } from 'expo-router';
import { View } from 'react-native';
import { Colors } from '../src/constants/theme';
import { AchievementToastContainer } from '../src/components/AchievementToast';

export default function RootLayout() {
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

