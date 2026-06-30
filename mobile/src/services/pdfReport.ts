/**
 * pdfReport.ts
 * Generates beautiful, on-brand PDF reports for ColorAid using expo-print + expo-sharing.
 * Each report contains SVG charts, styled tables, and ColorAid brand colours.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ProgressReport } from './api';

// ─── Brand constants ──────────────────────────────────────────────────────────

const C = {
  primary:   '#6C63FF',
  primaryDk: '#4B44CC',
  primaryLt: '#EEF0FF',
  accent:    '#00C9A7',
  info:      '#0A84FF',
  warning:   '#FF9500',
  error:     '#FF453A',
  success:   '#00C9A7',
  surface:   '#FFFFFF',
  bg:        '#F7F8FC',
  border:    '#E2E4F0',
  text:      '#1A1B2E',
  textSec:   '#6B7280',
  textMut:   '#9CA3AF',
  coin:      '#FFB800',
};

const GAME_LABELS: Record<string, string> = {
  color_match:    'Color Match',
  hue_hunt:       'Hue Hunt',
  shade_spectrum: 'Shade Spectrum',
  color_sort:     'Color Sort',
};
const GAME_COLORS: Record<string, string> = {
  color_match:    C.primary,
  hue_hunt:       C.accent,
  shade_spectrum: C.warning,
  color_sort:     C.error,
};
const GAME_EMOJIS: Record<string, string> = {
  color_match:    '🎨',
  hue_hunt:       '🔍',
  shade_spectrum: '🌈',
  color_sort:     '🗂️',
};

// ─── SVG Chart Builders ───────────────────────────────────────────────────────

function lineChartSVG(
  values: number[],
  color: string,
  width = 500,
  height = 140,
  maxVal = 100,
): string {
  if (values.length < 2) {
    return `<p style="color:${C.textMut};text-align:center;font-size:12px;padding:20px 0">Need at least 2 data points to draw chart</p>`;
  }
  const padX = 24, padY = 18;
  const w = width - 2 * padX;
  const h = height - 2 * padY;
  const pts = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * w,
    y: padY + h - (Math.min(v, maxVal) / maxVal) * h,
  }));
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${pts[0].x.toFixed(1)},${(padY + h).toFixed(1)} ${polyline} ${pts[pts.length - 1].x.toFixed(1)},${(padY + h).toFixed(1)}`;

  // y-axis grid labels
  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const y = padY + h - (v / maxVal) * h;
    return `
      <line x1="${padX}" y1="${y.toFixed(1)}" x2="${(padX + w).toFixed(1)}" y2="${y.toFixed(1)}"
            stroke="${C.border}" stroke-width="1" stroke-dasharray="4,3"/>
      <text x="${(padX - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end"
            font-size="9" fill="${C.textMut}">${v}%</text>
    `;
  }).join('');

  // x-axis labels (first and last)
  const xLabels = `
    <text x="${padX}" y="${(padY + h + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="${C.textMut}">Start</text>
    <text x="${(padX + w).toFixed(1)}" y="${(padY + h + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="${C.textMut}">Latest</text>
  `;

  const dots = pts.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${color}" stroke="white" stroke-width="2"/>`
  ).join('');

  return `
    <svg viewBox="0 0 ${width} ${height + 20}" xmlns="http://www.w3.org/2000/svg" width="100%">
      <defs>
        <linearGradient id="grad_${color.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${xLabels}
      <polygon points="${area}" fill="url(#grad_${color.replace('#','')})" />
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
  `;
}

function horizontalBarSVG(
  rows: { label: string; value: number; color: string; subtitle?: string }[],
  maxVal = 100,
  svgWidth = 500,
): string {
  const rowH = 38, padX = 140, barH = 14, padTop = 10;
  const totalH = padTop + rows.length * rowH;
  const barW = svgWidth - padX - 50;

  const bars = rows.map((r, i) => {
    const y = padTop + i * rowH;
    const filled = Math.min(r.value / maxVal, 1) * barW;
    const label = r.value > 0 ? `${r.value}%` : '—';
    return `
      <text x="0" y="${(y + 10).toFixed(1)}" font-size="12" font-weight="600" fill="${C.text}">${r.label}</text>
      ${r.subtitle ? `<text x="0" y="${(y + 22).toFixed(1)}" font-size="10" fill="${C.textSec}">${r.subtitle}</text>` : ''}
      <rect x="${padX}" y="${(y + 2).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH}" rx="7" fill="${C.bg}"/>
      <rect x="${padX}" y="${(y + 2).toFixed(1)}" width="${filled.toFixed(1)}" height="${barH}" rx="7" fill="${r.color}"/>
      <text x="${(padX + barW + 8).toFixed(1)}" y="${(y + 12).toFixed(1)}" font-size="11" font-weight="700" fill="${r.color}">${label}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${svgWidth} ${totalH}" xmlns="http://www.w3.org/2000/svg" width="100%">
      ${bars}
    </svg>
  `;
}

// ─── Shared HTML shell ────────────────────────────────────────────────────────

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background:${C.bg}; color:${C.text}; font-size:13px; line-height:1.5; }
  .page { max-width:760px; margin:0 auto; padding:32px 28px 48px; }

  /* Header */
  .header { background:linear-gradient(135deg,${C.primary},${C.primaryDk}); border-radius:18px; padding:30px 32px; color:#fff; margin-bottom:24px; }
  .header-top { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { font-size:22px; font-weight:800; letter-spacing:-0.5px; }
  .brand span { opacity:0.7; font-weight:400; font-size:13px; display:block; margin-top:2px; }
  .report-meta { text-align:right; font-size:11px; opacity:0.75; }
  .report-title { font-size:16px; font-weight:700; margin-top:14px; opacity:0.9; }

  /* Cards */
  .card { background:${C.surface}; border-radius:14px; padding:20px 22px; margin-bottom:18px;
          box-shadow:0 1px 4px rgba(0,0,0,0.07); }
  .card-title { font-size:14px; font-weight:700; color:${C.text}; margin-bottom:4px; }
  .card-sub { font-size:11px; color:${C.textMut}; margin-bottom:14px; }

  /* Metric row */
  .metrics { display:flex; gap:12px; margin-bottom:4px; }
  .metric { flex:1; background:${C.bg}; border-radius:10px; padding:14px 10px; text-align:center; }
  .metric-val { font-size:22px; font-weight:800; color:${C.primary}; line-height:1.1; }
  .metric-lbl { font-size:10px; color:${C.textMut}; margin-top:3px; }

  /* Badge */
  .badge { display:inline-block; border-radius:999px; padding:3px 12px; font-size:11px; font-weight:700;
           background:${C.primaryLt}; color:${C.primary}; text-transform:capitalize; }
  .badge.accent  { background:#E0FBF6; color:${C.accent}; }
  .badge.warning { background:#FFF3E0; color:${C.warning}; }
  .badge.error   { background:#FFEBEA; color:${C.error}; }
  .badge.info    { background:#E8F3FF; color:${C.info}; }

  /* Table */
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead th { background:${C.primaryLt}; color:${C.primary}; font-weight:700; padding:9px 12px; text-align:left; }
  tbody td { padding:8px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:nth-child(even) td { background:${C.bg}; }

  /* Progress bar */
  .prog-bar-wrap { background:${C.bg}; border-radius:999px; height:10px; overflow:hidden; }
  .prog-bar-fill { height:100%; border-radius:999px; }

  /* Two-col */
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

  /* Divider */
  .divider { height:1px; background:${C.border}; margin:4px 0 16px; }

  /* Rec activity */
  .rec-item { background:${C.bg}; border-radius:10px; padding:12px 14px; margin-bottom:10px;
              border-left:4px solid ${C.primary}; }
  .rec-title { font-weight:700; font-size:13px; margin-bottom:4px; }
  .rec-reason { font-size:11px; color:${C.textSec}; margin-bottom:6px; }
  .rec-tip { font-size:11px; color:${C.textMut}; margin-bottom:2px; }
  .rec-tip::before { content:'• '; color:${C.primary}; font-weight:700; }

  /* Weekly dots */
  .week-dots { display:flex; gap:6px; margin-top:8px; }
  .week-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center;
              justify-content:center; font-size:12px; font-weight:700; }

  /* Footer */
  .footer { text-align:center; font-size:10px; color:${C.textMut}; margin-top:32px; padding-top:16px;
            border-top:1px solid ${C.border}; }

  @media print {
    .page { padding:20px; }
    .card { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="page">
${body}
<div class="footer">
  Generated by ColorAid · Color Vision Training &amp; Analytics · ${new Date().toLocaleString()}
</div>
</div>
</body>
</html>`;
}

// ─── Full Progress Report ─────────────────────────────────────────────────────

export async function exportFullReportPDF(
  report: ProgressReport,
  sessions: Array<{ completedAt: string; accuracyPct: number; gameType: string; difficultyLevel: number }>,
  assessments: Array<{ completedAt: string; cvdType: string; correctPlates: number; totalPlates: number }>,
): Promise<void> {
  const cvdColor = report.assessment ? (
    report.assessment.cvdType === 'normal' ? C.accent :
    ['protanopia','protanomaly'].includes(report.assessment.cvdType) ? C.info :
    ['deuteranopia','deuteranomaly'].includes(report.assessment.cvdType) ? C.warning :
    ['tritanopia','tritanomaly'].includes(report.assessment.cvdType) ? C.error : C.textSec
  ) : C.textSec;

  // Accuracy over time (all sessions, capped last 20)
  const recentSessions = sessions.slice(-20);
  const accuracyValues = recentSessions.map(s => Math.round(s.accuracyPct));
  const diffValues = recentSessions.map(s => s.difficultyLevel);

  // Per-game bars
  const gameBarRows = Object.entries(report.training.gameSummary).map(([g, st]) => ({
    label: `${GAME_EMOJIS[g] ?? '🎮'} ${GAME_LABELS[g] ?? g}`,
    value: st.avgAccuracy,
    color: GAME_COLORS[g] ?? C.primary,
    subtitle: `${st.count} sessions · Best Lvl ${st.bestDifficulty}`,
  }));

  // Assessment score trend
  const assessmentScores = [...assessments].reverse().slice(-10).map(a =>
    a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0
  );

  // CVD history distribution
  const cvdCounts: Record<string, number> = {};
  assessments.forEach(a => { const k = a.cvdType || 'unknown'; cvdCounts[k] = (cvdCounts[k] ?? 0) + 1; });
  const cvdEntries = Object.entries(cvdCounts).sort((a, b) => b[1] - a[1]);
  const cvdTotal = cvdEntries.reduce((s, [, n]) => s + n, 0);
  const cvdBarRows = cvdEntries.map(([type, count]) => ({
    label: type.replace(/([A-Z])/g, ' $1').trim(),
    value: Math.round((count / cvdTotal) * 100),
    color: C.info,
    subtitle: `${count} assessment${count > 1 ? 's' : ''}`,
  }));

  const improvePct = report.training.improvementPct;
  const improveColor = improvePct >= 0 ? C.success : C.error;
  const weekPct = Math.min((report.training.sessionsThisWeek / report.training.weeklyGoal) * 100, 100);

  const body = `
    <!-- HEADER -->
    <div class="header">
      <div class="header-top">
        <div class="brand">ColorAid <span>Color Vision Training</span></div>
        <div class="report-meta">
          <div style="font-size:14px;font-weight:700">Progress Report</div>
          <div>${new Date(report.generatedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
      </div>
    </div>

    <!-- USER PROFILE -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div style="font-size:18px;font-weight:800;color:${C.text}">${report.user.username}</div>
          <div style="font-size:12px;color:${C.textSec};margin-top:2px">
            Level ${report.user.level} · ${report.user.totalXp.toLocaleString()} XP · ${report.user.streakDays} day streak 🔥
          </div>
        </div>
        <div>
          <span class="badge" style="font-size:13px;padding:5px 16px">${report.performanceLevel}</span>
          ${report.assessment ? `<span class="badge" style="background:${cvdColor}20;color:${cvdColor};margin-left:6px;font-size:13px;padding:5px 16px;text-transform:capitalize">${report.assessment.cvdType.replace(/([A-Z])/g,' $1').trim()}</span>` : ''}
        </div>
      </div>
      <div class="metrics">
        <div class="metric">
          <div class="metric-val">${report.training.totalSessions}</div>
          <div class="metric-lbl">Total Sessions</div>
        </div>
        <div class="metric">
          <div class="metric-val">${report.training.overallAvgAccuracy}%</div>
          <div class="metric-lbl">Avg Accuracy</div>
        </div>
        <div class="metric">
          <div class="metric-val" style="color:${improveColor}">${improvePct >= 0 ? '+' : ''}${improvePct}%</div>
          <div class="metric-lbl">Improvement</div>
        </div>
        <div class="metric">
          <div class="metric-val" style="color:${C.coin}">${report.user.coins}</div>
          <div class="metric-lbl">Coins Earned</div>
        </div>
      </div>
    </div>

    ${report.assessment ? `
    <!-- ASSESSMENT -->
    <div class="card" style="border-left:4px solid ${cvdColor}">
      <div class="card-title">Latest Assessment</div>
      <div class="card-sub">${new Date(report.assessment.completedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div class="two-col">
        <div>
          <table>
            <tbody>
              <tr><td style="color:${C.textSec};width:100px">Diagnosis</td>
                  <td style="font-weight:700;text-transform:capitalize;color:${cvdColor}">${report.assessment.cvdType.replace(/([A-Z])/g,' $1').trim()}</td></tr>
              <tr><td style="color:${C.textSec}">Severity</td>
                  <td style="font-weight:700;text-transform:capitalize">${report.assessment.severity}</td></tr>
              <tr><td style="color:${C.textSec}">Confidence</td>
                  <td style="font-weight:700">${Math.round(report.assessment.confidence * 100)}%</td></tr>
              <tr><td style="color:${C.textSec}">Score</td>
                  <td style="font-weight:700;color:${C.primary}">${report.assessment.scorePct !== null ? report.assessment.scorePct + '%' : 'N/A'}</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;align-items:center;justify-content:center">
          <div style="text-align:center">
            <div style="font-size:48px;font-weight:900;color:${cvdColor}">${report.assessment.scorePct ?? '—'}<span style="font-size:20px">%</span></div>
            <div style="font-size:11px;color:${C.textMut};margin-top:4px">Assessment Score</div>
            <div style="font-size:11px;color:${C.textSec}">${report.assessment.correctPlates} / ${report.assessment.totalPlates} plates correct</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    ${accuracyValues.length >= 2 ? `
    <!-- ACCURACY TREND -->
    <div class="card">
      <div class="card-title">📈 Accuracy Over Time</div>
      <div class="card-sub">Last ${accuracyValues.length} training sessions</div>
      ${lineChartSVG(accuracyValues, C.primary)}
    </div>
    ` : ''}

    ${gameBarRows.length > 0 ? `
    <!-- GAME BREAKDOWN -->
    <div class="card">
      <div class="card-title">🎮 Game Performance Breakdown</div>
      <div class="card-sub">Average accuracy and best difficulty per game type</div>
      ${horizontalBarSVG(gameBarRows, 100)}
    </div>
    ` : ''}

    ${diffValues.length >= 2 ? `
    <!-- DIFFICULTY PROGRESSION -->
    <div class="card">
      <div class="card-title">🎯 Difficulty Progression</div>
      <div class="card-sub">How your difficulty level has climbed over time</div>
      ${lineChartSVG(diffValues, C.accent, 500, 140, 10)}
    </div>
    ` : ''}

    <!-- WEEKLY GOAL -->
    <div class="card">
      <div class="card-title">📅 Weekly Training Goal</div>
      <div class="card-sub">Target: ${report.training.weeklyGoal} sessions per week</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;color:${C.textSec}">${report.training.sessionsThisWeek} completed this week</span>
        <span style="font-size:12px;font-weight:700;color:${C.primary}">${Math.round(weekPct)}%</span>
      </div>
      <div class="prog-bar-wrap">
        <div class="prog-bar-fill" style="width:${weekPct.toFixed(1)}%;background:${C.primary}"></div>
      </div>
      <div class="week-dots">
        ${Array.from({length: report.training.weeklyGoal}, (_, i) =>
          `<div class="week-dot" style="background:${i < report.training.sessionsThisWeek ? C.primary : C.bg};color:${i < report.training.sessionsThisWeek ? '#fff' : C.border};border:2px solid ${i < report.training.sessionsThisWeek ? C.primary : C.border}">
            ${i < report.training.sessionsThisWeek ? '✓' : ''}
           </div>`
        ).join('')}
      </div>
    </div>

    ${cvdBarRows.length > 0 && assessmentScores.length >= 2 ? `
    <!-- ASSESSMENT ANALYTICS -->
    <div class="card">
      <div class="card-title">👁️ Assessment Score Trend</div>
      <div class="card-sub">Correct plates % over last ${assessmentScores.length} assessments</div>
      ${lineChartSVG(assessmentScores, C.info)}
    </div>
    ` : ''}

    ${cvdBarRows.length > 0 ? `
    <div class="card">
      <div class="card-title">🔬 CVD Diagnosis History</div>
      <div class="card-sub">Frequency of each diagnosis across all ${assessments.length} assessments</div>
      ${horizontalBarSVG(cvdBarRows, 100)}
    </div>
    ` : ''}

    <!-- IMPROVEMENT TREND -->
    ${report.training.totalSessions >= 5 ? `
    <div class="card">
      <div class="card-title">${improvePct >= 0 ? '📈' : '📉'} Improvement Trend</div>
      <div class="card-sub">Comparing your first 5 sessions vs. most recent 5</div>
      <div style="display:flex;align-items:center;gap:20px;margin-top:8px">
        <div style="background:${improvePct >= 0 ? '#E0FBF6' : '#FFEBEA'};border-radius:12px;padding:20px 28px;text-align:center">
          <div style="font-size:32px;font-weight:900;color:${improveColor}">${improvePct >= 0 ? '+' : ''}${improvePct}%</div>
          <div style="font-size:11px;color:${C.textMut};margin-top:4px">accuracy change</div>
        </div>
        <div style="flex:1;font-size:12px;color:${C.textSec};line-height:1.7">
          ${improvePct > 10
            ? 'Excellent progress! Your accuracy has improved significantly. Keep challenging yourself with higher difficulty levels.'
            : improvePct > 0
            ? "Good progress! You're steadily building your color vision skills through consistent training."
            : improvePct === 0
            ? 'Your accuracy is consistent. Try increasing difficulty levels to push your improvement further.'
            : 'A slight dip can happen. Keep training consistently — your progress will bounce back with practice.'}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- RECOMMENDED ACTIVITIES -->
    ${report.recommendedActivities.length > 0 ? `
    <div class="card">
      <div class="card-title">⭐ Recommended Training Activities</div>
      <div class="card-sub">Personalized for your CVD profile — ${report.assessment?.cvdType ?? 'general'}</div>
      ${report.recommendedActivities.map(act => {
        const color = GAME_COLORS[act.gameType] ?? C.primary;
        return `
          <div class="rec-item" style="border-left-color:${color}">
            <div class="rec-title">${GAME_EMOJIS[act.gameType] ?? '🎮'} ${GAME_LABELS[act.gameType] ?? act.gameType}</div>
            <div class="rec-reason">${act.reason}</div>
            ${act.tips.map(t => `<div class="rec-tip">${t}</div>`).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}
  `;

  const html = htmlShell('ColorAid Progress Report', body);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'ColorAid Progress Report',
    UTI: 'com.adobe.pdf',
  });
}

// ─── Training Sessions PDF ────────────────────────────────────────────────────

export async function exportSessionsPDF(
  sessions: Array<{ completedAt: string; accuracyPct: number; gameType: string; difficultyLevel: number; score?: number }>,
): Promise<void> {
  const sorted = [...sessions].reverse(); // latest first

  // Per-game summary for bar chart
  const gameNames = ['color_match','hue_hunt','shade_spectrum','color_sort'];
  const gameSummaryRows = gameNames.map(g => {
    const gs = sessions.filter(s => s.gameType === g);
    const avg = gs.length ? Math.round(gs.reduce((a, s) => a + s.accuracyPct, 0) / gs.length) : 0;
    return { label: `${GAME_EMOJIS[g] ?? ''} ${GAME_LABELS[g] ?? g}`, value: avg, color: GAME_COLORS[g] ?? C.primary, subtitle: `${gs.length} sessions` };
  }).filter(r => r.value > 0);

  const recentAccuracy = sessions.slice(-15).map(s => Math.round(s.accuracyPct));

  // Compute streak/avg
  const overallAvg = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + s.accuracyPct, 0) / sessions.length)
    : 0;
  const bestAcc = sessions.length ? Math.round(Math.max(...sessions.map(s => s.accuracyPct))) : 0;
  const bestDiff = sessions.length ? Math.max(...sessions.map(s => s.difficultyLevel)) : 0;

  const tableRows = sorted.map(s => {
    const date = s.completedAt ? new Date(s.completedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const acc = s.accuracyPct.toFixed(0);
    const color = GAME_COLORS[s.gameType] ?? C.primary;
    return `
      <tr>
        <td>${date}</td>
        <td><span style="font-weight:600;color:${color}">${GAME_EMOJIS[s.gameType] ?? ''} ${GAME_LABELS[s.gameType] ?? s.gameType}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="prog-bar-wrap" style="width:60px;display:inline-block">
              <div class="prog-bar-fill" style="width:${acc}%;background:${color}"></div>
            </div>
            <span style="font-weight:700;color:${color}">${acc}%</span>
          </div>
        </td>
        <td>
          <div style="display:flex;gap:2px">
            ${Array.from({length:10},(_,i)=>`<div style="width:8px;height:8px;border-radius:2px;background:${i<s.difficultyLevel?color:C.bg}"></div>`).join('')}
            <span style="margin-left:4px;font-size:10px;color:${C.textMut}">${s.difficultyLevel}/10</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const body = `
    <div class="header">
      <div class="header-top">
        <div class="brand">ColorAid <span>Color Vision Training</span></div>
        <div class="report-meta">
          <div style="font-size:14px;font-weight:700">Training Sessions</div>
          <div>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
      </div>
    </div>

    <div class="metrics" style="margin-bottom:18px">
      <div class="metric"><div class="metric-val">${sessions.length}</div><div class="metric-lbl">Total Sessions</div></div>
      <div class="metric"><div class="metric-val">${overallAvg}%</div><div class="metric-lbl">Avg Accuracy</div></div>
      <div class="metric"><div class="metric-val">${bestAcc}%</div><div class="metric-lbl">Best Session</div></div>
      <div class="metric"><div class="metric-val">${bestDiff}/10</div><div class="metric-lbl">Best Difficulty</div></div>
    </div>

    ${recentAccuracy.length >= 2 ? `
    <div class="card">
      <div class="card-title">📈 Accuracy Trend</div>
      <div class="card-sub">Last ${recentAccuracy.length} sessions</div>
      ${lineChartSVG(recentAccuracy, C.primary)}
    </div>
    ` : ''}

    ${gameSummaryRows.length > 0 ? `
    <div class="card">
      <div class="card-title">🎮 Avg Accuracy by Game</div>
      <div class="card-sub">All-time average per game type</div>
      ${horizontalBarSVG(gameSummaryRows, 100)}
    </div>
    ` : ''}

    <div class="card">
      <div class="card-title">📋 All Sessions</div>
      <div class="card-sub">${sessions.length} sessions · sorted latest first</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Game</th>
            <th>Accuracy</th>
            <th>Difficulty</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  const html = htmlShell('ColorAid Training Sessions', body);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'ColorAid Training Sessions',
    UTI: 'com.adobe.pdf',
  });
}

// ─── Assessment History PDF ───────────────────────────────────────────────────

export async function exportAssessmentsPDF(
  assessments: Array<{ completedAt: string; cvdType: string; correctPlates: number; totalPlates: number }>,
): Promise<void> {
  const sorted = [...assessments]; // already latest-first from component

  // Score trend
  const scores = [...assessments].reverse().slice(-10).map(a =>
    a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0
  );

  // CVD distribution
  const cvdCounts: Record<string, number> = {};
  assessments.forEach(a => { cvdCounts[a.cvdType] = (cvdCounts[a.cvdType] ?? 0) + 1; });
  const cvdEntries = Object.entries(cvdCounts).sort((a, b) => b[1] - a[1]);
  const cvdTotal = cvdEntries.reduce((s, [, n]) => s + n, 0);
  const cvdBarRows = cvdEntries.map(([type, count]) => ({
    label: type.replace(/([A-Z])/g, ' $1').trim(),
    value: Math.round((count / cvdTotal) * 100),
    color: C.info,
    subtitle: `${count} time${count > 1 ? 's' : ''}`,
  }));

  const avgScore = assessments.length
    ? Math.round(assessments.reduce((s, a) => s + (a.totalPlates > 0 ? (a.correctPlates / a.totalPlates) * 100 : 0), 0) / assessments.length)
    : 0;
  const latestDx = sorted[0]?.cvdType?.replace(/([A-Z])/g,' $1').trim() ?? '—';

  const tableRows = sorted.map(a => {
    const date = a.completedAt ? new Date(a.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const scorePct = a.totalPlates > 0 ? Math.round((a.correctPlates / a.totalPlates) * 100) : 0;
    return `
      <tr>
        <td>${date}</td>
        <td style="text-transform:capitalize;font-weight:600;color:${C.info}">${a.cvdType.replace(/([A-Z])/g,' $1').trim()}</td>
        <td style="text-align:center">${a.correctPlates}</td>
        <td style="text-align:center">${a.totalPlates}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="prog-bar-wrap" style="width:60px;display:inline-block">
              <div class="prog-bar-fill" style="width:${scorePct}%;background:${C.info}"></div>
            </div>
            <span style="font-weight:700;color:${C.info}">${scorePct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const body = `
    <div class="header">
      <div class="header-top">
        <div class="brand">ColorAid <span>Color Vision Training</span></div>
        <div class="report-meta">
          <div style="font-size:14px;font-weight:700">Assessment History</div>
          <div>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
      </div>
    </div>

    <div class="metrics" style="margin-bottom:18px">
      <div class="metric"><div class="metric-val">${assessments.length}</div><div class="metric-lbl">Total Assessments</div></div>
      <div class="metric"><div class="metric-val">${avgScore}%</div><div class="metric-lbl">Avg Score</div></div>
      <div class="metric"><div class="metric-val" style="font-size:14px;text-transform:capitalize">${latestDx}</div><div class="metric-lbl">Latest Diagnosis</div></div>
    </div>

    <div class="card">
      <div class="card-title">📋 All Assessments</div>
      <div class="card-sub">${assessments.length} assessments · latest first</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Diagnosis</th>
            <th style="text-align:center">Correct</th>
            <th style="text-align:center">Total</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  const html = htmlShell('ColorAid Assessment History', body);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'ColorAid Assessment History',
    UTI: 'com.adobe.pdf',
  });
}

// ─── Game Performance Analytics PDF ──────────────────────────────────────────

export async function exportGamePerformancePDF(
  sessions: Array<{ completedAt: string; accuracyPct: number; gameType: string; difficultyLevel: number; score?: number }>,
): Promise<void> {
  const gameNames = ['color_match','hue_hunt','shade_spectrum','color_sort'];
  
  // Accuracy Trend
  const recentAccuracy = sessions.slice(-15).map(s => Math.round(s.accuracyPct));
  
  // Avg Accuracy by Game
  const gameSummaryRows = gameNames.map(g => {
    const gs = sessions.filter(s => s.gameType === g);
    const avg = gs.length ? Math.round(gs.reduce((a, s) => a + s.accuracyPct, 0) / gs.length) : 0;
    return { label: `${GAME_EMOJIS[g] ?? ''} ${GAME_LABELS[g] ?? g}`, value: avg, color: GAME_COLORS[g] ?? C.primary, subtitle: `${gs.length} sessions` };
  }).filter(r => r.value > 0);

  // Difficulty Progression
  const recentDiff = sessions.slice(-15).map(s => s.difficultyLevel);

  // Best Difficulty per game
  const bestDiffRows = gameNames.map(g => {
    const gs = sessions.filter(s => s.gameType === g);
    const best = gs.length ? Math.max(...gs.map(s => s.difficultyLevel)) : 0;
    return { label: `${GAME_EMOJIS[g] ?? ''} ${GAME_LABELS[g] ?? g}`, value: best, color: GAME_COLORS[g] ?? C.primary, subtitle: `Best Level` };
  }).filter(r => r.value > 0);

  const body = `
    <div class="header">
      <div class="header-top">
        <div class="brand">ColorAid <span>Color Vision Training</span></div>
        <div class="report-meta">
          <div style="font-size:14px;font-weight:700">Game Performance Analytics</div>
          <div>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
      </div>
    </div>

    ${recentAccuracy.length >= 2 ? `
    <div class="card">
      <div class="card-title">📈 Accuracy Over Time</div>
      <div class="card-sub">Last ${recentAccuracy.length} training sessions</div>
      ${lineChartSVG(recentAccuracy, C.primary)}
    </div>
    ` : ''}

    ${gameSummaryRows.length > 0 ? `
    <div class="card">
      <div class="card-title">🎮 Avg Accuracy by Game</div>
      <div class="card-sub">All-time average per game type</div>
      ${horizontalBarSVG(gameSummaryRows, 100)}
    </div>
    ` : ''}

    ${recentDiff.length >= 2 ? `
    <div class="card">
      <div class="card-title">🎯 Difficulty Progression</div>
      <div class="card-sub">How your difficulty level has climbed over time (Last ${recentDiff.length} sessions)</div>
      ${lineChartSVG(recentDiff, C.accent, 500, 140, 10)}
    </div>
    ` : ''}

    ${bestDiffRows.length > 0 ? `
    <div class="card">
      <div class="card-title">🏆 Best Difficulty Reached</div>
      <div class="card-sub">Highest difficulty played per game (Max 10)</div>
      ${horizontalBarSVG(bestDiffRows, 10)}
    </div>
    ` : ''}
  `;

  const html = htmlShell('ColorAid Game Performance', body);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'ColorAid Game Performance',
    UTI: 'com.adobe.pdf',
  });
}
