import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { assessmentApi, type PlateResponse, type AssessmentResult } from '../src/services/api';
import { Colors, Typography, Spacing, Radius, Shadow, CvdTypeColors, SeverityColors } from '../src/constants/theme';
import IshiharaPlate from '../src/components/IshiharaPlate';
import { showAchievementToasts } from '../src/components/AchievementToast';

// ─── Test Plates ──────────────────────────────────────────────────────────────
// Each plate uses procedurally generated Ishihara-style colored dot patterns.
// 'rd'      = red/orange number on green bg  (tests protan/deutan screening)
// 'rd_inv'  = green number on red/orange bg  (protan/deutan differentiation)
// 'neutral' = dark-blue on gray              (visible to all — calibration)

type PaletteKey = 'rd' | 'rd_inv' | 'neutral';

interface TestPlate {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  instruction: string;
  palette: PaletteKey;
}

const TEST_PLATES: TestPlate[] = [
  { id: 1,  palette: 'neutral', correctAnswer: '12', options: ['12', '2', '1', 'Nothing'],    question: 'What number do you see?', instruction: 'Everyone should be able to see this number.' },
  { id: 2,  palette: 'rd',      correctAnswer: '8',  options: ['8', '3', '6', 'Nothing'],     question: 'What number do you see?', instruction: 'Look carefully — the number is hidden in the dots.' },
  { id: 3,  palette: 'rd',      correctAnswer: '6',  options: ['6', '5', '9', 'Nothing'],     question: 'What number do you see?', instruction: 'Focus on the color contrast between dots.' },
  { id: 4,  palette: 'rd',      correctAnswer: '29', options: ['29', '70', '92', 'Nothing'],  question: 'What number do you see?', instruction: 'This two-digit number tests red-green distinction.' },
  { id: 5,  palette: 'rd',      correctAnswer: '57', options: ['57', '35', '75', 'Nothing'],  question: 'What number do you see?', instruction: 'Look for the number formed by one set of colored dots.' },
  { id: 6,  palette: 'rd',      correctAnswer: '5',  options: ['5', '2', '6', 'Nothing'],     question: 'What number do you see?', instruction: 'Tracing the shape with your eye may help.' },
  { id: 7,  palette: 'rd',      correctAnswer: '3',  options: ['3', '5', '8', 'Nothing'],     question: 'What number do you see?', instruction: 'The number is formed by contrasting colored dots.' },
  { id: 8,  palette: 'rd',      correctAnswer: '15', options: ['15', '17', '5', 'Nothing'],   question: 'What number do you see?', instruction: 'Look for a two-digit number.' },
  { id: 9,  palette: 'rd',      correctAnswer: '74', options: ['74', '21', '71', 'Nothing'],  question: 'What number do you see?', instruction: 'This plate helps distinguish protan from deutan.' },
  { id: 10, palette: 'rd',      correctAnswer: '2',  options: ['2', '6', '0', 'Nothing'],     question: 'What number do you see?', instruction: 'Take your time — some plates are more difficult.' },
  { id: 18, palette: 'rd_inv',  correctAnswer: '6',  options: ['6', '5', 'Nothing', '2'],    question: 'What number do you see?', instruction: 'This plate uses inverted color placement.' },
  { id: 19, palette: 'rd',      correctAnswer: '8',  options: ['8', '3', 'Nothing', '9'],    question: 'What number do you see?', instruction: 'Protan/deutan differentiation plate.' },
  { id: 20, palette: 'rd_inv',  correctAnswer: '16', options: ['16', '6', 'Nothing', '1'],   question: 'What number do you see?', instruction: 'Focus on the full number, not individual digits.' },
];

type Phase = 'intro' | 'testing' | 'loading' | 'result';

