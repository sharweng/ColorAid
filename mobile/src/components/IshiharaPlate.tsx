/**
 * IshiharaPlate — Procedural color vision test plate generator.
 *
 * Generates an Ishihara-inspired plate using ~220 colored circles:
 * - Circles falling in the digit region use the "digit" color family
 * - Circles outside use the "background" color family
 *
 * Palette 'rd': orange-red digit on green background
 *   → Normal vision can distinguish the number; red-green CVD cannot.
 * Palette 'rd_inv': green digit on orange-red background
 *   → Inverted — used for protan/deutan differentiation plates.
 * Palette 'neutral': dark-blue digit on gray background
 *   → Visible to everyone (demonstration/calibration plate).
 *
 * NOTE: This is a procedural approximation for educational screening.
 * Colors are not calibrated to clinical Ishihara standards.
 * Clinical diagnosis requires a certified optometrist.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';

const PLATE_D = 230;
const R = PLATE_D / 2;

// Linear congruential PRNG — fast, deterministic, seeded per plate
function mkRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 5-column × 9-row pixel glyphs for digits 0–9
const GLYPHS: Record<string, number[]> = {
  '0': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,1,1, 1,0,1,0,1, 1,1,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '1': [0,0,1,0,0, 0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 1,1,1,1,1],
  '2': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
  '3': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,1,0, 0,0,0,0,1, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '4': [0,0,0,1,0, 0,0,1,1,0, 0,1,0,1,0, 1,0,0,1,0, 1,1,1,1,1, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0, 0,0,0,1,0],
  '5': [1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,0, 0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '6': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '7': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,0,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0],
  '8': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '9': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
};

// ─── Color Palettes ───────────────────────────────────────────────────────────
const PALETTES = {
  // Standard screening plate: red/orange number on green background.
  // Normal vision: clearly different → sees number.
  // Red-green CVD: both look brownish → cannot see number.
  rd: {
    digit: ['#C84020','#D25030','#BE3C18','#D86040','#C44022','#CB5028','#B83A12','#D04820'],
    bg:    ['#5C9C2A','#4E881C','#6AAA38','#478014','#568C22','#68A035','#4A7C18','#5A9228'],
  },
  // Inverted plate: green number on orange-red background.
  // Used for protan vs deutan differentiation.
  rd_inv: {
    digit: ['#4A8E1C','#5A9C2A','#40801A','#63A32E','#4A8A1C','#589620','#3E7C16'],
    bg:    ['#C23E1A','#D25430','#B83412','#CE5E3C','#BA3C18','#C64C28','#B03010'],
  },
  // Neutral: dark-blue number on gray — visible to all CVD types.
  // Use for the first demonstration plate.
  neutral: {
    digit: ['#3A3A9C','#4B4BAD','#2D2D7A','#4040A8','#383898','#44449A'],
    bg:    ['#BBBFC0','#AEBABC','#C8CCCC','#B4B8B8','#C0C4C4','#B8BCBC'],
  },
} as const;

type PaletteKey = keyof typeof PALETTES;

// ─── Digit Region Test ────────────────────────────────────────────────────────
// Maps a plate coordinate (x, y) — origin at plate centre — to true if
// the point falls inside the pixel footprint of the given digit string.

function isInDigitRegion(x: number, y: number, text: string): boolean {
  const chars = text.split('').filter((c) => GLYPHS[c]);
  if (!chars.length) return false;

  // Scale to fill ~65% of the plate height
  const digitH = R * 1.3;
  const pixH = digitH / 9;       // height per glyph pixel row
  const charW = pixH * 5;        // width of one character (5 columns)
  const gap = pixH * 1.5;        // gap between characters
  const totalW = chars.length * charW + (chars.length - 1) * gap;

  const startX = -totalW / 2;
  const startY = -digitH / 2;

  for (let ci = 0; ci < chars.length; ci++) {
    const localX = x - (startX + ci * (charW + gap));
    const localY = y - startY;
    if (localX < 0 || localX >= charW || localY < 0 || localY >= digitH) continue;

    const col = Math.floor((localX / charW) * 5);
    const row = Math.floor((localY / digitH) * 9);
    if (col >= 0 && col < 5 && row >= 0 && row < 9 && GLYPHS[chars[ci]][row * 5 + col] === 1) {
      return true;
    }
  }
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Dot { x: number; y: number; r: number; color: string; }

const IshiharaPlate = React.memo(function IshiharaPlate({
  plateId,
  number,
  palette = 'rd',
}: {
  plateId: number;
  number: string;
  palette?: PaletteKey;
}) {
  const dots = useMemo<Dot[]>(() => {
    const rand = mkRng(plateId * 999983 + 7);
    const pal = PALETTES[palette];
    const placed: Dot[] = [];

    let attempts = 0;
    while (placed.length < 220 && attempts < 8000) {
      attempts++;
      // Uniform distribution inside circle via polar coords
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * (R - 7);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      const r = 4 + rand() * 8; // radius 4–12 px

      // Overlap rejection — check only the last 45 dots for speed
      let ok = true;
      const start = Math.max(0, placed.length - 45);
      for (let i = start; i < placed.length; i++) {
        const d = placed[i];
        const dx = d.x - px, dy = d.y - py;
        if (dx * dx + dy * dy < (r + d.r + 1.5) ** 2) { ok = false; break; }
      }
      if (!ok) continue;

      const inDigit = isInDigitRegion(px, py, number);
      const colors = inDigit ? pal.digit : pal.bg;
      placed.push({ x: px, y: py, r, color: colors[Math.floor(rand() * colors.length)] });
    }
    return placed;
  }, [plateId, number, palette]);

  return (
    <View
      style={{
        width: PLATE_D,
        height: PLATE_D,
        borderRadius: R,
        overflow: 'hidden',
        backgroundColor: '#EDECE8',
      }}
    >
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: R + d.x - d.r,
            top: R + d.y - d.r,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: d.r,
            backgroundColor: d.color,
          }}
        />
      ))}
    </View>
  );
});

export default IshiharaPlate;
