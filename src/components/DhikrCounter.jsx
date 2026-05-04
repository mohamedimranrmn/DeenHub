import {
    View, Text, TouchableOpacity, StyleSheet,
    Dimensions, StatusBar, Animated,
} from 'react-native';
import { useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');

const GOLD       = '#C9A84C';
const GOLD_MED   = 'rgba(201,168,76,0.28)';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.15)';
const GREEN      = '#4CAF7D';
const GREEN_BG   = 'rgba(76,175,125,0.12)';
const GREEN_MED  = 'rgba(76,175,125,0.28)';

const CIRCLE_SIZE = Math.min(width * 0.58, 230);

export default function DhikrCounter({
                                         dhikr, count, onIncrement, onReset,
                                         isCompleted, allCompleted, streak,
                                         totalDhikr, currentIndex, onDotPress,
                                         completedFlags, allCounts, onAddDhikr,
                                     }) {
    const insets = useSafeAreaInsets();

    // ── Anim refs ────────────────────────────────────────────
    const tapScale       = useRef(new Animated.Value(1)).current;
    const tapGlow        = useRef(new Animated.Value(0)).current;
    const countBounce    = useRef(new Animated.Value(1)).current;
    const completedScale = useRef(new Animated.Value(0)).current;
    const completedPulse = useRef(new Animated.Value(1)).current;
    const resetShake     = useRef(new Animated.Value(0)).current;
    const streakPop      = useRef(new Animated.Value(0)).current;
    const segmentAnims   = useRef(
        Array.from({ length: totalDhikr || 3 }, () => new Animated.Value(0))
    ).current;

    const prevCount     = useRef(count);
    const prevCompleted = useRef(isCompleted);

    // ── Segment indicator ────────────────────────────────────
    useEffect(() => {
        segmentAnims.forEach((anim, i) => {
            Animated.timing(anim, {
                toValue: completedFlags?.[i] ? 1 : (i === currentIndex ? 0.5 : 0),
                duration: 300,
                useNativeDriver: false,
            }).start();
        });
    }, [currentIndex, completedFlags]);

    // ── Count pop ────────────────────────────────────────────
    useEffect(() => {
        if (count > prevCount.current) {
            Animated.sequence([
                Animated.timing(countBounce, { toValue: 1.2, duration: 75, useNativeDriver: true }),
                Animated.spring(countBounce, { toValue: 1, tension: 230, friction: 6, useNativeDriver: true }),
            ]).start();
            Animated.sequence([
                Animated.timing(tapGlow, { toValue: 1, duration: 55, useNativeDriver: false }),
                Animated.timing(tapGlow, { toValue: 0, duration: 320, useNativeDriver: false }),
            ]).start();
        }
        prevCount.current = count;
    }, [count]);

    // ── Completion ───────────────────────────────────────────
    useEffect(() => {
        if (isCompleted && !prevCompleted.current) {
            Animated.spring(completedScale, {
                toValue: 1, tension: 65, friction: 7, useNativeDriver: true,
            }).start(() => {
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(completedPulse, { toValue: 1.05, duration: 850, useNativeDriver: true }),
                        Animated.timing(completedPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
                    ])
                ).start();
            });
        }
        if (!isCompleted) {
            completedScale.setValue(0);
            completedPulse.setValue(1);
        }
        prevCompleted.current = isCompleted;
    }, [isCompleted]);

    // ── Streak pop ───────────────────────────────────────────
    useEffect(() => {
        if (allCompleted && streak > 0) {
            Animated.spring(streakPop, {
                toValue: 1, tension: 70, friction: 6, useNativeDriver: true,
            }).start();
        } else {
            streakPop.setValue(0);
        }
    }, [allCompleted]);

    const handleTap = () => {
        if (isCompleted) return;
        Animated.sequence([
            Animated.timing(tapScale, { toValue: 0.93, duration: 60, useNativeDriver: true }),
            Animated.spring(tapScale, { toValue: 1, tension: 250, friction: 7, useNativeDriver: true }),
        ]).start();
        onIncrement();
    };

    const handleReset = () => {
        Animated.sequence([
            Animated.timing(resetShake, { toValue: -9, duration: 45, useNativeDriver: true }),
            Animated.timing(resetShake, { toValue: 9, duration: 45, useNativeDriver: true }),
            Animated.timing(resetShake, { toValue: -5, duration: 35, useNativeDriver: true }),
            Animated.timing(resetShake, { toValue: 5, duration: 35, useNativeDriver: true }),
            Animated.timing(resetShake, { toValue: 0, duration: 25, useNativeDriver: true }),
        ]).start();
        onReset();
    };

    const borderColor = tapGlow.interpolate({
        inputRange: [0, 1],
        outputRange: [isCompleted ? GREEN_MED : BORDER, isCompleted ? GREEN_MED : GOLD_MED],
    });

    const target = dhikr?.target || 1;
    const progressRatio = Math.min(count / target, 1);

    const ARC_SIZE  = CIRCLE_SIZE + 28;
    const ARC_TRACK = 6;

    return (
        <View style={[styles.safe, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <View style={styles.container}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.screenLabel}>DHIKR</Text>
                            <Text style={styles.arabicDecor}>ذكر</Text>
                        </View>
                        <Text style={styles.progressLabel}>
                            {(currentIndex ?? 0) + 1} of {totalDhikr}
                        </Text>
                        {/* Add custom dhikr button */}
                        <TouchableOpacity
                            style={styles.addBtn}
                            onPress={onAddDhikr}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="add-circle-outline" size={22} color={GOLD} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Dot nav ── */}
                <View style={styles.dotsRow}>
                    {Array.from({ length: totalDhikr }).map((_, i) => {
                        const isActive = i === currentIndex;
                        const isDone   = completedFlags?.[i];
                        return (
                            <TouchableOpacity
                                key={i}
                                onPress={() => onDotPress?.(i)}
                                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                            >
                                <Animated.View style={[
                                    styles.dot,
                                    isActive && styles.dotActive,
                                    isDone && !isActive && styles.dotDone,
                                ]} />
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* ── Arabic + translation ── */}
                <View style={styles.textBlock}>
                    <View style={{ overflow: 'visible', width: '100%' }}>
                        <Text style={styles.arabic}>
                            {dhikr.arabic}
                        </Text>
                    </View>
                    <Text style={styles.title}>{dhikr.title}</Text>
                    <Text style={styles.translation}>{dhikr.translation}</Text>
                </View>

                {/* ── FULL-WIDTH TAP ZONE wrapping arc + status ── */}
                {/* FIX: The entire zone below the text is tappable on all device sizes.
                    The circle is now purely visual; the TouchableOpacity covers the
                    whole area so tapping anywhere (not just inside the ring) registers. */}
                <TouchableOpacity
                    onPress={handleTap}
                    activeOpacity={isCompleted ? 1 : 0.92}
                    disabled={isCompleted}
                    style={styles.fullTapZone}
                >
                    <Animated.View style={{ transform: [{ translateX: resetShake }] }}>
                        <Animated.View style={{ transform: [{ scale: tapScale }] }}>
                            <View style={[styles.arcOuter, { width: ARC_SIZE, height: ARC_SIZE }]}>

                                {/* Track ring */}
                                <View style={[
                                    styles.arcTrack,
                                    {
                                        width: ARC_SIZE, height: ARC_SIZE,
                                        borderRadius: ARC_SIZE / 2,
                                        borderWidth: ARC_TRACK,
                                    },
                                ]} />

                                {/* Filled arc */}
                                <ProgressRing
                                    size={ARC_SIZE}
                                    strokeWidth={ARC_TRACK}
                                    progress={progressRatio}
                                    color={isCompleted ? GREEN : GOLD}
                                />

                                {/* Visual circle — purely decorative, no TouchableOpacity */}
                                <View
                                    style={[
                                        styles.circleWrap,
                                        {
                                            width: CIRCLE_SIZE,
                                            height: CIRCLE_SIZE,
                                            borderRadius: CIRCLE_SIZE / 2,
                                        },
                                        isCompleted && styles.circleCompleted,
                                    ]}
                                >
                                    <Animated.View style={[
                                        styles.circleBorder,
                                        {
                                            width: CIRCLE_SIZE,
                                            height: CIRCLE_SIZE,
                                            borderRadius: CIRCLE_SIZE / 2,
                                            borderColor,
                                        },
                                    ]} />

                                    {/* Inner decorative ring */}
                                    <View style={[
                                        styles.ring,
                                        {
                                            width: CIRCLE_SIZE - 16,
                                            height: CIRCLE_SIZE - 16,
                                            borderRadius: (CIRCLE_SIZE - 16) / 2,
                                        },
                                        isCompleted && styles.ringCompleted,
                                    ]} />

                                    <View style={styles.circleInner}>
                                        <Animated.Text style={[
                                            styles.count,
                                            isCompleted && styles.countCompleted,
                                            { transform: [{ scale: countBounce }] },
                                        ]}>
                                            {count}
                                        </Animated.Text>
                                        <View style={styles.divLine} />
                                        <Text style={styles.target}>{target}</Text>
                                        {!isCompleted
                                            ? <Text style={styles.tapHint}>TAP</Text>
                                            : <Text style={[styles.tapHint, { color: GREEN, opacity: 1 }]}>✓</Text>
                                        }
                                    </View>
                                </View>

                            </View>
                        </Animated.View>
                    </Animated.View>

                    {/* ── Status (inside tap zone so it adds to hit area) ── */}
                    <View style={styles.statusWrap}>
                        {isCompleted ? (
                            <Animated.View style={[
                                styles.completedBadge,
                                {
                                    opacity: completedScale,
                                    transform: [{ scale: Animated.multiply(completedScale, completedPulse) }],
                                },
                            ]}>
                                <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                                <Text style={styles.completedText}>Completed</Text>
                            </Animated.View>
                        ) : (
                            <Text style={styles.remaining}>
                                {target - count} remaining
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>

                {/* ── Streak ── */}
                {allCompleted && (
                    <Animated.View style={[
                        styles.streakBadge,
                        {
                            opacity: streakPop,
                            transform: [{
                                scale: streakPop.interpolate({
                                    inputRange: [0, 1], outputRange: [0.6, 1],
                                }),
                            }],
                        },
                    ]}>
                        <Text style={styles.streakIcon}>🔥</Text>
                        <Text style={styles.streakText}>{streak} day streak</Text>
                    </Animated.View>
                )}

                {/* ── Swipe hint ── */}
                <View style={styles.swipeHint}>
                    {currentIndex > 0 && (
                        <Ionicons name="chevron-back" size={13} color={MUTED} style={{ opacity: 0.5 }} />
                    )}
                    <Text style={styles.swipeHintText}>swipe to navigate</Text>
                    {currentIndex < totalDhikr - 1 && (
                        <Ionicons name="chevron-forward" size={13} color={MUTED} style={{ opacity: 0.5 }} />
                    )}
                </View>

                {/* ── Reset all ── */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.resetBtn}
                        onPress={handleReset}
                        activeOpacity={0.75}
                    >
                        <Ionicons name="refresh" size={15} color={TEXT_DIM} style={{ marginRight: 6 }} />
                        <Text style={styles.resetText}>Reset All</Text>
                    </TouchableOpacity>
                </View>

            </View>
        </View>
    );
}

function ProgressRing({ size, strokeWidth, progress, color }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: progress,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const strokeDashoffset = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference, 0],
    });

    const AnimatedCircle = Animated.createAnimatedComponent(Circle);

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                width: size,
                height: size,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Svg width={size} height={size}>
                <Circle
                    stroke="rgba(255,255,255,0.05)"
                    fill="none"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
                <AnimatedCircle
                    stroke={color}
                    fill="none"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: DARK },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
    },

    // ── Header ──
    header: { width: '100%', marginBottom: 8 },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: { alignItems: 'flex-start' },
    screenLabel:   { fontSize: 10, color: MUTED, letterSpacing: 3, marginBottom: 2 },
    arabicDecor:   { fontSize: 22, color: GOLD, opacity: 0.7 },
    progressLabel: { fontSize: 11, color: MUTED, letterSpacing: 1 },
    addBtn: {
        padding: 4,
    },

    dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 26 },
    dot: {
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: MUTED, opacity: 0.35,
    },
    dotActive: { backgroundColor: GOLD, opacity: 1, width: 20 },
    dotDone:   { backgroundColor: GREEN, opacity: 0.75 },

    textBlock: {
        alignItems: 'center',
        marginBottom: 28,
        width: '100%',
        paddingHorizontal: 16,
    },
    arabic: {
        fontFamily: 'Uthmanic',
        fontSize: 22,
        color: TEXT,
        textAlign: 'center',
        writingDirection: 'rtl',
        lineHeight: 38,
    },
    title:       { fontSize: 14, color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    translation: { fontSize: 14, color: TEXT_DIM, fontStyle: 'italic', letterSpacing: 0.3 },

    // ── Full-width tap zone ──
    // FIX: replaces the inner TouchableOpacity on the circle. Now the entire
    // area (arc + status text) is one single tap target — works on all device sizes.
    fullTapZone: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 8,
    },

    // Arc ring
    arcOuter: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
    },
    arcTrack: {
        position: 'absolute',
        borderColor: 'rgba(255,255,255,0.05)',
    },

    // Visual circle (no longer a TouchableOpacity)
    circleWrap: {
        backgroundColor: CARD,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 10,
        overflow: 'hidden',
    },
    circleCompleted: {
        shadowColor: GREEN,
        shadowOpacity: 0.22,
    },
    circleBorder: {
        position: 'absolute',
        borderWidth: 2,
    },
    ring: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.18)',
    },
    ringCompleted: { borderColor: 'rgba(76,175,125,0.22)' },

    circleInner: { alignItems: 'center', justifyContent: 'center' },
    count: {
        fontSize: 56, fontWeight: '700', color: TEXT, letterSpacing: -1,
    },
    countCompleted: { color: GREEN },
    divLine: { width: 32, height: 1, backgroundColor: BORDER, marginVertical: 4 },
    target:  { fontSize: 14, color: MUTED, letterSpacing: 0.5 },
    tapHint: { fontSize: 9, color: GOLD, letterSpacing: 3, marginTop: 6, opacity: 0.7 },

    statusWrap: { height: 38, justifyContent: 'center', marginBottom: 6 },
    completedBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: GREEN_BG,
        paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, gap: 7,
        borderWidth: 1, borderColor: 'rgba(76,175,125,0.2)',
    },
    completedText: { color: GREEN, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
    remaining:     { color: MUTED, fontSize: 13, letterSpacing: 0.5 },

    streakBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: GOLD_LIGHT,
        paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: 16, gap: 6, marginBottom: 10,
        borderWidth: 1, borderColor: BORDER,
    },
    streakIcon: { fontSize: 14 },
    streakText: { color: GOLD, fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },

    swipeHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 14,
    },
    swipeHintText: {
        color: MUTED,
        fontSize: 11,
        letterSpacing: 0.8,
        opacity: 0.5,
    },

    actions: { width: '100%' },
    resetBtn: {
        paddingVertical: 14, borderRadius: 12,
        borderWidth: 1, borderColor: BORDER,
        flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    resetText: { color: TEXT_DIM, fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },
});