import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trainingApi, type GameType, type RoundResult } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { hsvToRgb } from '../../src/utils/colorUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUNDS = 10;
const BASE_PTS = 100;
const TIME_BONUS_MS = 3500;
const SW = Dimensions.get('window').width;

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'preview' | 'playing' | 'feedback' | 'complete';

interface CS { hex: string; h: number; s: number; v: number; label: string }

// Each game has its own round shape (discriminated union)
type Round =
  | { kind: 'color_match';    target: CS; opts: CS[]; correctIdx: number; showLabel: boolean }
  | { kind: 'hue_hunt';       cells: CS[]; oddIdx: number; numCols: number }
  | { kind: 'shade_spectrum'; swatches: CS[]; sortedOrder: number[] }
  | { kind: 'color_sort';     swatch: CS; cats: string[]; correctCatIdx: number };

// ─── Color Helpers ────────────────────────────────────────────────────────────

function mkSwatch(h: number, s: number, v: number): CS {
  h = ((h % 360) + 360) % 360;
  s = Math.max(5, Math.min(100, s));
  v = Math.max(15, Math.min(95, v));
  const { r, g, b } = hsvToRgb(h, s, v);
  const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  return { hex, h, s, v, label: hueToLabel(h) };
}

function hueToLabel(h: number): string {
  if (h >= 355 || h < 12) return 'Red';
  if (h < 22)  return 'Red-Orange';
  if (h < 38)  return 'Orange';
  if (h < 50)  return 'Yellow-Orange';
  if (h < 65)  return 'Yellow';
  if (h < 80)  return 'Yellow-Green';
  if (h < 155) return 'Green';
  if (h < 180) return 'Teal';
  if (h < 200) return 'Cyan';
  if (h < 215) return 'Sky Blue';
  if (h < 255) return 'Blue';
  if (h < 275) return 'Indigo';
  if (h < 290) return 'Violet';
  if (h < 320) return 'Purple';
  if (h < 340) return 'Magenta';
  return 'Pink';
}

