/**
 * HSV-based Color Recognition Utility
 *
 * Converts RGB pixel data from camera frames to human-readable color names.
 *
 * Algorithm:
 * 1. Sample a region of pixels (not just one pixel)
 * 2. Convert RGB → HSV
 * 3. Filter outliers (very dark/very light pixels from shadows/reflections)
 * 4. Compute statistical mode of Hue
 * 5. Map HSV to named color + shade qualifier
 *
 * Why HSV > RGB for color naming:
 * - Hue (0–360°) is the "what color" channel — largely lighting-invariant
 * - Saturation — how vivid vs muted
 * - Value — how bright vs dark
 * A red apple in shadow (RGB: 80,20,20) and in sunlight (RGB: 220,50,50)
 * have very different RGB but similar Hue (~0°).
 */

export interface RgbColor {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
}

export interface HsvColor {
  h: number; // 0–360
  s: number; // 0–100
  v: number; // 0–100
}

export interface RecognizedColor {
  name: string;           // e.g. "Vivid Red", "Dark Green", "Pale Blue"
  baseName: string;       // e.g. "Red", "Green", "Blue"
  qualifier: string;      // e.g. "Vivid", "Dark", "Pale", "Muted", ""
  hex: string;            // e.g. "#FF4433"
  hsv: HsvColor;
  confidence: number;     // 0–1, higher = more saturated/unambiguous
}

// ─── RGB → HSV Conversion ─────────────────────────────────────────────────────

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const sv = s / 100;
  const vv = v / 100;
  const c = vv * sv;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vv - c;

  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// ─── Color Name Mapping ───────────────────────────────────────────────────────

interface ColorRange {
  name: string;
  hMin: number;
  hMax: number; // if hMax < hMin, wraps around (e.g. red)
}

const HUE_RANGES: ColorRange[] = [
  { name: 'Red',          hMin: 0,   hMax: 12  },
  { name: 'Red-Orange',   hMin: 12,  hMax: 20  },
  { name: 'Orange',       hMin: 20,  hMax: 35  },
  { name: 'Yellow-Orange',hMin: 35,  hMax: 48  },
  { name: 'Yellow',       hMin: 48,  hMax: 65  },
  { name: 'Yellow-Green', hMin: 65,  hMax: 80  },
  { name: 'Green',        hMin: 80,  hMax: 155 },
  { name: 'Teal',         hMin: 155, hMax: 180 },
  { name: 'Cyan',         hMin: 180, hMax: 200 },
  { name: 'Sky Blue',     hMin: 200, hMax: 215 },
  { name: 'Blue',         hMin: 215, hMax: 255 },
  { name: 'Indigo',       hMin: 255, hMax: 275 },
  { name: 'Violet',       hMin: 275, hMax: 290 },
  { name: 'Purple',       hMin: 290, hMax: 320 },
  { name: 'Magenta',      hMin: 320, hMax: 340 },
  { name: 'Pink',         hMin: 340, hMax: 355 },
  { name: 'Red',          hMin: 355, hMax: 360 }, // Red wraps around
];

function getBaseName(hue: number): string {
  for (const range of HUE_RANGES) {
    if (range.hMin <= hue && hue < range.hMax) {
      return range.name;
    }
  }
  return 'Red'; // fallback for hue ~360
}

function getQualifier(s: number, v: number): string {
  // Achromatic
  if (s < 12) {
    if (v < 20) return 'Black';
    if (v > 85) return 'White';
    return 'Gray';
  }

  // Shade qualifiers
  if (v < 25) return 'Dark';
  if (v < 40) return 'Deep';
  if (s < 25 && v > 70) return 'Pale';
  if (s < 35) return 'Muted';
  if (s > 80 && v > 80) return 'Vivid';
  if (v > 90) return 'Light';
  return '';
}

// ─── Region Sampling ──────────────────────────────────────────────────────────

/**
 * Given a flat RGBA pixel array (from canvas or camera frame),
 * width, and height, extract the center region and compute dominant HSV.
 *
 * @param pixels - Uint8Array or number[] of RGBA values [r,g,b,a, r,g,b,a, ...]
 * @param width  - frame width in pixels
 * @param height - frame height in pixels
 * @param regionSize - size of center square to sample (default 60px)
 */
