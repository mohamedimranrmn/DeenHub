/**
 * qibla.jsx  —  Production-grade Qibla Compass
 *
 * ── Crash fixes (all 8 from diagnostic) ─────────────────────────────────────
 *  ✅ 1. Sensor starts ONLY after qibla is fetched  (useEffect on qibla state)
 *  ✅ 2. Full sensor data guard  (null / undefined / NaN / zero-vector)
 *  ✅ 3. Update interval 150ms — was 80ms, which overloaded Android UI thread
 *  ✅ 4. isMounted ref — no setState calls after unmount
 *  ✅ 5. Magnetometer.isAvailableAsync() checked before subscribing
 *  ✅ 6. try/catch wraps every sensor listener body
 *  ✅ 7. isNaN / isFinite guards before every animated value write
 *  ✅ 8. Compass subtree only mounts when qibla !== null (render guard)
 *
 * ── Engine upgrades ──────────────────────────────────────────────────────────
 *  🔥 Kalman filter  — replaces naive EMA; far more stable under vibration
 *  🔥 Gyroscope fusion  — complementary filter blends gyro + magnetometer;
 *     gyro smooths fast motion, magnetometer corrects long-term drift
 *  🔥 Animated.Value.setValue() instead of Animated.timing queues;
 *     eliminates the "12 pending animations" overload that crashed on Android
 */

import {
    View, Text, StyleSheet, Animated, TouchableOpacity,
    StatusBar, Dimensions,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Magnetometer, Gyroscope } from 'expo-sensors';

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
const SENSOR_INTERVAL_MS = 150;   // 6.6 Hz — safe ceiling for all Android devices
const FUSION_ALPHA       = 0.95;  // gyro weight in complementary filter

