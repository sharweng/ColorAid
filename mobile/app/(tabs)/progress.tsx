import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, FlatList, SafeAreaView, Dimensions,
} from 'react-native';
import { progressApi, achievementsApi, type Achievement } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

const SW = Dimensions.get('window').width;

type SortOrder = 'latest' | 'earliest';
type ChartTab = 'accuracy' | 'difficulty' | 'assessment';
type GameFilter = 'all' | 'color_match' | 'hue_hunt' | 'shade_spectrum' | 'color_sort';

const GAME_COLORS: Record<string, string> = {
  color_match:    Colors.primary,
  hue_hunt:       Colors.accent,
  shade_spectrum: '#FF9500',
  color_sort:     '#FF6B6B',
  all:            Colors.primary,
};
const GAME_LABELS: Record<string, string> = {
  color_match:    'Color Match',
  hue_hunt:       'Hue Hunt',
  shade_spectrum: 'Shade Spectrum',
  color_sort:     'Color Sort',
};
const GAME_EMOJIS: Record<string, string> = {
  color_match: '🎨', hue_hunt: '🔍', shade_spectrum: '🌈', color_sort: '🗂️',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Session {
  completedAt: string;
  accuracyPct: number;
  gameType: string;
  difficultyLevel: number;
  score?: number;
}
interface Assessment {
  completedAt: string;
  cvdType: string;
  correctPlates: number;
  totalPlates: number;
}

// ─── Mini custom bar chart component ─────────────────────────────────────────

function BarChart({
  data, color, labelKey, valueKey, maxVal = 100, height = 100, showValues = true,
}: {
  data: Array<Record<string, any>>;
  color: string;
  labelKey: string;
  valueKey: string;
  maxVal?: number;
  height?: number;
  showValues?: boolean;
}) {
  if (!data.length) return <Text style={emptyStyle}>No data yet</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
      {data.map((item, i) => {
        const val = Number(item[valueKey]) || 0;
        const pct = maxVal > 0 ? Math.min(val / maxVal, 1) : 0;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${Math.max(pct * 100, 2)}%` as any, backgroundColor: color, borderRadius: 4, minHeight: 4 }} />
            </View>
            {showValues && <Text style={barLabelStyle}>{typeof val === 'number' ? val.toFixed(0) : val}</Text>}
            {item[labelKey] ? <Text style={[barLabelStyle, { color: Colors.textMuted, fontSize: 8 }]} numberOfLines={1}>{item[labelKey]}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const barLabelStyle: any = { fontSize: 9, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' };
const emptyStyle: any = { color: Colors.textMuted, fontSize: Typography.size.sm, textAlign: 'center', paddingVertical: Spacing.lg };

// ─── Line chart (pure RN — no SVG lib needed) ────────────────────────────────

function LineChart({ values, color, height = 90 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return <Text style={emptyStyle}>Not enough data</Text>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = SW - Spacing.base * 2 - Spacing.md * 2 - 4;
  const stepX = w / (values.length - 1);

  // Build polyline points
  const points = values.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * (height - 10) - 5,
  }));

  return (
    <View style={{ height, width: '100%', position: 'relative' }}>
      {/* Grid lines at 25, 50, 75, 100% */}
      {[0, 25, 50, 75, 100].map(pct => {
        const y = height - (pct / 100) * (height - 10) - 5;
        return (
          <View key={pct} style={{
            position: 'absolute', left: 0, right: 0, top: y,
            height: 1, backgroundColor: Colors.border, opacity: 0.5,
          }} />
        );
      })}
      {/* Connecting lines between points */}
      {points.slice(0, -1).map((pt, i) => {
        const next = points[i + 1];
        const dx = next.x - pt.x;
        const dy = next.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View key={i} style={{
            position: 'absolute',
            left: pt.x,
            top: pt.y,
            width: len,
            height: 2,
            backgroundColor: color,
            transformOrigin: 'left center',
            transform: [{ rotate: `${angle}deg` }],
          }} />
        );
      })}
      {/* Dots */}
      {points.map((pt, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: pt.x - 5,
          top: pt.y - 5,
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: color,
          borderWidth: 2, borderColor: Colors.surface,
        }} />
      ))}
      {/* Value labels for first and last */}
      <Text style={{ position: 'absolute', left: 0, top: points[0].y - 16, fontSize: 9, color: Colors.textSecondary }}>
        {values[0].toFixed(0)}%
      </Text>
      <Text style={{ position: 'absolute', right: 0, top: points[points.length - 1].y - 16, fontSize: 9, color: Colors.textSecondary }}>
        {values[values.length - 1].toFixed(0)}%
      </Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [progressData, setProgressData] = useState<{
    recentActivity: { sessionsLast7Days: number; avgAccuracyLast7Days: number };
    trainingSessions: Session[];
    assessments: Assessment[];
  } | null>(null);
  const [achievements, setAchievements] = useState<{
    achievements: Achievement[]; unlockedCount: number; totalCount: number
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal/chart state
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sessionSort, setSessionSort] = useState<SortOrder>('latest');
  const [sessionGameFilter, setSessionGameFilter] = useState<GameFilter>('all');
  const [showAllAssessments, setShowAllAssessments] = useState(false);
  const [assessmentSort, setAssessmentSort] = useState<SortOrder>('latest');
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [chartTab, setChartTab] = useState<ChartTab>('accuracy');
  const [chartGameFilter, setChartGameFilter] = useState<GameFilter>('all');

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

  // useFocusEffect covers both initial mount and every subsequent focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const recent = progressData?.recentActivity;
  const allSessions: Session[] = progressData?.trainingSessions ?? [];
  const allAssessments = [...(progressData?.assessments ?? [])].reverse();

  // Recent sessions card (last 7)
  const recentSessions = allSessions.slice(-7);

  // Sessions modal filtering/sorting
  const filteredSessions = sessionGameFilter === 'all'
    ? allSessions
    : allSessions.filter(s => s.gameType === sessionGameFilter);
  const sortedSessions = sessionSort === 'latest'
    ? [...filteredSessions].reverse()
    : filteredSessions;
  const sortedAssessments = assessmentSort === 'latest'
    ? allAssessments
    : [...allAssessments].reverse();
  const previewAssessments = allAssessments.slice(0, 3);

  // Chart data
  const chartSessions = chartGameFilter === 'all'
    ? allSessions
    : allSessions.filter(s => s.gameType === chartGameFilter);
  const chartAccuracyData = chartSessions.slice(-15).map((s, i) => ({
    label: new Date(s.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: Math.round(s.accuracyPct),
    game: s.gameType,
  }));
  const chartDiffData = chartSessions.slice(-15).map((s, i) => ({
    label: new Date(s.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: s.difficultyLevel,
  }));
  const assessmentScores = allAssessments.slice().reverse().slice(-10).map((a, i) => ({
    label: new Date(a.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0,
  }));

  // Per-game stats
  const gameStats = (['color_match', 'hue_hunt', 'shade_spectrum', 'color_sort'] as GameFilter[]).map(g => {
    const gs = allSessions.filter(s => s.gameType === g);
    return {
      game: g,
      count: gs.length,
      avg: gs.length ? Math.round(gs.reduce((a, s) => a + s.accuracyPct, 0) / gs.length) : 0,
    };
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
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

      {/* Recent Sessions bar chart */}
      {recentSessions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Recent Sessions</Text>
            <TouchableOpacity onPress={() => setShowAllSessions(true)}>
              <Text style={styles.seeAllBtn}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.barChart}>
            {recentSessions.map((s, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barOuter}>
                  <View style={[styles.barFill,
                    { height: `${s.accuracyPct}%` as any, backgroundColor: GAME_COLORS[s.gameType] ?? Colors.primary }]} />
                </View>
                <Text style={styles.barLabel}>{s.accuracyPct.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
          <Text style={styles.chartNote}>Accuracy per session (last {recentSessions.length}) · color = game type</Text>
        </View>
      )}

      {/* Per-game stats summary */}
      {allSessions.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Game Performance</Text>
            <TouchableOpacity onPress={() => setShowCharts(true)}>
              <Text style={styles.seeAllBtn}>View Charts</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gameStatsGrid}>
            {gameStats.map(gs => (
              <View key={gs.game} style={[styles.gameStatBox, { borderTopColor: GAME_COLORS[gs.game] }]}>
                <Text style={styles.gameStatEmoji}>{GAME_EMOJIS[gs.game]}</Text>
                <Text style={[styles.gameStatAvg, { color: GAME_COLORS[gs.game] }]}>
                  {gs.count > 0 ? `${gs.avg}%` : '—'}
                </Text>
                <Text style={styles.gameStatLbl}>{GAME_LABELS[gs.game]}</Text>
                <Text style={styles.gameStatCount}>{gs.count} sessions</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Assessment History */}
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
              <View style={styles.assessScoreBox}>
                <Text style={styles.assessScore}>{a.correctPlates}/{a.totalPlates}</Text>
                <Text style={styles.assessPct}>
                  {a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0}%
                </Text>
              </View>
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

      {/* ── ALL SESSIONS MODAL ───────────────────────────────────────────── */}
      <Modal visible={showAllSessions} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>All Training Sessions</Text>
            <TouchableOpacity onPress={() => setShowAllSessions(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort:</Text>
            {(['latest', 'earliest'] as SortOrder[]).map(opt => (
              <TouchableOpacity key={opt}
                style={[styles.filterBtn, sessionSort === opt && styles.filterBtnOn]}
                onPress={() => setSessionSort(opt)}>
                <Text style={[styles.filterBtnTxt, sessionSort === opt && styles.filterBtnTxtOn]}>
                  {opt === 'latest' ? 'Latest' : 'Earliest'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.filterScrollRow}
            contentContainerStyle={{ gap: Spacing.xs, paddingHorizontal: Spacing.base, alignItems: 'center' }}>
            {(['all', 'color_match', 'hue_hunt', 'shade_spectrum', 'color_sort'] as GameFilter[]).map(g => (
              <TouchableOpacity key={g}
                style={[styles.filterBtn, sessionGameFilter === g && { ...styles.filterBtnOn, backgroundColor: GAME_COLORS[g], borderColor: GAME_COLORS[g] }]}
                onPress={() => setSessionGameFilter(g)}>
                <Text style={[styles.filterBtnTxt, sessionGameFilter === g && styles.filterBtnTxtOn]}>
                  {g === 'all' ? '🎯 All' : `${GAME_EMOJIS[g]} ${GAME_LABELS[g]}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterResultCount}>{filteredSessions.length} sessions</Text>

          <FlatList
            style={{ flex: 1 }}
            data={sortedSessions}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.modalList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item: s }) => (
              <View style={styles.sessionRow}>
                <View style={[styles.sessionDot, { backgroundColor: GAME_COLORS[s.gameType] ?? Colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionGame}>{GAME_EMOJIS[s.gameType] ?? '🎮'} {GAME_LABELS[s.gameType] ?? s.gameType}</Text>
                  <Text style={styles.assessDate}>
                    {s.completedAt ? new Date(s.completedAt).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    }) : ''}
                  </Text>
                </View>
                <View style={styles.assessScoreBox}>
                  <Text style={[styles.assessScore, { color: GAME_COLORS[s.gameType] ?? Colors.primary }]}>
                    {s.accuracyPct.toFixed(0)}%
                  </Text>
                  <Text style={styles.assessPct}>Diff. {s.difficultyLevel}</Text>
                </View>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* ── CHARTS MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={showCharts} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Analytics</Text>
            <TouchableOpacity onPress={() => setShowCharts(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Chart tab selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.filterScrollRow} contentContainerStyle={{ gap: Spacing.xs, paddingHorizontal: Spacing.base, alignItems: 'center' }}>
            {([
              { id: 'accuracy' as ChartTab, label: '📈 Accuracy Trend' },
              { id: 'difficulty' as ChartTab, label: '🎯 Difficulty' },
              { id: 'assessment' as ChartTab, label: '👁️ Assessments' },
            ]).map(t => (
              <TouchableOpacity key={t.id}
                style={[styles.filterBtn, chartTab === t.id && styles.filterBtnOn]}
                onPress={() => setChartTab(t.id)}>
                <Text style={[styles.filterBtnTxt, chartTab === t.id && styles.filterBtnTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.modalList, { gap: Spacing.md }]}>

            {/* Accuracy trend chart */}
            {chartTab === 'accuracy' && (
              <>
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Accuracy Over Time</Text>
                  <Text style={styles.chartCardSub}>Last 15 sessions</Text>
                  {/* Game filter */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ height: 44, marginBottom: Spacing.md, flexGrow: 0, flexShrink: 0 }}
                    contentContainerStyle={{ gap: Spacing.xs, alignItems: 'center' }}>
                    {(['all', 'color_match', 'hue_hunt', 'shade_spectrum', 'color_sort'] as GameFilter[]).map(g => (
                      <TouchableOpacity key={g}
                        style={[styles.filterBtn,
                          chartGameFilter === g && { ...styles.filterBtnOn, backgroundColor: GAME_COLORS[g], borderColor: GAME_COLORS[g] }]}
                        onPress={() => setChartGameFilter(g)}>
                        <Text style={[styles.filterBtnTxt, { fontSize: 10 }, chartGameFilter === g && styles.filterBtnTxtOn]}>
                          {g === 'all' ? 'All' : GAME_LABELS[g]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {chartAccuracyData.length >= 2
                    ? <LineChart values={chartAccuracyData.map(d => d.value)} color={GAME_COLORS[chartGameFilter]} height={110} />
                    : <Text style={emptyStyle}>Play at least 2 sessions to see the trend</Text>}
                  {/* Percentage axis labels */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs }}>
                    {['0%', '25%', '50%', '75%', '100%'].map(l => (
                      <Text key={l} style={{ fontSize: 8, color: Colors.textMuted }}>{l}</Text>
                    ))}
                  </View>
                </View>

                {/* Per-game breakdown bars */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Avg Accuracy by Game</Text>
                  <Text style={styles.chartCardSub}>All-time average per game type</Text>
                  <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
                    {gameStats.map(gs => (
                      <View key={gs.game}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: Typography.size.sm, color: Colors.textPrimary, fontWeight: '600' }}>
                            {GAME_EMOJIS[gs.game]} {GAME_LABELS[gs.game]}
                          </Text>
                          <Text style={{ fontSize: Typography.size.sm, color: GAME_COLORS[gs.game], fontWeight: '700' }}>
                            {gs.count > 0 ? `${gs.avg}%` : 'No data'}
                          </Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ width: `${gs.avg}%` as any, height: '100%', backgroundColor: GAME_COLORS[gs.game], borderRadius: 4 }} />
                        </View>
                        <Text style={{ fontSize: 9, color: Colors.textMuted, marginTop: 2 }}>{gs.count} sessions</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* Difficulty progression chart */}
            {chartTab === 'difficulty' && (
              <>
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Difficulty Progression</Text>
                  <Text style={styles.chartCardSub}>How your difficulty level has changed</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ height: 44, marginBottom: Spacing.md, flexGrow: 0, flexShrink: 0 }}
                    contentContainerStyle={{ gap: Spacing.xs, alignItems: 'center' }}>
                    {(['all', 'color_match', 'hue_hunt', 'shade_spectrum', 'color_sort'] as GameFilter[]).map(g => (
                      <TouchableOpacity key={g}
                        style={[styles.filterBtn,
                          chartGameFilter === g && { ...styles.filterBtnOn, backgroundColor: GAME_COLORS[g], borderColor: GAME_COLORS[g] }]}
                        onPress={() => setChartGameFilter(g)}>
                        <Text style={[styles.filterBtnTxt, { fontSize: 10 }, chartGameFilter === g && styles.filterBtnTxtOn]}>
                          {g === 'all' ? 'All' : GAME_LABELS[g]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <BarChart
                    data={chartDiffData}
                    color={GAME_COLORS[chartGameFilter]}
                    labelKey="label"
                    valueKey="value"
                    maxVal={10}
                    height={100}
                  />
                  <Text style={styles.chartNote}>Difficulty 1–10 · last 15 sessions</Text>
                </View>

                {/* Best difficulty per game */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Best Difficulty Reached</Text>
                  <Text style={styles.chartCardSub}>Highest difficulty played per game</Text>
                  {(['color_match', 'hue_hunt', 'shade_spectrum', 'color_sort'] as GameFilter[]).map(g => {
                    const gs = allSessions.filter(s => s.gameType === g);
                    const best = gs.length ? Math.max(...gs.map(s => s.difficultyLevel)) : 0;
                    return (
                      <View key={g} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                        <Text style={{ fontSize: 20, marginRight: Spacing.sm }}>{GAME_EMOJIS[g]}</Text>
                        <Text style={{ flex: 1, fontSize: Typography.size.sm, color: Colors.textPrimary, fontWeight: '600' }}>
                          {GAME_LABELS[g]}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 3 }}>
                          {Array.from({ length: 10 }, (_, i) => (
                            <View key={i} style={{
                              width: 14, height: 14, borderRadius: 2,
                              backgroundColor: i < best ? GAME_COLORS[g] : Colors.surfaceAlt,
                            }} />
                          ))}
                        </View>
                        <Text style={{ marginLeft: Spacing.xs, fontSize: Typography.size.xs, color: GAME_COLORS[g], fontWeight: '700', minWidth: 28 }}>
                          {best > 0 ? `${best}/10` : '—'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Assessment chart */}
            {chartTab === 'assessment' && (
              <>
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Assessment Score Trend</Text>
                  <Text style={styles.chartCardSub}>Correct plates % over time</Text>
                  {assessmentScores.length >= 2
                    ? <LineChart values={assessmentScores.map(a => a.value)} color={Colors.info} height={110} />
                    : <Text style={emptyStyle}>Complete at least 2 assessments to see a trend</Text>}
                </View>

                {/* CVD type distribution */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>CVD Diagnosis History</Text>
                  <Text style={styles.chartCardSub}>Results from all assessments</Text>
                  {(() => {
                    const counts: Record<string, number> = {};
                    (progressData?.assessments ?? []).forEach(a => {
                      const k = formatCvdType(a.cvdType);
                      counts[k] = (counts[k] ?? 0) + 1;
                    });
                    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    const total = entries.reduce((s, [, n]) => s + n, 0);
                    return entries.length === 0 ? (
                      <Text style={emptyStyle}>No assessments yet</Text>
                    ) : (
                      <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
                        {entries.map(([type, count]) => (
                          <View key={type}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: Typography.size.sm, color: Colors.textPrimary, fontWeight: '600' }}>{type}</Text>
                              <Text style={{ fontSize: Typography.size.sm, color: Colors.info, fontWeight: '700' }}>
                                {count}× ({Math.round((count / total) * 100)}%)
                              </Text>
                            </View>
                            <View style={{ height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
                              <View style={{ width: `${(count / total) * 100}%` as any, height: '100%', backgroundColor: Colors.info, borderRadius: 4 }} />
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>

                {/* Assessment score details */}
                <View style={styles.chartCard}>
                  <Text style={styles.chartCardTitle}>Score Breakdown</Text>
                  {assessmentScores.length > 0 ? (
                    <BarChart
                      data={assessmentScores}
                      color={Colors.info}
                      labelKey="label"
                      valueKey="value"
                      maxVal={100}
                      height={100}
                    />
                  ) : <Text style={emptyStyle}>No assessments yet</Text>}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── ALL ASSESSMENTS MODAL ────────────────────────────────────────── */}
      <Modal visible={showAllAssessments} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assessment History</Text>
            <TouchableOpacity onPress={() => setShowAllAssessments(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort by:</Text>
            {(['latest', 'earliest'] as SortOrder[]).map(opt => (
              <TouchableOpacity key={opt}
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
                  <Text style={[styles.achListTitle, !a.unlocked && styles.achListTitleLocked]}>{a.title}</Text>
                  <Text style={styles.achListDesc}>{achDescription(a.key, a.description)}</Text>
                  {a.unlocked && a.unlockedAt && (
                    <Text style={styles.achListDate}>Unlocked {new Date(a.unlockedAt).toLocaleDateString()}</Text>
                  )}
                  {!a.unlocked && <Text style={styles.achListLocked}>🔒 Locked</Text>}
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
    first_assessment: '👁️', assessment_veteran: '🔬', first_game: '🎮',
    training_enthusiast: '🏃', training_master: '🏆', week_streak: '🔥',
    level_5: '⭐', level_10: '👑', color_match_dedicated: '🎨',
    hue_hunt_dedicated: '🔍', shade_spectrum_dedicated: '🌈', color_sort_dedicated: '🗂️',
  };
  return map[key] ?? '🏅';
}

function achDescription(key: string, fallback: string): string {
  const map: Record<string, string> = {
    first_assessment: 'Take your very first color vision assessment to earn this.',
    assessment_veteran: 'Complete 5 color vision assessments to prove your dedication.',
    first_game: 'Finish any training game for the first time.',
    training_enthusiast: 'Complete 10 training sessions total across any game type.',
    training_master: "Complete 50 training sessions — you're a true color master!",
    week_streak: 'Train every day for 7 consecutive days without missing a day.',
    level_5: 'Earn enough XP to reach Level 5 on your ColorAid journey.',
    level_10: 'Reach Level 10 — the mark of a dedicated Color Champion.',
    color_match_dedicated: 'Play Color Match at least 5 times to sharpen exact-match skills.',
    hue_hunt_dedicated: 'Play Hue Hunt at least 5 times to master finding the odd hue.',
    shade_spectrum_dedicated: 'Play Shade Spectrum at least 5 times to master light-to-dark ordering.',
    color_sort_dedicated: 'Play Color Sort at least 5 times to become a category expert.',
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
  barFill: { width: '100%', borderRadius: Radius.sm },
  barLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  chartNote: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },
  gameStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  gameStatBox: { width: '47%', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: Spacing.sm, borderTopWidth: 3, alignItems: 'center', justifyContent: 'center' },
  gameStatEmoji: { fontSize: 22, marginBottom: 2 },
  gameStatAvg: { fontSize: Typography.size.lg, fontWeight: '800' },
  gameStatLbl: { fontSize: 9, color: Colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  gameStatCount: { fontSize: 9, color: Colors.textMuted },
  assessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  assessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  assessType: { fontWeight: '600', color: Colors.textPrimary, textTransform: 'capitalize', fontSize: Typography.size.sm },
  assessDate: { color: Colors.textMuted, fontSize: Typography.size.xs },
  assessScore: { fontWeight: '700', color: Colors.primary, fontSize: Typography.size.sm },
  assessScoreBox: { alignItems: 'flex-end' },
  assessPct: { color: Colors.textMuted, fontSize: Typography.size.xs },
  moreBtn: { marginTop: Spacing.sm, padding: Spacing.sm, alignItems: 'center' },
  moreBtnText: { color: Colors.primary, fontWeight: '600', fontSize: Typography.size.sm },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  achItem: { width: '31%', backgroundColor: Colors.primaryBg, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, paddingBottom: Spacing.sm },
  filterScrollRow: { height: 44, paddingHorizontal: 0, flexGrow: 0, flexShrink: 0 },
  filterLabel: { color: Colors.textSecondary, fontSize: Typography.size.sm, fontWeight: '600' },
  filterBtn: { height: 32, paddingHorizontal: Spacing.md, paddingVertical: 0, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  filterBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterBtnTxt: { fontSize: Typography.size.xs, fontWeight: '700', color: Colors.textSecondary },
  filterBtnTxtOn: { color: Colors.textInverted },
  filterResultCount: { color: Colors.textMuted, fontSize: Typography.size.xs, paddingHorizontal: Spacing.base, paddingBottom: Spacing.xs },
  modalAssessRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionGame: { fontWeight: '600', color: Colors.textPrimary, fontSize: Typography.size.sm },

  // Charts
  chartCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.sm },
  chartCardTitle: { fontSize: Typography.size.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  chartCardSub: { fontSize: Typography.size.xs, color: Colors.textMuted, marginBottom: Spacing.md },

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
  achListIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
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