export default function AssessmentScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<PlateResponse[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [rewards, setRewards] = useState<{ xpEarned: number; coinsEarned: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const plate = TEST_PLATES[currentIndex];
  const totalPlates = TEST_PLATES.length;

  useEffect(() => {
    if (phase === 'testing') {
      Animated.timing(progress, {
        toValue: ((currentIndex + 1) / totalPlates) * 100,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [currentIndex, phase]);

  async function handleStart() {
    try {
      const { assessmentId: id } = await assessmentApi.startAssessment();
      setAssessmentId(id);
      setCurrentIndex(0);
      setResponses([]);
      setStartTime(Date.now());
      setPhase('testing');
    } catch (err) {
      Alert.alert('Error', 'Could not start assessment. Please try again.');
    }
  }

  function handleAnswer(answer: string) {
    const responseMs = Date.now() - startTime;
    const response: PlateResponse = {
      plateId: plate.id,
      userAnswer: answer === 'Nothing' ? '' : answer,
      responseMs,
      isCorrect: answer === plate.correctAnswer,
    };

    const newResponses = [...responses, response];
    setResponses(newResponses);
    setStartTime(Date.now());

    if (currentIndex + 1 >= totalPlates) {
      submitAssessment(newResponses);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  }

  async function submitAssessment(finalResponses: PlateResponse[]) {
    if (!assessmentId) return;
    setPhase('loading');
    try {
      const data = await assessmentApi.submitAssessment(assessmentId, finalResponses);
      // Show achievement toasts if any were unlocked
      if (data.newAchievements && data.newAchievements.length > 0) {
        showAchievementToasts(data.newAchievements);
      }
      setResult(data.result);
      setRewards({ xpEarned: data.xpEarned, coinsEarned: data.coinsEarned });
      setPhase('result');
    } catch (err) {
      Alert.alert('Error', 'Could not submit assessment. Please try again.');
      setPhase('intro');
    }
  }

  if (phase === 'intro') return <IntroScreen onStart={handleStart} />;
  if (phase === 'loading') return <LoadingScreen />;
  if (phase === 'result' && result) return <ResultScreen result={result} rewards={rewards} onDone={() => router.push('/(tabs)/home')} />;

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressOuter}>
        <Animated.View
          style={[
            styles.progressInner,
            { width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) as any },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>{currentIndex + 1} of {totalPlates}</Text>

      {/* Plate */}
      <View style={styles.plateContainer}>
        <IshiharaPlate
          plateId={plate.id}
          number={plate.correctAnswer}
          palette={plate.palette}
        />
        <Text style={styles.instruction}>{plate.instruction}</Text>
        <Text style={styles.question}>{plate.question}</Text>
      </View>

      {/* Answer options */}
      <View style={styles.options}>
        {plate.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={styles.optionButton}
            onPress={() => handleAnswer(opt)}
            accessibilityRole="button"
            accessibilityLabel={`Answer: ${opt}`}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Sub-screens ──────────────────────────────────────────────────────────────

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.base }}>
      <View style={{ alignItems: 'center', paddingVertical: Spacing['3xl'] }}>
        <Text style={{ fontSize: 64 }}>👁️</Text>
        <Text style={{ fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' }}>
          Color Vision Assessment
        </Text>
        <Text style={{ fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 24 }}>
          This test uses {TEST_PLATES.length} Ishihara-style plates to evaluate your color vision.
          You'll be asked to identify numbers hidden in colored dot patterns.
        </Text>
      </View>

      {[
        { emoji: '⏱️', title: 'Takes about 5 minutes', desc: 'Answer each plate as quickly as you can' },
        { emoji: '🔒', title: 'Private results', desc: 'Only you can see your assessment results' },
        { emoji: '🎯', title: 'ML-powered analysis', desc: 'Your responses are analyzed to classify CVD type and severity' },
      ].map((item) => (
        <View key={item.title} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow.sm }}>
          <Text style={{ fontSize: 24, marginRight: Spacing.md }}>{item.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{item.title}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 2 }}>{item.desc}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={{ backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.xl, ...Shadow.md }}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Start the color vision assessment"
      >
        <Text style={{ color: Colors.textInverted, fontSize: Typography.size.md, fontWeight: '700' }}>Start Assessment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={{ marginTop: Spacing.lg, fontSize: Typography.size.md, color: Colors.textSecondary }}>
        Analyzing your results…
      </Text>
    </View>
  );
}

function ResultScreen({
  result,
  rewards,
  onDone,
}: {
  result: AssessmentResult;
  rewards: { xpEarned: number; coinsEarned: number } | null;
  onDone: () => void;
}) {
  const cvdColor = CvdTypeColors[result.cvdType] ?? Colors.primary;
  const severityColor = SeverityColors[result.severity] ?? Colors.warning;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}>
      {/* Header */}
      <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
        <Text style={{ fontSize: 56 }}>
          {result.cvdType === 'normal' ? '🎉' : '👁️'}
        </Text>
        <Text style={{ fontSize: Typography.size['2xl'], fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' }}>
          Assessment Complete
        </Text>
      </View>

      {/* Result Card */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, marginBottom: Spacing.md, borderLeftWidth: 4, borderLeftColor: cvdColor, ...Shadow.md }}>
        <Text style={{ fontSize: Typography.size.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Diagnosis</Text>
        <Text style={{ fontSize: Typography.size.xl, fontWeight: '800', color: cvdColor, marginTop: Spacing.xs, textTransform: 'capitalize' }}>
          {result.cvdType.replace(/([A-Z])/g, ' $1')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm }}>
          <View style={{ backgroundColor: severityColor + '20', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 }}>
            <Text style={{ color: severityColor, fontWeight: '700', fontSize: Typography.size.xs, textTransform: 'capitalize' }}>
              {result.severity} severity
            </Text>
          </View>
          <Text style={{ marginLeft: Spacing.sm, color: Colors.textMuted, fontSize: Typography.size.xs }}>
            {Math.round(result.confidence * 100)}% confidence
          </Text>
        </View>
        <Text style={{ color: Colors.textSecondary, marginTop: Spacing.md, lineHeight: 22, fontSize: Typography.size.sm }}>
          {result.description}
        </Text>
      </View>

      {/* Affected Colors */}
      {result.affectedColors.length > 0 && (
        <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm }}>
          <Text style={{ fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm }}>Affected Colors</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {result.affectedColors.map((c) => (
              <View key={c} style={{ backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.sm }}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recommendations */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm }}>
        <Text style={{ fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm }}>Recommendations</Text>
        {result.recommendations.map((rec, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
            <Text style={{ color: Colors.accent, marginRight: Spacing.sm, fontWeight: '700' }}>•</Text>
            <Text style={{ flex: 1, color: Colors.textSecondary, fontSize: Typography.size.sm, lineHeight: 20 }}>{rec}</Text>
          </View>
        ))}
      </View>

      {/* Rewards */}
      {rewards && (
        <View style={{ backgroundColor: Colors.primaryBg, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, flexDirection: 'row', gap: Spacing.md }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>⭐</Text>
            <Text style={{ fontWeight: '800', color: Colors.primary, fontSize: Typography.size.lg }}>+{rewards.xpEarned}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.xs }}>XP earned</Text>
          </View>
          <View style={{ width: 1, backgroundColor: Colors.border }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>🪙</Text>
            <Text style={{ fontWeight: '800', color: Colors.coin, fontSize: Typography.size.lg }}>+{rewards.coinsEarned}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: Typography.size.xs }}>coins earned</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={{ backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center', ...Shadow.md }}
        onPress={onDone}
        accessibilityRole="button"
      >
        <Text style={{ color: Colors.textInverted, fontSize: Typography.size.md, fontWeight: '700' }}>Continue Training</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  progressOuter: { height: 6, backgroundColor: Colors.border, marginHorizontal: Spacing.base, marginTop: Spacing.base, borderRadius: Radius.full },
  progressInner: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  progressLabel: { textAlign: 'center', color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: Spacing.xs, marginBottom: Spacing.md },
  plateContainer: { alignItems: 'center', paddingHorizontal: Spacing.base },

  instruction: { color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: Spacing.md, textAlign: 'center' },
  question: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: '700', marginTop: Spacing.sm, textAlign: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.base, gap: Spacing.sm, marginTop: Spacing.base },
  optionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  optionText: { fontSize: Typography.size.lg, fontWeight: '700', color: Colors.textPrimary },
});
