// Design tokens for ColorAid
// Designed for accessibility — high contrast, clear color differentiation

export const Colors = {
  // Primary brand
  primary: '#6C63FF',       // Purple — chosen for good visibility across CVD types
  primaryDark: '#4B44CC',
  primaryLight: '#9B94FF',
  primaryBg: '#EEF0FF',

  // Secondary / accent
  accent: '#00C9A7',        // Teal-green — visible to most CVD types
  accentDark: '#00A88D',
  accentLight: '#4DDFC5',

  // Semantic colors (using blue-orange axis to be accessible to red-green CVD)
  success: '#00C9A7',       // Teal (not green — visible to protans/deutans)
  warning: '#FF9500',       // Orange
  error: '#FF453A',         // Red (labeled with text too, not color alone)
  info: '#0A84FF',          // Blue

  // Neutrals
  background: '#F7F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F8',
  border: '#E2E4F0',
  borderLight: '#ECEEF8',

  // Text
  textPrimary: '#1A1B2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverted: '#FFFFFF',

  // Gamification
  coin: '#FFB800',
  xp: '#6C63FF',
  level: '#FF6B6B',

  // Dark theme
  dark: {
    background: '#0F0F1A',
    surface: '#1A1B2E',
    surfaceAlt: '#252640',
    border: '#2D2E4A',
    textPrimary: '#E8E9F3',
    textSecondary: '#9B9CC8',
  },
} as const;

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 40,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// CVD-specific color palette for UI elements
// Using patterns + text labels alongside color to ensure accessibility
export const CvdTypeColors: Record<string, string> = {
  normal: '#00C9A7',
  protanopia: '#0A84FF',
  protanomaly: '#4CAAFF',
  deuteranopia: '#FF9500',
  deuteranomaly: '#FFBB55',
  tritanopia: '#FF453A',
  tritanomaly: '#FF7B76',
  achromatopsia: '#8E8E93',
};

export const SeverityColors: Record<string, string> = {
  none: '#00C9A7',
  mild: '#FFB800',
  moderate: '#FF9500',
  severe: '#FF453A',
};
