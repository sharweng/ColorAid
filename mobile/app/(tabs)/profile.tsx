import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { profileApi, shopApi, type ShopItem, type UserItem } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

// ─── Avatar definitions ────────────────────────────────────────────────────────

type AvatarEntry = {
  emoji: string;
  label: string;
  unlockLevel?: number; // undefined = free
  shopKey?: string;     // defined = must be purchased in store
};

const FREE_AVATARS: AvatarEntry[] = [
  { emoji: '🧑', label: 'Person' },
  { emoji: '👩', label: 'Woman' },
  { emoji: '👨', label: 'Man' },
  { emoji: '🧒', label: 'Child' },
  { emoji: '👦', label: 'Boy' },
  { emoji: '👧', label: 'Girl' },
  { emoji: '👶', label: 'Baby' },
  { emoji: '🧓', label: 'Older Adult' },
  { emoji: '👴', label: 'Old Man' },
  { emoji: '👵', label: 'Old Woman' },
  { emoji: '🧑‍🦱', label: 'Curly Hair' },
  { emoji: '🧑‍🦰', label: 'Red Hair' },
  { emoji: '🧑‍🦳', label: 'White Hair' },
  { emoji: '🧑‍🦲', label: 'Bald' },
  { emoji: '👱', label: 'Blond Man' },
  { emoji: '👱‍♀️', label: 'Blond Woman' },
];

const LEVEL_AVATARS: AvatarEntry[] = [
  { emoji: '🧑‍🎤', label: 'Rockstar', unlockLevel: 3 },
  { emoji: '🧑‍🎨', label: 'Artist', unlockLevel: 3 },
  { emoji: '🧑‍🚀', label: 'Astronaut', unlockLevel: 3 },
  { emoji: '🧑‍⚕️', label: 'Doctor', unlockLevel: 3 },
  { emoji: '🧙', label: 'Wizard', unlockLevel: 5 },
  { emoji: '🧜', label: 'Merperson', unlockLevel: 5 },
  { emoji: '🧝', label: 'Elf', unlockLevel: 5 },
  { emoji: '🧟', label: 'Zombie', unlockLevel: 5 },
  { emoji: '🦸', label: 'Superhero', unlockLevel: 7 },
  { emoji: '🦹', label: 'Supervillain', unlockLevel: 7 },
  { emoji: '🧛', label: 'Vampire', unlockLevel: 7 },
  { emoji: '🧞', label: 'Genie', unlockLevel: 7 },
  { emoji: '😎', label: 'Cool', unlockLevel: 10 },
  { emoji: '🤩', label: 'Star-Struck', unlockLevel: 10 },
  { emoji: '🥳', label: 'Partying', unlockLevel: 10 },
  { emoji: '🤠', label: 'Cowboy', unlockLevel: 10 },
  { emoji: '👸', label: 'Princess', unlockLevel: 15 },
  { emoji: '🤴', label: 'Prince', unlockLevel: 15 },
  { emoji: '🧑‍✈️', label: 'Pilot', unlockLevel: 15 },
  { emoji: '🧑‍🔬', label: 'Scientist', unlockLevel: 15 },
];

const STORE_AVATARS: AvatarEntry[] = [
  { emoji: '🤖', label: 'Robot', shopKey: 'avatar_emoji_robot' },
  { emoji: '👻', label: 'Ghost', shopKey: 'avatar_emoji_ghost' },
  { emoji: '🐱', label: 'Cat', shopKey: 'avatar_emoji_cat' },
  { emoji: '🐶', label: 'Dog', shopKey: 'avatar_emoji_dog' },
  { emoji: '🦊', label: 'Fox', shopKey: 'avatar_emoji_fox' },
  { emoji: '🐸', label: 'Frog', shopKey: 'avatar_emoji_frog' },
  { emoji: '🐼', label: 'Panda', shopKey: 'avatar_emoji_panda' },
  { emoji: '🦁', label: 'Lion', shopKey: 'avatar_emoji_lion' },
];

// Group level-locked avatars by their required level
const LEVEL_GROUPS: { level: number; entries: AvatarEntry[] }[] = [3, 5, 7, 10, 15].map(
  (lvl) => ({ level: lvl, entries: LEVEL_AVATARS.filter((e) => e.unlockLevel === lvl) })
);

const NUM_COLS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAvatarConfig(raw?: string | null) {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
}

// ─── Avatar Grid Component ────────────────────────────────────────────────────

