import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Colors, Typography, Spacing, Radius, Shadow } from '../src/constants/theme';
import { colorApi, type SampledColor } from '../src/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'camera' | 'photo';

interface CapturedImage {
  displayUri: string;
  base64: string;
  width: number;
  height: number;
}

interface TapState {
  displayX: number;
  displayY: number;
  normX: number;
  normY: number;
  phase: 'loading' | 'done' | 'error';
  color?: SampledColor;
}

const POPUP_W = 180;
const POPUP_H = 60;

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('camera');
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [tap, setTap] = useState<TapState | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // ── Permission ─────────────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permEmoji}>📷</Text>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSubtitle}>
          ColorAid needs camera access to identify colors from your surroundings.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission} accessibilityRole="button">
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  async function handleCapture() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      // Resize to 600px wide for API — keeps aspect ratio, greatly reduces payload size
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 600 } }],
        { compress: 0.75, format: SaveFormat.JPEG, base64: true }
      );
      setCaptured({
        displayUri: photo.uri,
        base64: resized.base64 ?? '',
        width: resized.width,
        height: resized.height,
      });
      setTap(null);
      setMode('photo');
    } catch {
      /* camera error — stay in camera mode */
    } finally {
      setIsCapturing(false);
    }
  }

  function handleRetake() {
    setMode('camera');
    setCaptured(null);
    setTap(null);
  }

  // ── Tap handler ────────────────────────────────────────────────────────────

  function handleImageTap(event: GestureResponderEvent) {
    if (!captured || !containerSize) return;
    const { locationX, locationY } = event.nativeEvent;

    // Compute where the image renders inside the container with resizeMode: cover.
    // Cover scales the image so it *fills* the container (the larger scale wins),
    // meaning one axis may overflow (negative offset). Clamping to [0,1] keeps
    // normX/normY valid even when the user taps near a cropped edge.
    const containerAspect = containerSize.width / containerSize.height;
    const imageAspect = captured.width / captured.height;

    let scale: number;
    if (imageAspect > containerAspect) {
      // Image is wider than container — fit height, crop left/right
      scale = containerSize.height / captured.height;
    } else {
      // Image is taller than container — fit width, crop top/bottom
      scale = containerSize.width / captured.width;
    }
    const offsetX = (containerSize.width - captured.width * scale) / 2;  // ≤ 0 on cropped axis
    const offsetY = (containerSize.height - captured.height * scale) / 2;

    const normX = Math.max(0, Math.min((locationX - offsetX) / (captured.width * scale), 1));
    const normY = Math.max(0, Math.min((locationY - offsetY) / (captured.height * scale), 1));

    setTap({ displayX: locationX, displayY: locationY, normX, normY, phase: 'loading' });

    colorApi
      .samplePoint(captured.base64, normX, normY)
      .then((color) => setTap((prev) => prev ? { ...prev, phase: 'done', color } : null))
      .catch(() => setTap((prev) => prev ? { ...prev, phase: 'error' } : null));
  }

  function handleContainerLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  }

  // ── Camera mode ────────────────────────────────────────────────────────────

  if (mode === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <Text style={styles.hint}>Frame what you want to sample</Text>
          </View>
        </CameraView>

        <View style={styles.shutterBar}>
          <TouchableOpacity
            style={[styles.shutterButton, isCapturing && styles.shutterCapturing]}
            onPress={handleCapture}
            disabled={isCapturing}
            accessibilityRole="button"
            accessibilityLabel="Take photo to sample colors"
          >
            {isCapturing
              ? <ActivityIndicator color="#fff" />
              : <View style={styles.shutterInner} />}
          </TouchableOpacity>
          <Text style={styles.shutterHint}>Tap to capture</Text>
        </View>
      </View>
    );
  }

  // ── Photo review mode ──────────────────────────────────────────────────────

  if (!captured) return null;

  const popupLeft = Math.max(
    8,
    Math.min(
      (tap?.displayX ?? 0) - POPUP_W / 2,
      (containerSize?.width ?? 400) - POPUP_W - 8,
    ),
  );
  const showPopupBelow = (tap?.displayY ?? 0) < POPUP_H + 32;
  const popupTop = showPopupBelow
    ? (tap?.displayY ?? 0) + 20
    : (tap?.displayY ?? 0) - POPUP_H - 20;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.imageContainer}
        onPress={handleImageTap}
        onLayout={handleContainerLayout}
        accessibilityLabel="Tap anywhere to identify a color"
      >
        <Image
          source={{ uri: captured.displayUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* Tap indicator dot */}
        {tap && (
          <View
            pointerEvents="none"
            style={[styles.tapDot, { left: tap.displayX - 7, top: tap.displayY - 7 }]}
          />
        )}

        {/* Color popup */}
        {tap && (
          <View
            pointerEvents="none"
            style={[styles.popup, { left: popupLeft, top: popupTop }]}
          >
            {tap.phase === 'loading' && (
              <ActivityIndicator size="small" color={Colors.primary} />
            )}
            {tap.phase === 'done' && tap.color && (
              <>
                <View style={[styles.popupSwatch, { backgroundColor: tap.color.hex }]} />
                <View style={styles.popupText}>
                  <Text style={styles.popupName} numberOfLines={1}>{tap.color.name}</Text>
                  <Text style={styles.popupHex}>{tap.color.hex}</Text>
                </View>
                <Text style={styles.popupPct}>{Math.round(tap.color.confidence * 100)}%</Text>
              </>
            )}
            {tap.phase === 'error' && (
              <Text style={styles.popupError}>Couldn't read color</Text>
            )}
          </View>
        )}

        {/* First-use hint */}
        {!tap && (
          <View pointerEvents="none" style={styles.tapHintOverlay}>
            <View style={styles.tapHintBadge}>
              <Text style={styles.tapHintText}>👆  Tap anywhere to identify a color</Text>
            </View>
          </View>
        )}
      </Pressable>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.retakeButton}
          onPress={handleRetake}
          accessibilityRole="button"
        >
          <Text style={styles.retakeText}>↩  Retake</Text>
        </TouchableOpacity>

        {tap?.phase === 'done' && tap.color && (
          <View style={styles.bottomColor}>
            <View style={[styles.bottomSwatch, { backgroundColor: tap.color.hex }]} />
            <View>
              <Text style={styles.bottomColorName}>{tap.color.name}</Text>
              <Text style={styles.bottomColorHex}>{tap.color.hex}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Camera mode
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 16 },
  hint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: Typography.size.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  shutterBar: { height: 110, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shutterButton: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterCapturing: { opacity: 0.45 },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
  shutterHint: { color: 'rgba(255,255,255,0.45)', fontSize: Typography.size.xs },

  // Photo review mode
  imageContainer: { flex: 1, backgroundColor: '#000' },

  tapDot: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2, borderColor: Colors.primary,
    zIndex: 10,
  },

  popup: {
    position: 'absolute',
    width: POPUP_W,
    minHeight: POPUP_H,
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
    ...Shadow.lg,
  },
  popupSwatch: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  popupText: { flex: 1 },
  popupName: { fontSize: Typography.size.sm, fontWeight: '700', color: Colors.textPrimary },
  popupHex: { fontSize: Typography.size.xs, color: Colors.textMuted },
  popupPct: { fontSize: Typography.size.xs, color: Colors.textMuted, alignSelf: 'flex-start' },
  popupError: { fontSize: Typography.size.sm, color: '#e44' },

  tapHintOverlay: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' },
  tapHintBadge: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  tapHintText: { color: '#fff', fontSize: Typography.size.sm },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    minHeight: 72,
  },
  retakeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retakeText: { color: '#fff', fontSize: Typography.size.sm, fontWeight: '600' },
  bottomColor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bottomSwatch: { width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  bottomColorName: { color: '#fff', fontSize: Typography.size.sm, fontWeight: '700' },
  bottomColorHex: { color: 'rgba(255,255,255,0.55)', fontSize: Typography.size.xs },

  // Permission screen
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], backgroundColor: Colors.background },
  permEmoji: { fontSize: 56, marginBottom: Spacing.lg },
  permTitle: { fontSize: Typography.size.xl, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  permSubtitle: { fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  permButton: { marginTop: Spacing.xl, backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg, ...Shadow.md },
  permButtonText: { color: Colors.textInverted, fontWeight: '700', fontSize: Typography.size.md },
});
