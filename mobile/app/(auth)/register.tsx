import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../src/constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  async function handleRegister() {
    setLocalError('');
    clearError();

    if (!email.trim() || !username.trim() || !password || !confirmPassword) {
      setLocalError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setLocalError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    try {
      await register(email.trim(), username.trim(), password);
      router.replace('/(tabs)/home');
    } catch {
      // error shown from store
    }
  }

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>👁️</Text>
          </View>
          <Text style={styles.brand}>ColorAid</Text>
          <Text style={styles.tagline}>Your color vision companion</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create account</Text>

          {displayError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          ) : null}

          {[
            { label: 'Email', value: email, setter: setEmail, keyboard: 'email-address' as const, placeholder: 'you@example.com', autocap: 'none' as const },
            { label: 'Username', value: username, setter: setUsername, keyboard: 'default' as const, placeholder: 'colorvision_pro', autocap: 'none' as const },
          ].map((f) => (
            <View key={f.label} style={styles.field}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={f.value}
                onChangeText={(t) => { f.setter(t); setLocalError(''); clearError(); }}
                placeholder={f.placeholder}
                placeholderTextColor={Colors.textMuted}
                keyboardType={f.keyboard}
                autoCapitalize={f.autocap}
                autoCorrect={false}
              />
            </View>
          ))}

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => { setPassword(t); setLocalError(''); }}
              placeholder="Minimum 8 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setLocalError(''); }}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            accessibilityLabel="Create ColorAid account"
            accessibilityRole="button"
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.textInverted} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={() => router.push('/login')}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkBold}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.base },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  logoText: { fontSize: 36 },
  brand: { fontSize: Typography.size['3xl'], fontWeight: '800', color: Colors.textPrimary },
  tagline: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    ...Shadow.md,
  },
  title: { fontSize: Typography.size.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: { color: Colors.error, fontSize: Typography.size.sm },
  field: { marginBottom: Spacing.md },
  label: { fontSize: Typography.size.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceAlt,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Shadow.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.textInverted, fontSize: Typography.size.md, fontWeight: '700' },
  link: { marginTop: Spacing.lg, alignItems: 'center' },
  linkText: { color: Colors.textSecondary, fontSize: Typography.size.sm },
  linkBold: { color: Colors.primary, fontWeight: '700' },
});
