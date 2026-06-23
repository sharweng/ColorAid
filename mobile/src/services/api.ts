import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️  On Android, 'localhost' = the phone itself, not your dev machine.
// Edit mobile/.env and set EXPO_PUBLIC_API_URL to your machine's local IP:
//   EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api  (IP shown in Metro QR URL)
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'coloraid_access_token',
  REFRESH_TOKEN: 'coloraid_refresh_token',
} as const;

// ─── Token Management ─────────────────────────────────────────────────────────

export async function storeTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.ACCESS_TOKEN, accessToken],
    [STORAGE_KEYS.REFRESH_TOKEN, refreshToken],
  ]);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN]);
}

async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

// ─── Core Fetch ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && retry) {
    // Try to refresh the token
    const refreshToken = await getRefreshToken();
    if (!refreshToken) throw new ApiError('Session expired. Please log in again.', 401);

    const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResponse.ok) {
      await clearTokens();
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    const refreshData = await refreshResponse.json();
    await storeTokens(refreshData.data.accessToken, refreshData.data.refreshToken);

    // Retry the original request with new token
    return apiFetch<T>(path, options, false);
  }

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new ApiError(data.message ?? 'Request failed', response.status);
  }

  return data.data as T;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  coins: number;
  totalXp: number;
  level: number;
  streakDays: number;
  lastActiveAt: string | null;
  avatarConfig: string;
  createdAt: string;
  stats?: { assessmentCount: number; sessionCount: number; achievementCount: number };
  xpToNextLevel?: number;
  xpProgress?: number;
}

export const authApi = {
  register: (email: string, username: string, password: string) =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: async (refreshToken: string) => {
    await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    await clearTokens();
  },

  getMe: () => apiFetch<UserProfile>('/auth/me'),
};

// ─── Assessment API ───────────────────────────────────────────────────────────

export interface PlateInfo {
  id: number;
  group: string;
  imageUrl: string;
}

export interface PlateResponse {
  plateId: number;
  userAnswer: string;
  responseMs: number;
  isCorrect?: boolean;
  correctAnswer?: string;
}

export interface AssessmentResult {
  cvdType: string;
  severity: string;
  confidence: number;
  description: string;
  recommendations: string[];
  affectedColors: string[];
}

export interface AssessmentSubmitResponse {
  assessment: Record<string, unknown>;
  result: AssessmentResult;
  xpEarned: number;
  coinsEarned: number;
  newAchievements?: Achievement[];
}

export const assessmentApi = {
  getPlates: () =>
    apiFetch<{ plates: PlateInfo[]; totalPlates: number }>('/assessment/plates'),

  startAssessment: () =>
    apiFetch<{ assessmentId: string }>('/assessment/start', { method: 'POST' }),

  submitAssessment: (assessmentId: string, responses: PlateResponse[]) =>
    apiFetch<AssessmentSubmitResponse>(`/assessment/${assessmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ responses }),
    }),

  getHistory: () =>
    apiFetch<AssessmentSubmitResponse[]>('/assessment/history'),

  getLatest: () =>
    apiFetch<{ assessment: Record<string, unknown>; result: AssessmentResult }>('/assessment/latest'),
};

// ─── Training API ─────────────────────────────────────────────────────────────

export type GameType = 'color_match' | 'color_sort' | 'hue_hunt' | 'shade_spectrum';

export interface RoundResult {
  roundNumber: number;
  targetColor: string;
  userAnswer: string;
  isCorrect: boolean;
  points: number;
  responseMs: number;
}

export interface SessionCompleteResponse {
  session: Record<string, unknown>;
  score: number;
  accuracyPct: number;
  xpEarned: number;
  coinsEarned: number;
  nextDifficulty: number;
  leveledUp: boolean;
  newLevel: number;
  newAchievements?: Achievement[];
}

export interface RecommendedGame {
  gameType: GameType;
  reason: string;
  suggestedDifficulty: number;
}

export const trainingApi = {
  startSession: (gameType: GameType, difficultyLevel: number) =>
    apiFetch<{ sessionId: string }>('/training/sessions', {
      method: 'POST',
      body: JSON.stringify({ gameType, difficultyLevel }),
    }),

  completeSession: (sessionId: string, rounds: RoundResult[]) =>
    apiFetch<SessionCompleteResponse>(`/training/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ rounds, timezoneOffset: new Date().getTimezoneOffset() }),
    }),

  getHistory: (gameType?: GameType) =>
    apiFetch<SessionCompleteResponse[]>(`/training/sessions/history${gameType ? `?gameType=${gameType}` : ''}`),

  getRecommended: () =>
    apiFetch<{ cvdType: string; recommendations: RecommendedGame[] }>('/training/recommended'),

  getStats: () =>
    apiFetch<{
      totalSessions: number;
      avgAccuracy: number;
      totalXpFromTraining: number;
      byGame: Record<string, { count: number; avgAccuracy: number; bestScore: number }>;
    }>('/training/stats'),
};

// ─── Profile API ──────────────────────────────────────────────────────────────

export const profileApi = {
  getProfile: () => apiFetch<UserProfile>('/profile'),
  updateAvatar: (avatarConfig: Record<string, unknown>) =>
    apiFetch('/profile/avatar', { method: 'PATCH', body: JSON.stringify({ avatarConfig }) }),
  getLeaderboard: () =>
    apiFetch<Array<{ id: string; username: string; totalXp: number; level: number }>>('/profile/leaderboard'),
};

// ─── Achievements API ─────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  iconName: string;
  xpReward: number;
  coinReward: number;
  category: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress?: { current: number; target: number };
}

export const achievementsApi = {
  getAll: () =>
    apiFetch<{ achievements: Achievement[]; unlockedCount: number; totalCount: number }>(
      '/achievements'
    ),
};

// ─── Progress API ─────────────────────────────────────────────────────────────

export const progressApi = {
  get: () =>
    apiFetch<{
      user: { totalXp: number; level: number; coins: number; streakDays: number };
      assessments: unknown[];
      trainingSessions: unknown[];
      recentActivity: { sessionsLast7Days: number; avgAccuracyLast7Days: number };
    }>('/progress'),
};

// ─── Shop API ─────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  coinCost: number;
  imageUrl: string | null;
  isActive: boolean;
}

export interface UserItem {
  shopItemId: string;
  quantity: number;
}

export const shopApi = {
  getShopData: () =>
    apiFetch<{ coins: number; items: ShopItem[]; inventory: UserItem[] }>('/shop'),
  purchaseItem: (itemId: string) =>
    apiFetch<{ success: boolean; message: string }>(`/shop/purchase/${itemId}`, { method: 'POST' }),
};

export interface SampledColor {
  r: number;
  g: number;
  b: number;
  hex: string;
  name: string;
  confidence: number;
}

export const colorApi = {
  /**
   * Sample the color at a normalized position (x, y in [0,1]) in a base64 JPEG.
   * Resize the image to ≤600px wide on the client before calling to keep payloads small.
   */
  samplePoint: (imageBase64: string, x: number, y: number) =>
    apiFetch<SampledColor>('/color/point', {
      method: 'POST',
      body: JSON.stringify({ image: imageBase64, x, y }),
    }),
};