export function getDominantHsv(
  pixels: Uint8Array | number[],
  width: number,
  height: number,
  regionSize = 60
): HsvColor {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const half = Math.floor(regionSize / 2);

  const hues: number[] = [];
  const saturations: number[] = [];
  const values: number[] = [];

  for (let y = cy - half; y < cy + half; y++) {
    for (let x = cx - half; x < cx + half; x++) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      const hsv = rgbToHsv(r, g, b);
      // Skip very dark pixels (shadow) and very desaturated (highlight/glare)
      if (hsv.v < 10 || (hsv.s < 8 && hsv.v > 90)) continue;

      hues.push(hsv.h);
      saturations.push(hsv.s);
      values.push(hsv.v);
    }
  }

  if (hues.length === 0) return { h: 0, s: 0, v: 50 };

  // Use circular mean for hue (handles red wrapping around 0/360)
  const sinMean = hues.reduce((sum, h) => sum + Math.sin((h * Math.PI) / 180), 0) / hues.length;
  const cosMean = hues.reduce((sum, h) => sum + Math.cos((h * Math.PI) / 180), 0) / hues.length;
  let meanHue = Math.round((Math.atan2(sinMean, cosMean) * 180) / Math.PI);
  if (meanHue < 0) meanHue += 360;

  const meanS = Math.round(saturations.reduce((a, b) => a + b, 0) / saturations.length);
  const meanV = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return { h: meanHue, s: meanS, v: meanV };
}

// ─── Main Recognition Function ────────────────────────────────────────────────

export function recognizeColor(hsv: HsvColor): RecognizedColor {
  const { h, s, v } = hsv;

  // Compute hex from HSV
  const rgb = hsvToRgb(h, s, v);
  const hex = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`.toUpperCase();

  // Achromatic colors
  if (s < 12) {
    if (v < 20)  return { name: 'Black',     baseName: 'Black',  qualifier: '', hex, hsv, confidence: 0.95 };
    if (v > 85)  return { name: 'White',     baseName: 'White',  qualifier: '', hex, hsv, confidence: 0.95 };
    if (v < 40)  return { name: 'Dark Gray', baseName: 'Gray',   qualifier: 'Dark', hex, hsv, confidence: 0.9 };
    if (v > 70)  return { name: 'Light Gray',baseName: 'Gray',   qualifier: 'Light', hex, hsv, confidence: 0.9 };
    return { name: 'Gray', baseName: 'Gray', qualifier: '', hex, hsv, confidence: 0.9 };
  }

  const baseName = getBaseName(h);
  const qualifier = getQualifier(s, v);

  let name: string;
  if (qualifier === 'Black' || qualifier === 'White' || qualifier === 'Gray') {
    name = qualifier;
  } else if (qualifier) {
    name = `${qualifier} ${baseName}`;
  } else {
    name = baseName;
  }

  // Confidence: higher saturation + moderate value = more identifiable color
  const confidence = Math.min(0.99, (s / 100) * 0.6 + (1 - Math.abs(v - 60) / 100) * 0.4);

  return { name, baseName, qualifier, hex, hsv, confidence };
}

/**
 * Recognize color from raw RGBA pixel data (e.g. from Expo Camera frame processor).
 */
export function recognizeColorFromPixels(
  pixels: Uint8Array | number[],
  width: number,
  height: number,
  regionSize = 60
): RecognizedColor {
  const hsv = getDominantHsv(pixels, width, height, regionSize);
  return recognizeColor(hsv);
}

/**
 * Recognize color from a single RGB value (for simple use cases).
 */
export function recognizeColorFromRgb(r: number, g: number, b: number): RecognizedColor {
  const hsv = rgbToHsv(r, g, b);
  return recognizeColor(hsv);
}

/**
 * Parse a hex color string and recognize it.
 */
export function recognizeColorFromHex(hex: string): RecognizedColor {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return recognizeColorFromRgb(r, g, b);
}

/**
 * Given a CVD type, simulate how the color would appear to that user.
 * Uses confusion line transformations for protan/deutan/tritan.
 */
export function simulateCvd(
  rgb: RgbColor,
  cvdType: string
): RgbColor {
  const { r, g, b } = rgb;
  // Simplified Brettel simulation matrices
  switch (cvdType) {
    case 'protanopia':
      return {
        r: Math.round(0.567 * r + 0.433 * g),
        g: Math.round(0.558 * r + 0.442 * g),
        b: Math.round(0.242 * g + 0.758 * b),
      };
    case 'deuteranopia':
      return {
        r: Math.round(0.625 * r + 0.375 * g),
        g: Math.round(0.700 * r + 0.300 * g),
        b: Math.round(0.300 * g + 0.700 * b),
      };
    case 'tritanopia':
      return {
        r: Math.round(0.950 * r + 0.050 * g),
        g: Math.round(0.433 * g + 0.567 * b),
        b: Math.round(0.475 * g + 0.525 * b),
      };
    default:
      return rgb;
  }
}
