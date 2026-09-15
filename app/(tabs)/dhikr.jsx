import { View, StyleSheet, Dimensions, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
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
import {
    getDhikrDefinitions,
    getCustomDhikr,
    getTodayDhikrLogs,
    saveDhikrProgress,
    resetDhikrProgress,
    getDhikrActiveDates,
    deleteDhikr,
} from '../../src/services/dhikr';
import { computeCurrentStreak } from '../../src/utils/streaks';

const DARK            = '#0F1923';
const { width }        = Dimensions.get('window');
const SWIPE_THRESHOLD  = 80;
const SPRING_CFG       = { damping: 20, stiffness: 180, mass: 0.8 };

export default function DhikrScreen() {
    const navigation = useNavigation();

    const [dhikrData,       setDhikrData]       = useState([]);
    const [loading,         setLoading]         = useState(true);
    const [error,           setError]           = useState(null);
    const [index,           setIndex]           = useState(0);
    const [confettiTrigger, setConfettiTrigger] = useState(null);

    // Keyed by dhikr.id, NOT array position — a dhikr's position can
    // change (custom dhikr added, list re-sorted) but its id can't.
    // Shape: { [dhikrId]: { count, completed } }
    const [progress, setProgress] = useState({});
    const [streak,   setStreak]   = useState(0);

    const translateX  = useSharedValue(0);
    const opacity      = useSharedValue(1);
    const svIndex      = useSharedValue(0);
    const svTotal       = useSharedValue(0);
    const isAnimating  = useSharedValue(false);

    useEffect(() => { svIndex.value = index; },            [index]);
    useEffect(() => { svTotal.value = dhikrData.length; }, [dhikrData.length]);

    // ── Reload on focus (picks up newly added custom dhikr + today's logs) ──
    useFocusEffect(
        useCallback(() => {
            fetchDhikr();
        }, [])
    );

    // ── Fetch catalogue (preset + custom) and today's progress ──────────────
    const fetchDhikr = async () => {
        try {
            setError(null);
            const [presetDhikr, customDhikr, logs] = await Promise.all([
                getDhikrDefinitions(),
                getCustomDhikr(),
                getTodayDhikrLogs(),
            ]);

            const all = [...presetDhikr, ...customDhikr];
            setDhikrData(all);
            svTotal.value = all.length;

            const progressMap = {};
            for (const log of logs) {
                progressMap[log.dhikr_id] = {
                    count: log.count,
                    completed: log.completed,
                };
            }
            setProgress(progressMap);

            refreshStreak();
        } catch (err) {
            console.error('Dhikr fetch:', err.message);
            setError('Could not load your dhikr. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const refreshStreak = async () => {
        try {
            const activeDates = await getDhikrActiveDates();
            setStreak(computeCurrentStreak(activeDates));
        } catch (err) {
            console.error('Dhikr streak:', err.message);
        }
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
        const dhikr = dhikrData[i];
        if (!dhikr) return;

        const current = progress[dhikr.id]?.count ?? 0;
        const target  = dhikr.target_count ?? 33;
        if (current >= target) return;

        const newCount   = current + 1;
        const justDone   = newCount === target;
        const wasDone    = progress[dhikr.id]?.completed ?? false;

        // Optimistic UI update.
        setProgress(prev => ({
            ...prev,
            [dhikr.id]: { count: newCount, completed: justDone },
        }));

        saveDhikrProgress({ dhikrId: dhikr.id, count: newCount, completed: justDone })
            .then(() => {
                if (justDone && !wasDone) refreshStreak();
            })
            .catch(err => console.error('saveDhikrProgress:', err.message));

        if (justDone) {
            setConfettiTrigger(Date.now());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (i < dhikrData.length - 1) {
                setTimeout(() => goToIndex(i + 1, 1), 700);
            }
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    }, [dhikrData, progress, goToIndex]);

    // ── Reset (today only) ───────────────────────────────────────────────
    const handleReset = useCallback(() => {
        const ids = dhikrData.map(d => d.id);

        setProgress(prev => {
            const cleared = { ...prev };
            for (const id of ids) cleared[id] = { count: 0, completed: false };
            return cleared;
        });

        resetDhikrProgress(ids)
            .then(refreshStreak)
            .catch(err => console.error('resetDhikrProgress:', err.message));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (index !== 0) goToIndex(0, -1);
    }, [dhikrData, index, goToIndex]);

    // ── Dot press ─────────────────────────────────────────────────────────
    const handleDotPress = useCallback((i) => {
        if (i === index) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        goToIndex(i, i > index ? 1 : -1);
    }, [index, goToIndex]);

    // ── Delete a preset (hide) or custom (hard-delete) dhikr ─────────────
    const handleDeleteDhikr = useCallback((dhikr) => {
        const deletedIdx = dhikrData.findIndex(d => d.id === dhikr.id);
        if (deletedIdx === -1) return;

        const newList = dhikrData.filter(d => d.id !== dhikr.id);

        setDhikrData(newList);
        svTotal.value = newList.length;
        setProgress(prev => {
            const next = { ...prev };
            delete next[dhikr.id];
            return next;
        });
        setIndex(prev => {
            const shifted = deletedIdx < prev ? prev - 1 : prev;
            return Math.max(0, Math.min(shifted, newList.length - 1));
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

        deleteDhikr(dhikr)
            .then(refreshStreak)
            .catch(err => {
                console.error('deleteDhikr:', err.message);
                // Something went wrong server-side — resync from the source
                // of truth instead of leaving the UI showing a deletion that
                // didn't actually happen.
                fetchDhikr();
            });
    }, [dhikrData]);

    // ── Navigate to add custom dhikr screen ──────────────────────────────
    const handleAddDhikr = useCallback(() => {
        navigation.navigate('AddDhikr');
    }, [navigation]);

    const handleRetry = useCallback(() => {
        setLoading(true);
        fetchDhikr();
    }, []);

    // ── Loading ───────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color="#C9A84C" />
                <Text style={styles.loadingText}>Loading Dhikr…</Text>
            </View>
        );
    }

    // ── Error (fetch failed — distinct from a genuinely empty list) ──────
    if (error) {
        return (
            <View style={styles.loader}>
                <Ionicons name="cloud-offline-outline" size={44} color="#5A6A7A" />
                <Text style={styles.emptyTitle}>Something went wrong</Text>
                <Text style={styles.emptySubtitle}>{error}</Text>
                <TouchableOpacity style={styles.emptyAddBtn} onPress={handleRetry}>
                    <Text style={styles.emptyAddBtnText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Empty (everything hidden/deleted, or no dhikr added yet) ─────────
    if (dhikrData.length === 0) {
        return (
            <View style={styles.loader}>
                <View style={styles.emptyIconWrap}>
                    <Ionicons name="moon-outline" size={34} color="#C9A84C" />
                </View>
                <Text style={styles.emptyTitle}>No Dhikr Yet</Text>
                <Text style={styles.emptySubtitle}>
                    Add your first dhikr to start building your daily practice.
                </Text>
                <TouchableOpacity
                    style={styles.emptyAddBtn}
                    onPress={handleAddDhikr}
                    activeOpacity={0.85}
                >
                    <Ionicons name="add" size={18} color="#0F1923" style={{ marginRight: 4 }} />
                    <Text style={styles.emptyAddBtnText}>Add Dhikr</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const currentDhikr    = dhikrData[index] ?? dhikrData[0];
    const completedFlags  = dhikrData.map(d => progress[d.id]?.completed ?? false);
    const allCounts       = dhikrData.map(d => progress[d.id]?.count ?? 0);
    const allCompleted    = completedFlags.every(Boolean);

    return (
        <View style={styles.container}>
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.fill, animStyle]}>
                    <DhikrCounter
                        dhikr={currentDhikr}
                        count={progress[currentDhikr.id]?.count ?? 0}
                        isCompleted={progress[currentDhikr.id]?.completed ?? false}
                        allCompleted={allCompleted}
                        streak={streak}
                        onIncrement={() => handleIncrement(index)}
                        onReset={handleReset}
                        totalDhikr={dhikrData.length}
                        currentIndex={index}
                        onDotPress={handleDotPress}
                        completedFlags={completedFlags}
                        allCounts={allCounts}
                        onAddDhikr={handleAddDhikr}
                        onDeleteDhikr={handleDeleteDhikr}
                    />
                </Animated.View>
            </GestureDetector>

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
        paddingHorizontal: 40, gap: 4,
    },
    loadingText: { color: '#C9A84C', fontSize: 16, marginTop: 14 },
    emptyIconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(201,168,76,0.10)',
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
    },
    emptyTitle: { color: '#F0EAD6', fontSize: 18, fontWeight: '700', marginBottom: 8 },
    emptySubtitle: {
        color: '#8A99A8', fontSize: 13, textAlign: 'center',
        lineHeight: 19, marginBottom: 8,
    },
    emptyAddBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 16,
        backgroundColor: '#C9A84C',
        paddingHorizontal: 24,
        paddingVertical: 13,
        borderRadius: 12,
    },
    emptyAddBtnText: { color: '#0F1923', fontSize: 14, fontWeight: '700' },
});