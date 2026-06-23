import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, FlatList, SafeAreaView,
} from 'react-native';
import { progressApi, achievementsApi, type Achievement } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

type SortOrder = 'latest' | 'earliest';

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

  // Modal state
  const [showAllAssessments, setShowAllAssessments] = useState(false);
  const [assessmentSort, setAssessmentSort] = useState<SortOrder>('latest');
  const [showAllAchievements, setShowAllAchievements] = useState(false);

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

  // Reload data every time the Progress tab comes into focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const recent = progressData?.recentActivity;
  const sessions = progressData?.trainingSessions?.slice(-7) ?? [];

  // Assessments sorted: latest first (newest at top)
  const allAssessments = [...(progressData?.assessments ?? [])].reverse();
  const sortedAssessments = assessmentSort === 'latest'
    ? allAssessments
    : [...allAssessments].reverse();
  const previewAssessments = allAssessments.slice(0, 3);

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
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Assessment History</Text>
            <TouchableOpacity onPress={() => setShowAllAssessments(true)}>
              <Text style={styles.seeAllBtn}>See All</Text>
            </TouchableOpacity>
          </View>
          {previewAssessments.map((a, i) => (
            <View key={i} style={styles.assessRow}>
              <View style={styles.assessIcon}><Text style={{ fontSize: 20 }}>👁️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assessType}>{formatCvdType(a.cvdType)}</Text>
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
            <View style={styles.achHeaderRight}>
              <Text style={styles.achCount}>{achievements.unlockedCount}/{achievements.totalCount}</Text>
              <TouchableOpacity onPress={() => setShowAllAchievements(true)}>
                <Text style={styles.seeAllBtn}>See All</Text>
              </TouchableOpacity>
            </View>
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

      {/* ── ALL ASSESSMENTS MODAL ────────────────────────────────────────── */}
      <Modal visible={showAllAssessments} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assessment History</Text>
            <TouchableOpacity onPress={() => setShowAllAssessments(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Sort toggle */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort by:</Text>
            {(['latest', 'earliest'] as SortOrder[]).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.filterBtn, assessmentSort === opt && styles.filterBtnOn]}
                onPress={() => setAssessmentSort(opt)}>
                <Text style={[styles.filterBtnTxt, assessmentSort === opt && styles.filterBtnTxtOn]}>
                  {opt === 'latest' ? 'Latest First' : 'Earliest First'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={sortedAssessments}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.modalList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item: a }) => (
              <View style={styles.modalAssessRow}>
                <View style={styles.assessIcon}><Text style={{ fontSize: 20 }}>👁️</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assessType}>{formatCvdType(a.cvdType)}</Text>
                  <Text style={styles.assessDate}>
                    {a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-US', {
                      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                    }) : ''}
                  </Text>
                </View>
                <View style={styles.assessScoreBox}>
                  <Text style={styles.assessScore}>{a.correctPlates}/{a.totalPlates}</Text>
                  <Text style={styles.assessPct}>
                    {a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0}%
                  </Text>
                </View>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* ── ALL ACHIEVEMENTS MODAL ───────────────────────────────────────── */}
      <Modal visible={showAllAchievements} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>All Achievements</Text>
            <TouchableOpacity onPress={() => setShowAllAchievements(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {achievements && (
            <Text style={styles.achModalSubtitle}>
              {achievements.unlockedCount} of {achievements.totalCount} unlocked
            </Text>
          )}

          <FlatList
            data={achievements?.achievements ?? []}
            keyExtractor={(a) => a.id}
            contentContainerStyle={styles.modalList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item: a }) => (
              <View style={[styles.achListRow, !a.unlocked && styles.achListRowLocked]}>
                <View style={styles.achListIcon}>
                  <Text style={[styles.achListEmoji, !a.unlocked && styles.achEmojiLocked]}>
                    {achievementEmoji(a.key)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.achListTitle, !a.unlocked && styles.achListTitleLocked]}>
                    {a.title}
                  </Text>
                  <Text style={styles.achListDesc}>{achDescription(a.key, a.description)}</Text>
                  {a.unlocked && a.unlockedAt && (
                    <Text style={styles.achListDate}>
                      Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
                    </Text>
                  )}
                  {!a.unlocked && (
                    <Text style={styles.achListLocked}>🔒 Locked</Text>
                  )}
                </View>
                <View style={styles.achRewards}>
                  <Text style={styles.achRewardXp}>+{a.xpReward} XP</Text>
                  <Text style={styles.achRewardCoin}>🪙 {a.coinReward}</Text>
                </View>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCvdType(cvdType: string | null | undefined): string {
  if (!cvdType) return 'Unknown';
  return cvdType.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function achievementEmoji(key: string): string {
  const map: Record<string, string> = {
    first_assessment:        '👁️',
    assessment_veteran:      '🔬',
    first_game:              '🎮',
    training_enthusiast:     '🏃',
    training_master:         '🏆',
    week_streak:             '🔥',
    level_5:                 '⭐',
    level_10:                '👑',
    color_match_dedicated:   '🎨',
    hue_hunt_dedicated:      '🔍',
    shade_spectrum_dedicated:'🌈',
    color_sort_dedicated:    '🗂️',
  };
  return map[key] ?? '🏅';
}

/** Returns a friendly how-to-unlock description for each achievement key. */
function achDescription(key: string, fallback: string): string {
  const map: Record<string, string> = {
    first_assessment:        'Take your very first color vision assessment to earn this.',
    assessment_veteran:      'Complete 5 color vision assessments to prove your dedication.',
    first_game:              'Finish any training game for the first time.',
    training_enthusiast:     'Complete 10 training sessions total across any game type.',
    training_master:         'Complete 50 training sessions — you\'re a true color master!',
    week_streak:             'Train every day for 7 consecutive days without missing a day.',
    level_5:                 'Earn enough XP to reach Level 5 on your ColorAid journey.',
    level_10:                'Reach Level 10 — the mark of a dedicated Color Champion.',
    color_match_dedicated:   'Play Color Match at least 5 times to sharpen exact-match skills.',
    hue_hunt_dedicated:      'Play Hue Hunt at least 5 times to master finding the odd hue.',
    shade_spectrum_dedicated:'Play Shade Spectrum at least 5 times to master light-to-dark ordering.',
    color_sort_dedicated:    'Play Color Sort at least 5 times to become a category expert.',
  };
  return map[key] ?? fallback;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  pageTitle: { fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm },
  cardTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  seeAllBtn: { color: Colors.primary, fontWeight: '700', fontSize: Typography.size.sm },
  achCount: { color: Colors.primary, fontWeight: '700', fontSize: Typography.size.sm, marginRight: Spacing.sm },
  achHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
  assessScoreBox: { alignItems: 'flex-end' },
  assessPct: { color: Colors.textMuted, fontSize: Typography.size.xs },
  moreBtn: { marginTop: Spacing.sm, padding: Spacing.sm, alignItems: 'center' },
  moreBtnText: { color: Colors.primary, fontWeight: '600', fontSize: Typography.size.sm },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  achItem: { width: '30%', backgroundColor: Colors.primaryBg, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  achLocked: { backgroundColor: Colors.surfaceAlt, opacity: 0.6 },
  achEmoji: { fontSize: 24, marginBottom: 4 },
  achEmojiLocked: { opacity: 0.4 },
  achTitle: { fontSize: 9, fontWeight: '600', color: Colors.primary, textAlign: 'center' },
  achTitleLocked: { color: Colors.textMuted },

  // Modal shared
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, paddingTop: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: Typography.size.xl, fontWeight: '800', color: Colors.textPrimary },
  modalClose: { fontSize: Typography.size.lg, color: Colors.textMuted, paddingHorizontal: Spacing.sm },
  modalList: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

  // Assessment modal
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, paddingBottom: Spacing.sm },
  filterLabel: { color: Colors.textSecondary, fontSize: Typography.size.sm, fontWeight: '600' },
  filterBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 2, borderColor: Colors.border },
  filterBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterBtnTxt: { fontSize: Typography.size.xs, fontWeight: '700', color: Colors.textSecondary },
  filterBtnTxtOn: { color: Colors.textInverted },
  modalAssessRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },

  // Achievement modal
  achModalSubtitle: {
    color: Colors.textSecondary, fontSize: Typography.size.sm,
    textAlign: 'center', paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  achListRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.primaryBg, borderRadius: Radius.md, padding: Spacing.md,
  },
  achListRowLocked: { backgroundColor: Colors.surfaceAlt, opacity: 0.75 },
  achListIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  achListEmoji: { fontSize: 26 },
  achListTitle: { fontWeight: '800', color: Colors.textPrimary, fontSize: Typography.size.base, marginBottom: 2 },
  achListTitleLocked: { color: Colors.textSecondary },
  achListDesc: { color: Colors.textSecondary, fontSize: Typography.size.xs, lineHeight: 16, marginBottom: 4 },
  achListDate: { color: Colors.accent, fontSize: Typography.size.xs, fontWeight: '600' },
  achListLocked: { color: Colors.textMuted, fontSize: Typography.size.xs, fontWeight: '600' },
  achRewards: { alignItems: 'flex-end', gap: 2 },
  achRewardXp: { color: Colors.primary, fontSize: Typography.size.xs, fontWeight: '700' },
  achRewardCoin: { color: Colors.coin, fontSize: Typography.size.xs, fontWeight: '700' },
});
