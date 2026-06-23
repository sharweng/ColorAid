import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { progressApi, achievementsApi, type Achievement } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useRouter } from 'expo-router';

export default function ProgressScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [progressData, setProgressData] = useState<{
    recentActivity: { sessionsLast7Days: number; avgAccuracyLast7Days: number };
    trainingSessions: Array<{ completedAt: string; accuracyPct: number; gameType: string; difficultyLevel: number }>;
    assessments: Array<{ completedAt: string; cvdType: string; correctPlates: number; totalPlates: number }>;
  } | null>(null);
  const [achievements, setAchievements] = useState<{ achievements: Achievement[]; unlockedCount: number; totalCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [prog, ach] = await Promise.all([
        progressApi.get(),
        achievementsApi.getAll(),
      ]);
      setProgressData(prog as any);
      setAchievements(ach);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const recent = progressData?.recentActivity;
  const sessions = progressData?.trainingSessions?.slice(-7) ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.pageTitle}>Progress</Text>

      {/* Weekly Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>This Week</Text>
        <View style={styles.weekRow}>
          <View style={styles.weekStat}>
            <Text style={styles.weekVal}>{recent?.sessionsLast7Days ?? 0}</Text>
            <Text style={styles.weekLbl}>Sessions</Text>
          </View>
          <View style={styles.weekDivider} />
          <View style={styles.weekStat}>
            <Text style={styles.weekVal}>{recent?.avgAccuracyLast7Days ?? 0}%</Text>
            <Text style={styles.weekLbl}>Avg Accuracy</Text>
          </View>
          <View style={styles.weekDivider} />
          <View style={styles.weekStat}>
            <Text style={styles.weekVal}>{user?.streakDays ?? 0}</Text>
            <Text style={styles.weekLbl}>Day Streak 🔥</Text>
          </View>
        </View>
      </View>

      {/* Mini accuracy chart (last 7 sessions as bar chart) */}
      {sessions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Sessions</Text>
          <View style={styles.barChart}>
            {sessions.map((s, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barOuter}>
                  <View style={[styles.barFill, { height: `${s.accuracyPct}%` as any }]} />
                </View>
                <Text style={styles.barLabel}>{s.accuracyPct.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
          <Text style={styles.chartNote}>Accuracy per session (last {sessions.length})</Text>
        </View>
      )}

      {/* Assessments */}
      {(progressData?.assessments?.length ?? 0) > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assessment History</Text>
          {(progressData?.assessments ?? []).slice(-3).map((a, i) => (
            <View key={i} style={styles.assessRow}>
              <View style={styles.assessIcon}><Text style={{ fontSize: 20 }}>👁️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assessType}>{a.cvdType?.replace(/([A-Z])/g, ' $1') ?? 'Unknown'}</Text>
                <Text style={styles.assessDate}>{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}</Text>
              </View>
              <Text style={styles.assessScore}>{a.correctPlates}/{a.totalPlates}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.moreBtn} onPress={() => router.push('/assessment')}>
            <Text style={styles.moreBtnText}>Take New Assessment →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Achievements */}
      {achievements && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Achievements</Text>
            <Text style={styles.achCount}>{achievements.unlockedCount}/{achievements.totalCount}</Text>
          </View>
          <View style={styles.achGrid}>
            {achievements.achievements.slice(0, 6).map((a) => (
              <View key={a.id} style={[styles.achItem, !a.unlocked && styles.achLocked]}>
                <Text style={[styles.achEmoji, !a.unlocked && styles.achEmojiLocked]}>
                  {achievementEmoji(a.key)}
                </Text>
                <Text style={[styles.achTitle, !a.unlocked && styles.achTitleLocked]} numberOfLines={2}>
                  {a.unlocked ? a.title : '???'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function achievementEmoji(key: string): string {
  const map: Record<string, string> = {
    first_assessment: '👁️', assessment_veteran: '🔬', first_game: '🎮',
    training_enthusiast: '🏃', training_master: '🏆', week_streak: '🔥',
    level_5: '⭐', level_10: '👑', color_match_dedicated: '🎨',
    hue_hunt_dedicated: '🔍', shade_spectrum_dedicated: '🌈', color_sort_dedicated: '🗂️',
  };
  return map[key] ?? '🏅';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  pageTitle: { fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  cardTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  achCount: { color: Colors.primary, fontWeight: '700', fontSize: Typography.size.sm },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekStat: { flex: 1, alignItems: 'center' },
  weekVal: { fontSize: Typography.size.xl, fontWeight: '800', color: Colors.primary },
  weekLbl: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  weekDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: Spacing.sm },
  barCol: { flex: 1, alignItems: 'center' },
  barOuter: { flex: 1, width: '100%', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.sm, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: Radius.sm },
  barLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  chartNote: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },
  assessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  assessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  assessType: { fontWeight: '600', color: Colors.textPrimary, textTransform: 'capitalize', fontSize: Typography.size.sm },
  assessDate: { color: Colors.textMuted, fontSize: Typography.size.xs },
  assessScore: { fontWeight: '700', color: Colors.primary, fontSize: Typography.size.sm },
  moreBtn: { marginTop: Spacing.sm, padding: Spacing.sm, alignItems: 'center' },
  moreBtnText: { color: Colors.primary, fontWeight: '600', fontSize: Typography.size.sm },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  achItem: { width: '30%', backgroundColor: Colors.primaryBg, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  achLocked: { backgroundColor: Colors.surfaceAlt, opacity: 0.6 },
  achEmoji: { fontSize: 24, marginBottom: 4 },
  achEmojiLocked: { opacity: 0.4 },
  achTitle: { fontSize: 9, fontWeight: '600', color: Colors.primary, textAlign: 'center' },
  achTitleLocked: { color: Colors.textMuted },
});
