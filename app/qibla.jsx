/**
 * qibla.jsx — Native/offline Qibla Compass
 *
 * Qibla bearing is calculated locally from the user's coordinates to the Kaaba.
 * Device orientation comes from expo-location's native heading API, preferring
 * trueHeading and falling back to magnetic heading when true north is unavailable.
 */

import {
    View, Text, StyleSheet, Animated, TouchableOpacity,
    StatusBar, Dimensions, Linking, Easing,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
    initializeLocation,
    detectLocation,
} from '../src/utils/location';
import {
    calculateQiblaBearing,
    calculateDistanceKm,
    normAngle,
} from '../src/utils/qibla';

const { width } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width * 0.72, 300);

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
    bg:          '#080E17',
    surface:     '#0D1824',
    surfaceAlt:  '#111F2E',
    border:      'rgba(255,255,255,0.06)',
    borderGold:  'rgba(201,168,76,0.18)',
    gold:        '#C9A84C',
    goldDim:     'rgba(201,168,76,0.35)',
    goldSubtle:  'rgba(201,168,76,0.08)',
    goldGlow:    'rgba(201,168,76,0.12)',
    green:       '#48BB78',
    greenSubtle: 'rgba(72,187,120,0.08)',
    greenBorder: 'rgba(72,187,120,0.25)',
    red:         '#F56565',
    redSubtle:   'rgba(245,101,101,0.08)',
    redBorder:   'rgba(245,101,101,0.25)',
    text:        '#EEE8D5',
    textDim:     '#B8A98A',
    muted:       '#4A6070',
    mutedMid:    '#6B8090',
};

// ── Constants ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ANGLE MATH
// ─────────────────────────────────────────────────────────────────────────────
function angleDelta(target, current) {
    let d = normAngle(target) - normAngle(current);
    if (d >  180) d -= 360;
    if (d < -180) d += 360;
    return d;
}

// expo-location reports -1 for a heading axis the platform can't supply
// (most commonly trueHeading when there's no valid true-north fix yet).
// Treat that sentinel — and any other non-finite value — as "unavailable"
// rather than a real 0–360 bearing.
function normalizeHeading(value) {
    if (!Number.isFinite(value) || value < 0) return null;
    return normAngle(value);
}

