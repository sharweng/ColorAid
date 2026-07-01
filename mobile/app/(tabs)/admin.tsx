/**
 * admin.tsx — ColorAid Administrator Panel
 * Charts built with react-native-svg (no third-party chart kit needed).
 * Tabs: Dashboard | Users | Analytics
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  SafeAreaView,
  Platform,
  StatusBar,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, {
  Path,
  Line,
  Rect,
  Circle,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  adminApi,
  type AdminStats,
  type AdminUser,
  type AdminAnalytics,
} from '../../src/services/api';
import { Colors, Spacing, Radius, Shadow } from '../../src/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.base * 2 - 24; // card padding

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  primary:   '#6C63FF',
  accent:    '#00C9A7',
  info:      '#0A84FF',
  warning:   '#FF9500',
  error:     '#FF453A',
  coin:      '#FFB800',
  text:      '#1A1B2E',
  textSec:   '#6B7280',
  textMut:   '#9CA3AF',
  border:    '#E2E4F0',
  surface:   '#FFFFFF',
  bg:        '#F7F8FC',
};

const CVD_COLORS: Record<string, string> = {
  normal:        C.accent,
  protanopia:    C.info,
  protanomaly:   '#4CAAFF',
  deuteranopia:  C.warning,
  deuteranomaly: '#FFBB55',
  tritanopia:    C.error,
  tritanomaly:   '#FF7B76',
  achromatopsia: '#8E8E93',
  unknown:       '#C7C7CC',
};

const GAME_LABELS: Record<string, string> = {
  color_match:    'Color Match',
  hue_hunt:       'Hue Hunt',
  shade_spectrum: 'Shade Spectrum',
  color_sort:     'Color Sort',
};

const GAME_COLORS = [C.primary, C.accent, C.warning, C.error];

// ─── SVG Chart Components ─────────────────────────────────────────────────────

/** Smooth line chart from an array of numbers */
function LineChartSvg({
  data,
  color,
  height = 140,
  labels,
}: {
  data: number[];
  color: string;
  height?: number;
  labels?: string[];
}) {
  if (!data || data.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textMut, fontSize: 12 }}>Not enough data yet</Text>
      </View>
    );
  }

  const W = CHART_W;
  const H = height;
  const PAD_LEFT = 28;
  const PAD_RIGHT = 8;
  const PAD_TOP = 10;
  const PAD_BOTTOM = labels ? 28 : 16;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const max = Math.max(...data, 1);
  const min = 0;

  const toX = (i: number) => PAD_LEFT + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => PAD_TOP + innerH - ((v - min) / (max - min)) * innerH;

  // Build smooth path using cubic bezier
  let d = `M ${toX(0)} ${toY(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const x0 = toX(i - 1), y0 = toY(data[i - 1]);
    const x1 = toX(i),     y1 = toY(data[i]);
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }

  // Area fill path
  const areaD = `${d} L ${toX(data.length - 1)} ${PAD_TOP + innerH} L ${PAD_LEFT} ${PAD_TOP + innerH} Z`;

  // Y-axis gridlines (3 levels)
  const gridVals = [0, Math.round(max / 2), max];

  // Sparse x-axis labels: ~5 evenly spaced
  const labelIndices = labels
    ? [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor((3 * data.length) / 4), data.length - 1]
    : [];

  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Gridlines */}
      {gridVals.map(v => (
        <G key={v}>
          <Line
            x1={PAD_LEFT} y1={toY(v)}
            x2={W - PAD_RIGHT} y2={toY(v)}
            stroke={C.border} strokeWidth="1" strokeDasharray="4 3"
          />
          <SvgText
            x={PAD_LEFT - 4} y={toY(v) + 4}
            fontSize="9" fill={C.textMut}
            textAnchor="end"
          >
            {v}
          </SvgText>
        </G>
      ))}

      {/* Area */}
      <Path d={areaD} fill={`url(#grad-${color})`} />

      {/* Line */}
      <Path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* X-axis labels */}
      {labels && labelIndices.map(i => (
        <SvgText
          key={i}
          x={toX(i)} y={H - 6}
          fontSize="9" fill={C.textMut}
          textAnchor="middle"
        >
          {labels[i]}
        </SvgText>
      ))}
    </Svg>
  );
}