type AvatarGridProps = {
  entries: AvatarEntry[];
  currentEmoji: string | null;
  isPhotoActive: boolean;
  userLevel: number;
  inventory: string[];
  cellSize: number;
  gap: number;
  onSelect: (entry: AvatarEntry) => void;
};

function AvatarGrid({
  entries,
  currentEmoji,
  isPhotoActive,
  userLevel,
  inventory,
  cellSize,
  gap,
  onSelect,
}: AvatarGridProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: gap, columnGap: gap }}>
      {entries.map((entry) => {
        const isSelected =
          !isPhotoActive &&
          (currentEmoji === entry.emoji || (!currentEmoji && entry.emoji === '🧑'));
        const isLevelLocked = !!entry.unlockLevel && userLevel < entry.unlockLevel;
        const isStoreItem = !!entry.shopKey;
        const isStoreOwned = isStoreItem && inventory.includes(entry.shopKey!);
        const isStoreUnowned = isStoreItem && !isStoreOwned;

        return (
          <TouchableOpacity
            key={entry.emoji}
            style={[
              gridStyles.cell,
              {
                width: cellSize,
                height: cellSize,
                borderRadius: cellSize / 2,
              },
              isSelected && gridStyles.cellSelected,
              (isLevelLocked || isStoreUnowned) && gridStyles.cellDimmed,
            ]}
            onPress={() => onSelect(entry)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label} avatar`}
          >
            <Text style={{ fontSize: cellSize * 0.46 }}>{entry.emoji}</Text>

            {/* Level lock badge */}
            {isLevelLocked && (
              <View style={gridStyles.badgeOverlay}>
                <Text style={gridStyles.badgeIcon}>🔒</Text>
              </View>
            )}

            {/* Store — not owned badge */}
            {isStoreUnowned && (
              <View style={[gridStyles.badgeOverlay, gridStyles.storeBadge]}>
                <Text style={gridStyles.storeIcon}>🏪</Text>
              </View>
            )}

            {/* Store — owned, checkmark */}
            {isStoreOwned && !isSelected && (
              <View style={[gridStyles.badgeOverlay, gridStyles.ownedBadge]}>
                <Text style={gridStyles.ownedIcon}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  cell: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  cellSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  cellDimmed: { opacity: 0.55 },
  badgeOverlay: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 7,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { fontSize: 8 },
  storeBadge: { backgroundColor: Colors.coin },
  storeIcon: { fontSize: 7 },
  ownedBadge: { backgroundColor: Colors.primary },
  ownedIcon: { fontSize: 8, color: '#fff', fontWeight: '800' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, logout, refreshUser, updateUser } = useAuthStore();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; username: string; totalXp: number; level: number }>
  >([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [inventory, setInventory] = useState<string[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const avatarConfig = parseAvatarConfig(user?.avatarConfig);
  const isPhotoAvatar = avatarConfig.type === 'photo' && !!avatarConfig.uri;
  const currentEmoji: string | null = avatarConfig.emoji ?? null;
  const userLevel = user?.level ?? 1;
  const hasCustomPhoto = inventory.includes('custom_photo_avatar');

  // Price comes straight from the shop item (seeded from backend CUSTOM_PHOTO_PRICE).
  // Falls back to EXPO_PUBLIC_CUSTOM_PHOTO_PRICE from mobile .env if the shop hasn't loaded yet.
  const customPhotoPrice =
    shopItems.find((i) => i.key === 'custom_photo_avatar')?.coinCost ??
    parseInt(process.env.EXPO_PUBLIC_CUSTOM_PHOTO_PRICE ?? '5000', 10);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadLeaderboard();
      loadShopData();
    }, [])
  );

  async function loadLeaderboard() {
    setLoadingLeaderboard(true);
    try {
      const data = await profileApi.getLeaderboard();
      setLeaderboard(data);
    } catch {
      // silent
    } finally {
      setLoadingLeaderboard(false);
    }
  }

  async function loadShopData() {
    try {
      const res = await shopApi.getShopData();
      setShopItems(res.items);
      const keys = res.inventory
        .map((inv) => res.items.find((i) => i.id === inv.shopItemId)?.key)
        .filter((k): k is string => !!k);
      setInventory(keys);
    } catch {
      // silent
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadLeaderboard(), loadShopData()]);
    setRefreshing(false);
  }

  // ── Equip an emoji avatar (no coin logic here — purchase happens in Store) ──

  async function equipEmoji(entry: AvatarEntry) {
    const config = { type: 'emoji', emoji: entry.emoji };
    updateUser({ avatarConfig: JSON.stringify(config) });
    setShowAvatarModal(false);
    try {
      await profileApi.updateAvatar(config);
      await refreshUser();
    } catch {
      refreshUser();
    }
  }

  // ── Handle avatar cell tap ─────────────────────────────────────────────────

  function handleSelectAvatar(entry: AvatarEntry) {
    // Level-locked
    if (entry.unlockLevel && userLevel < entry.unlockLevel) {
      Alert.alert(
        '🔒 Level Locked',
        `This avatar unlocks at Level ${entry.unlockLevel}.\nYou are currently Level ${userLevel}.`
      );
      return;
    }

    // Store avatar — not owned
    if (entry.shopKey && !inventory.includes(entry.shopKey)) {
      const storeItem = shopItems.find((i) => i.key === entry.shopKey);
      const price = storeItem?.coinCost;
      Alert.alert(
        '🏪 Store Avatar',
        `${entry.emoji} ${entry.label} costs 🪙 ${price ?? '?'} in the Store.\nPurchase it there, then come back to equip it here.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Store',
            onPress: () => {
              setShowAvatarModal(false);
              router.push('/(tabs)/shop');
            },
          },
        ]
      );
      return;
    }

    // Free, level-met, or store-owned — equip immediately
    equipEmoji(entry);
  }

  // ── Custom photo picker ────────────────────────────────────────────────────

  async function handlePickPhoto() {
    if (!hasCustomPhoto) {
      Alert.alert(
        '📷 Custom Photo Avatar',
        `Purchase "Custom Photo Avatar" for 🪙 ${customPhotoPrice} in the Store, then tap here to set your photo.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Store', onPress: () => router.push('/(tabs)/shop') },
        ]
      );
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Camera roll access is needed to set a photo avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    updateUser({ avatarConfig: JSON.stringify({ type: 'photo', uri }) });
    try {
      await profileApi.updateAvatar({ type: 'photo', uri });
      await refreshUser();
    } catch {
      refreshUser();
    }
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  // ── Cell size calculations ─────────────────────────────────────────────────

  const screenWidth = Dimensions.get('window').width;
  const MODAL_PADDING = 16;
  const MODAL_GAP = 8;
  const modalCellSize = Math.floor(
    (screenWidth - MODAL_PADDING * 2 - MODAL_GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  // Quick-strip cell (inside card)
  const CARD_PADDING = Spacing.md * 2 + Spacing.base * 2;
  const QUICK_CELL = 44;

  // Current avatar label for compact display
  const currentLabel = isPhotoAvatar
    ? 'Photo'
    : [...FREE_AVATARS, ...LEVEL_AVATARS, ...STORE_AVATARS].find(
        (e) => e.emoji === currentEmoji
      )?.label ?? 'Person';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => setShowAvatarModal(true)}
            accessibilityLabel="Change avatar"
          >
            {isPhotoAvatar ? (
              <Image source={{ uri: avatarConfig.uri }} style={styles.avatarPhoto} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarEmoji}>{currentEmoji ?? '🧑'}</Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditIcon}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.username}>{user?.username ?? '—'}</Text>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Level {userLevel}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Total XP', value: user?.totalXp ?? 0, emoji: '⭐', color: Colors.primary },
            { label: 'Coins', value: user?.coins ?? 0, emoji: '🪙', color: Colors.coin },
            { label: 'Streak', value: `${user?.streakDays ?? 0} days`, emoji: '🔥', color: Colors.warning },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statEmoji}>{s.emoji}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Avatar Customization — compact card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customize Avatar</Text>

          {/* Current selection row */}
          <View style={styles.currentAvatarRow}>
            <View style={styles.currentAvatarPreview}>
              {isPhotoAvatar ? (
                <Image source={{ uri: avatarConfig.uri }} style={styles.currentAvatarPhoto} resizeMode="cover" />
              ) : (
                <Text style={styles.currentAvatarEmoji}>{currentEmoji ?? '🧑'}</Text>
              )}
            </View>
            <View style={styles.currentAvatarInfo}>
              <Text style={styles.currentAvatarLabel}>Current Avatar</Text>
              <Text style={styles.currentAvatarName}>{currentLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => setShowAvatarModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Browse all avatars"
            >
              <Text style={styles.browseBtnText}>Browse All →</Text>
            </TouchableOpacity>
          </View>

          {/* Quick-select strip — free avatars only */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStrip}
          >
            {FREE_AVATARS.map((entry) => {
              const isSel =
                !isPhotoAvatar &&
                (currentEmoji === entry.emoji || (!currentEmoji && entry.emoji === '🧑'));
              return (
                <TouchableOpacity
                  key={entry.emoji}
                  style={[
                    styles.quickCell,
                    { width: QUICK_CELL, height: QUICK_CELL, borderRadius: QUICK_CELL / 2 },
                    isSel && styles.quickCellSelected,
                  ]}
                  onPress={() => equipEmoji(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick select ${entry.label}`}
                >
                  <Text style={{ fontSize: 24 }}>{entry.emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Photo Avatar button */}
          <TouchableOpacity
            style={[styles.photoBtn, !hasCustomPhoto && styles.photoBtnLocked]}
            onPress={handlePickPhoto}
            accessibilityRole="button"
            accessibilityLabel="Use your own photo as avatar"
          >
            {isPhotoAvatar && <View style={styles.photoActiveDot} />}
            <Text style={styles.photoBtnEmoji}>📷</Text>
            <View style={styles.photoBtnTextWrap}>
              <Text style={[styles.photoBtnTitle, !hasCustomPhoto && styles.photoBtnTitleLocked]}>
                Use Your Photo
              </Text>
              <Text style={styles.photoBtnSub}>
                {hasCustomPhoto
                  ? isPhotoAvatar
                    ? 'Active — tap to change'
                    : 'Tap to pick from camera roll'
                  : `🪙 ${customPhotoPrice} — Buy in Store`}
              </Text>
            </View>
            <Text style={[styles.photoBtnArrow, !hasCustomPhoto && { color: Colors.textMuted }]}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Leaderboard */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leaderboard</Text>
          {loadingLeaderboard ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            leaderboard.slice(0, 5).map((u, i) => (
              <View key={u.id} style={[styles.leaderRow, u.id === user?.id && styles.leaderRowSelf]}>
                <Text style={styles.leaderRank}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </Text>
                <Text style={[styles.leaderName, u.id === user?.id && styles.leaderNameSelf]}>
                  {u.username} {u.id === user?.id ? '(You)' : ''}
                </Text>
                <Text style={styles.leaderXp}>
                  Lv.{u.level} · {u.totalXp.toLocaleString()} XP
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Retake Assessment */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/assessment')}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 24, marginRight: Spacing.md }}>👁️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Retake Assessment</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.sm }}>
                Update your CVD profile for better-tailored training
              </Text>
            </View>
            <Text style={{ color: Colors.primary, fontSize: 18 }}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Log Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button">
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>ColorAid v1.0.0</Text>
      </ScrollView>

      {/* ── Avatar Picker Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showAvatarModal}
        animationType="slide"
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <SafeAreaView style={modal.container}>
          {/* Modal header */}
          <View style={modal.header}>
            <Text style={modal.title}>Choose Avatar</Text>
            <TouchableOpacity
              style={modal.closeBtn}
              onPress={() => setShowAvatarModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close avatar picker"
            >
              <Text style={modal.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modal.content} showsVerticalScrollIndicator={false}>

            {/* ── Free Avatars ─────────────────────────────────────────── */}
            <View style={modal.section}>
              <View style={modal.sectionHeader}>
                <Text style={modal.sectionTitle}>Free Avatars</Text>
                <Text style={modal.sectionBadge}>Always available</Text>
              </View>
              <AvatarGrid
                entries={FREE_AVATARS}
                currentEmoji={currentEmoji}
                isPhotoActive={isPhotoAvatar}
                userLevel={userLevel}
                inventory={inventory}
                cellSize={modalCellSize}
                gap={MODAL_GAP}
                onSelect={handleSelectAvatar}
              />
            </View>

            {/* ── Level-Locked Avatars ──────────────────────────────────── */}
            <View style={modal.section}>
              <View style={modal.sectionHeader}>
                <Text style={modal.sectionTitle}>Level Locked</Text>
              </View>
              {LEVEL_GROUPS.map(({ level, entries }) => {
                const isUnlocked = userLevel >= level;
                return (
                  <View key={level} style={modal.levelGroup}>
                    <View style={[modal.levelHeader, isUnlocked && modal.levelHeaderUnlocked]}>
                      <Text style={[modal.levelLabel, isUnlocked && modal.levelLabelUnlocked]}>
                        {isUnlocked ? '✓' : '🔒'} Level {level}
                      </Text>
                      {!isUnlocked && (
                        <Text style={modal.levelNeed}>
                          {level - userLevel} more level{level - userLevel !== 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                    <AvatarGrid
                      entries={entries}
                      currentEmoji={currentEmoji}
                      isPhotoActive={isPhotoAvatar}
                      userLevel={userLevel}
                      inventory={inventory}
                      cellSize={modalCellSize}
                      gap={MODAL_GAP}
                      onSelect={handleSelectAvatar}
                    />
                  </View>
                );
              })}
            </View>

            {/* ── Store Avatars ─────────────────────────────────────────── */}
            <View style={modal.section}>
              <View style={modal.sectionHeader}>
                <Text style={modal.sectionTitle}>Store Avatars</Text>
                <Text style={modal.sectionBadge}>Buy in Store, equip here</Text>
              </View>
              <AvatarGrid
                entries={STORE_AVATARS}
                currentEmoji={currentEmoji}
                isPhotoActive={isPhotoAvatar}
                userLevel={userLevel}
                inventory={inventory}
                cellSize={modalCellSize}
                gap={MODAL_GAP}
                onSelect={handleSelectAvatar}
              />
              <View style={modal.storeHint}>
                <Text style={modal.storeHintText}>
                  🏪 Tap any unowned avatar to see its price and go to the Store.
                  After purchasing, it will show ✓ here and can be equipped.
                </Text>
              </View>
            </View>

          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingBottom: Spacing['5xl'] },

  // Profile header
  profileHeader: { alignItems: 'center', paddingVertical: Spacing['2xl'] },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primaryLight,
    overflow: 'hidden',
    ...Shadow.md,
  },
  avatarEmoji: { fontSize: 44 },
  avatarPhoto: { width: 88, height: 88 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  avatarEditIcon: { fontSize: 10 },
  username: {
    fontSize: Typography.size.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  email: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 4 },
  levelBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginTop: Spacing.sm,
  },
  levelBadgeText: {
    color: Colors.textInverted,
    fontWeight: '700',
    fontSize: Typography.size.sm,
  },

  // Stats
  statsGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statEmoji: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: Typography.size.md, fontWeight: '800' },
  statLabel: { fontSize: Typography.size.xs, color: Colors.textMuted, marginTop: 2 },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  cardTitle: {
    fontSize: Typography.size.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },

  // Compact avatar row
  currentAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  currentAvatarPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  currentAvatarPhoto: { width: 48, height: 48 },
  currentAvatarEmoji: { fontSize: 26 },
  currentAvatarInfo: { flex: 1 },
  currentAvatarLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentAvatarName: {
    fontSize: Typography.size.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  browseBtn: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  browseBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Quick strip
  quickStrip: {
    columnGap: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  quickCell: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickCellSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },

  // Photo button
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    padding: Spacing.md,
  },
  photoBtnLocked: {
    backgroundColor: Colors.surfaceAlt,
    borderColor: Colors.border,
  },
  photoActiveDot: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  photoBtnEmoji: { fontSize: 26, marginRight: Spacing.md },
  photoBtnTextWrap: { flex: 1 },
  photoBtnTitle: {
    fontSize: Typography.size.md,
    fontWeight: '700',
    color: Colors.primary,
  },
  photoBtnTitleLocked: { color: Colors.textSecondary },
  photoBtnSub: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  photoBtnArrow: { fontSize: 18, color: Colors.primary, fontWeight: '700' },

  // Leaderboard
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    columnGap: Spacing.sm,
  },
  leaderRowSelf: {
    backgroundColor: Colors.primaryBg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
  },
  leaderRank: { fontSize: Typography.size.lg, width: 36, textAlign: 'center' },
  leaderName: {
    flex: 1,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
  },
  leaderNameSelf: { color: Colors.primary },
  leaderXp: { color: Colors.textMuted, fontSize: Typography.size.xs },

  // Logout
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  logoutText: { color: Colors.error, fontWeight: '700', fontSize: Typography.size.md },
  version: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    marginTop: Spacing.md,
  },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadow.sm,
  },
  title: {
    fontSize: Typography.size.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: Typography.size.md,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  content: { padding: 16, paddingBottom: 48 },

  // Sections
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    columnGap: 8,
  },
  sectionTitle: {
    fontSize: Typography.size.md,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sectionBadge: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },

  // Level groups
  levelGroup: { marginBottom: 16 },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  levelHeaderUnlocked: {
    backgroundColor: Colors.primaryBg,
  },
  levelLabel: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  levelLabelUnlocked: { color: Colors.primary },
  levelNeed: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },

  // Store hint
  storeHint: {
    marginTop: 12,
    padding: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.coin,
  },
  storeHintText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
