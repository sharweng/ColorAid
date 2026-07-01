/**
 * admin.tsx — ColorAid Administrator Panel
 * - No wasted space: root is View (tab navigator handles safe area)
 * - Download button lives in the nav header (context-aware per tab)
 * - Dashboard: graphs (donut for users, bar for sessions/assessments)
 * - Users: real avatars (emoji / photo), PDF export of full user list
 * - Analytics: improved PDF with embedded SVG charts
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, {
  Path, Line, Rect, G,
  Text as SvgText, Defs, LinearGradient, Stop,
} from 'react-native-svg';
import {
  adminApi,
  type AdminStats,
  type AdminUser,
  type AdminAnalytics,
} from '../../src/services/api';
import { Spacing, Radius, Shadow } from '../../src/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.base * 2 - 24;

// ─── Colour tokens ────────────────────────────────────────────────────────────
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

// ─── Avatar helper ────────────────────────────────────────────────────────────

function parseAvatar(avatarConfig: string | undefined | null): { type: 'emoji' | 'photo' | 'initial'; emoji?: string; uri?: string } {
  if (!avatarConfig) return { type: 'initial' };
  try {
    const p = JSON.parse(avatarConfig);
    if (p.type === 'photo' && p.uri) return { type: 'photo', uri: p.uri };
    if (p.emoji) return { type: 'emoji', emoji: p.emoji };
    // Parsed valid JSON but no recognised fields (e.g. '{}') — show initial
    return { type: 'initial' };
  } catch { /* not JSON — treat as plain emoji string */ }
  const trimmed = avatarConfig.trim();
  if (trimmed) return { type: 'emoji', emoji: trimmed };
  return { type: 'initial' };
}

function UserAvatar({ avatarConfig, username, size = 44 }: { avatarConfig?: string; username: string; size?: number }) {
  const av = parseAvatar(avatarConfig);
  const style = { width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary + '18', alignItems: 'center' as const, justifyContent: 'center' as const };
  if (av.type === 'photo' && av.uri) {
    return <Image source={{ uri: av.uri }} style={[style, { backgroundColor: 'transparent' }]} resizeMode="cover" />;
  }
  return (
    <View style={style}>
      {av.type === 'emoji'
        ? <Text style={{ fontSize: size * 0.52 }}>{av.emoji}</Text>
        : <Text style={{ fontSize: size * 0.44, fontWeight: '800', color: C.primary }}>{username[0]?.toUpperCase()}</Text>
      }
    </View>
  );
}

// ─── SVG Chart Components (in-app) ────────────────────────────────────────────

function LineChartSvg({ data, color, height = 140, labels }: { data: number[]; color: string; height?: number; labels?: string[] }) {
  if (!data || data.length < 2) {
    return <View style={{ height, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: C.textMut, fontSize: 12 }}>Not enough data yet</Text></View>;
  }
  const W = CHART_W, H = height;
  const PL = 28, PR = 8, PT = 10, PB = labels ? 28 : 16;
  const iW = W - PL - PR, iH = H - PT - PB;
  const max = Math.max(...data, 1);
  const toX = (i: number) => PL + (i / (data.length - 1)) * iW;
  const toY = (v: number) => PT + iH - (v / max) * iH;
  let d = `M ${toX(0)} ${toY(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const cx = (toX(i - 1) + toX(i)) / 2;
    d += ` C ${cx} ${toY(data[i-1])}, ${cx} ${toY(data[i])}, ${toX(i)} ${toY(data[i])}`;
  }
  const areaD = `${d} L ${toX(data.length-1)} ${PT+iH} L ${PL} ${PT+iH} Z`;
  const gridVals = [0, Math.round(max / 2), max];
  const labelIdx = labels ? [0, Math.floor(data.length/4), Math.floor(data.length/2), Math.floor(3*data.length/4), data.length-1] : [];
  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id={`lg${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.2" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {gridVals.map(v => (
        <G key={v}>
          <Line x1={PL} y1={toY(v)} x2={W-PR} y2={toY(v)} stroke={C.border} strokeWidth="1" strokeDasharray="4 3" />
          <SvgText x={PL-4} y={toY(v)+4} fontSize="9" fill={C.textMut} textAnchor="end">{v}</SvgText>
        </G>
      ))}
      <Path d={areaD} fill={`url(#lg${color.replace('#','')})`} />
      <Path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {labels && labelIdx.map(i => (
        <SvgText key={i} x={toX(i)} y={H-6} fontSize="9" fill={C.textMut} textAnchor="middle">{labels[i]}</SvgText>
      ))}
    </Svg>
  );
}