// ─────────────────────────────────────────────────────────────────────────────
// KALMAN FILTER  (1-D, angle-aware)
//
// Replaces the naive EMA smoothAngle() from the original code.
// Key improvement: the Kalman gain k adapts — it trusts the sensor more
// when uncertainty p is high (e.g. after a big movement) and trusts the
// model more when uncertainty is low (stable device).
//
//   Q = process noise   — how fast the true angle can change  (0.01 = slow)
//   R = measurement noise — how noisy the raw sensor is       (0.5 = moderate)
// ─────────────────────────────────────────────────────────────────────────────
function createKalman(Q = 0.01, R = 0.5) {
    let x           = 0;
    let p           = 1;
    let initialized = false;

    return {
        update(raw) {
            if (!initialized) { x = raw; initialized = true; return x; }

            // Minimal angular delta (handles 0/360 wrap)
            let d = raw - x;
            if (d >  180) d -= 360;
            if (d < -180) d += 360;

            const pPred = p + Q;          // predict covariance
            const k     = pPred / (pPred + R);  // Kalman gain
            x = normAngle(x + k * d);     // correct estimate
            p = (1 - k) * pPred;          // update covariance
            return x;
        },
        reset(v = 0) { x = v; p = 1; initialized = false; },
        get value()   { return x; },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANGLE MATH
// ─────────────────────────────────────────────────────────────────────────────
function normAngle(a) {
    return ((a % 360) + 360) % 360;
}

function angleDelta(target, current) {
    let d = normAngle(target) - normAngle(current);
    if (d >  180) d -= 360;
    if (d < -180) d += 360;
    return d;
}

// Returns null for bad data rather than crashing (fix #2)
function magnetometerToHeading(data) {
    if (
        data == null || !isFinite(data.x) || !isFinite(data.y) ||
        (data.x === 0 && data.y === 0)
    ) return null;
    return normAngle(-Math.atan2(data.y, data.x) * (180 / Math.PI) + 90);
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
    const good = accuracy < 15;
    return (
        <View style={[styles.accuracyBadge, {
            backgroundColor: good ? C.greenSubtle : C.redSubtle,
            borderColor:     good ? C.greenBorder : C.redBorder,
        }]}>
            <View style={[styles.accuracyDot, { backgroundColor: good ? C.green : C.red }]} />
            <Text style={[styles.accuracyText, { color: good ? C.green : C.red }]}>
                {good ? `±${Math.round(accuracy)}°` : 'Calibrate'}
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
    const [apiError,        setApiError]        = useState(false);
    const [loading,         setLoading]         = useState(true);
    const [sensorMissing,   setSensorMissing]   = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);

    // ── Refs ─────────────────────────────────────────────────────────────
    const isMounted       = useRef(false);
    const qiblaRef        = useRef(null);    // writable mirror of qibla state
    const magSub          = useRef(null);
    const gyroSub         = useRef(null);
    const sensorsActive   = useRef(false);

    // Kalman filters — seeded fresh on each focus
    const kfHeading       = useRef(createKalman(0.01, 0.5));
    const kfRotation      = useRef(createKalman(0.01, 0.5));

    // Gyroscope integration
    const gyroAngle       = useRef(0);
    const lastGyroTs      = useRef(null);
    const fusedAngle      = useRef(0);

    // Animated values — driven with setValue() to prevent timing queue buildup
    const rotateAnim  = useRef(new Animated.Value(0)).current;
    const ringRotAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim   = useRef(new Animated.Value(1)).current;
    const fadeAnim    = useRef(new Animated.Value(0)).current;
    const alignedRef  = useRef(false);

    // ── Keep qiblaRef in sync with state ─────────────────────────────────
    useEffect(() => { qiblaRef.current = qibla; }, [qibla]);

    // ─────────────────────────────────────────────────────────────────────
    // FETCH QIBLA
    // ─────────────────────────────────────────────────────────────────────
    const fetchQibla = useCallback(async () => {
        if (!isMounted.current) return;
        setLoading(true);
        setLocError(false);
        setApiError(false);

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                if (isMounted.current) setLocError(true);
                return;
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            if (!isMounted.current) return;

            const { latitude, longitude } = loc.coords;
            const res  = await fetch(`https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const direction = json?.data?.direction;
            if (typeof direction !== 'number' || !isFinite(direction)) {
                throw new Error('Unexpected API shape');
            }
            if (!isMounted.current) return;

            // Seed filters at the actual Qibla so the first frame is correct
            kfHeading.current.reset(0);
            kfRotation.current.reset(direction);
            fusedAngle.current = 0;

            setQibla(direction);  // ← triggers startSensors via useEffect below

            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();

        } catch (e) {
            console.error('[Qibla] fetch error:', e.message);
            if (isMounted.current) setApiError(true);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // STOP SENSORS
    // ─────────────────────────────────────────────────────────────────────
    const stopSensors = useCallback(() => {
        magSub.current?.remove();
        gyroSub.current?.remove();
        magSub.current      = null;
        gyroSub.current     = null;
        sensorsActive.current = false;
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // START SENSORS
    //
    // FIX #1: This is intentionally NOT called from useFocusEffect.
    // It is called from a useEffect that fires only when qibla !== null,
    // guaranteeing qiblaRef.current is set before any callback runs.
    // ─────────────────────────────────────────────────────────────────────
    const startSensors = useCallback(async () => {
        if (sensorsActive.current || !isMounted.current) return;

        // FIX #5: check availability first
        const magOk  = await Magnetometer.isAvailableAsync().catch(() => false);
        if (!magOk) {
            if (isMounted.current) setSensorMissing(true);
            return;
        }
        const gyroOk = await Gyroscope.isAvailableAsync().catch(() => false);

        sensorsActive.current = true;
        Magnetometer.setUpdateInterval(SENSOR_INTERVAL_MS);  // FIX #3

        // ── Magnetometer ─────────────────────────────────────────────────
        magSub.current = Magnetometer.addListener((data) => {
            try {    // FIX #6
                // FIX #2: validate raw data
                const rawH = magnetometerToHeading(data);
                if (rawH == null) return;

                // Complementary filter — blend gyro prediction + magnetometer
                const fused = gyroOk
                    ? normAngle(FUSION_ALPHA * fusedAngle.current + (1 - FUSION_ALPHA) * rawH)
                    : rawH;
                fusedAngle.current = fused;

                // Kalman on heading
                const smoothH = kfHeading.current.update(fused);
                if (!isFinite(smoothH)) return;  // FIX #7

                // FIX #1 continued: qiblaRef is guaranteed non-null here
                const q = qiblaRef.current;
                if (q == null) return;

                // Kalman on rotation (arrow angle)
                const rawRot  = normAngle(q - smoothH);
                const smoothR = kfRotation.current.update(rawRot);
                if (!isFinite(smoothR)) return;  // FIX #7

                // FIX #4: check mounted before setState
                if (!isMounted.current) return;
                setHeading(smoothH);
                setRotation(smoothR);

                // FIX #3: setValue() instead of Animated.timing() —
                // no animation queue, no pileup, renders at next frame only
                rotateAnim.setValue(smoothR);
                ringRotAnim.setValue(-smoothH);

                // Accuracy from field magnitude
                const mag = Math.sqrt(
                    (data.x ?? 0) ** 2 + (data.y ?? 0) ** 2 + (data.z ?? 0) ** 2
                );
                if (isFinite(mag)) {
                    setAccuracy(Math.min(Math.abs(mag - 45) * 1.2, 45));
                    setShowCalibration(mag < 20 || mag > 90);
                }

            } catch (e) {
                console.log('[Qibla] mag listener error:', e.message);  // FIX #6
            }
        });

        // ── Gyroscope (fusion source — provides smooth fast-motion data) ──
        if (gyroOk) {
            Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
            gyroSub.current = Gyroscope.addListener((data) => {
                try {
                    if (!data || !isFinite(data.z)) return;
                    const now = Date.now();
                    const dt  = lastGyroTs.current
                        ? Math.min((now - lastGyroTs.current) / 1000, 0.1)
                        : SENSOR_INTERVAL_MS / 1000;
                    lastGyroTs.current = now;

                    // Integrate angular velocity → heading delta
                    gyroAngle.current = normAngle(
                        gyroAngle.current + data.z * (180 / Math.PI) * dt
                    );
                    // Update the fusion accumulator — next mag tick will blend this in
                    fusedAngle.current = normAngle(
                        FUSION_ALPHA * gyroAngle.current + (1 - FUSION_ALPHA) * fusedAngle.current
                    );
                } catch (e) {
                    console.log('[Qibla] gyro listener error:', e.message);
                }
            });
        }
    }, []);

    // FIX #1: sensor starts only when qibla is ready
    useEffect(() => {
        if (qibla !== null) startSensors();
    }, [qibla]);

    // ─────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            isMounted.current = true;
            fetchQibla();

            return () => {
                isMounted.current = false;
                stopSensors();
                // Reset all state so next focus is clean
                kfHeading.current.reset(0);
                kfRotation.current.reset(0);
                fusedAngle.current  = 0;
                gyroAngle.current   = 0;
                lastGyroTs.current  = null;
                fadeAnim.setValue(0);
                setQibla(null);
                setAccuracy(null);
                setShowCalibration(false);
            };
        }, [fetchQibla, stopSensors])
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
    });
    const ringRotate = ringRotAnim.interpolate({
        inputRange:  [-360, 0, 360],
        outputRange: ['-360deg', '0deg', '360deg'],
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
                </View>
                <View style={[styles.headerSide, styles.headerSideRight]}>
                    <AccuracyBadge accuracy={accuracy} />
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
                    <Text style={[styles.bannerText, { color: C.red }]}>Compass sensor not available on this device</Text>
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

                {(locError || apiError) && !loading && (
                    <View style={styles.errorWrap}>
                        <Ionicons name="location-outline" size={32} color={C.muted} />
                        <Text style={styles.errorTitle}>
                            {locError ? 'Location access denied' : 'Could not reach server'}
                        </Text>
                        <Text style={styles.errorSub}>
                            {locError
                                ? 'Enable location permission and try again'
                                : 'Check your connection and tap Retry'}
                        </Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={fetchQibla}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/*
                  * FIX #8 — RENDER GUARD
                  * Compass subtree only mounts after qibla !== null.
                  * When qibla is null, interpolation on rotateAnim has no valid
                  * target → NaN in interpolation → crash on Android.
                  * Keeping it out of the tree entirely is the safest fix.
                  */}
                {qibla !== null && !loading && !locError && !apiError && (
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
                            <Text style={styles.degreeLabel}> from North</Text>
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
                </View>
            )}

            {/* ── AYAH FOOTER ── */}
            <View style={[styles.ayahFooter, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.ayahArabic}>فَوَلِّ وَجْهَكَ شَطْرَ الْمَسْجِدِ الْحَرَامِ</Text>
                <Text style={styles.ayahTrans}>"Turn your face toward the Sacred Mosque"</Text>
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
    headerSideRight: { alignItems: 'flex-end' },
    backBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter:  { flex: 1, alignItems: 'center' },
    headerEyebrow: { fontSize: 8, color: C.gold, letterSpacing: 3, fontWeight: '700', opacity: 0.6 },
    headerTitle:   { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: 0.2 },

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

    ayahFooter: {
        paddingHorizontal: 24, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center', gap: 4,
    },
    ayahArabic: { fontSize: 15, color: C.gold, fontFamily: 'Uthmanic', textAlign: 'center', lineHeight: 24 },
    ayahTrans:  { fontSize: 11, color: C.textDim, fontStyle: 'italic', textAlign: 'center', lineHeight: 17 },
    ayahRef:    { fontSize: 10, color: C.muted, letterSpacing: 0.5 },
});