function hueDist(a: number, b: number) {
  const d = Math.abs((a - b + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// ─── Game 1: Color Match ──────────────────────────────────────────────────────
// Target color is shown. Tap the one of 4 options that matches exactly.
// At difficulty 1: options are wildly different hues (easy).
// At difficulty 10: options are nearly identical shades (hard).

function genColorMatch(diff: number): Extract<Round, { kind: 'color_match' }> {
  // d1→80°, d3→45°, d5→22°, d7→11°, d10→5°
  const hueDiff = Math.max(4, Math.round(80 * Math.pow(0.78, diff - 1)));
  const sat = 65 + diff;
  const val = 72 - diff * 0.5;
  const showLabel = diff < 5;  // hide color name label at hard difficulties

  const targetH = Math.floor(Math.random() * 360);
  const target = mkSwatch(targetH, sat, val);

  const optHues: number[] = [targetH];
  let tries = 0;
  while (optHues.length < 4 && tries++ < 600) {
    const sign = Math.random() < 0.5 ? 1 : -1;
    const offset = hueDiff + Math.floor(Math.random() * hueDiff * 0.8);
    const c = (targetH + sign * offset + 360) % 360;
    if (optHues.every(h => hueDist(h, c) >= hueDiff)) optHues.push(c);
  }
  while (optHues.length < 4) optHues.push((targetH + optHues.length * 90) % 360);

  const shuffled = [...optHues].sort(() => Math.random() - 0.5);
  const correctIdx = shuffled.indexOf(targetH);

  // At very high difficulties, add slight sat/val variation to confuse
  const satVar = diff >= 7 ? 10 : 0;
  const valVar = diff >= 7 ? 8 : 0;
  const opts = shuffled.map(h =>
    mkSwatch(h, sat + (Math.random() - 0.5) * satVar, val + (Math.random() - 0.5) * valVar)
  );

  return { kind: 'color_match', target, opts, correctIdx, showLabel };
}

// ─── Game 2: Hue Hunt ─────────────────────────────────────────────────────────
// Grid of N same-colored cells — ONE cell has a slightly different hue.
// Tap the odd one out.
// Difficulty scales both grid size and how close the odd hue is.

function genHueHunt(diff: number): Extract<Round, { kind: 'hue_hunt' }> {
  const numCells = diff <= 2 ? 4 : diff <= 4 ? 6 : diff <= 6 ? 9 : diff <= 8 ? 12 : 16;
  const numCols  = numCells <= 4 ? 2 : numCells <= 9 ? 3 : 4;
  // d1→60°, d3→34°, d5→19°, d7→11°, d10→5°
  const diffHue  = Math.max(4, Math.round(60 * Math.pow(0.76, diff - 1)));
  const sat = 58 + diff;
  const val = 65;

  const mainH = Math.floor(Math.random() * 360);
  const sign  = Math.random() < 0.5 ? 1 : -1;
  const oddH  = (mainH + sign * diffHue + 360) % 360;
  const oddIdx = Math.floor(Math.random() * numCells);

  const cells: CS[] = Array.from({ length: numCells }, (_, i) => {
    const h = i === oddIdx ? oddH : mainH;
    // At high difficulty add tiny brightness noise to all cells so hue is the only true signal
    const vNoise = diff >= 6 ? (Math.random() - 0.5) * 4 : 0;
    return mkSwatch(h, sat, val + vNoise);
  });

  return { kind: 'hue_hunt', cells, oddIdx, numCols };
}

// ─── Game 3: Shade Spectrum ───────────────────────────────────────────────────
// N swatches of the SAME hue displayed in random order.
// Tap them one-by-one from LIGHTEST to DARKEST.
// Difficulty scales both the number of swatches and how similar the shades are.

function genShadeSpectrum(diff: number): Extract<Round, { kind: 'shade_spectrum' }> {
  const n = diff <= 3 ? 3 : diff <= 6 ? 4 : diff <= 8 ? 5 : 6;
  // d1→60 spread, d5→25, d10→8 spread — smaller spread = harder to order
  const vSpread = Math.max(8, Math.round(60 * Math.pow(0.83, diff - 1)));
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 15);
  const minV = 30;

  // lightToDeep[0] = lightest (highest V), lightToDeep[n-1] = darkest (lowest V)
  const lightToDeep: CS[] = Array.from({ length: n }, (_, i) => {
    const v = Math.round(minV + (vSpread / (n - 1)) * (n - 1 - i));
    return mkSwatch(hue, sat, v);
  });

  // Shuffle for display order
  const dispOrder = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
  const swatches = dispOrder.map(i => lightToDeep[i]);

  // sortedOrder[k] = index in swatches[] that is the k-th lightest
  const sortedOrder = Array.from({ length: n }, (_, k) => dispOrder.indexOf(k));

  return { kind: 'shade_spectrum', swatches, sortedOrder };
}

// ─── Game 4: Color Sort ────────────────────────────────────────────────────────
// One color swatch at a time. Pick which category it belongs to.
// Difficulty scales both the number of categories and whether colors are
// near category boundaries (making them ambiguous).

const CATS_EASY  = ['Red', 'Green', 'Blue'];
const CATS_MED   = ['Red', 'Yellow/Orange', 'Green', 'Blue', 'Purple'];
const CATS_HARD  = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple/Pink'];

// [hMin, hMax] for each category (hMin > hMax means wraps through 0°)
const RANGES_EASY:  [number,number][] = [[345,20], [80,160], [215,260]];
const RANGES_MED:   [number,number][] = [[340,20], [15,65], [65,165], [200,255], [255,340]];
const RANGES_HARD:  [number,number][] = [[345,15], [12,42], [40,68], [65,155], [195,255], [255,345]];

// Representative hues for each category used in the preview screen
const PREVIEW_HUES_EASY:  number[] = [0, 120, 230];
const PREVIEW_HUES_MED:   number[] = [0, 35, 120, 225, 290];
const PREVIEW_HUES_HARD:  number[] = [0, 25, 55, 110, 225, 300];

function randHueInRange([lo, hi]: [number, number], boundary: boolean, diff: number): number {
  const span = hi > lo ? hi - lo : hi + 360 - lo;
  let offset: number;
  if (boundary && diff >= 6) {
    const edge = Math.floor(span * 0.15);
    offset = Math.random() < 0.5
      ? Math.floor(Math.random() * edge)
      : span - Math.floor(Math.random() * edge);
  } else {
    offset = Math.floor(Math.random() * span);
  }
  return (lo + offset + 360) % 360;
}

/** Generate 3 representative swatches spread across a hue range */
function previewSwatchesForRange([lo, hi]: [number,number]): CS[] {
  const span = hi > lo ? hi - lo : hi + 360 - lo;
  return [0.2, 0.5, 0.8].map(t => {
    const hue = (lo + Math.round(span * t) + 360) % 360;
    return mkSwatch(hue, 70, 62);
  });
}

function genColorSort(diff: number): Extract<Round, { kind: 'color_sort' }> {
  const [cats, ranges] = diff <= 3 ? [CATS_EASY, RANGES_EASY]
    : diff <= 6 ? [CATS_MED, RANGES_MED]
    : [CATS_HARD, RANGES_HARD];

  const correctCatIdx = Math.floor(Math.random() * cats.length);
  const hue = randHueInRange(ranges[correctCatIdx] as [number,number], diff >= 5, diff);
  const swatch = mkSwatch(hue, 60 + Math.floor(Math.random() * 20), 55 + Math.floor(Math.random() * 20));

  return { kind: 'color_sort', swatch, cats, correctCatIdx };
}

/** Returns the category/range arrays for a given difficulty */
function getCatsAndRanges(diff: number): { cats: string[]; ranges: [number,number][]; previewHues: number[] } {
  if (diff <= 3) return { cats: CATS_EASY, ranges: RANGES_EASY, previewHues: PREVIEW_HUES_EASY };
  if (diff <= 6) return { cats: CATS_MED,  ranges: RANGES_MED,  previewHues: PREVIEW_HUES_MED };
  return             { cats: CATS_HARD, ranges: RANGES_HARD, previewHues: PREVIEW_HUES_HARD };
}

// ─── Game Meta ────────────────────────────────────────────────────────────────

const GAME_META: Record<string, { label: string; emoji: string; instr: string }> = {
  color_match:    { label: 'Color Match',    emoji: '🎨', instr: 'Tap the swatch that exactly matches the target color.' },
  hue_hunt:       { label: 'Hue Hunt',       emoji: '🔍', instr: 'One color has a different hue than the rest.\nTap the odd one out.' },
  shade_spectrum: { label: 'Shade Spectrum', emoji: '🌈', instr: 'Tap all shades in order from LIGHTEST to DARKEST.' },
  color_sort:     { label: 'Color Sort',     emoji: '🗂️', instr: 'Which color category does this swatch belong to?' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingGameScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();
  const router = useRouter();

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState(1);
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [roundNum, setRoundNum] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [score, setScore] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  // shade_spectrum: ordered list the user is building (indices into swatches[])
  const [shadeOrder, setShadeOrder] = useState<number[]>([]);
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const gt = (gameType ?? 'color_match') as GameType;
  const meta = GAME_META[gt] ?? GAME_META.color_match;

  function makeRound(diff: number): Round {
    if (gt === 'hue_hunt')       return genHueHunt(diff);
    if (gt === 'shade_spectrum') return genShadeSpectrum(diff);
    if (gt === 'color_sort')     return genColorSort(diff);
    return genColorMatch(diff);
  }

  async function startGame() {
    try {
      const { sessionId: id } = await trainingApi.startSession(gt, difficulty);
      setSessionId(id);
      setRounds([]);
      setScore(0);
      // For color_sort, show the category preview first
      if (gt === 'color_sort') {
        setPhase('preview');
      } else {
        pushRound(0, difficulty);
        setPhase('playing');
      }
    } catch {
      Alert.alert('Error', 'Could not start game. Please try again.');
    }
  }

  function beginPlaying() {
    pushRound(0, difficulty);
    setPhase('playing');
  }

  function pushRound(done: number, diff: number) {
    setRound(makeRound(diff));
    setRoundNum(done + 1);
    setStartTime(Date.now());
    setLastCorrect(null);
    setShadeOrder([]);
  }

  function commit(isCorrect: boolean) {
    if (!round) return;
    const responseMs = Date.now() - startTime;
    const timeBonus = isCorrect && responseMs < TIME_BONUS_MS
      ? Math.round((TIME_BONUS_MS - responseMs) / 35) : 0;
    const points = isCorrect ? BASE_PTS + timeBonus : 0;
    const rr: RoundResult = {
      roundNumber: roundNum,
      targetColor: getLabel(round),
      userAnswer: isCorrect ? 'correct' : 'incorrect',
      isCorrect, points, responseMs,
    };
    const newRounds = [...rounds, rr];
    setRounds(newRounds);
    setScore(s => s + points);
    setLastCorrect(isCorrect);
    setPhase('feedback');
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => {
      if (newRounds.length >= ROUNDS) { finishGame(newRounds); }
      else { pushRound(newRounds.length, difficulty); setPhase('playing'); }
    });
  }

  // shade_spectrum: tap a swatch to add/remove it from the ordered sequence
  function onShadeTap(i: number) {
    if (phase !== 'playing') return;
    setShadeOrder(prev => {
      if (prev.includes(i)) {
        // Deselect — remove from order
        return prev.filter(x => x !== i);
      } else {
        // Append to end of sequence
        return [...prev, i];
      }
    });
  }

  // shade_spectrum: submit the current order for judging
  function submitShadeOrder() {
    if (!round || round.kind !== 'shade_spectrum') return;
    const n = round.swatches.length;
    if (shadeOrder.length !== n) return; // shouldn't happen — button disabled
    const isCorrect = shadeOrder.every((swatchIdx, k) => swatchIdx === round.sortedOrder[k]);
    commit(isCorrect);
  }

  function getLabel(r: Round): string {
    switch (r.kind) {
      case 'color_match':    return r.target.label;
      case 'hue_hunt':       return r.cells[0]?.label ?? '';
      case 'shade_spectrum': return `${r.swatches.length}-shade`;
      case 'color_sort':     return r.swatch.label;
    }
  }

  async function finishGame(finalRounds: RoundResult[]) {
    setPhase('complete');
    if (sessionId) {
      try { await trainingApi.completeSession(sessionId, finalRounds); }
      catch { /* non-critical */ }
    }
  }

  // ── READY ─────────────────────────────────────────────────────────────────

  if (phase === 'ready') {
    return (
      <View style={styles.container}>
        <View style={styles.readyBox}>
          <Text style={styles.readyEmoji}>{meta.emoji}</Text>
          <Text style={styles.readyTitle}>{meta.label}</Text>
          <Text style={styles.readyInstr}>{meta.instr}</Text>
          <Text style={styles.readyMeta}>{ROUNDS} rounds · Difficulty {difficulty}</Text>
          <View style={styles.diffRow}>
            <Text style={styles.diffLabel}>Difficulty</Text>
            <View style={styles.diffBtns}>
              {[1, 3, 5, 7, 10].map(d => (
                <TouchableOpacity key={d}
                  style={[styles.diffBtn, difficulty === d && styles.diffBtnOn]}
                  onPress={() => setDifficulty(d)}>
                  <Text style={[styles.diffBtnTxt, difficulty === d && styles.diffBtnTxtOn]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={startGame}>
            <Text style={styles.primaryBtnTxt}>Start Game</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── COLOR SORT PREVIEW ────────────────────────────────────────────────────
  // Shows the player all color categories with example swatches before gameplay.

  if (phase === 'preview' && gt === 'color_sort') {
    const { cats, ranges } = getCatsAndRanges(difficulty);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.previewBox}>
        <Text style={styles.previewTitle}>🗂️ Color Categories</Text>
        <Text style={styles.previewSubtitle}>
          Familiarise yourself with the categories before playing.
          Each row shows example colors that belong to that group.
        </Text>
        {cats.map((cat, ci) => {
          const swatches = previewSwatchesForRange(ranges[ci] as [number, number]);
          return (
            <View key={ci} style={styles.previewRow}>
              <Text style={styles.previewCatName}>{cat}</Text>
              <View style={styles.previewSwatches}>
                {swatches.map((sw, si) => (
                  <View key={si} style={[styles.previewSwatch, { backgroundColor: sw.hex }]} />
                ))}
              </View>
            </View>
          );
        })}
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.xl }]} onPress={beginPlaying}>
          <Text style={styles.primaryBtnTxt}>Next →  Start Game</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── COMPLETE ──────────────────────────────────────────────────────────────

  if (phase === 'complete') {
    const correct = rounds.filter(r => r.isCorrect).length;
    const accuracy = rounds.length ? Math.round((correct / rounds.length) * 100) : 0;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.completeBox}>
        <Text style={styles.completeEmoji}>{accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👍' : '💪'}</Text>
        <Text style={styles.completeTitle}>Game Complete!</Text>
        <View style={styles.statsRow}>
          {[
            { label: 'Score',    val: String(score),             color: Colors.primary },
            { label: 'Accuracy', val: `${accuracy}%`,            color: Colors.success },
            { label: 'Correct',  val: `${correct}/${rounds.length}`, color: Colors.primary },
          ].map(s => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn}
          onPress={() => { setPhase('ready'); setRoundNum(0); }}>
          <Text style={styles.primaryBtnTxt}>Play Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/(tabs)/home')}>
          <Text style={styles.ghostBtnTxt}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!round) return null;

  const disabled = phase === 'feedback';

  // Shared header
  const header = (
    <>
      <View style={styles.gameHdr}>
        <Text style={styles.roundLbl}>Round {roundNum}/{ROUNDS}</Text>
        <Text style={styles.scoreLbl}>Score: {score}</Text>
      </View>
      <View style={styles.pbar}>
        <View style={[styles.pbarFill, { width: `${(roundNum / ROUNDS) * 100}%` as any }]} />
      </View>
    </>
  );

  // Shared feedback overlay
  const feedback = (
    <Animated.View
      pointerEvents="none"
      style={[styles.fbOverlay, { opacity: feedbackAnim,
        backgroundColor: lastCorrect ? Colors.success + 'CC' : Colors.error + 'CC' }]}>
      <Text style={styles.fbTxt}>{lastCorrect ? '✓ Correct!' : '✗ Wrong!'}</Text>
    </Animated.View>
  );

  // ── COLOR MATCH ───────────────────────────────────────────────────────────

  if (round.kind === 'color_match') {
    const gap = 10;
    const cellW = Math.floor((SW - 32 - gap * 3) / 4);
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.targetSection}>
          <Text style={styles.targetHint}>Match this color</Text>
          <View style={[styles.bigSwatch, { backgroundColor: round.target.hex }]} />
          {round.showLabel
            ? <Text style={styles.targetLbl}>{round.target.label}</Text>
            : <Text style={styles.targetLblMuted}>No label at this difficulty</Text>}
        </View>
        <View style={[styles.matchGrid, { gap }]}>
          {round.opts.map((opt, i) => (
            <TouchableOpacity key={i}
              style={[styles.matchOpt, { width: cellW, height: cellW },
                disabled && i === round.correctIdx && styles.optCorrect]}
              onPress={() => commit(i === round.correctIdx)}
              disabled={disabled} accessibilityRole="button">
              <View style={[StyleSheet.absoluteFill, { borderRadius: Radius.lg, backgroundColor: opt.hex }]} />
            </TouchableOpacity>
          ))}
        </View>
        {feedback}
      </View>
    );
  }

  // ── HUE HUNT ──────────────────────────────────────────────────────────────

  if (round.kind === 'hue_hunt') {
    const gap = 6;
    const cellW = Math.floor((SW - 32 - gap * (round.numCols - 1)) / round.numCols);
    return (
      <View style={styles.container}>
        {header}
        <Text style={styles.huntPrompt}>Which one has a different hue?</Text>
        <View style={[styles.huntGrid, { gap }]}>
          {round.cells.map((cell, i) => (
            <TouchableOpacity key={i}
              style={[styles.huntCell, { width: cellW, height: cellW },
                disabled && i === round.oddIdx && styles.optCorrect]}
              onPress={() => commit(i === round.oddIdx)}
              disabled={disabled} accessibilityRole="button"
              accessibilityLabel={`Cell ${i + 1}`}>
              <View style={[StyleSheet.absoluteFill,
                { borderRadius: Radius.md, backgroundColor: cell.hex }]} />
            </TouchableOpacity>
          ))}
        </View>
        {feedback}
      </View>
    );
  }

  // ── SHADE SPECTRUM ────────────────────────────────────────────────────────

  if (round.kind === 'shade_spectrum') {
    const n = round.swatches.length;
    const gap = 10;
    const cellW = Math.min(72, Math.floor((SW - 32 - gap * (n - 1)) / n));
    const allSelected = shadeOrder.length === n;

    return (
      <View style={styles.container}>
        {header}
        <View style={styles.shadeSection}>
          <Text style={styles.shadeHint}>Order from lightest → darkest</Text>

          {/* Ordered sequence the user is building */}
          <Text style={styles.shadeSeqLabel}>Your order (tap a placed swatch to remove it):</Text>
          <View style={styles.shadeChain}>
            {Array.from({ length: n }).map((_, k) => (
              <View key={k} style={styles.shadeChainItem}>
                {k > 0 && <Text style={styles.shadeArrow}>›</Text>}
                {k < shadeOrder.length ? (
                  <TouchableOpacity
                    onPress={() => !disabled && onShadeTap(shadeOrder[k])}
                    style={[styles.shadeChainDot, { backgroundColor: round.swatches[shadeOrder[k]].hex }]}
                    accessibilityLabel={`Remove position ${k + 1}`}
                  />
                ) : (
                  <View style={[styles.shadeChainDot, styles.shadeChainEmpty]}>
                    <Text style={styles.shadeChainNum}>{k + 1}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          <Text style={styles.shadePickHint}>
            {disabled
              ? ''
              : shadeOrder.length === 0
              ? 'Tap the LIGHTEST shade first'
              : allSelected
              ? 'Review your order, then submit!'
              : `Select shade #${shadeOrder.length + 1} — tap to place, tap chain to remove`}
          </Text>

          {/* Available swatches palette */}
          <View style={[styles.shadeOpts, { gap }]}>
            {round.swatches.map((sw, i) => {
              const posInOrder = shadeOrder.indexOf(i);
              const isPlaced = posInOrder >= 0;
              const isHintIncorrect = disabled && !lastCorrect && i === round.sortedOrder[0];
              return (
                <TouchableOpacity key={i}
                  style={[styles.shadeOpt, { width: cellW, height: cellW },
                    isPlaced && styles.shadeOptPlaced,
                    isHintIncorrect && styles.optCorrect]}
                  onPress={() => onShadeTap(i)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Shade ${i + 1}${isPlaced ? `, placed at position ${posInOrder + 1}` : ''}`}>
                  <View style={[StyleSheet.absoluteFill,
                    { borderRadius: Radius.md, backgroundColor: sw.hex, opacity: isPlaced ? 0.35 : 1 }]} />
                  {isPlaced && (
                    <View style={styles.shadeOptBadge}>
                      <Text style={styles.shadeOptBadgeTxt}>{posInOrder + 1}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Submit button */}
          {!disabled && (
            <TouchableOpacity
              style={[styles.submitBtn, !allSelected && styles.submitBtnDisabled]}
              onPress={submitShadeOrder}
              disabled={!allSelected}
              accessibilityRole="button"
              accessibilityLabel="Submit order">
              <Text style={styles.submitBtnTxt}>
                {allSelected ? 'Submit ✓' : `Place all ${n} shades to submit`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {feedback}
      </View>
    );
  }

  // ── COLOR SORT ────────────────────────────────────────────────────────────

  if (round.kind === 'color_sort') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.sortSection}>
          <Text style={styles.sortHint}>Which color category is this?</Text>
          <View style={[styles.sortSwatch, { backgroundColor: round.swatch.hex }]} />
          <View style={styles.catGrid}>
            {round.cats.map((cat, i) => (
              <TouchableOpacity key={i}
                style={[styles.catBtn,
                  disabled && i === round.correctCatIdx && styles.catBtnCorrect]}
                onPress={() => commit(i === round.correctCatIdx)}
                disabled={disabled} accessibilityRole="button">
                <Text style={styles.catBtnTxt}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {feedback}
      </View>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Ready
  readyBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  readyEmoji:  { fontSize: 64 },
  readyTitle:  { fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md },
  readyInstr:  { color: Colors.textSecondary, textAlign: 'center', fontSize: Typography.size.base, marginTop: Spacing.sm, lineHeight: 22 },
  readyMeta:   { color: Colors.textMuted, fontSize: Typography.size.sm, marginTop: Spacing.xs },
  diffRow:     { marginTop: Spacing.xl, alignItems: 'center' },
  diffLabel:   { color: Colors.textSecondary, fontWeight: '600', marginBottom: Spacing.sm },
  diffBtns:    { flexDirection: 'row', gap: Spacing.sm },
  diffBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.border },
  diffBtnOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  diffBtnTxt:  { fontWeight: '700', color: Colors.textSecondary },
  diffBtnTxtOn:{ color: Colors.textInverted },
  primaryBtn:  { marginTop: Spacing.xl, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing['3xl'], paddingVertical: Spacing.md, ...Shadow.md },
  primaryBtnTxt: { color: Colors.textInverted, fontSize: Typography.size.md, fontWeight: '700' },

  // Color Sort Preview
  previewBox:       { padding: Spacing.xl, paddingBottom: 80 },
  previewTitle:     { fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  previewSubtitle:  { fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },
  previewRow:       { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', ...Shadow.sm },
  previewCatName:   { flex: 1, fontWeight: '700', color: Colors.textPrimary, fontSize: Typography.size.base },
  previewSwatches:  { flexDirection: 'row', gap: Spacing.sm },
  previewSwatch:    { width: 36, height: 36, borderRadius: Radius.md, ...Shadow.sm },

  // Complete
  completeBox:   { alignItems: 'center', padding: Spacing.xl, paddingBottom: 80 },
  completeEmoji: { fontSize: 72, marginBottom: Spacing.md },
  completeTitle: { fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xl },
  statsRow:      { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  statBox:       { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.sm },
  statVal:       { fontSize: Typography.size.xl, fontWeight: '800' },
  statLbl:       { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },
  ghostBtn:      { paddingVertical: Spacing.md },
  ghostBtnTxt:   { color: Colors.textSecondary, fontSize: Typography.size.sm },

  // Shared game header
  gameHdr:   { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.base, paddingTop: Spacing.xl },
  roundLbl:  { fontSize: Typography.size.sm, color: Colors.textSecondary, fontWeight: '600' },
  scoreLbl:  { fontSize: Typography.size.sm, color: Colors.primary, fontWeight: '700' },
  pbar:      { height: 6, backgroundColor: Colors.border, marginHorizontal: Spacing.base, borderRadius: Radius.full, overflow: 'hidden' },
  pbarFill:  { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },

  // Feedback overlay
  fbOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fbTxt:     { color: Colors.textInverted, fontSize: Typography.size['2xl'], fontWeight: '900' },

  // Shared option highlight
  optCorrect: { borderColor: Colors.success },

  // Color Match
  targetSection: { alignItems: 'center', paddingVertical: Spacing.xl },
  targetHint:    { fontSize: Typography.size.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  bigSwatch:     { width: 110, height: 110, borderRadius: Radius.xl, ...Shadow.lg },
  targetLbl:     { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.md },
  targetLblMuted:{ fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: Spacing.md, fontStyle: 'italic' },
  matchGrid:     { flexDirection: 'row', paddingHorizontal: 16, justifyContent: 'center' },
  matchOpt:      { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', ...Shadow.sm },

  // Hue Hunt
  huntPrompt: { textAlign: 'center', color: Colors.textSecondary, fontSize: Typography.size.base, fontWeight: '600', marginVertical: Spacing.lg, paddingHorizontal: Spacing.base },
  huntGrid:   { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  huntCell:   { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', ...Shadow.sm },

  // Shade Spectrum
  shadeSection:    { flex: 1, padding: Spacing.base },
  shadeHint:       { textAlign: 'center', fontWeight: '700', color: Colors.textPrimary, fontSize: Typography.size.md, marginBottom: Spacing.sm },
  shadeSeqLabel:   { textAlign: 'center', color: Colors.textMuted, fontSize: Typography.size.xs, marginBottom: Spacing.sm },
  shadeChain:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  shadeChainItem:  { flexDirection: 'row', alignItems: 'center' },
  shadeChainDot:   { width: 34, height: 34, borderRadius: 17, ...Shadow.sm, alignItems: 'center', justifyContent: 'center' },
  shadeChainEmpty: { backgroundColor: Colors.border },
  shadeChainNum:   { fontSize: Typography.size.xs, color: Colors.textMuted, fontWeight: '700' },
  shadeArrow:      { fontSize: 18, color: Colors.textMuted, marginHorizontal: 3 },
  shadePickHint:   { textAlign: 'center', color: Colors.textSecondary, fontSize: Typography.size.sm, marginBottom: Spacing.md, minHeight: 18 },
  shadeOpts:       { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  shadeOpt:        { borderRadius: Radius.md, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', ...Shadow.md, alignItems: 'center', justifyContent: 'center' },
  shadeOptPlaced:  { borderColor: Colors.primary, opacity: 0.7 },
  shadeOptBadge:   { position: 'absolute', bottom: 4, right: 4, backgroundColor: Colors.primary, borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  shadeOptBadgeTxt:{ color: Colors.textInverted, fontSize: 10, fontWeight: '900' },
  submitBtn:       { marginTop: Spacing.lg, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.md },
  submitBtnDisabled:{ backgroundColor: Colors.border },
  submitBtnTxt:    { color: Colors.textInverted, fontWeight: '800', fontSize: Typography.size.base },

  // Color Sort
  sortSection: { flex: 1, alignItems: 'center', padding: Spacing.base },
  sortHint:    { color: Colors.textSecondary, fontSize: Typography.size.base, fontWeight: '600', marginVertical: Spacing.lg },
  sortSwatch:  { width: 130, height: 130, borderRadius: Radius.xl, marginBottom: Spacing.xl, ...Shadow.lg },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  catBtn:      { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.border, ...Shadow.sm, minWidth: 90, alignItems: 'center' },
  catBtnCorrect: { backgroundColor: (Colors.success ?? '#4CAF50') + '33', borderColor: Colors.success ?? '#4CAF50' },
  catBtnTxt:   { fontWeight: '700', color: Colors.textPrimary, fontSize: Typography.size.sm },
});
