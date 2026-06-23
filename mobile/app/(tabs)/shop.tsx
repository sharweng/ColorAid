import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { shopApi, type ShopItem, type UserItem } from '../../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { Tabs } from 'expo-router';

export default function ShopScreen() {
  const { user, refreshUser } = useAuthStore();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<UserItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await shopApi.getShopData();
      setCoins(res.coins);
      setItems(res.items);
      setInventory(res.inventory);
    } catch (error) {
      console.error('Failed to load shop data', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshUser()]);
  };

  const handlePurchase = (item: ShopItem) => {
    if (coins < item.coinCost) {
      Alert.alert('Not enough coins', `You need ${item.coinCost - coins} more coins to buy this item.`);
      return;
    }

    Alert.alert(
      'Confirm Purchase',
      `Buy ${item.name} for ${item.coinCost} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          style: 'default',
          onPress: async () => {
            try {
              const res = await shopApi.purchaseItem(item.id);
              if (res.success) {
                Alert.alert('Success', `${item.name} purchased!`);
                await loadData();
                await refreshUser(); // Update global coin state
              } else {
                Alert.alert('Error', res.message || 'Purchase failed');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  const getItemEmoji = (category: string) => {
    switch (category) {
      case 'avatar': return '🧑‍🎤';
      case 'theme': return '🎨';
      case 'booster': return '🚀';
      case 'world': return '🌍';
      default: return '📦';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const categories = Array.from(new Set(items.map(i => i.category)));

  return (
    <>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerCoinBadge}>
              <Text style={styles.coinEmoji}>🪙</Text>
              <Text style={styles.coinValue}>{coins}</Text>
            </View>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

      {categories.map(category => {
        const catItems = items.filter(i => i.category === category);
        return (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>
            <View style={styles.itemGrid}>
              {catItems.map(item => {
                const invItem = inventory.find(i => i.shopItemId === item.id);
                const quantity = invItem?.quantity ?? 0;
                // Items like themes/avatars/worlds are permanent, boosters are consumable
                const isConsumable = item.category === 'booster';
                const isOwned = !isConsumable && quantity > 0;
                const canAfford = coins >= item.coinCost;

                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemEmoji}>{getItemEmoji(item.category)}</Text>
                      {quantity > 0 && isConsumable && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{quantity}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                    
                    <TouchableOpacity
                      style={[
                        styles.buyBtn,
                        isOwned && styles.ownedBtn,
                        !isOwned && !canAfford && styles.disabledBtn
                      ]}
                      disabled={isOwned || (!isOwned && !canAfford)}
                      onPress={() => handlePurchase(item)}
                    >
                      <Text style={[
                        styles.buyBtnText,
                        isOwned && styles.ownedBtnText,
                        !isOwned && !canAfford && styles.disabledBtnText
                      ]}>
                        {isOwned ? 'Owned' : `🪙 ${item.coinCost}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
      
      {items.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏪</Text>
          <Text style={styles.emptyTitle}>Store is Empty</Text>
          <Text style={styles.emptyDesc}>Check back later for new items!</Text>
        </View>
      )}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  headerCoinBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full, marginRight: Spacing.md, ...Shadow.sm },
  coinEmoji: { fontSize: 16, marginRight: 4 },
  coinValue: { fontSize: Typography.size.md, fontWeight: '800', color: Colors.coin },
  
  categorySection: { marginBottom: Spacing.xl },
  categoryTitle: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.md, letterSpacing: 1 },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  itemCard: { width: '48%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, margin: '1%', ...Shadow.sm },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  itemEmoji: { fontSize: 32 },
  badge: { backgroundColor: Colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  badgeText: { color: Colors.surface, fontSize: Typography.size.xs, fontWeight: '800' },
  itemName: { fontSize: Typography.size.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  itemDesc: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.md, height: 40 },
  buyBtn: { backgroundColor: Colors.coin, paddingVertical: 8, borderRadius: Radius.md, alignItems: 'center' },
  buyBtnText: { color: '#FFF', fontWeight: '800', fontSize: Typography.size.sm },
  ownedBtn: { backgroundColor: Colors.border },
  ownedBtnText: { color: Colors.textSecondary },
  disabledBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  disabledBtnText: { color: Colors.textMuted },

  emptyState: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Typography.size.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyDesc: { color: Colors.textSecondary },
});