function BarChartSvg({ values, labels, colors, height = 160 }: { values: number[]; labels: string[]; colors: string[]; height?: number }) {
  if (!values.length) return null;
  const W = CHART_W, H = height;
  const PL = 28, PR = 8, PT = 20, PB = 36;
  const iW = W - PL - PR, iH = H - PT - PB;
  const max = Math.max(...values, 1);
  const barW = Math.min(44, (iW / values.length) * 0.55);
  const gap = iW / values.length;
  return (
    <Svg width={W} height={H}>
      {[0, Math.round(max/2), max].map(v => (
        <G key={v}>
          <Line x1={PL} y1={PT+iH-(v/max)*iH} x2={W-PR} y2={PT+iH-(v/max)*iH} stroke={C.border} strokeWidth="1" strokeDasharray="4 3" />
          <SvgText x={PL-4} y={PT+iH-(v/max)*iH+4} fontSize="9" fill={C.textMut} textAnchor="end">{v}</SvgText>
        </G>
      ))}
      {values.map((v, i) => {
        const x = PL + i*gap + gap/2 - barW/2;
        const bH = (v/max)*iH;
        const y = PT + iH - bH;
        const col = colors[i % colors.length];
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={bH} rx="4" fill={col} />
            {v > 0 && <SvgText x={x+barW/2} y={y-4} fontSize="9" fill={col} textAnchor="middle" fontWeight="bold">{v}</SvgText>}
            <SvgText x={x+barW/2} y={H-6} fontSize="9" fill={C.textMut} textAnchor="middle">{labels[i]}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChartSvg({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {

  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <View style={{ height: size, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: C.textMut, fontSize: 12 }}>No data</Text></View>;
  const R = size / 2, r = R * 0.58, cx = R, cy = R;
  let startAngle = -Math.PI / 2;
  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const end = startAngle + angle;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(end),         y2 = cy + R * Math.sin(end);
    const ix1 = cx + r * Math.cos(end),        iy1 = cy + r * Math.sin(end);
    const ix2 = cx + r * Math.cos(startAngle), iy2 = cy + r * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const pathD = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`;
    startAngle = end;
    return { ...d, pathD };
  });
  return (
    <Svg width={size} height={size}>
      {slices.map((s, i) => <Path key={i} d={s.pathD} fill={s.color} />)}
      <SvgText x={cx} y={cy-6} textAnchor="middle" fontSize="22" fontWeight="bold" fill={C.text}>{total}</SvgText>
      <SvgText x={cx} y={cy+12} textAnchor="middle" fontSize="10" fill={C.textMut}>total</SvgText>
    </Svg>
  );
}

// ─── SVG chart builders for PDF HTML ─────────────────────────────────────────

function htmlLine(values: number[], labels: string[], color: string, w = 480, h = 140): string {
  if (values.length < 2) return `<p style="color:#9CA3AF;text-align:center;font-size:12px">Not enough data</p>`;
  const PL=36,PR=12,PT=12,PB=28, iW=w-PL-PR, iH=h-PT-PB;
  const max = Math.max(...values, 1);
  const pts = values.map((v,i) => `${(PL+(i/(values.length-1))*iW).toFixed(1)},${(PT+iH-(v/max)*iH).toFixed(1)}`).join(' ');
  const areaPts = `${PL},${PT+iH} ${pts} ${PL+iW},${PT+iH}`;
  const grids = [0,Math.round(max/2),max].map(v => {
    const y=(PT+iH-(v/max)*iH).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${PL+iW}" y2="${y}" stroke="#E2E4F0" stroke-width="1" stroke-dasharray="4,3"/>
            <text x="${PL-4}" y="${(Number(y)+4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9CA3AF">${v}</text>`;
  }).join('');
  const li = [0,Math.floor(values.length/4),Math.floor(values.length/2),Math.floor(3*values.length/4),values.length-1];
  const lbEls = li.map(i => {
    const x=(PL+(i/(values.length-1))*iW).toFixed(1);
    return `<text x="${x}" y="${PT+iH+18}" text-anchor="middle" font-size="9" fill="#9CA3AF">${labels[i]||''}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin:0 auto">
    ${grids}
    <polygon points="${areaPts}" fill="${color}22"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${lbEls}
  </svg>`;
}

function htmlPie(slices: {label:string;value:number;color:string}[], size=180): string {
  const total = slices.reduce((a,b)=>a+b.value,0);
  if (!total) return `<p style="color:#9CA3AF;text-align:center">No data</p>`;
  const cx=size/2,cy=size/2,R=size/2-4,r=R*0.56;
  let ang=-Math.PI/2;
  const paths = slices.map(s=>{
    const a=(s.value/total)*2*Math.PI, end=ang+a;
    const x1=(cx+R*Math.cos(ang)).toFixed(1),y1=(cy+R*Math.sin(ang)).toFixed(1);
    const x2=(cx+R*Math.cos(end)).toFixed(1),y2=(cy+R*Math.sin(end)).toFixed(1);
    const ix1=(cx+r*Math.cos(end)).toFixed(1),iy1=(cy+r*Math.sin(end)).toFixed(1);
    const ix2=(cx+r*Math.cos(ang)).toFixed(1),iy2=(cy+r*Math.sin(ang)).toFixed(1);
    const lg=a>Math.PI?1:0;
    const d=`M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${lg} 0 ${ix2} ${iy2} Z`;
    ang=end;
    return `<path d="${d}" fill="${s.color}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;margin:0 auto">${paths}
    <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="18" font-weight="bold" fill="#1A1B2E">${total}</text>
    <text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="9" fill="#9CA3AF">total</text>
  </svg>`;
}

function htmlBar(values: number[], labels: string[], colors: string[], w=420, h=180): string {
  const PL=36,PR=12,PT=24,PB=40, iW=w-PL-PR, iH=h-PT-PB;
  const max=Math.max(...values,1);
  const bW=Math.min(52,(iW/values.length)*0.58), gap=iW/values.length;
  const grids=[0,Math.round(max/2),max].map(v=>{
    const y=(PT+iH-(v/max)*iH).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${PL+iW}" y2="${y}" stroke="#E2E4F0" stroke-width="1" stroke-dasharray="4,3"/>
            <text x="${PL-4}" y="${(Number(y)+4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9CA3AF">${v}</text>`;
  }).join('');
  const bars=values.map((v,i)=>{
    const x=(PL+i*gap+gap/2-bW/2).toFixed(1);
    const bH=((v/max)*iH).toFixed(1);
    const y=(PT+iH-Number(bH)).toFixed(1);
    const col=colors[i%colors.length];
    return `<rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="4" fill="${col}"/>
      ${v>0?`<text x="${(Number(x)+bW/2).toFixed(1)}" y="${(Number(y)-5).toFixed(1)}" text-anchor="middle" font-size="10" fill="${col}" font-weight="bold">${v}</text>`:''}
      <text x="${(Number(x)+bW/2).toFixed(1)}" y="${(PT+iH+22).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6B7280">${labels[i]}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin:0 auto">${grids}${bars}
    <line x1="${PL}" y1="${PT+iH}" x2="${PL+iW}" y2="${PT+iH}" stroke="#E2E4F0" stroke-width="1"/>
  </svg>`;
}

// ─── PDF generators ───────────────────────────────────────────────────────────

async function generateDashboardPdf(stats: AdminStats): Promise<void> {
  const now = new Date().toLocaleString();
  const sessRate = stats.sessions.total > 0 ? Math.round(stats.sessions.completed/stats.sessions.total*100) : 0;
  const assRate  = stats.assessments.total > 0 ? Math.round(stats.assessments.completed/stats.assessments.total*100) : 0;

  // User accounts donut (active vs deactivated)
  const userPieSlices = [
    { label: 'Active',      value: stats.users.active,      color: '#00C9A7' },
    { label: 'Deactivated', value: stats.users.deactivated, color: '#FF453A' },
  ];
  const userPieSvg = htmlPie(userPieSlices, 180);

  // Sessions bar: Total vs Completed
  const sessBarSvg = htmlBar(
    [stats.sessions.total, stats.sessions.completed],
    ['Total', 'Completed'],
    [C.info, C.accent], 320, 160,
  );
  // Assessments bar
  const assBarSvg = htmlBar(
    [stats.assessments.total, stats.assessments.completed],
    ['Total', 'Completed'],
    [C.info, C.accent], 320, 160,
  );

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:36px;color:#1A1B2E;background:#F7F8FC}
  h1{color:#6C63FF;font-size:22px;margin:0 0 4px}
  .sub{color:#9CA3AF;font-size:12px;margin-bottom:28px}
  h2{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #E2E4F0}
  .chart-wrap{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:4px;display:flex;align-items:center;gap:24px}
  .legend{display:flex;flex-direction:column;gap:8px}
  .legend-row{display:flex;align-items:center;gap:8px;font-size:12px;color:#6B7280}
  .dot{width:10px;height:10px;border-radius:5px;flex-shrink:0}
  .stat-row{display:flex;gap:16px;margin-top:12px}
  .stat{background:#EEF0FF;border-radius:8px;padding:10px 16px;text-align:center;flex:1}
  .stat-val{font-size:22px;font-weight:800;color:#6C63FF}
  .stat-lbl{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
  .kpi{background:#fff;border-radius:10px;padding:18px 22px;border-top:3px solid #FFB800;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .kpi-val{font-size:32px;font-weight:800;color:#FFB800}
  .kpi-lbl{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .foot{margin-top:36px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #E2E4F0;padding-top:12px}
</style></head><body>
<h1>ColorAid — Dashboard Report</h1>
<p class="sub">Generated: ${now}</p>

<h2>User Accounts</h2>
<div class="chart-wrap">
  ${userPieSvg}
  <div>
    <div class="legend">
      <div class="legend-row"><div class="dot" style="background:#00C9A7"></div>Active — ${stats.users.active}</div>
      <div class="legend-row"><div class="dot" style="background:#FF453A"></div>Deactivated — ${stats.users.deactivated}</div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="stat-val" style="color:#6C63FF">${stats.users.total}</div><div class="stat-lbl">Total</div></div>
      <div class="stat"><div class="stat-val" style="color:#FF9500">${stats.users.admins}</div><div class="stat-lbl">Admins</div></div>
    </div>
  </div>
</div>

<h2>Training Sessions</h2>
<div class="chart-wrap" style="flex-direction:column;align-items:flex-start">
  ${sessBarSvg}
  <p style="font-size:12px;color:#6B7280;margin:4px 0 0">${sessRate}% completion rate &nbsp;(${stats.sessions.completed} of ${stats.sessions.total})</p>
</div>

<h2>Assessments</h2>
<div class="chart-wrap" style="flex-direction:column;align-items:flex-start">
  ${assBarSvg}
  <p style="font-size:12px;color:#6B7280;margin:4px 0 0">${assRate}% completion rate &nbsp;(${stats.assessments.completed} of ${stats.assessments.total})</p>
</div>

<h2>Economy</h2>
<div class="kpi"><div class="kpi-val">${stats.coinsInCirculation.toLocaleString()}</div><div class="kpi-lbl">Coins in Circulation</div></div>

<p class="foot">ColorAid Administrator Report &nbsp;|&nbsp; Confidential</p>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Dashboard Report' });
}

async function generateUsersListPdf(users: AdminUser[]): Promise<void> {
  const now = new Date().toLocaleString();
  const rows = users.map((u, i) => `
    <tr style="${i%2===1?'background:#FAFAFE':''}">
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td style="text-align:center">
        <span style="background:${u.role==='admin'?'#EEF0FF':'#F3F4F6'};color:${u.role==='admin'?'#6C63FF':'#6B7280'};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600">
          ${u.role==='admin'?'Admin':'User'}
        </span>
      </td>
      <td style="text-align:center">
        <span style="background:${u.isActive?'#E6FBF7':'#FFF1F0'};color:${u.isActive?'#00C9A7':'#FF453A'};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600">
          ${u.isActive?'Active':'Deactivated'}
        </span>
      </td>
      <td style="text-align:center">${u.level}</td>
      <td style="text-align:center">${new Date(u.createdAt).toLocaleDateString()}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:36px;color:#1A1B2E;background:#F7F8FC}
  h1{color:#6C63FF;font-size:22px;margin:0 0 4px}
  .sub{color:#9CA3AF;font-size:12px;margin-bottom:24px}
  .summary{display:flex;gap:14px;margin-bottom:20px}
  .s{flex:1;background:#fff;border-radius:8px;padding:12px 16px;border-top:3px solid #6C63FF;box-shadow:0 1px 4px rgba(0,0,0,.05)}

  .sv{font-size:22px;font-weight:800;color:#6C63FF}
  .sl{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;padding:9px 12px;background:#EEF0FF;color:#6C63FF;font-weight:600;font-size:11px}
  td{padding:9px 12px;border-bottom:1px solid #E2E4F0;vertical-align:middle}
  .foot{margin-top:32px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #E2E4F0;padding-top:12px}
</style></head><body>
<h1>ColorAid — User List Report</h1>
<p class="sub">Generated: ${now} &nbsp;|&nbsp; ${users.length} user${users.length!==1?'s':''} total</p>
<div class="summary">
  <div class="s"><div class="sv">${users.length}</div><div class="sl">Total</div></div>
  <div class="s"><div class="sv" style="color:#00C9A7">${users.filter(u=>u.isActive).length}</div><div class="sl">Active</div></div>
  <div class="s"><div class="sv" style="color:#FF453A">${users.filter(u=>!u.isActive).length}</div><div class="sl">Deactivated</div></div>
  <div class="s"><div class="sv" style="color:#FF9500">${users.filter(u=>u.role==='admin').length}</div><div class="sl">Admins</div></div>
</div>
<table>
  <thead><tr><th>Username</th><th>Email</th><th style="text-align:center">Role</th><th style="text-align:center">Status</th><th style="text-align:center">Level</th><th style="text-align:center">Joined</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="foot">ColorAid Administrator Report &nbsp;|&nbsp; Confidential</p>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save User List' });
}

async function generateAnalyticsPdf(data: AdminAnalytics): Promise<void> {
  const now = new Date().toLocaleString();
  const totalNewUsers    = data.usersPerDay.reduce((a,b)=>a+b,0);
  const totalSessions    = data.sessionsPerDay.reduce((a,b)=>a+b,0);
  const totalAssessments = data.assessmentsPerDay.reduce((a,b)=>a+b,0);
  const nonZeroAcc       = data.avgAccuracyPerDay.filter(v=>v>0);
  const avgAcc           = nonZeroAcc.length ? (nonZeroAcc.reduce((a,b)=>a+b,0)/nonZeroAcc.length).toFixed(1) : '—';

  // SVG charts
  const regSvg  = htmlLine(data.usersPerDay,       data.labels, C.primary);
  const sessSvg = htmlLine(data.sessionsPerDay,     data.labels, C.info);
  const accSvg  = htmlLine(data.avgAccuracyPerDay,  data.labels, C.accent);

  const cvdSlices = data.cvdDistribution.map(d => ({
    label: d.type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
    value: d.count,
    color: CVD_COLORS[d.type] ?? '#C7C7CC',
  }));
  const cvdPieSvg = htmlPie(cvdSlices, 200);

  const sortedGames = [...data.gameBreakdown].sort((a,b)=>b.count-a.count);
  const gameBarSvg  = htmlBar(
    sortedGames.map(g=>g.count),
    sortedGames.map(g=>GAME_LABELS[g.gameType]?.split(' ')[0] ?? g.gameType),
    sortedGames.map((_,i)=>GAME_COLORS[i%GAME_COLORS.length]),
    420, 180,
  );

  const cvdLegend = cvdSlices.sort((a,b)=>b.value-a.value).map(d => `
    <div class="legend-row"><div class="dot" style="background:${d.color}"></div>${d.label} — ${d.value}</div>`).join('');

  const gameRows = sortedGames.map((g,i)=>`
    <tr style="${i%2===1?'background:#FAFAFE':''}">
      <td>${GAME_LABELS[g.gameType]??g.gameType}</td>
      <td style="text-align:center">${g.count}</td>
      <td style="text-align:center;color:#00C9A7;font-weight:700">${g.avgAccuracy}%</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:36px;color:#1A1B2E;background:#F7F8FC}
  h1{color:#6C63FF;font-size:22px;margin:0 0 4px}
  .sub{color:#9CA3AF;font-size:12px;margin-bottom:28px}
  h2{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #E2E4F0}
  .note{background:#EEF0FF;border-radius:8px;padding:10px 14px;font-size:11px;color:#4B44CC;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:4px}
  .card{background:#fff;border-radius:10px;padding:14px;border-top:3px solid #6C63FF;box-shadow:0 1px 4px rgba(0,0,0,.05);text-align:center}
  .val{font-size:24px;font-weight:800;color:#6C63FF}
  .lbl{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .chart-wrap{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:4px}
  .chart-row{display:flex;align-items:center;gap:20px}
  .legend{display:flex;flex-direction:column;gap:7px}
  .legend-row{display:flex;align-items:center;gap:8px;font-size:11px;color:#6B7280}
  .dot{width:10px;height:10px;border-radius:5px;flex-shrink:0}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
  th{text-align:left;padding:8px 12px;background:#EEF0FF;color:#6C63FF;font-weight:600;font-size:11px}
  td{padding:9px 12px;border-bottom:1px solid #E2E4F0;vertical-align:middle}
  .foot{margin-top:36px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #E2E4F0;padding-top:12px}
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

<h2>New User Registrations — Last 30 Days</h2>
<div class="chart-wrap">${regSvg}</div>

<h2>Training Sessions Completed — Last 30 Days</h2>
<div class="chart-wrap">${sessSvg}</div>

<h2>Average Training Accuracy (%) — Last 30 Days</h2>
<div class="chart-wrap">${accSvg}</div>

<h2>CVD Type Distribution — All Time</h2>
<div class="chart-wrap">
  <div class="chart-row">
    ${cvdPieSvg}
    <div class="legend">${cvdLegend}</div>
  </div>
</div>

<h2>Sessions by Game Type — All Time</h2>
<div class="chart-wrap">${gameBarSvg}</div>

<h2>Game Accuracy Breakdown</h2>
<table>
  <thead><tr><th>Game</th><th style="text-align:center">Sessions</th><th style="text-align:center">Avg Accuracy</th></tr></thead>
  <tbody>${gameRows||'<tr><td colspan="3" style="color:#9CA3AF;text-align:center;padding:20px">No data yet</td></tr>'}</tbody>
</table>

<p class="foot">ColorAid Administrator Report &nbsp;|&nbsp; Confidential</p>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Analytics Report' });
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

type AdminTab = 'dashboard' | 'users' | 'analytics';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function KpiCard({ label, value, sub, accentColor }: { label: string; value: string|number; sub?: string; accentColor: string }) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: accentColor }]}>
      <Text style={[styles.kpiValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: isActive ? C.accent+'1A' : C.error+'1A' }]}>
      <View style={[styles.pillDot, { backgroundColor: isActive ? C.accent : C.error }]} />
      <Text style={[styles.pillText, { color: isActive ? C.accent : C.error }]}>{isActive ? 'Active' : 'Deactivated'}</Text>
    </View>
  );
}

function RolePill({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.pill, { backgroundColor: isAdmin ? C.primary+'1A' : C.border }]}>
      <Text style={[styles.pillText, { color: isAdmin ? C.primary : C.textMut }]}>{isAdmin ? 'Admin' : 'User'}</Text>
    </View>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ onExportReady }: { onExportReady: (fn: (() => Promise<void>) | null) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setStats(await adminApi.getStats()); }
    catch { Alert.alert('Error', 'Failed to load dashboard data.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (stats) onExportReady(() => generateDashboardPdf(stats));
    else       onExportReady(null);
  }, [stats, onExportReady]);

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} size="large" />;
  if (!stats) return null;

  const sessRate = stats.sessions.total > 0 ? `${Math.round(stats.sessions.completed/stats.sessions.total*100)}% completion rate` : 'No sessions yet';
  const assRate  = stats.assessments.total > 0 ? `${Math.round(stats.assessments.completed/stats.assessments.total*100)}% completion rate` : 'No assessments yet';

  const userDonutData = [
    { label: 'Active',      value: stats.users.active,      color: C.accent },
    { label: 'Deactivated', value: stats.users.deactivated, color: C.error },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.primary} />}
    >
      <SectionHeader title="User Accounts" />
      <View style={styles.chartCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <DonutChartSvg data={userDonutData} size={120} />
          <View style={{ flex: 1, gap: 8 }}>
            {[
              { label: 'Total Users',     value: stats.users.total,       color: C.primary },
              { label: 'Active',          value: stats.users.active,      color: C.accent },
              { label: 'Deactivated',     value: stats.users.deactivated, color: C.error },
              { label: 'Administrators',  value: stats.users.admins,      color: C.warning },
            ].map(row => (
              <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                  <Text style={{ fontSize: 12, color: C.textSec }}>{row.label}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: row.color }}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <SectionHeader title="Training Sessions" />
      <View style={styles.chartCard}>
        <BarChartSvg
          values={[stats.sessions.total, stats.sessions.completed]}
          labels={['Total', 'Completed']}
          colors={[C.info, C.accent]}
          height={130}
        />
        <Text style={styles.chartNote}>{sessRate}</Text>
      </View>

      <SectionHeader title="Assessments" />
      <View style={styles.chartCard}>
        <BarChartSvg
          values={[stats.assessments.total, stats.assessments.completed]}
          labels={['Total', 'Completed']}
          colors={[C.info, C.accent]}
          height={130}
        />
        <Text style={styles.chartNote}>{assRate}</Text>
      </View>

      <SectionHeader title="Economy" />
      <View style={styles.kpiGrid}>
        <KpiCard label="Coins in Circulation" value={stats.coinsInCirculation.toLocaleString()} accentColor={C.coin} />
      </View>
    </ScrollView>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ onExportReady }: { onExportReady: (fn: (() => Promise<void>) | null) => void }) {
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

  // Export: use already-loaded users; fetch up to 100 if there are more pages
  useEffect(() => {
    onExportReady(async () => {
      let exportUsers = users;
      if (totalPages > 1) {
        // Fetch a full batch (backend caps at 100)
        const data = await adminApi.listUsers(1, 100, debouncedSearch);
        exportUsers = data.users;
      }
      await generateUsersListPdf(exportUsers);
    });
  }, [users, totalPages, debouncedSearch, onExportReady]);

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
      <UserAvatar avatarConfig={item.avatarConfig} username={item.username} size={44} />
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, true); }} tintColor={C.primary} />}
            ListFooterComponent={totalPages > 1 ? (
              <View style={styles.pager}>
                <TouchableOpacity disabled={page <= 1} onPress={() => load(page-1)} style={[styles.pageBtn, page<=1 && { opacity: 0.35 }]}>
                  <Ionicons name="chevron-back" size={16} color={C.primary} />
                </TouchableOpacity>
                <Text style={styles.pageText}>{page} / {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => load(page+1)} style={[styles.pageBtn, page>=totalPages && { opacity: 0.35 }]}>
                  <Ionicons name="chevron-forward" size={16} color={C.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
          />
        )
      }

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
                <UserAvatar avatarConfig={selected.avatarConfig} username={selected.username} size={72} />
                <Text style={[styles.modalUsername, { marginTop: 10 }]}>@{selected.username}</Text>
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
                {([
                  { label: 'Joined',            value: new Date(selected.createdAt).toLocaleDateString() },
                  selected.lastActiveAt ? { label: 'Last Active', value: new Date(selected.lastActiveAt).toLocaleDateString() } : null,
                  selected._count ? { label: 'Assessments',      value: `${selected._count.assessments}` } : null,
                  selected._count ? { label: 'Training Sessions', value: `${selected._count.trainingSessions}` } : null,
                ] as ({ label: string; value: string } | null)[]).filter(Boolean).map(row => (
                  <View key={row!.label} style={styles.infoRow}>
                    <Text style={styles.infoLbl}>{row!.label}</Text>
                    <Text style={styles.infoVal}>{row!.value}</Text>
                  </View>
                ))}
              </View>

              {actionLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} />
              ) : (
                <View style={styles.actionStack}>
                  <Text style={styles.actionGroupLabel}>Account Status</Text>
                  {selected.isActive ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: C.error+'66', backgroundColor: C.error+'0D' }]}
                      onPress={() => Alert.alert(
                        'Deactivate Account',
                        `Deactivate @${selected.username}? They will be immediately logged out and cannot log in until reactivated.`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: () => handleSetStatus(selected, false) }]
                      )}
                    >
                      <Ionicons name="ban-outline" size={17} color={C.error} />
                      <Text style={[styles.actionBtnText, { color: C.error }]}>Deactivate Account</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: C.accent+'66', backgroundColor: C.accent+'0D' }]}
                      onPress={() => handleSetStatus(selected, true)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={17} color={C.accent} />
                      <Text style={[styles.actionBtnText, { color: C.accent }]}>Reactivate Account</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.actionGroupLabel, { marginTop: 16 }]}>Role Management</Text>
                  {selected.role === 'admin' ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: C.warning+'66', backgroundColor: C.warning+'0D' }]}
                      onPress={() => Alert.alert(
                        'Revoke Administrator Role',
                        `Remove admin privileges from @${selected.username}?`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Revoke', style: 'destructive', onPress: () => handleSetRole(selected, 'user') }]
                      )}
                    >
                      <Ionicons name="shield-outline" size={17} color={C.warning} />
                      <Text style={[styles.actionBtnText, { color: C.warning }]}>Revoke Administrator Role</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: C.primary+'66', backgroundColor: C.primary+'0D' }]}
                      onPress={() => Alert.alert(
                        'Grant Administrator Role',
                        `Grant admin privileges to @${selected.username}? They will have full access to this panel.`,
                        [{ text: 'Cancel', style: 'cancel' }, { text: 'Grant', onPress: () => handleSetRole(selected, 'admin') }]
                      )}
                    >
                      <Ionicons name="shield-checkmark-outline" size={17} color={C.primary} />
                      <Text style={[styles.actionBtnText, { color: C.primary }]}>Grant Administrator Role</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ onExportReady }: { onExportReady: (fn: (() => Promise<void>) | null) => void }) {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try { setData(await adminApi.getAnalytics()); }
    catch { Alert.alert('Error', 'Failed to load analytics.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (data) onExportReady(() => generateAnalyticsPdf(data));
    else      onExportReady(null);
  }, [data, onExportReady]);

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} size="large" />;
  if (!data) return null;

  const totalNewUsers    = data.usersPerDay.reduce((a,b)=>a+b,0);
  const totalSessions    = data.sessionsPerDay.reduce((a,b)=>a+b,0);
  const totalAssessments = data.assessmentsPerDay.reduce((a,b)=>a+b,0);
  const nonZeroAcc       = data.avgAccuracyPerDay.filter(v=>v>0);
  const avgAccLabel      = nonZeroAcc.length ? `${(nonZeroAcc.reduce((a,b)=>a+b,0)/nonZeroAcc.length).toFixed(1)}%` : '—';

  const cvdDonutData = data.cvdDistribution.map(d => ({
    label: d.type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
    value: d.count,
    color: CVD_COLORS[d.type] ?? '#C7C7CC',
  }));

  const sortedGames = [...data.gameBreakdown].sort((a,b)=>b.count-a.count);

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.primary} />}
    >
      <SectionHeader title="30-Day Summary" />
      <View style={styles.kpiGrid}>
        <KpiCard label="New Users"    value={totalNewUsers}    accentColor={C.primary} />
        <KpiCard label="Sessions"     value={totalSessions}    accentColor={C.info} />
        <KpiCard label="Assessments"  value={totalAssessments} accentColor={C.accent} />
        <KpiCard label="Avg Accuracy" value={avgAccLabel}      accentColor={C.warning} />
      </View>

      <SectionHeader title="New User Registrations — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.usersPerDay} color={C.primary} labels={data.labels} />
      </View>

      <SectionHeader title="Training Sessions Completed — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.sessionsPerDay} color={C.info} labels={data.labels} />
      </View>

      <SectionHeader title="Average Training Accuracy (%) — Last 30 Days" />
      <View style={styles.chartCard}>
        <LineChartSvg data={data.avgAccuracyPerDay} color={C.accent} labels={data.labels} />
      </View>

      <SectionHeader title="CVD Type Distribution — All Time" />
      <View style={[styles.chartCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <DonutChartSvg data={cvdDonutData} size={140} />
        <View style={{ flex: 1, gap: 6 }}>
          {cvdDonutData.sort((a,b)=>b.value-a.value).map(d => (
            <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: d.color }} />
              <Text style={{ flex: 1, fontSize: 11, color: C.textSec }} numberOfLines={1}>{d.label}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.text }}>{d.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {sortedGames.length > 0 && (
        <>
          <SectionHeader title="Sessions by Game Type — All Time" />
          <View style={styles.chartCard}>
            <BarChartSvg
              values={sortedGames.map(g=>g.count)}
              labels={sortedGames.map(g=>GAME_LABELS[g.gameType]?.split(' ')[0] ?? g.gameType)}
              colors={sortedGames.map((_,i)=>GAME_COLORS[i%GAME_COLORS.length])}
            />
          </View>

          <SectionHeader title="Game Accuracy Breakdown" />
          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>Game</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader]}>Sessions</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader]}>Avg Accuracy</Text>
            </View>
            {sortedGames.map((g,i) => (
              <View key={g.gameType} style={[styles.tableRow, i%2===1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{GAME_LABELS[g.gameType]??g.gameType}</Text>
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
  const [isExporting, setIsExporting] = useState(false);
  const navigation = useNavigation();
  const exportRef = useRef<(() => Promise<void>) | null>(null);

  const handleExport = useCallback(async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try { await exportRef.current(); }
    catch { Alert.alert('Error', 'Could not generate PDF.'); }
    finally { setIsExporting(false); }
  }, [isExporting]);

  // Update header right button whenever exporting state changes
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleExport}
          disabled={isExporting}
          style={{ marginRight: 16, padding: 4 }}
        >
          {isExporting
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Ionicons name="download-outline" size={22} color={C.primary} />
          }
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleExport, isExporting]);

  const setExportFn = useCallback((fn: (() => Promise<void>) | null) => {
    exportRef.current = fn;
  }, []);

  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'users',     label: 'Users' },
    { key: 'analytics', label: 'Analytics' },
  ];

  return (
    <View style={styles.root}>
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
              <Text style={[styles.innerTabLabel, active && styles.innerTabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.flex1}>
        {activeTab === 'dashboard' && <DashboardTab  onExportReady={setExportFn} />}
        {activeTab === 'users'     && <UsersTab       onExportReady={setExportFn} />}
        {activeTab === 'analytics' && <AnalyticsTab   onExportReady={setExportFn} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex1: { flex: 1 },
  centred: { flex: 1, alignSelf: 'center', marginTop: 48 },

  innerTabBar: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  innerTab: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  innerTabActive: { borderBottomColor: C.primary },
  innerTabLabel: { fontSize: 13, fontWeight: '500', color: C.textMut, letterSpacing: 0.2 },
  innerTabLabelActive: { color: C.primary, fontWeight: '700' },

  tabContent: { padding: Spacing.base, paddingBottom: 80 },

  sectionHeader: { fontSize: 11, fontWeight: '700', color: C.textMut, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { backgroundColor: C.surface, borderRadius: Radius.md, padding: 16, borderTopWidth: 3, minWidth: '45%', flex: 1, ...Shadow.sm },
  kpiValue: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
  kpiLabel: { fontSize: 11, color: C.textSec, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiSub:   { fontSize: 10, color: C.textMut, marginTop: 3 },

  chartCard: { backgroundColor: C.surface, borderRadius: Radius.md, padding: 12, marginBottom: 4, ...Shadow.sm, overflow: 'hidden' },
  chartNote: { fontSize: 11, color: C.textMut, marginTop: 4, textAlign: 'right' },

  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, gap: 4 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, margin: Spacing.base, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  resultCount: { fontSize: 12, color: C.textMut, paddingHorizontal: 16, marginBottom: 8 },

  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, marginHorizontal: Spacing.base, marginBottom: 8, borderRadius: Radius.md, padding: 12, gap: 12, ...Shadow.sm },
  userMeta: { flex: 1, gap: 2 },
  userUsername: { fontSize: 14, fontWeight: '700', color: C.text },
  userEmail: { fontSize: 12, color: C.textSec },
  userRight: { alignItems: 'center', gap: 4 },
  userLevel: { fontSize: 11, fontWeight: '700', color: C.textMut },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 20 },
  pageBtn: { padding: 8, borderRadius: 8, backgroundColor: C.surface, ...Shadow.sm },
  pageText: { fontSize: 13, color: C.textSec, fontWeight: '600' },

  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  modalBody: { padding: Spacing.base, paddingBottom: 60 },

  modalHero: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  modalUsername: { fontSize: 18, fontWeight: '800', color: C.text },
  modalEmail: { fontSize: 13, color: C.textSec },

  statsRow: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: Radius.md, padding: 14, marginVertical: 12, ...Shadow.sm },
  statCell: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: C.text },
  statLbl: { fontSize: 10, color: C.textMut, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  infoBlock: { backgroundColor: C.surface, borderRadius: Radius.md, overflow: 'hidden', ...Shadow.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLbl: { fontSize: 13, color: C.textMut },
  infoVal: { fontSize: 13, fontWeight: '600', color: C.text },

  actionStack: { gap: 8, marginTop: 20 },
  actionGroupLabel: { fontSize: 11, fontWeight: '700', color: C.textMut, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: Radius.md, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontWeight: '600' },

  tableCard: { backgroundColor: C.surface, borderRadius: Radius.md, overflow: 'hidden', marginBottom: 4, ...Shadow.sm },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.primary+'12', paddingHorizontal: 12, paddingVertical: 10 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowAlt: { backgroundColor: '#FAFAFE' },
  tableCell: { flex: 1, fontSize: 12, color: C.text },
  tableCellHeader: { color: C.primary, fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
});
