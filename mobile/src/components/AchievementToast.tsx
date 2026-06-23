import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Animated, StyleSheet, Pressable, Dimensions,
} from 'react-native';
import type { Achievement } from '../services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../constants/theme';

const SW = Dimensions.get('window').width;
const TOAST_DURATION_MS = 4000;
const SLIDE_DURATION_MS = 400;

// ─── Emoji map ────────────────────────────────────────────────────────────────

export function achEmoji(key: string): string {
  const map: Record<string, string> = {
    first_assessment:        '👁️',
    assessment_veteran:      '🔬',
    assessment_10:           '🧬',
    assessment_ace:          '💯',
    first_game:              '🎮',
    training_enthusiast:     '🏃',
    training_dedicated_20:   '💪',
    training_master:         '🏆',
    training_dedicated_100:  '🎖️',
    color_match_dedicated:   '🎨',
    hue_hunt_dedicated:      '🔍',
    shade_spectrum_dedicated:'🌈',
    color_sort_dedicated:    '🗂️',
    color_match_master:      '🎨',
    hue_hunt_master:         '🔎',
    shade_spectrum_master:   '🌠',
    color_sort_master:       '📂',
    perfect_score:           '✨',
    accuracy_streak_3:       '🎯',
    all_games_played:        '🕹️',
    week_streak:             '🔥',
    month_streak:            '🌋',
    level_5:                 '⭐',
    level_10:                '👑',
  };
  return map[key] ?? '🏅';
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

interface ToastProps {
  achievement: Achievement;
  onDismiss: () => void;
}

function SingleToast({ achievement, onDismiss }: ToastProps) {
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    const timer = setTimeout(() => dismiss(), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -120,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(onDismiss);
  }

  return (
    <Animated.View
      style={[styles.toast, { transform: [{ translateY: slideY }], opacity }]}
    >
      <Pressable style={styles.toastInner} onPress={dismiss}>
        {/* Gold accent bar on the left */}
        <View style={styles.accentBar} />

        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{achEmoji(achievement.key)}</Text>
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.unlockLabel}>🎉 Achievement Unlocked!</Text>
          <Text style={styles.title} numberOfLines={1}>{achievement.title}</Text>
          <Text style={styles.desc} numberOfLines={2}>{achievement.description}</Text>
          <View style={styles.rewards}>
            <Text style={styles.xpBadge}>+{achievement.xpReward} XP</Text>
            <Text style={styles.coinBadge}>🪙 {achievement.coinReward}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Toast Manager — module-level ref for global access ──────────────────────

interface ToastManagerHandle {
  show: (achievements: Achievement[]) => void;
}

let _toastRef: ToastManagerHandle | null = null;

export function setToastRef(ref: ToastManagerHandle | null) {
  _toastRef = ref;
}

/** Call this from anywhere (e.g., game screen) to show achievement toasts */
export function showAchievementToasts(achievements: Achievement[]) {
  if (_toastRef && achievements.length > 0) {
    _toastRef.show(achievements);
  }
}

// ─── Toast Container ─────────────────────────────────────────────────────────

interface ToastEntry {
  id: string;
  achievement: Achievement;
}

/** Mount this once in your root layout so toasts are globally visible */
export function AchievementToastContainer() {
  const [queue, setQueue] = useState<ToastEntry[]>([]);
  const [current, setCurrent] = useState<ToastEntry | null>(null);

  // Register globally
  useEffect(() => {
    const handle: ToastManagerHandle = {
      show: (achievements: Achievement[]) => {
        setQueue(prev => [
          ...prev,
          ...achievements.map(a => ({
            id: `${a.id}-${Date.now()}-${Math.random()}`,
            achievement: a,
          })),
        ]);
      },
    };
    setToastRef(handle);
    return () => setToastRef(null);
  }, []);

  // Dequeue next when current finishes
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
    }
  }, [current, queue]);

  const handleDismiss = useCallback(() => {
    setCurrent(null);
  }, []);

  if (!current) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <SingleToast
        key={current.id}
        achievement={current.achievement}
        onDismiss={handleDismiss}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingTop: 52,
  },
  toast: {
    width: SW - Spacing.xl * 2,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Shadow.lg,
    borderWidth: 1.5,
    borderColor: Colors.coin + '44',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.coin,
    borderRadius: 2,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    marginLeft: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.coin + '66',
  },
  icon: {
    fontSize: 26,
  },
  textWrap: {
    flex: 1,
  },
  unlockLabel: {
    fontSize: Typography.size.xs,
    color: Colors.coin,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  title: {
    fontSize: Typography.size.base,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  desc: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    lineHeight: 15,
    marginBottom: Spacing.xs,
  },
  rewards: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  xpBadge: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  coinBadge: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: Colors.coin,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
});
