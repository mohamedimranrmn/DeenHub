import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, StatusBar, Animated, Dimensions,
    AppState, Linking, Modal,
} from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../src/services/supabase';
import { getDeviceId } from '../src/utils/device';
import { getPrayerActiveDates } from '../src/services/prayerLogs';
import { todayLocalStr, toLocalDateStr, computeCurrentStreak, computeLongestStreak } from '../src/utils/streaks';
import {
    getCachedLocation,
    detectLocation,
    initializeLocation,
    getCoordsFromCity,
    openLocationSettings,
} from '../src/utils/location';
import { calculateQiblaBearing } from '../src/utils/qibla';
import {
    fetchTimesFromAPI,
    TIMES_CACHE_KEY,
    refreshPrayerNotifications,
} from '../src/utils/prayerTimes';
// Local (on-device, non-push) notifications work fine in Expo Go — only
// remote push is blocked there from SDK 53. Prayer reminders are scheduled
// locally from client-side location + prayer-time data, so no gating needed.
// All notification scheduling/permission/channel logic now lives centrally
// in src/utils/notifications.js — see that file rather than duplicating
// this logic here. fetchTimesFromAPI/TIMES_CACHE_KEY now live in
// src/utils/prayerTimes.js so Settings can trigger the same pipeline
// without this screen needing to be mounted.


const { width, height } = Dimensions.get('window');
const IS_TALL = height > 800;

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
    bg:         '#080E17',
    surface:    '#0D1824',
    surfaceAlt: '#111F2E',
    surfaceUp:  '#162538',
    border:     'rgba(255,255,255,0.06)',
    borderGold: 'rgba(201,168,76,0.18)',
    borderBlue: 'rgba(99,160,220,0.22)',
    borderGreen:'rgba(72,187,120,0.22)',

    gold:       '#C9A84C',
    goldDim:    'rgba(201,168,76,0.40)',
    goldSubtle: 'rgba(201,168,76,0.08)',
    goldMed:    'rgba(201,168,76,0.15)',

    blue:       '#63A0DC',
    blueDim:    'rgba(99,160,220,0.40)',
    blueSubtle: 'rgba(99,160,220,0.07)',
    blueMed:    'rgba(99,160,220,0.15)',

    green:      '#48BB78',
    greenDim:   'rgba(72,187,120,0.40)',
    greenSubtle:'rgba(72,187,120,0.07)',
    greenMed:   'rgba(72,187,120,0.15)',

    red:        '#F56565',
    redSubtle:  'rgba(245,101,101,0.08)',
    redMed:     'rgba(245,101,101,0.20)',

    text:       '#EEE8D5',
    textDim:    '#B8A98A',
    muted:      '#4A6070',
    mutedMid:   '#6B8090',
};

const PRAYERS = [
    { key: 'fajr',    label: 'Fajr',    arabic: 'الفَجْر',   period: 'Dawn',      rakat: '2' },
    { key: 'dhuhr',   label: 'Dhuhr',   arabic: 'الظُّهْر',  period: 'Midday',    rakat: '4' },
    { key: 'asr',     label: 'Asr',     arabic: 'العَصْر',   period: 'Afternoon', rakat: '4' },
    { key: 'maghrib', label: 'Maghrib', arabic: 'المَغْرِب', period: 'Sunset',    rakat: '3' },
    { key: 'isha',    label: 'Isha',    arabic: 'العِشَاء',  period: 'Night',     rakat: '4' },
];

function getTodayStr() {
    return todayLocalStr();
}

function getGregorianDate() {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date());
}

