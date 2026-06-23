import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTitleStyle: { color: Colors.textPrimary },
        headerTintColor: Colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="login" options={{ title: '', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: '', headerShown: false }} />
    </Stack>
  );
}
