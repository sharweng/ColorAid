import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../src/store/authStore';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { CvdTypeColors } from '../../src/constants/theme';
import { trainingApi, type RecommendedGame } from '../../src/services/api';

const GAME_CARDS = [
  {
    id: 'color_match' as const,
    title: 'Color Match',
    emoji: '🎨',
    description: 'Match the target color from a set of options',
    color: Colors.primary,
  },
  {
    id: 'hue_hunt' as const,
    title: 'Hue Hunt',
    emoji: '🔍',
    description: 'Find the odd color out in a grid',
    color: Colors.accent,
  },
  {
    id: 'shade_spectrum' as const,
    title: 'Shade Spectrum',
    emoji: '🌈',
    description: 'Order shades from light to dark',
    color: '#FF9500',
  },
  {
    id: 'color_sort' as const,
    title: 'Color Sort',
    emoji: '🗂️',
    description: 'Sort colors into their correct categories',
    color: '#FF6B6B',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuthStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [recommendations, setRecommendations] = useState<{
    cvdType: string;
    recommendations: RecommendedGame[];
    performanceSummary: string;
    sessionsThisWeek: number;
    weeklyGoal: number;
  } | null>(null);

  async function loadRecommendations() {
    try {
      const data = await trainingApi.getRecommended();
      setRecommendations(data);
    } catch {
      // silent — recommendations are optional
    }
  }

  // Refresh user stats every time this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadRecommendations();
    }, [])
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadRecommendations()]);
    setRefreshing(false);
  }

  const xpProgress = user ? (user.xpProgress ?? user.totalXp % 500) : 0;
  const xpForLevel = 500;
  const xpPercent = Math.min((xpProgress / xpForLevel) * 100, 100);

  // Parse avatarConfig from user store
  const avatarConfig = (() => {
    try { return JSON.parse(user?.avatarConfig ?? '{}'); } catch { return {}; }
  })();

  const isPhotoAvatar = avatarConfig.type === 'photo' && avatarConfig.uri;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.username ?? 'Explorer'} 👋</Text>
          <Text style={styles.subGreeting}>Ready to train your color vision?</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          style={styles.avatar}
          accessibilityLabel="Go to profile"
        >
          {isPhotoAvatar ? (
            <Image
              source={{ uri: avatarConfig.uri }}
              style={styles.avatarPhoto}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarEmoji}>{avatarConfig.emoji ?? '🧑'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Coins', value: user?.coins ?? 0, emoji: '🪙', color: Colors.coin },
          { label: 'Level', value: user?.level ?? 1, emoji: '⭐', color: Colors.primary },
          { label: 'Streak', value: `${user?.streakDays ?? 0}d`, emoji: '🔥', color: Colors.warning },
        ].map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.statEmoji}>{stat.emoji}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* XP Progress */}
      <View style={styles.xpCard}>
        <View style={styles.xpHeader}>
          <Text style={styles.xpLabel}>Level {user?.level ?? 1}</Text>
          <Text style={styles.xpCount}>{xpProgress} / {xpForLevel} XP</Text>
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${xpPercent}%` as any }]} />
        </View>
        <Text style={styles.xpNext}>{user?.xpToNextLevel ?? xpForLevel - xpProgress} XP to Level {(user?.level ?? 1) + 1}</Text>
      </View>

      {/* Assessment Banner */}
      <TouchableOpacity
        style={styles.assessmentBanner}
        onPress={() => router.push('/assessment')}
        accessibilityRole="button"
        accessibilityLabel="Take the color vision assessment"
      >
        <View style={styles.assessmentContent}>
          <Text style={styles.assessmentEmoji}>👁️</Text>
          <View style={styles.assessmentText}>
            <Text style={styles.assessmentTitle}>Color Vision Assessment</Text>
            <Text style={styles.assessmentSub}>Identify your CVD type and severity</Text>
          </View>
        </View>
        <Text style={styles.assessmentArrow}>→</Text>
      </TouchableOpacity>

      {/* Camera Scanner */}
      <TouchableOpacity
        style={styles.scannerBanner}
        onPress={() => router.push('/scanner')}
        accessibilityRole="button"
        accessibilityLabel="Open color scanner"
      >
        <View style={styles.assessmentContent}>
          <Text style={styles.assessmentEmoji}>📷</Text>
          <View style={styles.assessmentText}>
            <Text style={[styles.assessmentTitle, { color: Colors.textInverted }]}>Color Scanner</Text>
            <Text style={[styles.assessmentSub, { color: 'rgba(255,255,255,0.8)' }]}>Identify real-world colors in real time</Text>
          </View>
        </View>
        <Text style={[styles.assessmentArrow, { color: Colors.textInverted }]}>→</Text>
      </TouchableOpacity>

      {/* Training Games */}
      <Text style={styles.sectionTitle}>Training Games</Text>
      <View style={styles.gamesGrid}>
        {GAME_CARDS.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={[styles.gameCard, { borderTopColor: game.color }]}
            onPress={() => router.push({ pathname: '/training/[gameType]', params: { gameType: game.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Play ${game.title}`}
          >
            <Text style={styles.gameEmoji}>{game.emoji}</Text>
            <Text style={styles.gameTitle}>{game.title}</Text>
            <Text style={styles.gameDescription}>{game.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recommended for You */}
      {recommendations && recommendations.recommendations.length > 0 && (
        <View style={styles.recSection}>
          <View style={styles.recHeader}>
            <Text style={styles.sectionTitle}>Recommended for You</Text>
            {recommendations.cvdType !== 'normal' && (
              <View style={styles.cvdBadge}>
                <Text style={styles.cvdBadgeText}>
                  {recommendations.cvdType.replace(/([A-Z])/g, ' $1')}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.recSummary}>{recommendations.performanceSummary}</Text>

          {/* Weekly goal bar */}
          <View style={styles.weeklyGoalRow}>
            <Text style={styles.weeklyGoalLabel}>
              This week: {recommendations.sessionsThisWeek}/{recommendations.weeklyGoal} sessions
            </Text>
            <View style={styles.weeklyGoalBar}>
              <View
                style={[
                  styles.weeklyGoalFill,
                  { width: `${Math.min((recommendations.sessionsThisWeek / recommendations.weeklyGoal) * 100, 100)}%` as any },
                ]}
              />
            </View>
          </View>

          {recommendations.recommendations.map((rec) => {
            const game = GAME_CARDS.find(g => g.id === rec.gameType);
            if (!game) return null;
            return (
              <TouchableOpacity
                key={rec.gameType}
                style={[styles.recCard, { borderLeftColor: game.color }]}
                onPress={() => router.push({ pathname: '/training/[gameType]', params: { gameType: rec.gameType } })}
                accessibilityRole="button"
                accessibilityLabel={`Play recommended ${game.title}`}
              >
                <Text style={styles.recEmoji}>{game.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.recCardTitleRow}>
                    <Text style={styles.recCardTitle}>{game.title}</Text>
                    <View style={[styles.diffBadge, { backgroundColor: game.color + '22' }]}>
                      <Text style={[styles.diffBadgeText, { color: game.color }]}>
                        Lvl {rec.suggestedDifficulty}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recReason}>{rec.reason}</Text>
                  <Text style={styles.recSessions}>{rec.sessionsCompleted} sessions completed</Text>
                </View>
                <Text style={[styles.recArrow, { color: game.color }]}>→</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  greeting: { fontSize: Typography.size.xl, fontWeight: '800', color: Colors.textPrimary },
  subGreeting: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    overflow: 'hidden',
  },
  avatarEmoji: { fontSize: 24 },
  avatarPhoto: { width: 48, height: 48, borderRadius: 24 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statEmoji: { fontSize: 20, marginBottom: 2 },
  statValue: { fontSize: Typography.size.lg, fontWeight: '800' },
  statLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  xpCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  xpLabel: { fontSize: Typography.size.sm, fontWeight: '700', color: Colors.textPrimary },
  xpCount: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  xpBar: { height: 10, backgroundColor: Colors.border, borderRadius: Radius.full, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  xpNext: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  assessmentBanner: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    ...Shadow.sm,
  },
  scannerBanner: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    ...Shadow.md,
  },
  assessmentContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  assessmentEmoji: { fontSize: 32, marginRight: Spacing.md },
  assessmentText: { flex: 1 },
  assessmentTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary },
  assessmentSub: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  assessmentArrow: { fontSize: 20, color: Colors.primary, fontWeight: '700' },
  sectionTitle: { fontSize: Typography.size.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  gamesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  gameCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderTopWidth: 4,
    ...Shadow.sm,
  },
  gameEmoji: { fontSize: 28, marginBottom: Spacing.xs },
  gameTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  gameDescription: { fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 16 },

  // Recommendations
  recSection: { marginTop: Spacing.md },
  recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  cvdBadge: {
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  cvdBadgeText: { fontSize: Typography.size.xs, color: Colors.primary, fontWeight: '700', textTransform: 'capitalize' },
  recSummary: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 20 },
  weeklyGoalRow: { marginBottom: Spacing.md },
  weeklyGoalLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, marginBottom: 4 },
  weeklyGoalBar: { height: 6, backgroundColor: Colors.border, borderRadius: Radius.full, overflow: 'hidden' },
  weeklyGoalFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: Radius.full },
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    ...Shadow.sm,
  },
  recEmoji: { fontSize: 28, marginRight: Spacing.md },
  recCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  recCardTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  diffBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginLeft: Spacing.xs },
  diffBadgeText: { fontSize: Typography.size.xs, fontWeight: '700' },
  recReason: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  recSessions: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  recArrow: { fontSize: 18, fontWeight: '700', marginLeft: Spacing.sm },
});
