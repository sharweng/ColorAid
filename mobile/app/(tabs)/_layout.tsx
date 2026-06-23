import { Tabs } from 'expo-router';
import { Colors } from '../../src/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        headerStyle: { backgroundColor: Colors.surface },
        headerTitleStyle: { fontWeight: '800', color: Colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🏠" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="📊" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Store',
          tabBarLabel: 'Store',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🛒" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="👤" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 22, opacity: color === Colors.primary ? 1 : 0.5 }}>{emoji}</Text>;
}
