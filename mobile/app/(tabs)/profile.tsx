import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { profileApi } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow, CvdTypeColors } from '../../src/constants/theme';
import { useRouter } from 'expo-router';

const AVATAR_OPTIONS = ['🧑', '👩', '👨', '🧒', '👦', '👧', '🧑‍🦱', '🧑‍🦰', '🧑‍🦳', '🧑‍🦲'];

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuthStore();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ id: string; username: string; totalXp: number; level: number }>>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoadingLeaderboard(true);
    try {
      const data = await profileApi.getLeaderboard();
      setLeaderboard(data);
    } catch {
      // silent
    } finally {
      setLoadingLeaderboard(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await refreshUser();
    await loadLeaderboard();
    setRefreshing(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const avatarConfig = (() => {
    try { return JSON.parse(user?.avatarConfig ?? '{}'); } catch { return {}; }
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarEmoji}>{avatarConfig.emoji ?? '🧑'}</Text>
        </View>
        <Text style={styles.username}>{user?.username ?? '—'}</Text>
        <Text style={styles.email}>{user?.email ?? '—'}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>Level {user?.level ?? 1}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        {[
          { label: 'Total XP', value: user?.totalXp ?? 0, emoji: '⭐', color: Colors.primary },
          { label: 'Coins', value: user?.coins ?? 0, emoji: '🪙', color: Colors.coin },
          { label: 'Streak', value: `${user?.streakDays ?? 0} days`, emoji: '🔥', color: Colors.warning },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statEmoji}>{s.emoji}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Avatar Customization */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customize Avatar</Text>
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[styles.avatarOption, avatarConfig.emoji === emoji && styles.avatarOptionSelected]}
              onPress={() => profileApi.updateAvatar({ emoji })}
              accessibilityRole="button"
              accessibilityLabel={`Select avatar ${emoji}`}
            >
              <Text style={{ fontSize: 28 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Leaderboard */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Leaderboard</Text>
        {loadingLeaderboard ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          leaderboard.slice(0, 5).map((u, i) => (
            <View key={u.id} style={[styles.leaderRow, u.id === user?.id && styles.leaderRowSelf]}>
              <Text style={styles.leaderRank}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </Text>
              <Text style={[styles.leaderName, u.id === user?.id && styles.leaderNameSelf]}>
                {u.username} {u.id === user?.id ? '(You)' : ''}
              </Text>
              <Text style={styles.leaderXp}>Lv.{u.level} · {u.totalXp.toLocaleString()} XP</Text>
            </View>
          ))
        )}
      </View>

      {/* About CVD */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/assessment')}
        accessibilityRole="button"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, marginRight: Spacing.md }}>👁️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Retake Assessment</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.sm }}>
              Update your CVD profile for better-tailored training
            </Text>
          </View>
          <Text style={{ color: Colors.primary, fontSize: 18 }}>→</Text>
        </View>
      </TouchableOpacity>

      {/* Log Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button">
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>ColorAid v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingBottom: Spacing['5xl'] },
  profileHeader: { alignItems: 'center', paddingVertical: Spacing['2xl'] },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primaryLight,
    ...Shadow.md,
  },
  avatarEmoji: { fontSize: 44 },
  username: { fontSize: Typography.size.xl, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md },
  email: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 4 },
  levelBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginTop: Spacing.sm,
  },
  levelBadgeText: { color: Colors.textInverted, fontWeight: '700', fontSize: Typography.size.sm },
  statsGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statEmoji: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: Typography.size.md, fontWeight: '800' },
  statLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  cardTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  avatarOption: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm },
  leaderRowSelf: { backgroundColor: Colors.primaryBg, borderRadius: Radius.md, paddingHorizontal: Spacing.sm },
  leaderRank: { fontSize: Typography.size.lg, width: 36, textAlign: 'center' },
  leaderName: { flex: 1, fontWeight: '600', color: Colors.textPrimary, fontSize: Typography.size.sm },
  leaderNameSelf: { color: Colors.primary },
  leaderXp: { color: Colors.textMuted, fontSize: Typography.size.xs },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  logoutText: { color: Colors.error, fontWeight: '700', fontSize: Typography.size.md },
  version: { textAlign: 'center', color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: Spacing.md },
});