function getHijriDate() {
    try {
        return new Intl.DateTimeFormat('en-u-ca-islamic', {
            day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date());
    } catch { return null; }
}

function parseTimeToday(timeStr) {
    if (!timeStr) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
}

function formatTime12(timeStr) {
    if (!timeStr) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function countdownTo(timeStr) {
    if (!timeStr) return '';
    const target = parseTimeToday(timeStr);
    if (!target) return '';
    const diff = target - new Date();
    if (diff <= 0) return 'passed';
    const totalMins = Math.floor(diff / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

function isPrayerPassed(timeStr) {
    if (!timeStr) return false;
    const t = parseTimeToday(timeStr);
    return t && t < new Date();
}

function getNextPrayer(prayerTimes) {
    const now = new Date();
    for (const prayer of PRAYERS) {
        const t = parseTimeToday(prayerTimes[prayer.key]);
        if (t && t > now) return prayer;
    }
    return PRAYERS[0];
}

function dayLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
}

// TIMES_CACHE_KEY and fetchTimesFromAPI now live in src/utils/prayerTimes.js
// (imported above) so Settings can drive the same caching pipeline.

// ── Angle helpers ─────────────────────────────────────────────────────────────
function normAngle(a) { return ((a % 360) + 360) % 360; }

// ── Mini compass geometry ─────────────────────────────────────────────────────
const MINI_SIZE    = 96;
const MINI_CENTER  = MINI_SIZE / 2;
const MINI_CARDS   = ['N', 'E', 'S', 'W'];
const MINI_TICKS   = 24; // every 15°

function buildMiniTick(i) {
    const angle  = (i / MINI_TICKS) * 360;
    const isCard = angle % 90 === 0;
    const len    = isCard ? 8 : 4;
    const r      = MINI_SIZE / 2 - 2;
    const rad    = (angle * Math.PI) / 180;
    return {
        angle,
        isCard,
        height: len,
        width:  isCard ? 1 : 0.7,
        left:   MINI_CENTER + r * Math.sin(rad),
        top:    MINI_CENTER - r * Math.cos(rad),
    };
}
const MINI_TICK_DATA = Array.from({ length: MINI_TICKS }, (_, i) => buildMiniTick(i));

// ── Qibla Card Component ──────────────────────────────────────────────────────
// Preview card — shows bearing + animated arrow. Full compass at /app/qibla.jsx
function QiblaCard({ latitude, longitude }) {
    const [direction, setDirection] = useState(null);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState(false);

    const fadeAnim    = useRef(new Animated.Value(0)).current;
    const arrowAnim   = useRef(new Animated.Value(0)).current;
    const pulseAnim   = useRef(new Animated.Value(1)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    // Shimmer loop while loading
    useEffect(() => {
        if (!loading) { shimmerAnim.setValue(0); return; }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(shimmerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(shimmerAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [loading]);

    useEffect(() => {
        if (typeof latitude === 'number' && typeof longitude === 'number') {
            fetchQibla();
        }
    }, [latitude, longitude]);

    const fetchQibla = async () => {
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            setError(true);
            return;
        }

        setLoading(true);
        setError(false);

        try {
            // Qibla bearing is deterministic from the user's coordinates.
            // No network/API request is needed.
            const bearing = calculateQiblaBearing(latitude, longitude);
            if (!Number.isFinite(bearing)) throw new Error('Invalid Qibla bearing');

            setDirection(Math.round(bearing));

            Animated.spring(arrowAnim, {
                toValue: bearing,
                tension: 55,
                friction: 9,
                useNativeDriver: true,
            }).start();

            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();

            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.25,
                    duration: 220,
                    useNativeDriver: true,
                }),
                Animated.spring(pulseAnim, {
                    toValue: 1,
                    tension: 180,
                    friction: 6,
                    useNativeDriver: true,
                }),
            ]).start();
        } catch (e) {
            console.error('[Qibla] Local calculation failed:', e.message);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const arrowRotate = arrowAnim.interpolate({
        inputRange: [0, 360], outputRange: ['0deg', '360deg'],
    });
    const shimmerOpacity = shimmerAnim.interpolate({
        inputRange: [0, 1], outputRange: [0.25, 0.65],
    });

    const dirLabel = direction !== null
        ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(direction / 45) % 8]
        : null;

    return (
        <View style={qS.card}>

            {/* Header */}
            <View style={qS.header}>
                <View style={qS.headerLeft}>
                    <Text style={qS.eyebrow}>QIBLA DIRECTION</Text>
                    {direction !== null && (
                        <Animated.Text style={[qS.dirLabel, { opacity: fadeAnim }]}>
                            toward Mecca · {dirLabel}
                        </Animated.Text>
                    )}
                </View>
                <View style={qS.headerIcon}>
                    <Ionicons name="compass-outline" size={15} color={C.gold} />
                </View>
            </View>

            {/* Body */}
            <View style={qS.body}>

                {/* Mini compass disc */}
                <View style={qS.discOuter}>
                    <View style={qS.discGlow} />
                    <View style={qS.disc}>

                        {/* Tick marks */}
                        {MINI_TICK_DATA.map((tk, i) => (
                            <View key={i} style={{
                                position: 'absolute',
                                left:   tk.left,
                                top:    tk.top,
                                width:  tk.width,
                                height: tk.height,
                                backgroundColor: tk.isCard ? C.gold : C.muted,
                                opacity: tk.isCard ? 0.6 : 0.15,
                                transform: [{ rotate: `${tk.angle}deg` }],
                                transformOrigin: 'center top',
                            }} />
                        ))}

                        {/* N E S W labels */}
                        {MINI_CARDS.map((lbl, i) => {
                            const angle = i * 90;
                            const r   = MINI_CENTER - 14;
                            const rad = (angle * Math.PI) / 180;
                            const x   = MINI_CENTER + r * Math.sin(rad);
                            const y   = MINI_CENTER - r * Math.cos(rad);
                            return (
                                <Text key={lbl} style={{
                                    position: 'absolute',
                                    left: x - 6, top: y - 6,
                                    width: 12, textAlign: 'center',
                                    fontSize: lbl === 'N' ? 9 : 8,
                                    fontWeight: '700',
                                    color: lbl === 'N' ? C.gold : C.muted,
                                    opacity: lbl === 'N' ? 0.9 : 0.4,
                                }}>
                                    {lbl}
                                </Text>
                            );
                        })}

                        {/* Qibla arrow */}
                        {direction !== null && (
                            <Animated.View style={[qS.arrowWrap, { transform: [{ rotate: arrowRotate }] }]}>
                                <View style={qS.arrowHeadGold} />
                                <View style={qS.arrowShaftGold} />
                                <View style={qS.arrowShaftMuted} />
                                <View style={qS.arrowHeadMuted} />
                            </Animated.View>
                        )}

                        {/* Loading shimmer arrow */}
                        {loading && (
                            <Animated.View style={[qS.arrowWrap, { opacity: shimmerOpacity }]}>
                                <View style={[qS.arrowHeadGold, { borderBottomColor: C.muted }]} />
                                <View style={[qS.arrowShaftGold, { backgroundColor: C.muted }]} />
                                <View style={qS.arrowShaftMuted} />
                                <View style={qS.arrowHeadMuted} />
                            </Animated.View>
                        )}

                        {/* Center hub */}
                        <Animated.View style={[
                            qS.hub,
                            direction !== null && { transform: [{ scale: pulseAnim }] },
                            error && { borderColor: C.muted, backgroundColor: 'transparent' },
                        ]}>
                            {loading
                                ? <Animated.View style={[qS.hubDot, { opacity: shimmerOpacity }]} />
                                : error
                                    ? <Ionicons name="location-outline" size={11} color={C.muted} />
                                    : <Text style={qS.kaabaEmoji}>🕋</Text>
                            }
                        </Animated.View>

                        {/* Top notch */}
                        <View style={qS.topNotch} />
                    </View>
                </View>

                {/* Right info panel */}
                <View style={qS.info}>
                    {direction !== null ? (
                        <Animated.View style={{ opacity: fadeAnim }}>
                            <View style={qS.degreeRow}>
                                <Text style={qS.degreeNum}>{direction}</Text>
                                <Text style={qS.degreeSuffix}>°</Text>
                            </View>
                            <Text style={qS.fromNorth}>from True North</Text>
                        </Animated.View>
                    ) : error ? (
                        <Text style={qS.errorText}>Location{'\n'}unavailable</Text>
                    ) : (
                        <Animated.View style={{ opacity: shimmerOpacity }}>
                            <View style={qS.skeletonNum} />
                            <View style={qS.skeletonLabel} />
                        </Animated.View>
                    )}

                    <TouchableOpacity
                        style={[qS.btn, error && { borderColor: C.muted, backgroundColor: 'transparent' }]}
                        onPress={error ? fetchQibla : () => router.push('/qibla')}
                        activeOpacity={0.75}
                    >
                        <Ionicons
                            name={error ? 'refresh-outline' : 'navigate-outline'}
                            size={11}
                            color={error ? C.muted : C.gold}
                        />
                        <Text style={[qS.btnText, error && { color: C.muted }]}>
                            {error ? 'Retry' : 'Open Compass'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Footer hint */}
            {direction !== null && (
                <Animated.View style={[qS.footer, { opacity: fadeAnim }]}>
                    <View style={qS.footerDivider} />
                    <View style={qS.footerRow}>
                        <Ionicons name="phone-portrait-outline" size={10} color={C.muted} />
                        <Text style={qS.footerHint}>
                            Open full compass to point your phone toward Mecca
                        </Text>
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

// ── Qibla card stylesheet (separate object — no changes to main styles) ────────
const MINI_SIZE_STYLES = 96;
const qS = StyleSheet.create({
    card: {
        backgroundColor: C.surface,
        borderRadius: 16, borderWidth: 1, borderColor: C.borderGold,
        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 0,
        marginBottom: 8, overflow: 'hidden',
        shadowColor: C.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    },
    header: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 14,
    },
    headerLeft:  { flex: 1 },
    eyebrow:     { fontSize: 9, color: C.gold, letterSpacing: 2.8, fontWeight: '700', opacity: 0.7, marginBottom: 3 },
    dirLabel:    { fontSize: 11, color: C.textDim, letterSpacing: 0.2 },
    headerIcon:  {
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: C.goldSubtle, borderWidth: 1, borderColor: C.borderGold,
        alignItems: 'center', justifyContent: 'center',
    },
    body:        { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 14 },
    discOuter:   { width: MINI_SIZE_STYLES, height: MINI_SIZE_STYLES, alignItems: 'center', justifyContent: 'center' },
    discGlow:    {
        position: 'absolute',
        width: MINI_SIZE_STYLES + 16, height: MINI_SIZE_STYLES + 16,
        borderRadius: (MINI_SIZE_STYLES + 16) / 2,
        backgroundColor: 'rgba(201,168,76,0.04)',
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.07)',
    },
    disc: {
        width: MINI_SIZE_STYLES, height: MINI_SIZE_STYLES, borderRadius: MINI_SIZE_STYLES / 2,
        backgroundColor: C.surfaceAlt,
        borderWidth: 1.5, borderColor: C.borderGold,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    arrowWrap: {
        position: 'absolute',
        width: 14, height: MINI_SIZE_STYLES * 0.74,
        alignItems: 'center',
    },
    arrowHeadGold: {
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 11,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: C.gold,
    },
    arrowShaftGold:  { width: 2.5, flex: 1, maxHeight: 24, backgroundColor: C.gold, opacity: 0.85, borderRadius: 1.5 },
    arrowShaftMuted: { width: 2,   flex: 1, maxHeight: 20, backgroundColor: C.muted, opacity: 0.35, borderRadius: 1 },
    arrowHeadMuted: {
        width: 0, height: 0,
        borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: C.muted, opacity: 0.3,
    },
    hub: {
        position: 'absolute',
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: 'rgba(201,168,76,0.10)',
        borderWidth: 1.5, borderColor: C.goldDim,
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    hubDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted },
    kaabaEmoji:  { fontSize: 12 },
    topNotch:    { position: 'absolute', top: 0, width: 2, height: 7, backgroundColor: C.gold, borderRadius: 1, opacity: 0.8 },
    info:        { flex: 1, justifyContent: 'center', gap: 2 },
    degreeRow:   { flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 },
    degreeNum:   { fontSize: 38, fontWeight: '800', color: C.text, lineHeight: 42, letterSpacing: -1 },
    degreeSuffix:{ fontSize: 20, fontWeight: '700', color: C.textDim, marginLeft: 1, lineHeight: 42 },
    fromNorth:   { fontSize: 11, color: C.muted, letterSpacing: 0.3, marginBottom: 14 },
    errorText:   { fontSize: 12, color: C.muted, lineHeight: 18, marginBottom: 14 },
    skeletonNum: { width: 80, height: 36, backgroundColor: C.surfaceUp, borderRadius: 6, marginBottom: 6 },
    skeletonLabel:{ width: 56, height: 10, backgroundColor: C.surfaceUp, borderRadius: 4, marginBottom: 14 },
    btn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: C.goldSubtle, borderRadius: 8,
        borderWidth: 1, borderColor: C.borderGold,
        paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start',
    },
    btnText:      { fontSize: 11, color: C.gold, fontWeight: '600', letterSpacing: 0.3 },
    footer:       { paddingBottom: 12 },
    footerDivider:{ height: 1, backgroundColor: C.border, marginBottom: 10 },
    footerRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerHint:   { fontSize: 10, color: C.muted, letterSpacing: 0.2, lineHeight: 14, flex: 1 },
});

// ── Prayer row ────────────────────────────────────────────────────────────────
function PrayerRow({ prayer, done, missed, onToggle, prayerTime, isNext }) {
    const scale     = useRef(new Animated.Value(1)).current;
    const checkAnim = useRef(new Animated.Value(done ? 1 : 0)).current;
    const pulse     = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(checkAnim, {
            toValue: done ? 1 : 0,
            tension: 140, friction: 8, useNativeDriver: true,
        }).start();
    }, [done]);

    useEffect(() => {
        if (!isNext || done) { pulse.setValue(0); return; }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: false }),
            Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: false }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [isNext, done]);

    const handlePress = async () => {
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, tension: 220, friction: 6, useNativeDriver: true }),
        ]).start();
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle(prayer.key);
    };

    const rowBg = done
        ? C.surfaceAlt
        : isNext
            ? pulse.interpolate({ inputRange: [0,1], outputRange: [C.surface, C.surfaceAlt] })
            : C.surface;

    const borderCol = done
        ? C.borderGreen
        : missed
            ? C.redMed
            : isNext
                ? pulse.interpolate({ inputRange: [0,1], outputRange: [C.borderBlue, 'rgba(99,160,220,0.35)'] })
                : C.border;

    const labelColor = done ? C.green : missed ? C.red : isNext ? C.blue : C.text;
    const timeColor  = done ? C.greenDim : missed ? 'rgba(245,101,101,0.60)' : isNext ? C.blue : C.textDim;

    return (
        <Animated.View style={{ transform: [{ scale }], marginBottom: 8 }}>
            <TouchableOpacity onPress={handlePress} activeOpacity={0.88}>
                <Animated.View style={[styles.prayerRow, { backgroundColor: rowBg, borderColor: borderCol }]}>
                    <View style={[
                        styles.prayerAccentBar,
                        done   ? { backgroundColor: C.green }
                            : missed ? { backgroundColor: C.red }
                                : isNext ? { backgroundColor: C.blue }
                                    : { backgroundColor: 'transparent' }
                    ]} />
                    <View style={styles.arabicWrap}>
                        <Text style={[styles.prayerArabic, { opacity: done ? 0.9 : missed ? 0.5 : isNext ? 0.85 : 0.35 }]}>
                            {prayer.arabic}
                        </Text>
                    </View>
                    <View style={styles.prayerMid}>
                        <Text style={[styles.prayerLabel, { color: labelColor }]}>
                            {prayer.label}
                        </Text>
                        <View style={styles.prayerMetaRow}>
                            {prayerTime ? (
                                <Text style={[styles.prayerTimeText, { color: timeColor }]}>
                                    {formatTime12(prayerTime)}
                                </Text>
                            ) : (
                                <Text style={styles.prayerPeriod}>{prayer.period}</Text>
                            )}
                            {isNext && !done && prayerTime && (
                                <>
                                    <View style={styles.metaDot} />
                                    <Text style={styles.countdownText}>{countdownTo(prayerTime)}</Text>
                                </>
                            )}
                            {missed && !done && (
                                <>
                                    <View style={[styles.metaDot, { backgroundColor: C.red, opacity: 0.5 }]} />
                                    <Text style={styles.missedText}>Missed</Text>
                                </>
                            )}
                        </View>
                    </View>
                    <View style={styles.prayerRight}>
                        <View style={styles.rakatPill}>
                            <Text style={styles.rakatNum}>{prayer.rakat}</Text>
                            <Text style={styles.rakatSuffix}>rak</Text>
                        </View>
                        <Animated.View style={[
                            styles.checkOuter,
                            done   && styles.checkOuterDone,
                            missed && !done && styles.checkOuterMissed,
                            isNext && !done && !missed && styles.checkOuterNext,
                            {
                                transform: [{
                                    scale: checkAnim.interpolate({
                                        inputRange: [0, 0.5, 1],
                                        outputRange: [1, 1.15, 1],
                                    })
                                }]
                            }
                        ]}>
                            {done
                                ? <View style={styles.checkInnerDone} />
                                : missed
                                    ? <View style={styles.checkInnerMissed} />
                                    : <View style={styles.checkInnerEmpty} />
                            }
                        </Animated.View>
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ── Week bar column ───────────────────────────────────────────────────────────
function WeekBar({ day, isToday }) {
    const pct = day.count / 5;
    const fillAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fillAnim, {
            toValue: Math.max(pct, 0.04),
            duration: 600,
            useNativeDriver: false,
        }).start();
    }, [pct]);

    const fillColor = day.count === 5 ? C.green : day.count >= 3 ? C.gold : C.muted;

    return (
        <View style={styles.weekCol}>
            <View style={styles.weekBarTrack}>
                <Animated.View style={[
                    styles.weekBarFill,
                    {
                        height: fillAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }),
                        backgroundColor: fillColor,
                        opacity: isToday ? 1 : 0.6,
                    }
                ]} />
            </View>
            <Text style={[styles.weekCountText, { color: day.count > 0 ? C.textDim : C.muted }]}>
                {day.count > 0 ? day.count : '·'}
            </Text>
            <Text style={[styles.weekDayText, isToday && { color: C.gold, fontWeight: '700' }]}>
                {dayLabel(day.date)}
            </Text>
            {isToday && <View style={styles.weekTodayLine} />}
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PrayerTracker() {
    const insets = useSafeAreaInsets();
    const today  = getTodayStr();

    const [log, setLog]             = useState({});
    const [streak, setStreak]       = useState({ current: 0, longest: 0 });
    const [weekData, setWeekData]   = useState([]);
    const [saving, setSaving]       = useState(false);
    const [error, setError]         = useState(null);

    const [prayerTimes, setPrayerTimes]     = useState({});
    const [timesLoading, setTimesLoading]   = useState(false);
    const [timesError, setTimesError]       = useState(null);
    const [locationLabel, setLocationLabel]       = useState(null);
    const [coords, setCoords]                     = useState(null);
    const [locationRefreshing, setLocationRefreshing] = useState(false);
    const [needsLocationPermission, setNeedsLocationPermission] = useState(false);
    const [needsLocationServicesEnabled, setNeedsLocationServicesEnabled] = useState(false);
    const [locationModalVisible, setLocationModalVisible] = useState(false);
    const [nextPrayer, setNextPrayer]       = useState(null);
    const [tick, setTick]                   = useState(0);

    const completedCount = PRAYERS.filter(p => log[p.key]).length;
    const allDone        = completedCount === PRAYERS.length;

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (Object.keys(prayerTimes).length > 0) {
            setNextPrayer(getNextPrayer(prayerTimes));
        }
    }, [prayerTimes, tick]);

    // Safe to keep: after the fetchPrayerTimes rewrite below, this never calls
    // GPS again — it only re-reads the cached location and refreshes today's
    // times (e.g. so the screen updates itself around midnight).
    useEffect(() => {
        const sub = AppState.addEventListener('change', async (state) => {
            if (state === 'active') {
                await fetchPrayerTimes(false);
            }
        });
        return () => sub.remove();
    }, []);

    // Deliberate startup check: surface a "location is required" prompt as
    // soon as the screen mounts, rather than waiting for the prayer-times
    // fetch below to fail first. initializeLocation() is cache-first, so on
    // every visit after the first this just returns the cached location
    // immediately and never opens the modal.
    useEffect(() => {
        let cancelled = false;

        const initializeAppLocation = async () => {
            try {
                await initializeLocation();
                if (!cancelled) setLocationModalVisible(false);
            } catch (e) {
                if (cancelled) return;
                console.log('[Prayer] startup location check:', e?.message);
                if (e?.message === 'LOCATION_SERVICES_DISABLED') {
                    setNeedsLocationServicesEnabled(true);
                    setLocationModalVisible(true);
                } else if (e?.message === 'LOCATION_PERMISSION_DENIED') {
                    setNeedsLocationPermission(true);
                    setLocationModalVisible(true);
                }
            }
        };

        initializeAppLocation();
        return () => { cancelled = true; };
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    const loadAll = () =>
        Promise.all([loadLog(), loadStreak(), loadWeek(), fetchPrayerTimes(true)]);

    /**
     * showLoading          — show the header "Detecting location…" / spinner state.
     * forceLocationRefresh — true only for the explicit Auto-detect / Refresh
     *                        button. Every other caller (focus, AppState,
     *                        settings change) leaves this false, so location
     *                        is read from cache and GPS is never touched.
     *                        Notification scheduling is only triggered by an
     *                        explicit location refresh.
     */
    const fetchPrayerTimes = async (showLoading = true, forceLocationRefresh = false) => {
        if (showLoading) setTimesLoading(true);
        if (forceLocationRefresh) setLocationRefreshing(true);
        setTimesError(null);
        setNeedsLocationPermission(false);
        setNeedsLocationServicesEnabled(false);

        try {
            const device_id = await getDeviceId();
            const { data: settings } = await supabase
                .from('user_settings')
                .select('calculation_method, madhab, reminder_enabled, notification_offset, manual_city')
                .eq('device_id', device_id)
                .maybeSingle();

            const madhabSetting = settings?.madhab ?? 'Shafi';
            const methodId      = settings?.calculation_method ?? 'MWL';

            // ── Resolve location ──────────────────────────────────────────
            let location = null;

            // A manually-selected city wins unless the user explicitly asked
            // to auto-detect — we never silently override a manual choice.
            if (settings?.manual_city && !forceLocationRefresh) {
                const manual = await getCoordsFromCity(settings.manual_city);
                if (manual) {
                    location = { latitude: manual.latitude, longitude: manual.longitude, city: settings.manual_city, source: 'manual' };
                }
            }

            if (!location) {
                location = forceLocationRefresh
                    ? await detectLocation()      // explicit refresh — GPS every time
                    : await initializeLocation();  // cache-first — GPS only if nothing saved yet
            }

            setCoords({ latitude: location.latitude, longitude: location.longitude });
            setLocationLabel(location.city ?? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`);

            // ── Fetch times from UmmahAPI (cached same-day same-place) ───────
            const result = await fetchTimesFromAPI(location.latitude, location.longitude, methodId, madhabSetting);

            setPrayerTimes(result);

            // Prayer Tracker only schedules reminders after an explicit
            // location refresh. Normal screen focus/AppState refreshes are
            // display-only and therefore cannot cancel a valid schedule.
            if (forceLocationRefresh && settings?.reminder_enabled === true) {
                await refreshPrayerNotifications(settings);
            }

        } catch (e) {
            console.log('[Prayer] fetchPrayerTimes error:', e.message);

            if (e.message === 'LOCATION_PERMISSION_DENIED') {
                setNeedsLocationPermission(true);
                setLocationModalVisible(true);
                setTimesError('Location permission is needed for accurate prayer times and Qibla.');
                return;
            }
            if (e.message === 'LOCATION_SERVICES_DISABLED') {
                setNeedsLocationServicesEnabled(true);
                setLocationModalVisible(true);
                setTimesError('Location services are turned off. Enable them to detect your location.');
                return;
            }

            // Try to show cached times if available so the screen isn't blank
            try {
                const cached = await AsyncStorage.getItem(TIMES_CACHE_KEY);
                if (cached) {
                    const { times } = JSON.parse(cached);
                    if (times?.fajr) {
                        setPrayerTimes(times);
                        setTimesError('Showing cached times. Location unavailable.');
                        return;
                    }
                }
            } catch {}

            console.error('[Prayer] Unexpected prayer-time error:', e);
            setTimesError(
                e?.message?.includes('UmmahAPI') || e?.message?.includes('HTTP')
                    ? 'Unable to fetch prayer times. Please check your internet connection.'
                    : 'Unable to load prayer times. Please try again.'
            );
        } finally {
            setTimesLoading(false);
            setLocationRefreshing(false);
        }
    };

    const loadLog = async () => {
        try {
            const device_id = await getDeviceId();
            const { data } = await supabase
                .from('prayer_logs')
                .select('*')
                .eq('device_id', device_id)
                .eq('date', today)
                .maybeSingle();

            if (data) {
                const { fajr, dhuhr, asr, maghrib, isha } = data;
                setLog({ fajr, dhuhr, asr, maghrib, isha });
            } else {
                setLog({});
            }
        } catch (e) { console.error('loadLog:', e.message); }
    };

    const loadStreak = async () => {
        try {
            const activeDates = await getPrayerActiveDates();
            setStreak({
                current: computeCurrentStreak(activeDates),
                longest: computeLongestStreak(activeDates),
            });
        } catch (e) { console.error('loadStreak:', e.message); }
    };

    const loadWeek = async () => {
        try {
            const device_id = await getDeviceId();
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                days.push(toLocalDateStr(d));
            }
            const { data } = await supabase
                .from('prayer_logs')
                .select('date, fajr, dhuhr, asr, maghrib, isha')
                .eq('device_id', device_id)
                .in('date', days);

            const mapped = days.map(date => {
                const row = data?.find(r => r.date === date);
                const count = row ? PRAYERS.filter(p => row[p.key]).length : 0;
                return { date, count, isToday: date === today };
            });
            setWeekData(mapped);
        } catch (e) { console.error('loadWeek:', e.message); }
    };

    const togglePrayer = async (key) => {
        if (saving) return;
        setSaving(true);
        setError(null);
        const prevLog = log;
        const newLog  = { ...log, [key]: !log[key] };
        setLog(newLog);

        try {
            const device_id = await getDeviceId();
            const payload = { device_id, date: today, ...newLog };

            const { error: upsertErr } = await supabase
                .from('prayer_logs')
                .upsert(payload, { onConflict: 'device_id,date' });
            if (upsertErr) throw upsertErr;

            // Streak is derived live from prayer_logs, not hand-incremented —
            // this also means unchecking a prayer correctly lowers the streak
            // again instead of it only ever being able to go up.
            await Promise.all([loadStreak(), loadWeek()]);
        } catch (e) {
            console.error('togglePrayer:', e.message);
            setLog(prevLog);
            setError('Failed to save. Check connection.');
        } finally {
            setSaving(false);
        }
    };

    const hijriDate = getHijriDate();
    const gregDate  = getGregorianDate();
    const nextPrayerTimeStr = nextPrayer ? prayerTimes[nextPrayer.key] : null;
    const nextCountdown     = nextPrayerTimeStr ? countdownTo(nextPrayerTimeStr) : null;
    const perfectDays = weekData.filter(d => d.count === 5).length;

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />

            {/* ── STICKY NEXT PRAYER BANNER ─────────────── */}
            {nextPrayer && nextPrayerTimeStr && !allDone && (
                <View style={styles.stickyBanner}>
                    <View style={styles.stickyLeft}>
                        <View style={styles.stickyPulse} />
                        <View>
                            <Text style={styles.stickyLabel}>NEXT PRAYER</Text>
                            <Text style={styles.stickyName}>{nextPrayer.label}</Text>
                        </View>
                    </View>
                    <View style={styles.stickyRight}>
                        <Text style={styles.stickyTime}>{formatTime12(nextPrayerTimeStr)}</Text>
                        {nextCountdown !== 'passed' && (
                            <Text style={styles.stickyCountdown}>in {nextCountdown}</Text>
                        )}
                    </View>
                </View>
            )}

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* ── HEADER ──────────────────────────────── */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.headerEyebrow}>SALAH TRACKER</Text>
                        {hijriDate && <Text style={styles.hijri}>{hijriDate}</Text>}
                        <Text style={styles.greg}>{gregDate}</Text>
                        {locationLabel && !locationRefreshing && (
                            <View style={styles.locationRow}>
                                <View style={styles.locationDot} />
                                <Text style={styles.locationText}>{locationLabel}</Text>
                            </View>
                        )}
                        {(timesLoading || locationRefreshing) && (
                            <View style={styles.locationRow}>
                                <View style={[styles.locationDot, { backgroundColor: C.gold }]} />
                                <Text style={[styles.locationText, { color: C.gold }]}>
                                    {locationRefreshing ? 'Detecting location…' : 'Loading…'}
                                </Text>
                            </View>
                        )}

                        {/* Explicit location control — location is otherwise read once
                            from cache and never re-requested on its own. */}
                        <View style={styles.locationActions}>
                            <TouchableOpacity
                                style={styles.locationButton}
                                onPress={() => fetchPrayerTimes(true, true)}
                                disabled={locationRefreshing}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="locate-outline" size={12} color={C.gold} />
                                <Text style={styles.locationButtonText}>
                                    {locationRefreshing ? 'Updating…' : 'Auto-detect / Refresh'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Progress circle */}
                    <View style={styles.progressWrap}>
                        <View style={styles.progressCircle}>
                            <Text style={styles.progressNum}>{completedCount}</Text>
                            <Text style={styles.progressDenom}>/ 5</Text>
                        </View>
                        <View style={styles.progressDots}>
                            {PRAYERS.map(p => (
                                <View
                                    key={p.key}
                                    style={[
                                        styles.progressDot,
                                        log[p.key] && styles.progressDotDone,
                                    ]}
                                />
                            ))}
                        </View>
                        <Text style={styles.progressCaption}>
                            {allDone ? 'Complete' : `${5 - completedCount} left`}
                        </Text>
                    </View>
                </View>

                {/* ── ERROR BANNERS ─────────────────────────── */}
                {timesError && (
                    <View style={[styles.alertBanner, { borderColor: C.redMed, backgroundColor: C.redSubtle, flexDirection: 'column', alignItems: 'stretch' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={[styles.alertAccent, { backgroundColor: C.red }]} />
                            <Text style={[styles.alertText, { color: C.red }]}>{timesError}</Text>
                        </View>
                        {needsLocationPermission ? (
                            <TouchableOpacity
                                style={[styles.locationButton, { marginTop: 8, alignSelf: 'flex-start', marginLeft: 15 }]}
                                onPress={() => Linking.openSettings()}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="settings-outline" size={12} color={C.gold} />
                                <Text style={styles.locationButtonText}>Open Settings</Text>
                            </TouchableOpacity>
                        ) : needsLocationServicesEnabled ? (
                            <TouchableOpacity
                                style={[styles.locationButton, { marginTop: 8, alignSelf: 'flex-start', marginLeft: 15 }]}
                                onPress={async () => {
                                    await openLocationSettings();
                                    fetchPrayerTimes(true, true);
                                }}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="navigate-outline" size={12} color={C.gold} />
                                <Text style={styles.locationButtonText}>Turn On Location</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.locationButton, { marginTop: 8, alignSelf: 'flex-start', marginLeft: 15 }]}
                                onPress={() => fetchPrayerTimes(true, true)}
                                activeOpacity={0.75}
                            >
                                <Ionicons name="refresh-outline" size={12} color={C.gold} />
                                <Text style={styles.locationButtonText}>Retry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                {error && (
                    <View style={[styles.alertBanner, { borderColor: C.redMed, backgroundColor: C.redSubtle }]}>
                        <View style={[styles.alertAccent, { backgroundColor: C.red }]} />
                        <Text style={[styles.alertText, { color: C.red }]}>{error}</Text>
                    </View>
                )}

                {/* ── ALL DONE BANNER ──────────────────────── */}
                {allDone && (
                    <View style={styles.allDoneCard}>
                        <View style={styles.allDoneTop}>
                            <Text style={styles.allDoneArabic}>الحَمْدُ لِلَّه</Text>
                            <Text style={styles.allDoneTitle}>All prayers complete</Text>
                        </View>
                        {streak.current > 0 && (
                            <View style={styles.allDoneStreak}>
                                <Text style={styles.allDoneStreakNum}>{streak.current}</Text>
                                <Text style={styles.allDoneStreakLabel}>day streak</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* ── PRAYER ROWS ───────────────────────────── */}
                <Text style={styles.sectionLabel}>TODAY'S PRAYERS</Text>
                {PRAYERS.map(prayer => {
                    const passed = isPrayerPassed(prayerTimes[prayer.key]);
                    const missed = passed && !log[prayer.key] && Object.keys(prayerTimes).length > 0;
                    return (
                        <PrayerRow
                            key={prayer.key}
                            prayer={prayer}
                            done={!!log[prayer.key]}
                            missed={missed}
                            onToggle={togglePrayer}
                            prayerTime={prayerTimes[prayer.key]}
                            isNext={!allDone && nextPrayer?.key === prayer.key}
                        />
                    );
                })}

                <View style={styles.sectionHeaderRow}></View>

                {/* ── QIBLA CARD (replaces stats section) ──── */}
                <QiblaCard
                    latitude={coords?.latitude ?? null}
                    longitude={coords?.longitude ?? null}
                />

            </ScrollView>

            {/* ── LOCATION REQUIRED MODAL ──────────────────────────────── */}
            <Modal
                visible={locationModalVisible}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setLocationModalVisible(false)}
            >
                <View style={styles.locationModalOverlay}>
                    <View style={styles.locationModalCard}>
                        <View style={styles.locationModalIcon}>
                            <Ionicons name="location" size={26} color={C.gold} />
                        </View>

                        <Text style={styles.locationModalTitle}>Location Required</Text>

                        <Text style={styles.locationModalText}>
                            Islamic Knowledge Hub uses your device location
                            to provide accurate prayer times and Qibla direction.
                        </Text>

                        <Text style={styles.locationModalHint}>
                            {needsLocationServicesEnabled
                                ? 'Please turn on Location Services to continue.'
                                : 'Please allow location access to continue.'}
                        </Text>

                        <TouchableOpacity
                            style={styles.locationModalButton}
                            onPress={async () => {
                                try {
                                    if (needsLocationPermission) {
                                        Linking.openSettings();
                                    } else {
                                        await openLocationSettings();
                                    }
                                    // Give the OS a moment, then check again.
                                    setTimeout(async () => {
                                        try {
                                            await initializeLocation();
                                            setLocationModalVisible(false);
                                            await fetchPrayerTimes(true);
                                        } catch (e) {
                                            console.log('[Prayer] location still unavailable:', e?.message);
                                        }
                                    }, 800);
                                } catch {}
                            }}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="settings-outline" size={16} color={C.bg} />
                            <Text style={styles.locationModalButtonText}>
                                {needsLocationPermission ? 'Open Settings' : 'Turn On Location'}
                            </Text>
                        </TouchableOpacity>

                        {/* Not in the original spec, added deliberately: a way out.
                            A modal the user can't dismiss without granting location
                            traps anyone who wants to look around the app first —
                            the inline banner still explains what's missing after
                            this closes. */}
                        <TouchableOpacity
                            style={styles.locationModalDismiss}
                            onPress={() => setLocationModalVisible(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.locationModalDismissText}>Not now</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    locationModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    locationModalCard: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: C.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.borderGold,
        padding: 24,
        alignItems: 'center',
    },
    locationModalIcon: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: C.goldSubtle,
        borderWidth: 1,
        borderColor: C.borderGold,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    locationModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
        marginBottom: 10,
        textAlign: 'center',
    },
    locationModalText: {
        fontSize: 13,
        color: C.textDim,
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 10,
    },
    locationModalHint: {
        fontSize: 12,
        color: C.mutedMid,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    locationModalButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: C.gold,
        borderRadius: 12,
        paddingVertical: 13,
    },
    locationModalButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: C.bg,
    },
    locationModalDismiss: {
        marginTop: 14,
        paddingVertical: 4,
    },
    locationModalDismissText: {
        fontSize: 12,
        color: C.mutedMid,
        textDecorationLine: 'underline',
    },
    root:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 16, paddingTop: 14 },

    stickyBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: C.surfaceUp,
        borderBottomWidth: 1, borderBottomColor: C.borderBlue,
        paddingHorizontal: 20, paddingVertical: 11,
    },
    stickyLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stickyPulse:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.blue },
    stickyLabel:     { fontSize: 9, color: C.blue, letterSpacing: 2, fontWeight: '700', marginBottom: 1, opacity: 0.8 },
    stickyName:      { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: 0.2 },
    stickyRight:     { alignItems: 'flex-end' },
    stickyTime:      { fontSize: 17, fontWeight: '700', color: C.blue, letterSpacing: 0.3 },
    stickyCountdown: { fontSize: 10, color: C.mutedMid, marginTop: 1 },

    header: {
        flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
        paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 20,
    },
    headerLeft:     { flex: 1, paddingRight: 12 },
    headerEyebrow:  { fontSize: 9, color: C.gold, letterSpacing: 3, fontWeight: '700', opacity: 0.7, marginBottom: 6 },
    hijri:          { fontSize: 13, color: C.gold, fontWeight: '600', marginBottom: 2, letterSpacing: 0.3 },
    greg:           { fontSize: 12, color: C.mutedMid, letterSpacing: 0.2, marginBottom: 8 },
    locationRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    locationDot:    { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.green },
    locationText:   { fontSize: 11, color: C.mutedMid, letterSpacing: 0.2 },
    locationActions: { flexDirection: 'row', marginTop: 7 },
    locationButton: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingVertical: 5, paddingHorizontal: 8, borderRadius: 7,
        backgroundColor: C.goldSubtle, borderWidth: 1, borderColor: C.borderGold,
    },
    locationButtonText: { fontSize: 10, color: C.gold, fontWeight: '600' },

    progressWrap:    { alignItems: 'center' },
    progressCircle:  {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.borderGold,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8, gap: 2,
    },
    progressNum:     { fontSize: 26, fontWeight: '700', color: C.gold, lineHeight: 28 },
    progressDenom:   { fontSize: 11, color: C.muted, marginTop: 6 },
    progressDots:    { flexDirection: 'row', gap: 4, marginBottom: 4 },
    progressDot:     { width: 8, height: 3, borderRadius: 1.5, backgroundColor: C.muted, opacity: 0.3 },
    progressDotDone: { backgroundColor: C.green, opacity: 1 },
    progressCaption: { fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },

    alertBanner: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 10, borderWidth: 1,
        paddingVertical: 11, paddingHorizontal: 14,
        marginBottom: 12, overflow: 'hidden',
    },
    alertAccent: { width: 3, height: '100%', borderRadius: 2, marginRight: 12, alignSelf: 'stretch' },
    alertText:   { fontSize: 12, flex: 1, lineHeight: 17, letterSpacing: 0.1 },

    allDoneCard: {
        backgroundColor: C.greenSubtle, borderRadius: 14,
        borderWidth: 1, borderColor: C.borderGreen,
        padding: 18, marginBottom: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    allDoneTop:         {},
    allDoneArabic:      { fontSize: 20, color: C.green, marginBottom: 2, fontFamily: 'Uthmanic' },
    allDoneTitle:       { fontSize: 13, color: C.green, fontWeight: '600', letterSpacing: 0.3 },
    allDoneStreak:      { alignItems: 'center' },
    allDoneStreakNum:    { fontSize: 32, fontWeight: '700', color: C.gold, lineHeight: 34 },
    allDoneStreakLabel: { fontSize: 9, color: C.gold, letterSpacing: 1.5, opacity: 0.7, textTransform: 'uppercase' },

    sectionLabel: {
        fontSize: 9, color: C.gold, letterSpacing: 2.8, fontWeight: '700',
        opacity: 0.7, marginBottom: 12, textTransform: 'uppercase',
    },
    sectionHeaderRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 8, marginBottom: 12,
    },
    sectionMeta: { fontSize: 11, color: C.mutedMid },

    prayerRow: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 12, borderWidth: 1,
        paddingRight: 14, paddingVertical: IS_TALL ? 13 : 11,
        overflow: 'hidden',
    },
    prayerAccentBar: { width: 3, height: '100%', marginRight: 12, alignSelf: 'stretch', borderRadius: 1.5 },
    arabicWrap:      { width: 52, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
    prayerArabic:    { fontFamily: 'Uthmanic', fontSize: 19, color: C.gold, textAlign: 'center' },
    prayerMid:       { flex: 1 },
    prayerLabel:     { fontSize: 16, fontWeight: '700', letterSpacing: 0.15, marginBottom: 2 },
    prayerMetaRow:   { flexDirection: 'row', alignItems: 'center' },
    prayerTimeText:  { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
    prayerPeriod:    { fontSize: 11, color: C.muted },
    metaDot:         { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.muted, marginHorizontal: 6 },
    countdownText:   { fontSize: 11, color: C.blue, fontWeight: '600' },
    missedText:      { fontSize: 11, color: C.red, fontWeight: '600' },
    prayerRight:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rakatPill: {
        backgroundColor: C.goldSubtle, borderRadius: 6, borderWidth: 1, borderColor: C.borderGold,
        paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', flexDirection: 'row', gap: 2,
    },
    rakatNum:         { fontSize: 13, fontWeight: '700', color: C.gold },
    rakatSuffix:      { fontSize: 8, color: C.goldDim, letterSpacing: 0.3, marginTop: 1 },
    checkOuter: {
        width: 30, height: 30, borderRadius: 15,
        borderWidth: 1.5, borderColor: C.muted,
        alignItems: 'center', justifyContent: 'center',
    },
    checkOuterDone:   { borderColor: C.green, backgroundColor: C.greenSubtle },
    checkOuterMissed: { borderColor: C.red, backgroundColor: C.redSubtle },
    checkOuterNext:   { borderColor: C.blue, backgroundColor: C.blueSubtle },
    checkInnerDone:   { width: 12, height: 12, borderRadius: 6, backgroundColor: C.green },
    checkInnerMissed: { width: 8, height: 2, borderRadius: 1, backgroundColor: C.red },
    checkInnerEmpty:  { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: C.muted, opacity: 0.4 },

    weekCard: {
        flexDirection: 'row', justifyContent: 'space-between',
        backgroundColor: C.surface, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 18,
        marginBottom: 16,
    },
    weekCol:      { alignItems: 'center', flex: 1 },
    weekBarTrack: {
        width: 16, height: 52,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 8, overflow: 'hidden',
        justifyContent: 'flex-end', marginBottom: 5,
    },
    weekBarFill:    { width: '100%', borderRadius: 8 },
    weekCountText:  { fontSize: 10, marginBottom: 3 },
    weekDayText:    { fontSize: 10, color: C.muted, letterSpacing: 0.3, fontWeight: '500' },
    weekTodayLine:  { width: 16, height: 2, borderRadius: 1, backgroundColor: C.gold, marginTop: 3 },

    // Qibla card styles live in the separate `qS` StyleSheet object above QiblaCard
});