/** Vertical bar chart */
function BarChartSvg({
  values,
  labels,
  colors,
  height = 160,
}: {
  values: number[];
  labels: string[];
  colors: string[];
  height?: number;
}) {
  if (!values.length) return null;

  const W = CHART_W;
  const H = height;
  const PAD_LEFT = 28;
  const PAD_RIGHT = 8;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 36;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const max = Math.max(...values, 1);
  const barW = Math.min(40, (innerW / values.length) * 0.55);
  const gap = innerW / values.length;

  return (
    <Svg width={W} height={H}>
      {/* Gridlines */}
      {[0, Math.round(max / 2), max].map(v => (
        <G key={v}>
          <Line
            x1={PAD_LEFT} y1={PAD_TOP + innerH - (v / max) * innerH}
            x2={W - PAD_RIGHT} y2={PAD_TOP + innerH - (v / max) * innerH}
            stroke={C.border} strokeWidth="1" strokeDasharray="4 3"
          />
          <SvgText
            x={PAD_LEFT - 4}
            y={PAD_TOP + innerH - (v / max) * innerH + 4}
            fontSize="9" fill={C.textMut} textAnchor="end"
          >
            {v}
          </SvgText>
        </G>
      ))}

      {/* Bars */}
      {values.map((v, i) => {
        const x = PAD_LEFT + i * gap + gap / 2 - barW / 2;
        const barH = (v / max) * innerH;
        const y = PAD_TOP + innerH - barH;
        const col = colors[i % colors.length];
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} rx="4" fill={col} />
            {v > 0 && (
              <SvgText x={x + barW / 2} y={y - 4} fontSize="9" fill={col} textAnchor="middle" fontWeight="bold">
                {v}
              </SvgText>
            )}
            <SvgText
              x={x + barW / 2}
              y={H - 6}
              fontSize="9"
              fill={C.textMut}
              textAnchor="middle"
            >
              {labels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Donut/pie chart */
function DonutChartSvg({
  data,
  size = 160,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return (
      <View style={{ height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textMut, fontSize: 12 }}>No assessment data yet</Text>
      </View>
    );
  }

  const R = size / 2;
  const r = R * 0.58; // inner radius for donut
  const cx = R, cy = R;

  let startAngle = -Math.PI / 2;
  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const ix1 = cx + r * Math.cos(endAngle);
    const iy1 = cy + r * Math.sin(endAngle);
    const ix2 = cx + r * Math.cos(startAngle);
    const iy2 = cy + r * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const pathD = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');
    const slice = { ...d, pathD };
    startAngle = endAngle;
    return slice;
  });

  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => (
        <Path key={i} d={s.pathD} fill={s.color} />
      ))}
      {/* Centre text */}
      <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="bold" fill={C.text}>
        {total}
      </SvgText>
      <SvgText x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill={C.textMut}>
        total
      </SvgText>
    </Svg>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

type AdminTab = 'dashboard' | 'users' | 'analytics';

function KpiCard({
  label,
  value,
  sub,
  accentColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentColor: string;
}) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: accentColor }]}>
      <Text style={[styles.kpiValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: isActive ? C.accent + '1A' : C.error + '1A' }]}>
      <View style={[styles.pillDot, { backgroundColor: isActive ? C.accent : C.error }]} />
      <Text style={[styles.pillText, { color: isActive ? C.accent : C.error }]}>
        {isActive ? 'Active' : 'Deactivated'}
      </Text>
    </View>
  );
}

function RolePill({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.pill, { backgroundColor: isAdmin ? C.primary + '1A' : C.border }]}>
      <Text style={[styles.pillText, { color: isAdmin ? C.primary : C.textMut }]}>
        {isAdmin ? 'Admin' : 'User'}
      </Text>
    </View>
  );
}

// ─── PDF helpers ──────────────────────────────────────────────────────────────