// Exponential smoothing across the compass's 0°/360° wraparound. A plain
// `prev + (next - prev) * alpha` breaks near north (e.g. 359° → 1° would
// briefly spin the arrow almost all the way around), so the blend has to
// happen along the shortest angular path instead.
function smoothHeading(prev, next, alpha = 0.2) {
    if (prev == null || !Number.isFinite(prev)) return next;
    const delta = angleDelta(next, prev);
    return normAngle(prev + delta * alpha);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPASS TICK GEOMETRY  (pre-computed — not recalculated per render)
// ─────────────────────────────────────────────────────────────────────────────
const CARDINALS  = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TICK_COUNT = 72;
const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle         = (i / TICK_COUNT) * 360;
    const isCardinal    = angle % 90 === 0;
    const isIntercard   = angle % 45 === 0 && !isCardinal;
    const len           = isCardinal ? 14 : isIntercard ? 9 : 5;
    const r             = (COMPASS_SIZE / 2) - 2;
    const rad           = (angle * Math.PI) / 180;
    const sin           = Math.sin(rad);
    const cos           = Math.cos(rad);
    return {
        left:    (COMPASS_SIZE / 2) + (r - len) * sin - (isCardinal ? 0.75 : 0.5),
        top:     (COMPASS_SIZE / 2) - r * cos,
        height:  len,
        width:   isCardinal ? 1.5 : 1,
        color:   isCardinal ? C.gold : C.muted,
        opacity: isCardinal ? 0.8 : isIntercard ? 0.4 : 0.18,
        angle,
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCURACY BADGE
// ─────────────────────────────────────────────────────────────────────────────
function AccuracyBadge({ accuracy }) {
    if (accuracy == null) return null;
    const good = accuracy >= 3;
    const label = accuracy >= 3 ? 'High' : accuracy === 2 ? 'Medium' : accuracy === 1 ? 'Low' : 'Calibrate';
    return (
        <View style={[styles.accuracyBadge, {
            backgroundColor: good ? C.greenSubtle : C.redSubtle,
            borderColor:     good ? C.greenBorder : C.redBorder,
        }]}>
            <View style={[styles.accuracyDot, { backgroundColor: good ? C.green : C.red }]} />
            <Text style={[styles.accuracyText, { color: good ? C.green : C.red }]}>
                {label}
            </Text>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function QiblaScreen() {
    const insets = useSafeAreaInsets();

    const [heading,         setHeading]         = useState(0);
    const [qibla,           setQibla]           = useState(null);  // null until API resolves
    const [rotation,        setRotation]        = useState(0);
    const [accuracy,        setAccuracy]        = useState(null);
    const [locError,        setLocError]        = useState(false);
    const [servicesDisabled,setServicesDisabled] = useState(false);
    const [qiblaError,      setQiblaError]      = useState(false);
    const [loading,         setLoading]         = useState(true);
    const [sensorMissing,   setSensorMissing]   = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);
    const [locationLabel,   setLocationLabel]   = useState(null);
    const [distanceKm,      setDistanceKm]      = useState(null);

    // ── Refs ─────────────────────────────────────────────────────────────
    const isMounted       = useRef(false);
    const headingSub      = useRef(null);
    const qiblaRef        = useRef(null);
    const smoothedHeading = useRef(null);
    const lastTrueHeading = useRef(null);
    // Continuous (non-wrapped) rotation totals. Animated.timing interpolates
    // linearly between values, so animating straight from a wrapped 0–360
    // number (e.g. 359° → 1°) would spin the dial almost all the way
    // backward instead of the 2° forward turn it actually is. Keeping a
    // running total that only ever moves by the shortest angular step lets
    // the tween always take the short way round.
    const rotateUnwrapped = useRef(0);
    const ringUnwrapped   = useRef(0);

    // Animated values for the arrow and tick ring. Each heading update
    // starts a short Animated.timing tween toward the new angle (see
    // startHeading) rather than snapping with setValue, which is what
    // makes the rotation feel continuous instead of stepping between
    // sensor samples. A new .start() call simply retargets the tween from
    // wherever it currently is, so this stays cheap even at a fast
    // sensor update rate.
    const rotateAnim  = useRef(new Animated.Value(0)).current;
    const ringRotAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim   = useRef(new Animated.Value(1)).current;
    const fadeAnim    = useRef(new Animated.Value(0)).current;
    const alignedRef  = useRef(false);

    const [headingSource, setHeadingSource] = useState('true');

    useEffect(() => {
        qiblaRef.current = qibla;
    }, [qibla]);

    // ─────────────────────────────────────────────────────────────────────
    // FETCH QIBLA — entirely local after location is known
    // ─────────────────────────────────────────────────────────────────────
    const fetchQibla = useCallback(async (forceLocationRefresh = false) => {
        if (!isMounted.current) return;
        setLoading(true);
        setLocError(false);
        setServicesDisabled(false);
        setQiblaError(false);
        setSensorMissing(false);

        try {
            const location = forceLocationRefresh
                ? await detectLocation()
                : await initializeLocation();

            if (!isMounted.current) return;

            const { latitude, longitude, city } = location;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                throw new Error('LOCATION_UNAVAILABLE');
            }

            const bearing = calculateQiblaBearing(latitude, longitude);
            const distance = calculateDistanceKm(latitude, longitude);

            if (city) setLocationLabel(city);
            setDistanceKm(Math.round(distance));
            setQibla(bearing);

            // Reset the heading state. The native heading stream will populate
            // the actual device orientation immediately after this.
            smoothedHeading.current = null;
            lastTrueHeading.current = null;
            rotateUnwrapped.current = bearing;
            ringUnwrapped.current = 0;
            setHeading(0);
            setRotation(bearing);
            rotateAnim.setValue(bearing);
            ringRotAnim.setValue(0);
            setHeadingSource('true');

            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        } catch (e) {
            if (!isMounted.current) return;

            if (e.message === 'LOCATION_PERMISSION_DENIED') {
                console.warn('[Qibla] location permission denied');
                setLocError(true);
            } else if (e.message === 'LOCATION_SERVICES_DISABLED') {
                console.warn('[Qibla] location services disabled');
                setServicesDisabled(true);
            } else {
                // Any other failure (e.g. a bad import/undefined helper) means
                // the local calculation itself blew up — not a network issue.
                console.error('[Qibla] location/calculation error:', e.message);
                setQiblaError(true);
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [fadeAnim, ringRotAnim, rotateAnim]);

    // ─────────────────────────────────────────────────────────────────────
    // STOP NATIVE HEADING SENSOR
    // ─────────────────────────────────────────────────────────────────────
    const stopHeading = useCallback(() => {
        try { headingSub.current?.remove(); } catch {}
        headingSub.current = null;
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // START NATIVE HEADING
    //
    // expo-location's heading API uses the platform compass implementation and
    // exposes both magnetic and true-north headings. We prefer trueHeading so
    // the heading uses the same north reference as our Qibla calculation.
    // ─────────────────────────────────────────────────────────────────────
    const startHeading = useCallback(async () => {
        if (!isMounted.current || headingSub.current) return;

        try {
            const subscription = await Location.watchHeadingAsync(
                (data) => {
                    try {
                        if (!isMounted.current || !data) return;

                        const trueHeading = normalizeHeading(data.trueHeading);
                        const magneticHeading = normalizeHeading(data.magHeading);

                        // trueHeading is -1 when the platform cannot provide a
                        // true-north value. Fall back to magnetic heading rather
                        // than leaving the user without a working compass.
                        const nextHeading = trueHeading ?? magneticHeading;
                        if (nextHeading == null) return;

                        const smoothed = smoothHeading(
                            smoothedHeading.current,
                            nextHeading,
                            0.24
                        );
                        if (!Number.isFinite(smoothed)) return;

                        smoothedHeading.current = smoothed;
                        lastTrueHeading.current = trueHeading;

                        const q = qiblaRef.current;
                        if (!Number.isFinite(q)) return;

                        let relative = q - smoothed;
                        if (relative > 180) relative -= 360;
                        if (relative < -180) relative += 360;
                        relative = normAngle(relative);

                        setHeading(smoothed);
                        setRotation(relative);

                        // Advance the unwrapped totals by the shortest angular
                        // step, then tween to them so the arrow/ring glide
                        // between sensor samples instead of snapping.
                        rotateUnwrapped.current += angleDelta(relative, normAngle(rotateUnwrapped.current));
                        ringUnwrapped.current += angleDelta(normAngle(-smoothed), normAngle(ringUnwrapped.current));

                        Animated.timing(rotateAnim, {
                            toValue: rotateUnwrapped.current,
                            duration: 180,
                            easing: Easing.out(Easing.quad),
                            useNativeDriver: true,
                        }).start();
                        Animated.timing(ringRotAnim, {
                            toValue: ringUnwrapped.current,
                            duration: 180,
                            easing: Easing.out(Easing.quad),
                            useNativeDriver: true,
                        }).start();

                        setHeadingSource(trueHeading != null ? 'true' : 'magnetic');

                        // Expo exposes 0/1/2/3 calibration levels. Keep the
                        // user-facing badge conservative: only call it good at
                        // high accuracy.
                        const accuracyLevel = Number(data.accuracy);
                        if (Number.isFinite(accuracyLevel)) {
                            setAccuracy(accuracyLevel);
                            setShowCalibration(accuracyLevel < 2);
                        }
                    } catch (e) {
                        console.warn('[Qibla] heading callback:', e.message);
                    }
                },
                (reason) => {
                    console.warn('[Qibla] heading error:', reason);
                    if (isMounted.current) setSensorMissing(true);
                }
            );

            if (!isMounted.current) {
                subscription?.remove();
                return;
            }
            headingSub.current = subscription;
        } catch (e) {
            console.error('[Qibla] heading subscription failed:', e.message);
            if (isMounted.current) setSensorMissing(true);
        }
    }, [ringRotAnim, rotateAnim]);

    // Start the native compass only after a valid Qibla bearing exists.
    useEffect(() => {
        if (qibla !== null && !loading && !sensorMissing) {
            startHeading();
        }
        return () => stopHeading();
    }, [qibla, loading, sensorMissing, startHeading, stopHeading]);

    // ─────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            isMounted.current = true;
            fetchQibla(false);

            return () => {
                isMounted.current = false;
                stopHeading();
                smoothedHeading.current = null;
                lastTrueHeading.current = null;
                fadeAnim.setValue(0);
                setQibla(null);
                setAccuracy(null);
                setShowCalibration(false);
                setSensorMissing(false);
            };
        }, [fetchQibla, stopHeading, fadeAnim])
    );

    // ── Aligned pulse ─────────────────────────────────────────────────────
    useEffect(() => {
        const aligned = Math.abs(angleDelta(rotation, 0)) < 5;
        if (aligned && !alignedRef.current) {
            alignedRef.current = true;
            Animated.sequence([
                Animated.timing(pulseAnim,  { toValue: 1.3, duration: 200, useNativeDriver: true }),
                Animated.spring(pulseAnim,  { toValue: 1, tension: 200, friction: 6, useNativeDriver: true }),
            ]).start();
        } else if (!aligned) {
            alignedRef.current = false;
        }
    }, [rotation]);

    // ─────────────────────────────────────────────────────────────────────
    // DERIVED DISPLAY
    // ─────────────────────────────────────────────────────────────────────
    const arrowRotate = rotateAnim.interpolate({
        inputRange:  [0, 360],
        outputRange: ['0deg', '360deg'],
        extrapolate: 'extend',
    });
    const ringRotate = ringRotAnim.interpolate({
        inputRange:  [-360, 0, 360],
        outputRange: ['-360deg', '0deg', '360deg'],
        extrapolate: 'extend',
    });

    const isAligned = Math.abs(angleDelta(rotation, 0)) < 8;
    const center    = COMPASS_SIZE / 2;
    const offsetDeg = Math.abs(Math.round(angleDelta(qibla ?? 0, heading)));

    // ─────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />

            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerSide}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
                        <Ionicons name="chevron-back" size={20} color={C.gold} />
                    </TouchableOpacity>
                </View>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerEyebrow}>COMPASS</Text>
                    <Text style={styles.headerTitle}>Qibla Direction</Text>
                    {locationLabel ? (
                        <View style={styles.locRow}>
                            <View style={styles.locDot} />
                            <Text style={styles.locText} numberOfLines={1}>{locationLabel}</Text>
                        </View>
                    ) : null}
                </View>
                <View style={[styles.headerSide, styles.headerSideRight]}>
                    <AccuracyBadge accuracy={accuracy} />
                    <TouchableOpacity
                        style={styles.refreshBtn}
                        onPress={() => fetchQibla(true)}
                        disabled={loading}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="locate-outline" size={16} color={C.gold} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── BANNERS ── */}
            {showCalibration && (
                <View style={styles.banner}>
                    <Ionicons name="warning-outline" size={14} color={C.gold} />
                    <Text style={styles.bannerText}>Move phone in a figure‑8 to calibrate</Text>
                </View>
            )}
            {sensorMissing && (
                <View style={[styles.banner, { backgroundColor: C.redSubtle, borderBottomColor: C.redBorder }]}>
                    <Ionicons name="close-circle-outline" size={14} color={C.red} />
                    <Text style={[styles.bannerText, { color: C.red }]}>Device compass heading is not available</Text>
                </View>
            )}

            {/* ── COMPASS ── */}
            <View style={styles.compassSection}>

                {loading && (
                    <View style={styles.loadingWrap}>
                        <Ionicons name="sync-outline" size={28} color={C.goldDim} />
                        <Text style={styles.loadingText}>Finding your direction…</Text>
                    </View>
                )}

                {(locError || servicesDisabled || qiblaError) && !loading && (
                    <View style={styles.errorWrap}>
                        <Ionicons name="location-outline" size={32} color={C.muted} />
                        <Text style={styles.errorTitle}>
                            {locError
                                ? 'Location access denied'
                                : servicesDisabled
                                    ? 'Location services are off'
                                    : 'Unable to calculate Qibla'}
                        </Text>
                        <Text style={styles.errorSub}>
                            {locError
                                ? 'Enable location permission in Settings, then retry'
                                : servicesDisabled
                                    ? 'Turn on location services for this device, then retry'
                                    : 'We could not determine your Qibla direction. Please retry.'}
                        </Text>
                        {(locError || servicesDisabled) ? (
                            <TouchableOpacity style={styles.retryBtn} onPress={() => Linking.openSettings()}>
                                <Text style={styles.retryText}>Open Settings</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchQibla(true)}>
                                <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/*
                  * FIX #8 — RENDER GUARD
                  * Compass subtree only mounts after qibla !== null.
                  * When qibla is null, interpolation on rotateAnim has no valid
                  * target → NaN in interpolation → crash on Android.
                  * Keeping it out of the tree entirely is the safest fix.
                  */}
                {qibla !== null && !loading && !locError && !servicesDisabled && !qiblaError && (
                    <Animated.View style={{ opacity: fadeAnim }}>

                        {/* Glow ring */}
                        <View style={[styles.glowRing, {
                            width:        COMPASS_SIZE + 32,
                            height:       COMPASS_SIZE + 32,
                            borderRadius: (COMPASS_SIZE + 32) / 2,
                        }]} />

                        {/* Compass disc */}
                        <View style={[styles.compassWrap, {
                            width:        COMPASS_SIZE,
                            height:       COMPASS_SIZE,
                            borderRadius: COMPASS_SIZE / 2,
                        }]}>

                            {/* Rotating ring — tick marks + labels */}
                            <Animated.View style={[
                                styles.ringLayer,
                                { width: COMPASS_SIZE, height: COMPASS_SIZE, borderRadius: COMPASS_SIZE / 2 },
                                { transform: [{ rotate: ringRotate }] },
                            ]}>
                                {TICKS.map((t, i) => (
                                    <View key={i} style={{
                                        position:        'absolute',
                                        left:            t.left,
                                        top:             t.top,
                                        width:           t.width,
                                        height:          t.height,
                                        backgroundColor: t.color,
                                        opacity:         t.opacity,
                                        transform:       [{ rotate: `${t.angle}deg` }],
                                        transformOrigin: 'center top',
                                    }} />
                                ))}

                                {CARDINALS.map((label, i) => {
                                    const angle = (i / 8) * 360;
                                    const r     = center - 22;
                                    const rad   = (angle * Math.PI) / 180;
                                    const isN   = label === 'N';
                                    const isC   = i % 2 === 0;
                                    return (
                                        <Text key={label} style={{
                                            position:      'absolute',
                                            left:          center + r * Math.sin(rad) - 10,
                                            top:           center - r * Math.cos(rad) - 9,
                                            width:         20,
                                            textAlign:     'center',
                                            fontSize:      isC ? (isN ? 13 : 11) : 9,
                                            fontWeight:    isC ? '700' : '500',
                                            color:         isN ? C.gold : isC ? C.textDim : C.muted,
                                            letterSpacing: 0.3,
                                            opacity:       isC ? 1 : 0.6,
                                        }}>
                                            {label}
                                        </Text>
                                    );
                                })}
                            </Animated.View>

                            {/* Fixed inner disc — arrow lives here */}
                            <View style={[styles.innerDisc, {
                                width:        COMPASS_SIZE * 0.62,
                                height:       COMPASS_SIZE * 0.62,
                                borderRadius: COMPASS_SIZE * 0.31,
                            }]}>
                                <Animated.View style={[
                                    styles.arrowContainer,
                                    { transform: [{ rotate: arrowRotate }] },
                                ]}>
                                    <View style={styles.arrowTop}>
                                        <View style={styles.arrowHeadUp} />
                                        <View style={styles.arrowShaftUp} />
                                    </View>
                                    <View style={styles.arrowBottom}>
                                        <View style={styles.arrowShaftDown} />
                                        <View style={styles.arrowHeadDown} />
                                    </View>
                                </Animated.View>

                                <Animated.View style={[
                                    styles.centerHub,
                                    {
                                        transform:       [{ scale: pulseAnim }],
                                        backgroundColor: isAligned ? 'rgba(72,187,120,0.15)' : C.goldGlow,
                                        borderColor:     isAligned ? C.green : C.gold,
                                    },
                                ]}>
                                    <Text style={styles.kaabaEmoji}>🕋</Text>
                                </Animated.View>
                            </View>

                            {/* Alignment notch */}
                            <View style={[styles.topNotch, { backgroundColor: isAligned ? C.green : C.gold }]} />
                        </View>

                    </Animated.View>
                )}
            </View>

            {/* ── INFO SECTION ── */}
            {qibla !== null && !loading && (
                <View style={styles.infoSection}>
                    {isAligned ? (
                        <View style={styles.alignedBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={C.green} />
                            <Text style={styles.alignedText}>Facing Qibla</Text>
                        </View>
                    ) : (
                        <View style={styles.degreeRow}>
                            <Text style={styles.degreeNum}>{Math.round(qibla)}°</Text>
                            <Text style={styles.degreeLabel}> from True North</Text>
                        </View>
                    )}

                    {!isAligned && (
                        <View style={styles.offsetRow}>
                            <Ionicons
                                name={angleDelta(qibla, heading) > 0 ? 'arrow-redo-outline' : 'arrow-undo-outline'}
                                size={12} color={C.mutedMid}
                            />
                            <Text style={styles.offsetText}>
                                Turn {offsetDeg}° {angleDelta(qibla, heading) > 0 ? 'right' : 'left'}
                            </Text>
                        </View>
                    )}

                    <Text style={styles.instructionText}>Rotate until the arrow points straight up ↑</Text>
                    <Text style={styles.sourceText}>{headingSource === 'true' ? 'True-north heading' : 'Magnetic heading — calibrate for best accuracy'}</Text>
                    {distanceKm ? (
                        <Text style={styles.distanceText}>📍 {distanceKm.toLocaleString()} km from Mecca</Text>
                    ) : null}
                </View>
            )}

            {/* ── AYAH FOOTER ── */}
            <View style={[styles.ayahFooter, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.ayahArabic}>فَوَلِّ وَجْهَكَ شَطْرَ الْمَسْجِدِ الْحَرَامِ</Text>
                <Text style={styles.ayahTrans}>"Turn your face towards the Sacred Mosque"</Text>
                <Text style={styles.ayahRef}>— Quran 2:149</Text>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    headerSide:      { width: 72, alignItems: 'flex-start', justifyContent: 'center' },
    headerSideRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    refreshBtn: {
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: C.goldSubtle, borderWidth: 1, borderColor: C.borderGold,
        alignItems: 'center', justifyContent: 'center',
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter:  { flex: 1, alignItems: 'center' },
    headerEyebrow: { fontSize: 8, color: C.gold, letterSpacing: 3, fontWeight: '700', opacity: 0.6 },
    headerTitle:   { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: 0.2 },
    locRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    locDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.green },
    locText:       { fontSize: 10, color: C.mutedMid, letterSpacing: 0.2 },

    accuracyBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
    },
    accuracyDot:  { width: 5, height: 5, borderRadius: 2.5 },
    accuracyText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },

    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(201,168,76,0.06)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.18)',
        paddingHorizontal: 16, paddingVertical: 10,
    },
    bannerText: { fontSize: 12, color: C.gold, flex: 1, lineHeight: 16 },

    compassSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    glowRing: {
        position: 'absolute',
        backgroundColor: 'rgba(201,168,76,0.03)',
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.06)',
    },
    compassWrap: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.surface,
        borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.18)',
        overflow: 'hidden',
        shadowColor: C.gold, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
    },
    ringLayer:  { position: 'absolute', top: 0, left: 0, backgroundColor: 'transparent' },
    innerDisc:  {
        backgroundColor: C.surfaceAlt,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
    },

    arrowContainer: {
        position: 'absolute', width: 20,
        height: COMPASS_SIZE * 0.45,
        alignItems: 'center', justifyContent: 'center',
    },
    arrowTop:       { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    arrowHeadUp: {
        width: 0, height: 0,
        borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 16,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: C.gold,
    },
    arrowShaftUp:   { width: 3, flex: 1, backgroundColor: C.gold, opacity: 0.8, borderRadius: 1.5 },
    arrowBottom:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    arrowShaftDown: { width: 3, flex: 1, backgroundColor: C.muted, opacity: 0.4, borderRadius: 1.5 },
    arrowHeadDown: {
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 10,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: C.muted, opacity: 0.4,
    },

    centerHub: {
        width: 42, height: 42, borderRadius: 21, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    kaabaEmoji: { fontSize: 18 },
    topNotch:   { position: 'absolute', top: 0, width: 2, height: 10, borderRadius: 1, opacity: 0.9 },

    loadingWrap: { alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 13, color: C.muted, letterSpacing: 0.3 },
    errorWrap:   { alignItems: 'center', gap: 10, paddingHorizontal: 32 },
    errorTitle:  { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
    errorSub:    { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
    retryBtn: {
        marginTop: 8, backgroundColor: C.goldSubtle,
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)',
        paddingHorizontal: 20, paddingVertical: 10,
    },
    retryText: { fontSize: 13, color: C.gold, fontWeight: '600' },

    infoSection: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center', gap: 8 },
    alignedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(72,187,120,0.08)',
        borderRadius: 20, borderWidth: 1, borderColor: 'rgba(72,187,120,0.25)',
        paddingHorizontal: 14, paddingVertical: 7,
    },
    alignedText:     { fontSize: 13, fontWeight: '700', color: C.green, letterSpacing: 0.4 },
    degreeRow:       { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
    degreeNum:       { fontSize: 36, fontWeight: '800', color: C.text, lineHeight: 40 },
    degreeLabel:     { fontSize: 13, color: C.muted, letterSpacing: 0.4 },
    offsetRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
    offsetText:      { fontSize: 11, color: C.mutedMid, letterSpacing: 0.3 },
    instructionText: { fontSize: 11, color: C.muted, letterSpacing: 0.3, textAlign: 'center' },
    sourceText:      { fontSize: 9, color: C.muted, letterSpacing: 0.2, textAlign: 'center' },
    distanceText:    { fontSize: 11, color: C.mutedMid, letterSpacing: 0.2, textAlign: 'center', marginTop: 2 },

    ayahFooter: {
        paddingHorizontal: 24, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center', gap: 4,
    },
    ayahArabic: { fontSize: 15, color: C.gold, fontFamily: 'Uthmanic', textAlign: 'center', lineHeight: 24 },
    ayahTrans:  { fontSize: 11, color: C.textDim, fontStyle: 'italic', textAlign: 'center', lineHeight: 17 },
    ayahRef:    { fontSize: 10, color: C.muted, letterSpacing: 0.5 },
});