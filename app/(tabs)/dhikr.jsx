import { View, StyleSheet, Dimensions } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import DhikrCounter from '../../src/components/DhikrCounter';
import ConfettiLayer from '../../src/components/ConfettiLayer';
import supabase from '../../src/services/supabase';

const DARK            = '#0F1923';
const { width }       = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const SPRING_CFG      = { damping: 20, stiffness: 180, mass: 0.8 };

export default function DhikrScreen() {
    const navigation = useNavigation();

    const [dhikrData,      setDhikrData]      = useState([]);
    const [loading,        setLoading]         = useState(true);
    const [index,          setIndex]           = useState(0);
    // FIX: confetti trigger — set to Date.now() whenever a dhikr is completed
    const [confettiTrigger, setConfettiTrigger] = useState(null);
    const [progress,       setProgress]        = useState({
        counts: [], completed: [], lastUpdated: null, streak: 0,
    });

    const translateX  = useSharedValue(0);
    const opacity     = useSharedValue(1);
    const svIndex     = useSharedValue(0);
    const svTotal     = useSharedValue(0);
    const isAnimating = useSharedValue(false);

    useEffect(() => { svIndex.value = index; },            [index]);
    useEffect(() => { svTotal.value = dhikrData.length; }, [dhikrData.length]);

    // ── Reload on focus (picks up newly added custom dhikr) ──────────────
    useFocusEffect(
        useCallback(() => {
            fetchDhikr();
        }, [])
    );

    // ── Fetch ─────────────────────────────────────────────────────────────
    const fetchDhikr = async () => {
        try {
            const { data, error } = await supabase
                .from('dhikr')
                .select('id, title, arabic, translation, target_count, category')
                .order('id', { ascending: true });

            if (error) throw error;

            const formatted = (data || []).map(d => ({ ...d, target: d.target_count }));

            // Merge with user-created custom dhikr from AsyncStorage
            const customRaw  = await AsyncStorage.getItem('customDhikr');
            const customList = customRaw ? JSON.parse(customRaw) : [];

            const all = [...formatted, ...customList];
            setDhikrData(all);
            svTotal.value = all.length;

            // Only reset progress when list length changes (new item added)
            setProgress(prev => {
                if (prev.counts.length === all.length) return prev;
                return {
                    counts:      all.map((_, i) => prev.counts[i]    ?? 0),
                    completed:   all.map((_, i) => prev.completed[i] ?? false),
                    lastUpdated: prev.lastUpdated,
                    streak:      prev.streak,
                };
            });
        } catch (err) {
            console.error('Dhikr fetch:', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (dhikrData.length > 0) loadProgress();
    }, [dhikrData.length]);

    // ── Storage ───────────────────────────────────────────────────────────
    const loadProgress = async () => {
        try {
            const saved = await AsyncStorage.getItem('dhikrProgress');
            if (!saved) return;
            const parsed = JSON.parse(saved);
            const today  = new Date().toDateString();

            if (parsed.lastUpdated !== today) {
                const reset = {
                    counts:      dhikrData.map(() => 0),
                    completed:   dhikrData.map(() => false),
                    lastUpdated: today,
                    streak:      parsed.streak || 0,
                };
                setProgress(reset);
                await AsyncStorage.setItem('dhikrProgress', JSON.stringify(reset));
                return;
            }

            setProgress({
                ...parsed,
                counts:    dhikrData.map((_, i) => parsed.counts?.[i]    ?? 0),
                completed: dhikrData.map((_, i) => parsed.completed?.[i] ?? false),
            });
        } catch (e) { console.error('loadProgress:', e); }
    };

    const saveProgress = async (data) => {
        try {
            await AsyncStorage.setItem('dhikrProgress', JSON.stringify(data));
        } catch (e) { console.error('saveProgress:', e); }
    };

    // ── Transition ────────────────────────────────────────────────────────
    const goToIndex = useCallback((nextIdx, direction) => {
        if (isAnimating.value) return;
        isAnimating.value = true;

        translateX.value = withTiming(-36 * direction, { duration: 130 });
        opacity.value    = withTiming(0, { duration: 130 }, (finished) => {
            'worklet';
            if (!finished) {
                isAnimating.value = false;
                return;
            }
            translateX.value = 40 * direction;
            runOnJS(setIndex)(nextIdx);
            translateX.value = withSpring(0, SPRING_CFG);
            opacity.value    = withTiming(1, { duration: 200 }, () => {
                'worklet';
                isAnimating.value = false;
            });
        });
    }, []);

    // ── Gesture ───────────────────────────────────────────────────────────
    const panGesture = Gesture.Pan()
        .minDistance(10)
        .activeOffsetX([-10, 10])
        .failOffsetY([-25, 25])
        .onUpdate((e) => {
            'worklet';
            const atStart = svIndex.value === 0                  && e.translationX > 0;
            const atEnd   = svIndex.value === svTotal.value - 1  && e.translationX < 0;
            translateX.value = (atStart || atEnd)
                ? e.translationX * 0.1
                : e.translationX * 0.5;
        })
        .onEnd((e) => {
            'worklet';
            const cur = svIndex.value;
            const len = svTotal.value;
            if (len <= 1) {
                translateX.value = withSpring(0, SPRING_CFG);
                return;
            }

            const shouldGoNext = (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -600) && cur < len - 1;
            const shouldGoPrev = (e.translationX >  SWIPE_THRESHOLD || e.velocityX >  600) && cur > 0;

            if (shouldGoNext) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                runOnJS(goToIndex)(cur + 1, 1);
            } else if (shouldGoPrev) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                runOnJS(goToIndex)(cur - 1, -1);
            } else {
                translateX.value = withSpring(0, SPRING_CFG);
            }
        });

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity:   opacity.value,
    }));

    // ── Counter tap ───────────────────────────────────────────────────────
    const handleIncrement = useCallback((i) => {
        setProgress(prev => {
            const currentCount = prev.counts[i] ?? 0;
            const target       = dhikrData[i]?.target ?? 33;
            if (currentCount >= target) return prev;

            const newCounts    = [...prev.counts];
            newCounts[i]       = currentCount + 1;
            const newCompleted = [...prev.completed];
            const justDone     = newCounts[i] === target;
            if (justDone) newCompleted[i] = true;

            const allDone = newCompleted.every(Boolean);
            const updated = {
                ...prev,
                counts:      newCounts,
                completed:   newCompleted,
                lastUpdated: new Date().toDateString(),
                streak: allDone && !prev.completed.every(Boolean)
                    ? prev.streak + 1
                    : prev.streak,
            };

            saveProgress(updated);

            if (justDone) {
                // FIX: fire confetti on dhikr completion
                setConfettiTrigger(Date.now());
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (i < dhikrData.length - 1) {
                    setTimeout(() => goToIndex(i + 1, 1), 700);
                }
            } else {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }

            return updated;
        });
    }, [dhikrData, goToIndex]);

    // ── Reset ─────────────────────────────────────────────────────────────
    const handleReset = useCallback(() => {
        const reset = {
            counts:      dhikrData.map(() => 0),
            completed:   dhikrData.map(() => false),
            lastUpdated: new Date().toDateString(),
            streak:      progress.streak,
        };
        setProgress(reset);
        saveProgress(reset);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (index !== 0) goToIndex(0, -1);
    }, [dhikrData, progress.streak, index, goToIndex]);

    // ── Dot press ─────────────────────────────────────────────────────────
    const handleDotPress = useCallback((i) => {
        if (i === index) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        goToIndex(i, i > index ? 1 : -1);
    }, [index, goToIndex]);

    // ── Navigate to add custom dhikr screen ──────────────────────────────
    const handleAddDhikr = useCallback(() => {
        navigation.navigate('AddDhikr');
    }, [navigation]);

    // ── Loading ───────────────────────────────────────────────────────────
    if (loading || dhikrData.length === 0) {
        return (
            <View style={styles.loader}>
                <Animated.Text style={styles.loadingText}>Loading Dhikr…</Animated.Text>
            </View>
        );
    }

    const currentDhikr = dhikrData[index] ?? dhikrData[0];

    return (
        <View style={styles.container}>
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.fill, animStyle]}>
                    <DhikrCounter
                        dhikr={currentDhikr}
                        count={progress.counts[index] ?? 0}
                        isCompleted={progress.completed[index] ?? false}
                        allCompleted={progress.completed.every(Boolean)}
                        streak={progress.streak}
                        onIncrement={() => handleIncrement(index)}
                        onReset={handleReset}
                        totalDhikr={dhikrData.length}
                        currentIndex={index}
                        onDotPress={handleDotPress}
                        completedFlags={progress.completed}
                        allCounts={progress.counts}
                        onAddDhikr={handleAddDhikr}
                    />
                </Animated.View>
            </GestureDetector>

            {/* FIX: ConfettiLayer now rendered and wired to confettiTrigger state */}
            <ConfettiLayer trigger={confettiTrigger} />
        </View>
    );
}

const styles = StyleSheet.create({
    container:   { flex: 1, backgroundColor: DARK },
    fill:        { flex: 1 },
    loader: {
        flex: 1, justifyContent: 'center',
        alignItems: 'center', backgroundColor: DARK,
    },
    loadingText: { color: '#C9A84C', fontSize: 16 },
});