function tinyBar(value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:1;background:#E2E4F0;border-radius:4px;height:8px;overflow:hidden">
      <div style="width:${pct}%;background:${color};height:100%;border-radius:4px"></div>
    </div>
    <span style="width:28px;text-align:right;font-size:11px;color:#6B7280">${value}</span>
  </div>`;
}

async function generateDashboardPdf(stats: AdminStats): Promise<void> {
  const now = new Date().toLocaleString();
  const sessRate = stats.sessions.total > 0 ? Math.round(stats.sessions.completed / stats.sessions.total * 100) : 0;
  const assRate  = stats.assessments.total > 0 ? Math.round(stats.assessments.completed / stats.assessments.total * 100) : 0;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       margin:0;padding:36px;color:#1A1B2E;background:#F7F8FC}
  h1{color:#6C63FF;font-size:22px;margin:0 0 4px}
  .sub{color:#9CA3AF;font-size:12px;margin-bottom:28px}
  h2{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;
     letter-spacing:.8px;margin:28px 0 10px;padding-bottom:6px;
     border-bottom:1px solid #E2E4F0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px}
  .card{background:#fff;border-radius:10px;padding:18px 22px;
        border-top:3px solid #6C63FF;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .val{font-size:32px;font-weight:800;margin-bottom:4px}
  .lbl{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px}
  .note{font-size:11px;color:#9CA3AF;margin-top:3px}
  .foot{margin-top:36px;font-size:10px;color:#9CA3AF;text-align:center;
        border-top:1px solid #E2E4F0;padding-top:12px}
</style></head><body>
<h1>ColorAid — Dashboard Report</h1>
<p class="sub">Generated: ${now}</p>

<h2>User Accounts</h2>
<div class="grid">
  <div class="card"><div class="val" style="color:#6C63FF">${stats.users.total}</div><div class="lbl">Total Users</div></div>
  <div class="card"><div class="val" style="color:#00C9A7">${stats.users.active}</div><div class="lbl">Active</div></div>
  <div class="card"><div class="val" style="color:#FF453A">${stats.users.deactivated}</div><div class="lbl">Deactivated</div></div>
  <div class="card"><div class="val" style="color:#FF9500">${stats.users.admins}</div><div class="lbl">Administrators</div></div>
</div>

<h2>Training Sessions</h2>
<div class="grid">
  <div class="card"><div class="val" style="color:#0A84FF">${stats.sessions.total}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="val" style="color:#00C9A7">${stats.sessions.completed}</div><div class="lbl">Completed</div><div class="note">${sessRate}% completion rate</div></div>
</div>

<h2>Assessments</h2>
<div class="grid">
  <div class="card"><div class="val" style="color:#0A84FF">${stats.assessments.total}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="val" style="color:#00C9A7">${stats.assessments.completed}</div><div class="lbl">Completed</div><div class="note">${assRate}% completion rate</div></div>
</div>

<h2>Economy</h2>
<div class="grid">
  <div class="card"><div class="val" style="color:#FFB800">${stats.coinsInCirculation.toLocaleString()}</div><div class="lbl">Coins in Circulation</div></div>
</div>

<p class="foot">ColorAid Administrator Report &nbsp;|&nbsp; Confidential</p>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Dashboard Report' });
}

async function generateAnalyticsPdf(data: AdminAnalytics): Promise<void> {
  const now = new Date().toLocaleString();
  const totalNewUsers   = data.usersPerDay.reduce((a, b) => a + b, 0);
  const totalSessions   = data.sessionsPerDay.reduce((a, b) => a + b, 0);
  const totalAssessments = data.assessmentsPerDay.reduce((a, b) => a + b, 0);
  const nonZeroAcc      = data.avgAccuracyPerDay.filter(v => v > 0);
  const avgAcc          = nonZeroAcc.length
    ? (nonZeroAcc.reduce((a, b) => a + b, 0) / nonZeroAcc.length).toFixed(1)
    : '—';

  const maxCvd  = Math.max(...data.cvdDistribution.map(d => d.count), 1);
  const maxGame = Math.max(...data.gameBreakdown.map(d => d.count), 1);

  const cvdRows = data.cvdDistribution
    .sort((a, b) => b.count - a.count)
    .map(d => `<tr>
      <td>${d.type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
      <td>${tinyBar(d.count, maxCvd, CVD_COLORS[d.type] ?? C.primary)}</td>
      <td style="text-align:center;font-weight:600">${d.count}</td>
    </tr>`).join('');

  const gameRows = data.gameBreakdown
    .sort((a, b) => b.count - a.count)
    .map(d => `<tr>
      <td>${GAME_LABELS[d.gameType] ?? d.gameType}</td>
      <td>${tinyBar(d.count, maxGame, C.primary)}</td>
      <td style="text-align:center;font-weight:600">${d.count}</td>
      <td style="text-align:center;color:#00C9A7;font-weight:700">${d.avgAccuracy}%</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       margin:0;padding:36px;color:#1A1B2E;background:#F7F8FC}
  h1{color:#6C63FF;font-size:22px;margin:0 0 4px}
  .sub{color:#9CA3AF;font-size:12px;margin-bottom:28px}
  h2{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;
     letter-spacing:.8px;margin:28px 0 10px;padding-bottom:6px;
     border-bottom:1px solid #E2E4F0}
  .note{background:#EEF0FF;border-radius:8px;padding:10px 14px;font-size:11px;
        color:#4B44CC;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:4px}
  .card{background:#fff;border-radius:10px;padding:14px;
        border-top:3px solid #6C63FF;box-shadow:0 1px 4px rgba(0,0,0,.05);text-align:center}
  .val{font-size:24px;font-weight:800;color:#6C63FF}
  .lbl{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}
  th{text-align:left;padding:8px 12px;background:#EEF0FF;color:#6C63FF;font-weight:600;font-size:11px}
  td{padding:9px 12px;border-bottom:1px solid #E2E4F0;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .foot{margin-top:36px;font-size:10px;color:#9CA3AF;text-align:center;
        border-top:1px solid #E2E4F0;padding-top:12px}
</style></head><body>
<h1>ColorAid — Analytics Report (Last 30 Days)</h1>
<p class="sub">Generated: ${now}</p>
<p class="note">30-day window ending today. CVD distribution and game breakdown reflect all-time data.</p>

<h2>30-Day Summary</h2>
<div class="grid">
  <div class="card"><div class="val">${totalNewUsers}</div><div class="lbl">New Users</div></div>
  <div class="card"><div class="val" style="color:#0A84FF">${totalSessions}</div><div class="lbl">Sessions</div></div>
  <div class="card"><div class="val" style="color:#00C9A7">${totalAssessments}</div><div class="lbl">Assessments</div></div>
  <div class="card"><div class="val" style="color:#FF9500">${avgAcc}%</div><div class="lbl">Avg Accuracy</div></div>
</div>

<h2>CVD Type Distribution (All Time)</h2>
<table>
  <thead><tr><th>Condition</th><th style="width:200px">Distribution</th><th style="text-align:center;width:60px">Count</th></tr></thead>
  <tbody>${cvdRows || '<tr><td colspan="3" style="color:#9CA3AF;text-align:center;padding:20px">No assessment data yet</td></tr>'}</tbody>
</table>

<h2>Game Performance Breakdown (All Time)</h2>
<table>
  <thead><tr><th>Game</th><th style="width:160px">Sessions</th><th style="text-align:center;width:60px">Count</th><th style="text-align:center;width:90px">Avg Accuracy</th></tr></thead>
  <tbody>${gameRows || '<tr><td colspan="4" style="color:#9CA3AF;text-align:center;padding:20px">No session data yet</td></tr>'}</tbody>
</table>

<p class="foot">ColorAid Administrator Report &nbsp;|&nbsp; Confidential</p>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Analytics Report' });
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setStats(await adminApi.getStats()); }
    catch { Alert.alert('Error', 'Failed to load dashboard data.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleExport() {
    if (!stats) return;
    setExporting(true);
    try { await generateDashboardPdf(stats); }
    catch { Alert.alert('Error', 'Could not generate PDF.'); }
    finally { setExporting(false); }
  }

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} size="large" />;
  if (!stats) return null;

  const sessRate = stats.sessions.total > 0
    ? `${Math.round(stats.sessions.completed / stats.sessions.total * 100)}% completion rate`
    : 'No sessions yet';
  const assRate = stats.assessments.total > 0
    ? `${Math.round(stats.assessments.completed / stats.assessments.total * 100)}% completion rate`
    : 'No assessments yet';

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.primary} />}
    >
      <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
        {exporting
          ? <ActivityIndicator color={C.primary} size="small" />
          : <><Ionicons name="download-outline" size={15} color={C.primary} /><Text style={styles.exportBtnText}>Export PDF</Text></>
        }
      </TouchableOpacity>

      <SectionHeader title="User Accounts" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Total"          value={stats.users.total}       accentColor={C.primary} />
        <KpiCard label="Active"         value={stats.users.active}      accentColor={C.accent} />
        <KpiCard label="Deactivated"    value={stats.users.deactivated} accentColor={C.error} />
        <KpiCard label="Administrators" value={stats.users.admins}      accentColor={C.warning} />
      </View>

      <SectionHeader title="Training Sessions" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Total"     value={stats.sessions.total}     accentColor={C.info} />
        <KpiCard label="Completed" value={stats.sessions.completed} accentColor={C.accent} sub={sessRate} />
      </View>

      <SectionHeader title="Assessments" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Total"     value={stats.assessments.total}     accentColor={C.info} />
        <KpiCard label="Completed" value={stats.assessments.completed} accentColor={C.accent} sub={assRate} />
      </View>

      <SectionHeader title="Economy" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Coins in Circulation" value={stats.coinsInCirculation.toLocaleString()} accentColor={C.coin} />
      </View>
    </ScrollView>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (p = 1, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await adminApi.listUsers(p, 20, debouncedSearch);
      setUsers(data.users); setTotal(data.total);
      setTotalPages(data.totalPages); setPage(p);
    } catch { Alert.alert('Error', 'Failed to load users.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [debouncedSearch]);

  useFocusEffect(useCallback(() => { load(1); }, [load]));
  useEffect(() => { load(1); }, [debouncedSearch]);

  async function handleSetStatus(user: AdminUser, isActive: boolean) {
    setActionLoading(true);
    try {
      const updated = await adminApi.setUserStatus(user.id, isActive);
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
      setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
    } catch (err) { Alert.alert('Error', (err as Error).message); }
    finally { setActionLoading(false); }
  }

  async function handleSetRole(user: AdminUser, role: 'user' | 'admin') {
    setActionLoading(true);
    try {
      const updated = await adminApi.setUserRole(user.id, role);
      setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
      setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
    } catch (err) { Alert.alert('Error', (err as Error).message); }
    finally { setActionLoading(false); }
  }

  const renderUser = ({ item }: { item: AdminUser }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => setSelected(item)} activeOpacity={0.7}>
      <View style={styles.userInitial}>
        <Text style={styles.userInitialText}>{item.username[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userMeta}>
        <Text style={styles.userUsername}>@{item.username}</Text>
        <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
        <View style={styles.pillRow}>
          <RolePill role={item.role} />
          <StatusPill isActive={item.isActive} />
        </View>
      </View>
      <View style={styles.userRight}>
        <Text style={styles.userLevel}>Lv {item.level}</Text>
        <Ionicons name="chevron-forward" size={14} color="#C7C7CC" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.flex1}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={15} color={C.textMut} style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username or email"
          placeholderTextColor={C.textMut}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={C.textMut} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.resultCount}>{total} user{total !== 1 ? 's' : ''}</Text>

      {loading
        ? <ActivityIndicator style={styles.centred} color={C.primary} size="large" />
        : (
          <FlatList
            data={users}
            keyExtractor={u => u.id}
            renderItem={renderUser}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, true); }} tintColor={C.primary} />
            }
            ListFooterComponent={totalPages > 1 ? (
              <View style={styles.pager}>
                <TouchableOpacity disabled={page <= 1} onPress={() => load(page - 1)}
                  style={[styles.pageBtn, page <= 1 && { opacity: 0.35 }]}>
                  <Ionicons name="chevron-back" size={16} color={C.primary} />
                </TouchableOpacity>
                <Text style={styles.pageText}>{page} / {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => load(page + 1)}
                  style={[styles.pageBtn, page >= totalPages && { opacity: 0.35 }]}>
                  <Ionicons name="chevron-forward" size={16} color={C.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
          />
        )
      }

      {/* User detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.modalHero}>
                <View style={styles.modalInitial}>
                  <Text style={styles.modalInitialText}>{selected.username[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.modalUsername}>@{selected.username}</Text>
                <Text style={styles.modalEmail}>{selected.email}</Text>
                <View style={[styles.pillRow, { justifyContent: 'center', marginTop: 6 }]}>
                  <RolePill role={selected.role} />
                  <StatusPill isActive={selected.isActive} />
                </View>
              </View>

              <View style={styles.statsRow}>
                {[
                  { label: 'Level',  value: `${selected.level}` },
                  { label: 'XP',     value: selected.totalXp.toLocaleString() },
                  { label: 'Coins',  value: `${selected.coins}` },
                  { label: 'Streak', value: `${selected.streakDays}d` },
                ].map(s => (
                  <View key={s.label} style={styles.statCell}>
                    <Text style={styles.statVal}>{s.value}</Text>
                    <Text style={styles.statLbl}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.infoBlock}>
                {[
                  { label: 'Joined',            value: new Date(selected.createdAt).toLocaleDateString() },
                  selected.lastActiveAt ? { label: 'Last Active', value: new Date(selected.lastActiveAt).toLocaleDateString() } : null,
                  selected._count ? { label: 'Assessments',       value: `${selected._count.assessments}` } : null,
                  selected._count ? { label: 'Training Sessions',  value: `${selected._count.trainingSessions}` } : null,
                ].filter(Boolean).map(row => (
                  <View key={row!.label} style={styles.infoRow}>
                    <Text style={styles.infoLbl}>{row!.label}</Text>
                    <Text style={styles.infoVal}>{row!.value}</Text>
                  </View>
                ))}
              </View>

              {actionLoading
                ? <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} />
                : (
                  <View style={styles.actionStack}>
                    <Text style={styles.actionGroupLabel}>Account Status</Text>
                    {selected.isActive ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: C.error + '66', backgroundColor: C.error + '0D' }]}
                        onPress={() => Alert.alert(
                          'Deactivate Account',
                          `Deactivate @${selected.username}? They will be immediately logged out and cannot log in until reactivated.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Deactivate', style: 'destructive', onPress: () => handleSetStatus(selected, false) },
                          ]
                        )}
                      >
                        <Ionicons name="ban-outline" size={17} color={C.error} />
                        <Text style={[styles.actionBtnText, { color: C.error }]}>Deactivate Account</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: C.accent + '66', backgroundColor: C.accent + '0D' }]}
                        onPress={() => handleSetStatus(selected, true)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={17} color={C.accent} />
                        <Text style={[styles.actionBtnText, { color: C.accent }]}>Reactivate Account</Text>
                      </TouchableOpacity>
                    )}

                    <Text style={[styles.actionGroupLabel, { marginTop: 16 }]}>Role Management</Text>
                    {selected.role === 'admin' ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: C.warning + '66', backgroundColor: C.warning + '0D' }]}
                        onPress={() => Alert.alert(
                          'Revoke Administrator Role',
                          `Remove admin privileges from @${selected.username}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Revoke', style: 'destructive', onPress: () => handleSetRole(selected, 'user') },
                          ]
                        )}
                      >
                        <Ionicons name="shield-outline" size={17} color={C.warning} />
                        <Text style={[styles.actionBtnText, { color: C.warning }]}>Revoke Administrator Role</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: C.primary + '66', backgroundColor: C.primary + '0D' }]}
                        onPress={() => Alert.alert(
                          'Grant Administrator Role',
                          `Grant admin privileges to @${selected.username}? They will have full access to this panel.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Grant', onPress: () => handleSetRole(selected, 'admin') },
                          ]
                        )}
                      >
                        <Ionicons name="shield-checkmark-outline" size={17} color={C.primary} />
                        <Text style={[styles.actionBtnText, { color: C.primary }]}>Grant Administrator Role</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              }
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setData(await adminApi.getAnalytics()); }
    catch { Alert.alert('Error', 'Failed to load analytics.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try { await generateAnalyticsPdf(data); }
    catch { Alert.alert('Error', 'Could not generate PDF.'); }
    finally { setExporting(false); }
  }

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} size="large" />;
  if (!data) return null;

  const totalNewUsers    = data.usersPerDay.reduce((a, b) => a + b, 0);
  const totalSessions    = data.sessionsPerDay.reduce((a, b) => a + b, 0);
  const totalAssessments = data.assessmentsPerDay.reduce((a, b) => a + b, 0);
  const nonZeroAcc       = data.avgAccuracyPerDay.filter(v => v > 0);
  const avgAccLabel      = nonZeroAcc.length
    ? `${(nonZeroAcc.reduce((a, b) => a + b, 0) / nonZeroAcc.length).toFixed(1)}%`
    : '—';

  // CVD donut
  const cvdDonutData = data.cvdDistribution.map(d => ({
    label: d.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: d.count,
    color: CVD_COLORS[d.type] ?? '#C7C7CC',
  }));

  // Game bar chart
  const sortedGames = [...data.gameBreakdown].sort((a, b) => b.count - a.count);

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.primary} />}
    >
      <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
        {exporting
          ? <ActivityIndicator color={C.primary} size="small" />
          : <><Ionicons name="download-outline" size={15} color={C.primary} /><Text style={styles.exportBtnText}>Export PDF</Text></>
        }
      </TouchableOpacity>

      <SectionHeader title="30-Day Summary" />
      <View style={styles.kpiGrid}>
        <KpiCard label="New Users"    value={totalNewUsers}    accentColor={C.primary} />
        <KpiCard label="Sessions"     value={totalSessions}    accentColor={C.info} />
        <KpiCard label="Assessments"  value={totalAssessments} accentColor={C.accent} />
        <KpiCard label="Avg Accuracy" value={avgAccLabel}      accentColor={C.warning} />
      </View>

      {/* Registration trend */}
      <SectionHeader title="New User Registrations — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.usersPerDay} color={C.primary} labels={data.labels} />
      </View>

      {/* Session trend */}
      <SectionHeader title="Training Sessions Completed — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.sessionsPerDay} color={C.info} labels={data.labels} />
      </View>

      {/* Accuracy trend */}
      <SectionHeader title="Average Training Accuracy (%) — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.avgAccuracyPerDay} color={C.accent} labels={data.labels} />
      </View>

      {/* CVD Distribution */}
      <SectionHeader title="CVD Type Distribution — All Time" />
      <View style={[styles.chartCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <DonutChartSvg data={cvdDonutData} size={140} />
        <View style={{ flex: 1, gap: 6 }}>
          {cvdDonutData.sort((a, b) => b.value - a.value).map(d => (
            <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: d.color }} />
              <Text style={{ flex: 1, fontSize: 11, color: C.textSec }} numberOfLines={1}>{d.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.text }}>{d.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Game session bar chart */}
      {sortedGames.length > 0 && (
        <>
          <SectionHeader title="Sessions by Game Type — All Time" />
          <View style={styles.chartCard}>
            <BarChartSvg
              values={sortedGames.map(g => g.count)}
              labels={sortedGames.map(g => GAME_LABELS[g.gameType]?.split(' ')[0] ?? g.gameType)}
              colors={sortedGames.map((_, i) => GAME_COLORS[i % GAME_COLORS.length])}
            />
          </View>

          {/* Accuracy table */}
          <SectionHeader title="Game Accuracy Breakdown" />
          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>Game</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader]}>Sessions</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader]}>Avg Accuracy</Text>
            </View>
            {sortedGames.map((g, i) => (
              <View key={g.gameType} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{GAME_LABELS[g.gameType] ?? g.gameType}</Text>
                <Text style={styles.tableCell}>{g.count}</Text>
                <Text style={[styles.tableCell, { color: C.accent, fontWeight: '700' }]}>{g.avgAccuracy}%</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'users',     label: 'Users' },
    { key: 'analytics', label: 'Analytics' },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />
      <View style={styles.innerTabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.innerTab, active && styles.innerTabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.innerTabLabel, active && styles.innerTabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.flex1}>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'users'     && <UsersTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PT = Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: PT },
  flex1: { flex: 1 },
  centred: { flex: 1, alignSelf: 'center', marginTop: 48 },

  innerTabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  innerTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  innerTabActive: { borderBottomColor: C.primary },
  innerTabLabel: { fontSize: 13, fontWeight: '500', color: C.textMut, letterSpacing: 0.2 },
  innerTabLabelActive: { color: C.primary, fontWeight: '700' },

  tabContent: { padding: Spacing.base, paddingBottom: 80 },

  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.primary + '55',
    backgroundColor: C.primary + '0D',
    marginBottom: 16,
  },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: C.primary },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMut,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: 16,
    borderTopWidth: 3,
    minWidth: '45%',
    flex: 1,
    ...Shadow.sm,
  },
  kpiValue: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
  kpiLabel: { fontSize: 11, color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiSub:   { fontSize: 10, color: C.textMut, marginTop: 3 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    gap: 4,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    margin: Spacing.base,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  resultCount: { fontSize: 12, color: C.textMut, paddingHorizontal: 16, marginBottom: 8 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    marginHorizontal: Spacing.base,
    marginBottom: 8,
    borderRadius: Radius.md,
    padding: 12,
    gap: 12,
    ...Shadow.sm,
  },
  userInitial: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  userInitialText: { fontSize: 18, fontWeight: '800', color: C.primary },
  userMeta: { flex: 1, gap: 2 },
  userUsername: { fontSize: 14, fontWeight: '700', color: C.text },
  userEmail: { fontSize: 12, color: C.textSec },
  userRight: { alignItems: 'center', gap: 4 },
  userLevel: { fontSize: 11, fontWeight: '700', color: C.textMut },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 20 },
  pageBtn: { padding: 8, borderRadius: 8, backgroundColor: C.surface, ...Shadow.sm },
  pageText: { fontSize: 13, color: C.textSec, fontWeight: '600' },

  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  modalBody: { padding: Spacing.base, paddingBottom: 60 },

  modalHero: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  modalInitial: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.primary + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  modalInitialText: { fontSize: 28, fontWeight: '800', color: C.primary },
  modalUsername: { fontSize: 18, fontWeight: '800', color: C.text },
  modalEmail: { fontSize: 13, color: C.textSec },

  statsRow: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: Radius.md, padding: 14, marginVertical: 12, ...Shadow.sm,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: C.text },
  statLbl: { fontSize: 10, color: C.textMut, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  infoBlock: { backgroundColor: C.surface, borderRadius: Radius.md, overflow: 'hidden', ...Shadow.sm },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  infoLbl: { fontSize: 13, color: C.textMut },
  infoVal: { fontSize: 13, fontWeight: '600', color: C.text },

  actionStack: { gap: 8, marginTop: 20 },
  actionGroupLabel: { fontSize: 11, fontWeight: '700', color: C.textMut, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 13, borderRadius: Radius.md, borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },

  chartCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 4,
    ...Shadow.sm,
    overflow: 'hidden',
  },

  tableCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: 4,
    ...Shadow.sm,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: C.primary + '12',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowAlt: { backgroundColor: '#FAFAFE' },
  tableCell: { flex: 1, fontSize: 12, color: C.text },
  tableCellHeader: { color: C.primary, fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
});
