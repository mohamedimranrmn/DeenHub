/**
 * app/quran/player.jsx — Quran Player (Redesigned)
 *
 * ✅ Loop Surah kept, Ayah loop removed
 * ✅ Ultra-smooth Surah progress bar: React Native Animated driven, peak-to-move seek gesture inspired by Spotify & Apple Music
 * ✅ 10s forward/back: icon + label stack vertically — zero overlap
 * ✅ Wave bars: independent staggered animations per bar, centered below ayah pill
 * ✅ Seeker: smooth Animated.timing fill, spring thumb, floating scrub bubble
 * ✅ Play button: spring press feedback animation
 * ✅ Skip/seek buttons: separate spring feedback
 * ✅ Full-screen dark gradient background (no flat colour)
 * ✅ Action strip separated by a hairline border
 * ✅ All modals (Sleep, Info, Reciter) preserved, corners rounded to 30px
 */

import {
    View, Text, TouchableOpacity, StyleSheet, StatusBar,
    Animated, Dimensions, ScrollView, Modal, ActivityIndicator,
    Easing, PanResponder, Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useEffect, useState, useRef, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AudioStore, { ayahNum } from '../../src/services/audioStore';
import { getAyahWords, getAyahTafsir } from '../../src/services/quranApi';

const BG_IMAGE = (() => {
    try { return require('../../assets/images/background.png'); } catch (_) { return null; }
})();

const { width: W, height: H } = Dimensions.get('window');

// ── Design tokens ──────────────────────────────────────────────────────────────
const DARK  = '#080E18';
const CARD  = '#0F1923';
const CARD2 = '#0B1520';
const GOLD  = '#C9A84C';
const GOLD_L = 'rgba(201,168,76,0.10)';
const GOLD_M = 'rgba(201,168,76,0.22)';
const GOLD_B = 'rgba(201,168,76,0.40)';
const GREEN  = '#3EC97A';
const TEXT   = '#F0EAD6';
const TEXT_D = '#C8B99A';
const MUTED  = '#4A5A6A';
const BORDER = 'rgba(201,168,76,0.12)';
const ART_SIZE = W - 48;

const SPEEDS     = [0.75, 1.0, 1.25, 1.5, 2.0];
const SLEEP_OPTS = [
    { label: '5',   sub: 'min',   value: 5   },
    { label: '10',  sub: 'min',   value: 10  },
    { label: '15',  sub: 'min',   value: 15  },
    { label: '20',  sub: 'min',   value: 20  },
    { label: '30',  sub: 'min',   value: 30  },
    { label: '45',  sub: 'min',   value: 45  },
    { label: '1',   sub: 'hr',    value: 60  },
    { label: '1.5', sub: 'hr',    value: 90  },
    { label: '2',   sub: 'hr',    value: 120 },
    { label: 'End', sub: 'surah', value: -1  },
];

// ── Persistent sleep timer — survives screen navigation ──────────────────────
// Lives at module scope so PlayerScreen unmounting never clears it.
const SleepManager = (() => {
    let _timerId   = null;   // setTimeout id or unsub fn
    let _endsAt    = 0;      // epoch ms when timer fires (0 = inactive, -1 = end-of-surah)
    let _minutes   = 0;      // currently set value (0 = off)
    const _listeners = new Set();
    const notify = () => _listeners.forEach(fn => fn(_minutes, _endsAt));

    const _cancel = () => {
        if (typeof _timerId === 'function') _timerId();   // it's an AudioStore unsub
        else if (_timerId != null)          clearTimeout(_timerId);
        _timerId = null;
    };

    return {
        subscribe(fn) {
            _listeners.add(fn);
            fn(_minutes, _endsAt);               // emit current state immediately
            return () => _listeners.delete(fn);
        },
        getMinutes() { return _minutes; },
        set(minutes) {
            _cancel();
            _minutes = minutes;
            if (minutes > 0) {
                _endsAt  = Date.now() + minutes * 60 * 1000;
                _timerId = setTimeout(() => {
                    AudioStore.pause();
                    _minutes = 0; _endsAt = 0; _timerId = null;
                    notify();
                }, minutes * 60 * 1000);
            } else if (minutes === -1) {
                // Stop at end of current surah — watch for playback finishing
                _endsAt = -1;
                let lastSurahId = AudioStore.getState().surahId;
                _timerId = AudioStore.subscribe((state) => {
                    if (state.surahId !== lastSurahId || (!state.isPlaying && !state.isLoading && state.surahId)) {
                        // surah changed or finished
                        AudioStore.pause();
                        _cancel();
                        _minutes = 0; _endsAt = 0;
                        notify();
                    }
                });
            } else {
                _endsAt = 0;
            }
            notify();
        },
        cancel() {
            _cancel();
            _minutes = 0; _endsAt = 0;
            notify();
        },
    };
})();

const fmt = (ms) => {
    if (!ms || ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ArtPanel
// ─────────────────────────────────────────────────────────────────────────────
const BAR_HEIGHTS = [4, 8, 14, 9, 18, 12, 7, 16, 10, 5, 13, 17, 8, 11, 6, 14];

const ArtPanel = ({ surahArabic, surahName, surahId, playingAyah, isPlaying }) => {
    const barAnims = useRef(BAR_HEIGHTS.map(() => new Animated.Value(0.2))).current;
    const loopRefs = useRef([]);

    useEffect(() => {
        loopRefs.current.forEach(l => l?.stop?.());
        if (isPlaying) {
            loopRefs.current = barAnims.map((anim, i) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(anim, { toValue: 1,    duration: 350 + i * 45, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
                        Animated.timing(anim, { toValue: 0.22, duration: 300 + i * 38, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
                    ])
                )
            );
            loopRefs.current.forEach((loop, i) => setTimeout(() => loop.start(), i * 28));
        } else {
            barAnims.forEach(anim =>
                Animated.timing(anim, { toValue: 0.15, duration: 500, useNativeDriver: true }).start()
            );
        }
        return () => loopRefs.current.forEach(l => l?.stop?.());
    }, [isPlaying]);

    return (
        <View style={ap.container}>
            {BG_IMAGE && (
                <Animated.Image
                    source={BG_IMAGE}
                    style={ap.bgImage}
                    resizeMode="cover"
                />
            )}
            <LinearGradient
                colors={['rgba(8,14,24,0.42)', 'rgba(8,14,24,0.90)']}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <LinearGradient
                colors={['rgba(201,168,76,0.06)', 'transparent']}
                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <View style={ap.textLayer} pointerEvents="none">
                <Text style={ap.arabicName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>
                    {surahArabic || 'القُرْآن'}
                </Text>
                <View style={ap.divider}>
                    <View style={ap.dividerLine} />
                    <View style={ap.dividerDot} />
                    <View style={ap.dividerLine} />
                </View>
                {surahName ? (
                    <Text style={ap.surahSub}>{surahName}  ·  Surah {surahId}</Text>
                ) : null}
                {playingAyah != null && (
                    <View style={ap.ayahPill}>
                        <View style={[ap.ayahDot, isPlaying && ap.ayahDotActive]} />
                        <Text style={ap.ayahPillText}>Ayah {playingAyah}</Text>
                    </View>
                )}
                {/* Wave — centered below pill, in layout flow */}
                <View style={ap.waveRow}>
                    {BAR_HEIGHTS.map((h, i) => (
                        <Animated.View
                            key={i}
                            style={[ap.bar, {
                                height: h,
                                transform: [{ scaleY: barAnims[i] }],
                                opacity:   barAnims[i].interpolate({ inputRange: [0.15, 1], outputRange: [0.15, 0.82], extrapolate: 'clamp' }),
                            }]}
                        />
                    ))}
                </View>
            </View>
        </View>
    );
};

const ap = StyleSheet.create({
    container: {
        width: ART_SIZE, height: ART_SIZE * 0.75, borderRadius: 28,
        overflow: 'hidden', alignSelf: 'center',
        borderWidth: 1, borderColor: GOLD_B,
        shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.65, shadowRadius: 36, elevation: 22,
    },
    bgImage:   { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    textLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    arabicName: {
        fontSize: 56, color: '#fff', fontFamily: 'Uthmanic', lineHeight: 90,
        textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 18,
        textAlign: 'center', alignSelf: 'stretch',
    },
    divider:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 6 },
    dividerLine: { flex: 1, height: 1, backgroundColor: GOLD_B, maxWidth: 56 },
    dividerDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD },
    surahSub:    { color: 'rgba(240,234,214,0.70)', fontSize: 13, letterSpacing: 1.4 },
    ayahPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: 'rgba(8,14,24,0.72)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: GOLD_M },
    ayahDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: MUTED },
    ayahDotActive:{ backgroundColor: GREEN },
    ayahPillText:{ color: GOLD, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
    waveRow:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, marginTop: 14, height: 20 },
    bar:         { width: 3, backgroundColor: GREEN, borderRadius: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Seeker (Smoother Animations & Peek-to-Move behavior)
// ─────────────────────────────────────────────────────────────────────────────
const THUMB_R = 9;
const HIT_H   = 48;
const TRACK_H = 4;
const TRACK_TOP = (HIT_H - TRACK_H) / 2;

const Seeker = ({ positionMs, durationMs, onSeek }) => {
    const trackWidthRef = useRef(W - 56);
    const trackXRef     = useRef(0);
    const [trackW, setTrackW] = useState(W - 56);
    const isDragging  = useRef(false);
    const durationRef = useRef(durationMs);
    useEffect(() => { durationRef.current = durationMs; }, [durationMs]);

    const pctAnim   = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const trackScaleY = useRef(new Animated.Value(1)).current;
    const [scrubMs, setScrubMs] = useState(null);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const toFrac = useCallback((px) => clamp((px - trackXRef.current) / trackWidthRef.current, 0, 1), []);

    const playPct = durationMs > 0 ? clamp(positionMs / durationMs, 0, 1) : 0;
    useEffect(() => {
        if (isDragging.current) return;
        Animated.timing(pctAnim, {
            toValue: playPct,
            duration: 160,
            useNativeDriver: false,
            easing: Easing.out(Easing.quad)
        }).start();
    }, [playPct]);

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: (e) => {
            isDragging.current = true;
            pctAnim.stopAnimation();
            const f = toFrac(e.nativeEvent.pageX);
            pctAnim.setValue(f);
            setScrubMs(f * durationRef.current);
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1.6, friction: 6, tension: 120, useNativeDriver: false }),
                Animated.timing(trackScaleY, { toValue: 1.8, duration: 150, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
            ]).start();
        },
        onPanResponderMove: (e) => {
            const f = toFrac(e.nativeEvent.pageX);
            pctAnim.setValue(f);
            setScrubMs(f * durationRef.current);
        },
        onPanResponderRelease: (e) => {
            const f = toFrac(e.nativeEvent.pageX);
            isDragging.current = false;
            setScrubMs(null);
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 140, useNativeDriver: false }),
                Animated.timing(trackScaleY, { toValue: 1, duration: 150, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
            ]).start();
            if (durationRef.current > 0) onSeek(clamp(f, 0, 1) * durationRef.current);
        },
        onPanResponderTerminate: () => {
            isDragging.current = false;
            setScrubMs(null);
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 140, useNativeDriver: false }),
                Animated.timing(trackScaleY, { toValue: 1, duration: 150, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
            ]).start();
        },
    })).current;

    const fillWidth = pctAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
    const thumbX    = pctAnim.interpolate({ inputRange: [0, 1], outputRange: [0, trackW - THUMB_R * 2], extrapolate: 'clamp' });
    const displayMs = scrubMs != null ? scrubMs : positionMs;

    return (
        <View style={sk.wrap}>
            {scrubMs != null && (
                <View style={sk.bubble}><Text style={sk.bubbleText}>{fmt(scrubMs)}</Text></View>
            )}
            <View
                style={sk.hitArea}
                onLayout={e => { const w = e.nativeEvent.layout.width; trackWidthRef.current = w; setTrackW(w); }}
                ref={r => { if (r) r.measure((_x, _y, _w, _h, px) => { trackXRef.current = px; }); }}
                {...pan.panHandlers}
            >
                <Animated.View style={[sk.track, { transform: [{ scaleY: trackScaleY }] }]}>
                    <Animated.View style={[sk.fill, { width: fillWidth }]} />
                </Animated.View>
                <Animated.View style={[sk.thumbWrap, { transform: [{ translateX: thumbX }] }]}>
                    <Animated.View style={[sk.thumb, { transform: [{ scale: scaleAnim }] }]} />
                </Animated.View>
            </View>
            <View style={sk.labels}>
                <Text style={[sk.time, scrubMs != null && sk.timeScrub]}>{fmt(displayMs)}</Text>
                <Text style={sk.time}>{fmt(durationMs)}</Text>
            </View>
        </View>
    );
};

const sk = StyleSheet.create({
    wrap:       { paddingHorizontal: 28, marginTop: 8 },
    bubble:     { alignSelf: 'center', backgroundColor: CARD, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4, borderWidth: 1, borderColor: GOLD_M },
    bubbleText: { color: GOLD, fontSize: 12, fontWeight: '700' },
    hitArea:    { height: HIT_H, justifyContent: 'center' },
    track:      { height: TRACK_H, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: TRACK_H / 2, overflow: 'hidden' },
    fill:       { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: GREEN, borderRadius: TRACK_H / 2 },
    thumbWrap:  { position: 'absolute', top: TRACK_TOP - THUMB_R + TRACK_H / 2, left: 0, width: THUMB_R * 2, height: THUMB_R * 2 },
    thumb:      { width: THUMB_R * 2, height: THUMB_R * 2, borderRadius: THUMB_R, backgroundColor: '#fff', shadowColor: GREEN, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 10 },
    labels:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    time:       { color: MUTED, fontSize: 11, fontWeight: '600' },
    timeScrub:  { color: GOLD },
});

// ─────────────────────────────────────────────────────────────────────────────
// SeekButton — 10 s forward / back. Icon stacked ABOVE label — no overlap.
// ─────────────────────────────────────────────────────────────────────────────
const SeekButton = ({ direction, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const isBack = direction === 'back';

    const handle = () => {
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.80, duration: 75, useNativeDriver: true }),
            Animated.spring(scale,  { toValue: 1,    speed: 22, bounciness: 7, useNativeDriver: true }),
        ]).start();
        onPress();
    };

    return (
        <TouchableOpacity onPress={handle} activeOpacity={0.75} style={ctrl.seekOuter}>
            <Animated.View style={[ctrl.seekInner, { transform: [{ scale }] }]}>
                <Ionicons
                    name="refresh-outline"
                    size={26}
                    color={TEXT_D}
                    style={isBack ? { transform: [{ scaleX: -1 }] } : undefined}
                />
                <Text style={ctrl.seekLabel}>10s</Text>
            </Animated.View>
        </TouchableOpacity>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PlayButton
// ─────────────────────────────────────────────────────────────────────────────
const PlayButton = ({ isPlaying, isLoading, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const handle = () => {
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.88, duration: 90, useNativeDriver: true }),
            Animated.spring(scale,  { toValue: 1,    speed: 14, bounciness: 9, useNativeDriver: true }),
        ]).start();
        onPress();
    };
    return (
        <TouchableOpacity onPress={handle} activeOpacity={0.85} disabled={isLoading}>
            <Animated.View style={[ctrl.playBtn, isLoading && ctrl.playBtnLoading, { transform: [{ scale }] }]}>
                {isLoading
                    ? <ActivityIndicator size="small" color={DARK} />
                    : <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={DARK} style={!isPlaying && { marginLeft: 3 }} />
                }
            </Animated.View>
        </TouchableOpacity>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// SkipButton
// ─────────────────────────────────────────────────────────────────────────────
const SkipButton = ({ direction, onPress, disabled }) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7}
                      style={[ctrl.skipBtn, disabled && { opacity: 0.3 }]}>
        <Ionicons name={direction === 'prev' ? 'play-skip-back' : 'play-skip-forward'} size={24} color={TEXT} />
    </TouchableOpacity>
);

const ctrl = StyleSheet.create({
    // Seek 10 s ─ icon above, label below — both centred, no overlap
    seekOuter: { alignItems: 'center', justifyContent: 'center', width: 54, height: 60 },
    seekInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
    seekLabel: { color: MUTED, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    // Play
    playBtn: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
        shadowColor: GREEN, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55, shadowRadius: 20, elevation: 16,
    },
    playBtnLoading: { backgroundColor: MUTED },

    // Skip
    skipBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});

// ─────────────────────────────────────────────────────────────────────────────
// ActionBtn
// ─────────────────────────────────────────────────────────────────────────────
const ActionBtn = ({ icon, color, onPress, badge }) => (
    <TouchableOpacity style={ac.btn} onPress={onPress} activeOpacity={0.7}>
        <Ionicons name={icon} size={22} color={color ?? TEXT_D} />
        {badge ? (
            <View style={[ac.badge, badge.bg && { backgroundColor: badge.bg }]}>
                <Text style={[ac.badgeText, badge.tc && { color: badge.tc }]}>{badge.label}</Text>
            </View>
        ) : null}
    </TouchableOpacity>
);
const ac = StyleSheet.create({
    btn:       { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
    badge:     { position: 'absolute', top: 4, right: 2, backgroundColor: GOLD, borderRadius: 7, minWidth: 14, paddingHorizontal: 3, paddingVertical: 1, alignItems: 'center' },
    badgeText: { color: DARK, fontSize: 7, fontWeight: '900' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sleep Timer Sheet  (redesigned — no Off button, countdown display)
// ─────────────────────────────────────────────────────────────────────────────
const fmtCountdown = (endsAt) => {
    if (!endsAt || endsAt <= 0) return null;
    if (endsAt === -1) return 'ends with surah';
    const rem = Math.max(0, endsAt - Date.now());
    const totalSec = Math.ceil(rem / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m remaining`;
    if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s remaining`;
    return `${s}s remaining`;
};

const SleepTimerSheet = ({ visible, sleepMinutes, sleepEndsAt, onSelect, onCancel, onClose }) => {
    const insets = useSafeAreaInsets();
    const [tick, setTick] = useState(0);

    // Tick every second while visible so countdown refreshes
    useEffect(() => {
        if (!visible || !sleepEndsAt || sleepEndsAt <= 0) return;
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [visible, sleepEndsAt]);

    const isActive   = sleepMinutes !== 0;
    const countdown  = isActive ? fmtCountdown(sleepEndsAt) : null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={st.overlay}>
                <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={[st.sheet, { paddingBottom: insets.bottom + 28 }]}>
                    <View style={st.handle} />

                    {/* Header */}
                    <View style={st.headerRow}>
                        <View style={st.headerIcon}>
                            <Ionicons name="moon" size={18} color={GOLD} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={st.title}>Sleep Timer</Text>
                            <Text style={st.sub}>Audio will pause automatically</Text>
                        </View>
                        {isActive && (
                            <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
                                <Ionicons name="close" size={14} color={DARK} />
                                <Text style={st.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Active countdown banner */}
                    {isActive && countdown && (
                        <View style={st.countdownBanner}>
                            <Ionicons name="timer-outline" size={14} color={GOLD} />
                            <Text style={st.countdownText}>{countdown}</Text>
                        </View>
                    )}

                    {/* Divider */}
                    <View style={st.divider} />
                    <Text style={st.sectionLabel}>SET TIMER</Text>

                    {/* Options grid */}
                    <View style={st.grid}>
                        {SLEEP_OPTS.map(opt => {
                            const isSel = sleepMinutes === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[st.opt, isSel && st.optA]}
                                    onPress={() => onSelect(opt.value)}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[st.optVal, isSel && st.optValA]}>{opt.label}</Text>
                                    <Text style={[st.optSub, isSel && st.optSubA]}>{opt.sub}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
};
const st = StyleSheet.create({
    overlay:       { flex: 1, justifyContent: 'flex-end' },
    backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.70)' },
    sheet:         { backgroundColor: CARD, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderColor: BORDER },
    handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', alignSelf: 'center', marginBottom: 18 },

    headerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    headerIcon:    { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD_L, borderWidth: 1, borderColor: GOLD_M, alignItems: 'center', justifyContent: 'center' },
    title:         { color: TEXT, fontSize: 16, fontWeight: '800' },
    sub:           { color: MUTED, fontSize: 12, marginTop: 2 },
    cancelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#C0392B', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    cancelText:    { color: DARK, fontSize: 12, fontWeight: '800' },

    countdownBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GOLD_L, borderRadius: 12, borderWidth: 1, borderColor: GOLD_M, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
    countdownText:   { color: GOLD, fontSize: 13, fontWeight: '700' },

    divider:       { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 14 },
    sectionLabel:  { color: MUTED, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 12 },

    grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: {
        width: (W - 40 - 32) / 5,   // 5 per row
        paddingVertical: 14, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER,
    },
    optA:          { backgroundColor: GOLD, borderColor: GOLD },
    optVal:        { color: TEXT, fontSize: 17, fontWeight: '800' },
    optValA:       { color: DARK },
    optSub:        { color: MUTED, fontSize: 10, marginTop: 2 },
    optSubA:       { color: 'rgba(12,21,32,0.6)', fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// WordExpandPopup — blurred overlay showing full word meaning
// ─────────────────────────────────────────────────────────────────────────────
const WordExpandPopup = ({ words, index, onClose, onNavigate }) => {
    const scaleAnim = useRef(new Animated.Value(0.82)).current;
    const opacAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, speed: 22, bounciness: 8, useNativeDriver: true }),
            Animated.timing(opacAnim,  { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        ]).start();
    }, []);

    // Slide animation when navigating prev/next
    const slideAnim = useRef(new Animated.Value(0)).current;
    const navigateTo = (newIndex) => {
        Animated.sequence([
            Animated.timing(slideAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
        ]).start();
        onNavigate(newIndex);
    };

    const dismiss = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 0.82, speed: 28, bounciness: 0, useNativeDriver: true }),
            Animated.timing(opacAnim,  { toValue: 0, duration: 140, useNativeDriver: true }),
        ]).start(() => onClose());
    };

    const word     = words[index];
    const arabic   = word?.text_uthmani ?? word?.arabic ?? word?.char ?? '';
    const translit = word?.transliteration?.text ?? word?.transliteration ?? '';
    const meaning  = word?.translation?.text ?? word?.translation ?? word?.en_translation ?? '';

    return (
        <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
            <Pressable style={wp.backdrop} onPress={dismiss}>
                <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
            </Pressable>
            <Animated.View
                style={[wp.card, { opacity: opacAnim, transform: [{ scale: scaleAnim }, { translateY: slideAnim }] }]}
                pointerEvents="box-none"
            >
                {/* Close button */}
                <TouchableOpacity style={wp.closeBtn} onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={24} color={MUTED} />
                </TouchableOpacity>

                {/* Word counter badge */}
                <View style={wp.badge}>
                    <Text style={wp.badgeText}>Word {index + 1} of {words.length}</Text>
                </View>

                {/* Arabic */}
                {!!arabic && (
                    <Text style={wp.arabic}>{arabic}</Text>
                )}

                {/* Divider */}
                <View style={wp.divider}>
                    <View style={wp.dividerLine} />
                    <View style={wp.dividerDot} />
                    <View style={wp.dividerLine} />
                </View>

                {/* Transliteration */}
                {!!translit && (
                    <Text style={wp.translit}>{translit}</Text>
                )}

                {/* Full meaning */}
                {!!meaning && (
                    <View style={wp.meaningWrap}>
                        <Text style={wp.meaningLabel}>MEANING</Text>
                        <Text style={wp.meaning}>{meaning}</Text>
                    </View>
                )}

                {/* Prev / Next navigation */}
                <View style={wp.nav}>
                    <TouchableOpacity
                        style={[wp.navBtn, index === 0 && wp.navBtnOff]}
                        onPress={() => navigateTo(index - 1)}
                        disabled={index === 0}
                    >
                        <Ionicons name="chevron-back" size={18} color={index === 0 ? MUTED : GOLD} />
                        <Text style={[wp.navText, index === 0 && { color: MUTED }]}>Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[wp.navBtn, index === words.length - 1 && wp.navBtnOff]}
                        onPress={() => navigateTo(index + 1)}
                        disabled={index === words.length - 1}
                    >
                        <Text style={[wp.navText, index === words.length - 1 && { color: MUTED }]}>Next</Text>
                        <Ionicons name="chevron-forward" size={18} color={index === words.length - 1 ? MUTED : GOLD} />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </Modal>
    );
};

const wp = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(4,8,16,0.55)',
    },
    card: {
        position: 'absolute',
        top: '50%',
        left: 28,
        right: 28,
        transform: [{ translateY: -150 }],
        backgroundColor: CARD,
        borderRadius: 26,
        padding: 24,
        paddingTop: 20,
        borderWidth: 1,
        borderColor: GOLD_M,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.7,
        shadowRadius: 32,
        elevation: 28,
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
    },
    badge: {
        backgroundColor: GOLD_L,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: GOLD_M,
        marginBottom: 16,
        marginTop: 4,
    },
    badgeText: { color: GOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    arabic: {
        fontSize: 44,
        color: TEXT,
        fontFamily: 'Uthmanic',
        lineHeight: 72,
        textAlign: 'center',
        marginTop: 4,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 10,
        alignSelf: 'stretch',
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: GOLD_B },
    dividerDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD },
    translit: {
        color: MUTED,
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 14,
        letterSpacing: 0.4,
    },
    meaningWrap: {
        backgroundColor: DARK,
        borderRadius: 14,
        padding: 14,
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 16,
    },
    meaningLabel: {
        color: GOLD,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.8,
        marginBottom: 6,
    },
    meaning: {
        color: TEXT_D,
        fontSize: 15,
        lineHeight: 24,
        textAlign: 'center',
    },
    nav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    navBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: GOLD_L,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: GOLD_M,
    },
    navBtnOff: { opacity: 0.35 },
    navText:   { color: GOLD, fontWeight: '700', fontSize: 13 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Info Sheet (Word-by-Word + Tafsir)
// ─────────────────────────────────────────────────────────────────────────────
const InfoSheet = ({ visible, surahId, ayahObj, onClose }) => {
    const insets = useSafeAreaInsets();
    const [tab, setTab]                     = useState('words');
    const [words, setWords]                 = useState([]);
    const [wordsLoading, setWordsLoading]   = useState(false);
    const [wordsError, setWordsError]       = useState(null);
    const [tafsirText, setTafsirText]       = useState(null);
    const [tafsirLoading, setTafsirLoading] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState(null);

    const num        = ayahObj ? ayahNum(ayahObj) : null;
    const arabicText = ayahObj?.arabic ?? ayahObj?.arabic_text ?? ayahObj?.text_uthmani ?? '';

    useEffect(() => {
        if (!visible || !ayahObj || !num) { setWords([]); setTafsirText(null); setWordsError(null); return; }
        setTab('words'); loadWords(); loadTafsir();
    }, [visible, ayahObj]);

    // Close word popup when sheet closes
    useEffect(() => { if (!visible) setExpandedIndex(null); }, [visible]);

    const loadWords = async () => {
        setWordsLoading(true); setWordsError(null); setWords([]);
        try {
            const json = await getAyahWords(surahId, num);
            const raw  = json?.data?.words ?? json?.data ?? [];
            const list = Array.isArray(raw) ? raw : [];
            if (!list.length) setWordsError('No word-by-word data for this ayah.');
            else setWords(list);
        } catch { setWordsError('Could not load word data.'); }
        finally { setWordsLoading(false); }
    };

    const loadTafsir = async () => {
        setTafsirLoading(true); setTafsirText(null);
        try {
            const json    = await getAyahTafsir(surahId, num, 'muyassar');
            const content = json?.data?.tafsir ?? json?.data?.text ?? json?.data ?? null;
            setTafsirText(typeof content === 'string' ? content : content?.text ?? null);
        } catch { setTafsirText('__error__'); }
        finally { setTafsirLoading(false); }
    };

    const TABS = [
        { key: 'words',  label: 'Word by Word', icon: 'text-outline' },
        { key: 'tafsir', label: 'Tafsir',        icon: 'book-outline' },
    ];

    return (
        <>
            <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
                <View style={inf.overlay}>
                    <TouchableOpacity style={inf.backdrop} activeOpacity={1} onPress={onClose} />
                    <View style={[inf.sheet, { paddingBottom: insets.bottom + 16 }]}>
                        <View style={inf.handle} />
                        <View style={inf.header}>
                            <View style={{ flex: 1 }}>
                                <Text style={inf.headerTitle}>Ayah {surahId}:{num}</Text>
                                {!!arabicText && <Text style={inf.headerArabic} numberOfLines={1}>{arabicText}</Text>}
                            </View>
                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="close-circle" size={26} color={MUTED} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={inf.tabs}>
                            {TABS.map(t => (
                                <TouchableOpacity key={t.key} style={[inf.tab, tab === t.key && inf.tabA]} onPress={() => setTab(t.key)}>
                                    <Ionicons name={t.icon} size={13} color={tab === t.key ? GOLD : MUTED} />
                                    <Text style={[inf.tabText, tab === t.key && inf.tabTextA]}>{t.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <ScrollView style={inf.scroll} showsVerticalScrollIndicator={false}>
                            <View style={{ paddingBottom: 24 }}>
                                {tab === 'words' && (
                                    wordsLoading ? <View style={inf.center}><ActivityIndicator color={GOLD} /><Text style={inf.hint}>Loading…</Text></View> :
                                        wordsError ? <View style={inf.center}><Text style={inf.emptyText}>{wordsError}</Text></View> :
                                            <View style={inf.wordGrid}>
                                                {words.map((w, i) => {
                                                    const meaning = w.translation?.text ?? w.translation ?? w.en_translation ?? '';
                                                    return (
                                                        <TouchableOpacity
                                                            key={i}
                                                            style={inf.wordCell}
                                                            onPress={() => setExpandedIndex(i)}
                                                            activeOpacity={0.65}
                                                        >
                                                            <Text style={inf.wordArabic}>{w.text_uthmani ?? w.arabic ?? w.char ?? ''}</Text>
                                                            <Text style={inf.wordTranslit} numberOfLines={1}>{w.transliteration?.text ?? w.transliteration ?? ''}</Text>
                                                            <Text style={inf.wordMeaning} numberOfLines={2}>{meaning}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                )}
                                {tab === 'tafsir' && (
                                    tafsirLoading ? <View style={inf.center}><ActivityIndicator color={GOLD} /></View> :
                                        (!tafsirText || tafsirText === '__error__') ? <View style={inf.center}><Text style={inf.emptyText}>No tafsir available.</Text></View> :
                                            <Text style={inf.tafsirText}>{tafsirText}</Text>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Word expand popup — rendered outside the sheet Modal so it sits above everything */}
            {expandedIndex !== null && (
                <WordExpandPopup
                    words={words}
                    index={expandedIndex}
                    onClose={() => setExpandedIndex(null)}
                    onNavigate={(i) => setExpandedIndex(i)}
                />
            )}
        </>
    );
};
const inf = StyleSheet.create({
    overlay:      { flex: 1, justifyContent: 'flex-end' },
    backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
    sheet:        { backgroundColor: CARD, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 10, maxHeight: H * 0.88, borderTopWidth: 1, borderColor: BORDER },
    handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: MUTED, alignSelf: 'center', marginBottom: 16 },
    header:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
    headerTitle:  { color: GOLD, fontSize: 16, fontWeight: '800' },
    headerArabic: { color: TEXT_D, fontSize: 14, fontFamily: 'Uthmanic', lineHeight: 30, marginTop: 2 },
    tabs:         { flexDirection: 'row', gap: 8, paddingBottom: 12, paddingRight: 16 },
    tab:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER },
    tabA:         { backgroundColor: GOLD_L, borderColor: GOLD_M },
    tabText:      { color: MUTED, fontSize: 12, fontWeight: '600' },
    tabTextA:     { color: GOLD },
    scroll:       { maxHeight: H * 0.55 },
    center:       { paddingVertical: 40, alignItems: 'center', gap: 12 },
    hint:         { color: MUTED, fontSize: 12, marginTop: 6 },
    emptyText:    { color: TEXT_D, fontSize: 13, textAlign: 'center', paddingHorizontal: 16 },
    wordGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
    wordCell:     { backgroundColor: DARK, borderRadius: 14, padding: 12, alignItems: 'center', minWidth: 80, maxWidth: 120, borderWidth: 1, borderColor: BORDER, flex: 1 },
    wordArabic:   { fontSize: 22, color: TEXT, fontFamily: 'Uthmanic', lineHeight: 48, marginBottom: 6, textAlign: 'center' },
    wordTranslit: { color: MUTED, fontSize: 11, fontStyle: 'italic', marginBottom: 4, textAlign: 'center' },
    wordMeaning:  { color: TEXT_D, fontSize: 11, textAlign: 'center', lineHeight: 16 },
    tafsirText:   { color: TEXT_D, fontSize: 14, lineHeight: 26 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Reciter Sheet
// ─────────────────────────────────────────────────────────────────────────────
const ReciterSheet = ({ visible, currentReciter, onSelect, onClose }) => {
    const insets = useSafeAreaInsets();
    const [reciters, setReciters] = useState([]);
    const [loading, setLoading]   = useState(true);

    useEffect(() => {
        if (!visible) return;

        let cancelled = false;

        const loadReciters = async () => {
            setLoading(true);
            try {
                const { getReciters } = await import('../../src/services/quranApi');
                const json = await getReciters();

                console.log(
                    '[Player Reciters] API response:',
                    JSON.stringify(json, null, 2)
                );

                // Quran Foundation proxy returns: { reciters: [...] }
                // Keep compatibility with older wrapped responses as well.
                const list =
                    json?.reciters ??
                    json?.data?.reciters ??
                    (Array.isArray(json?.data) ? json.data : []);

                if (!cancelled) {
                    setReciters(Array.isArray(list) ? list : []);
                }
            } catch (e) {
                console.error('[Player Reciters] Failed to load:', e);
                if (!cancelled) setReciters([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadReciters();

        return () => {
            cancelled = true;
        };
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={rs.overlay}>
                <TouchableOpacity style={rs.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={[rs.sheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={rs.handle} />
                    <View style={rs.headerRow}>
                        <Text style={rs.title}>Change Reciter</Text>
                        <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={24} color={MUTED} /></TouchableOpacity>
                    </View>
                    {loading
                        ? <View style={rs.center}><ActivityIndicator color={GOLD} /></View>
                        : (
                            <ScrollView style={{ maxHeight: H * 0.5 }} showsVerticalScrollIndicator={false}>
                                {reciters.map((r, i) => {
                                    const isSel = (currentReciter?.id != null && r.id != null)
                                        ? currentReciter.id === r.id
                                        : currentReciter?.name === r.name;
                                    return (
                                        <TouchableOpacity key={r.id ?? i} style={[rs.row, isSel && rs.rowA]} onPress={() => onSelect(r)}>
                                            <Ionicons name={isSel ? 'mic' : 'mic-outline'} size={16} color={isSel ? DARK : GOLD} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[rs.rowName, isSel && rs.rowNameA]} numberOfLines={1}>
                                                    {r.name ?? r.translated_name?.name ?? `Reciter ${r.id}`}
                                                </Text>
                                                {!!(r.style?.name || r.style?.translated_name?.name || r.qirat?.name) && (
                                                    <Text style={[rs.rowMeta, isSel && rs.rowMetaA]} numberOfLines={1}>
                                                        {[
                                                            r.style?.name ?? r.style?.translated_name?.name,
                                                            r.qirat?.name,
                                                        ].filter(Boolean).join(' · ')}
                                                    </Text>
                                                )}
                                            </View>
                                            {isSel && <Ionicons name="checkmark-circle" size={20} color={DARK} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )
                    }
                </View>
            </View>
        </Modal>
    );
};
const rs = StyleSheet.create({
    overlay:   { flex: 1, justifyContent: 'flex-end' },
    backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
    sheet:     { backgroundColor: CARD, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: BORDER },
    handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: MUTED, alignSelf: 'center', marginBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title:     { color: TEXT, fontSize: 17, fontWeight: '800' },
    center:    { height: 100, alignItems: 'center', justifyContent: 'center' },
    row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: CARD2, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
    rowA:      { backgroundColor: GOLD, borderColor: GOLD },
    rowName:   { color: TEXT, fontSize: 14, fontWeight: '700' },
    rowNameA:  { color: DARK },
    rowMeta:   { color: MUTED, fontSize: 11, marginTop: 2 },
    rowMetaA:  { color: 'rgba(12,21,32,0.55)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main PlayerScreen
// ─────────────────────────────────────────────────────────────────────────────
export default function PlayerScreen() {
    const insets = useSafeAreaInsets();
    const [audio, setAudio]             = useState(AudioStore.getState());
    const [sleepMin, setSleepMin]       = useState(SleepManager.getMinutes());
    const [sleepEndsAt, setSleepEndsAt] = useState(0);
    const [showSleep, setShowSleep]     = useState(false);
    const [showInfo, setShowInfo]       = useState(false);
    const [showReciter, setShowReciter] = useState(false);

    useEffect(() => { const unsub = AudioStore.subscribe(setAudio); return unsub; }, []);
    // Subscribe to SleepManager — persists across navigation, no cleanup needed on unmount
    useEffect(() => {
        return SleepManager.subscribe((min, endsAt) => {
            setSleepMin(min);
            setSleepEndsAt(endsAt);
        });
    }, []);

    const { surahId, surahName, surahArabic, ayahs, playingAyah, isPlaying, isLoading, positionMs, durationMs, speed, reciter, repeat } = audio;
    const currentAyahObj = ayahs.find(a => ayahNum(a) === playingAyah) ?? null;

    const handleSpeedCycle = useCallback(() => {
        const idx = SPEEDS.indexOf(speed);
        AudioStore.setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
    }, [speed]);

    const cycleRepeat = useCallback(() => {
        const modes = ['none', 'surah'];
        AudioStore.setRepeat(modes[(modes.indexOf(repeat) + 1) % modes.length]);
    }, [repeat]);

    const handleSleepSelect = useCallback((minutes) => {
        SleepManager.set(minutes);
        setShowSleep(false);
    }, []);

    const handleSleepCancel = useCallback(() => {
        SleepManager.cancel();
    }, []);

    const handleReciterSelect = useCallback(async (r) => {
        if (!r?.id) {
            console.warn('[Quran Player] Invalid reciter:', r);
            return;
        }

        const obj = {
            id: Number(r.id),
            name: r.name ?? r.translated_name?.name ?? `Reciter ${r.id}`,
            style: r.style ?? null,
            language: r.language ?? null,
            qirat: r.qirat ?? null,
            source: 'quran-foundation',
        };

        console.log('[Quran Player] Selected reciter:', obj);

        try {
            // AudioStore.changeReciter() handles the existing native player,
            // restores the current Surah/Ayah and preserves play/pause state.
            await AudioStore.changeReciter(obj);
        } catch (e) {
            console.error('[Quran Player] reciter change:', e);
        }

        setShowReciter(false);
    }, []);

    const goToSurah   = () => { if (surahId) router.push(`/quran/surah/${surahId}`); else router.back(); };
    const repeatColor = repeat === 'surah' ? GOLD : MUTED;
    const sleepLabel  = sleepMin !== 0 ? (sleepMin === -1 ? 'End' : `${sleepMin}m`) : null;

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <LinearGradient colors={['#0D1822', '#080E18', '#060C14']} style={StyleSheet.absoluteFill} />

            {/* Top bar */}
            <View style={[s.topBar, { paddingTop: insets.top + 6 }]}>
                <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-down" size={22} color={GOLD} />
                </TouchableOpacity>
                <Text style={s.nowPlaying}>NOW PLAYING</Text>
                <TouchableOpacity style={s.iconBtn} onPress={goToSurah}>
                    <Ionicons name="list" size={20} color={GOLD} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false} bounces={false}>

                {/* Artwork */}
                <View style={s.artWrap}>
                    <ArtPanel surahArabic={surahArabic} surahName={surahName} surahId={surahId} playingAyah={playingAyah} isPlaying={isPlaying} />
                </View>

                {/* Title + reciter */}
                <View style={s.infoRow}>
                    <View style={s.infoLeft}>
                        <Text style={s.titleLine} numberOfLines={1}>{surahName || (surahId ? `Surah ${surahId}` : 'Nothing Playing')}</Text>
                        <TouchableOpacity onPress={() => setShowReciter(true)} activeOpacity={0.7}>
                            <Text style={s.reciterLine} numberOfLines={1}>{reciter?.name ?? 'Tap to select reciter…'}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.reciterBtn} onPress={() => setShowReciter(true)}>
                        <Ionicons name="mic-outline" size={17} color={GOLD} />
                    </TouchableOpacity>
                </View>

                {/* Seeker */}
                <Seeker positionMs={positionMs} durationMs={durationMs} onSeek={ms => AudioStore.seekTo(ms)} />

                {/* ── Action strip (tafsir/words/timer/loop/speed) ── */}
                <View style={s.actionStrip}>
                    <ActionBtn icon="book-outline" color={currentAyahObj ? TEXT_D : MUTED} onPress={() => { if (currentAyahObj) setShowInfo(true); }} />
                    <ActionBtn icon="timer-outline" color={sleepMin !== 0 ? GOLD : MUTED} onPress={() => setShowSleep(true)} badge={sleepMin !== 0 ? { label: sleepLabel } : null} />
                    <ActionBtn icon={repeat === 'none' ? 'repeat-outline' : 'repeat'} color={repeatColor} onPress={cycleRepeat} />
                    <TouchableOpacity style={s.speedPill} onPress={handleSpeedCycle} activeOpacity={0.7}>
                        <Text style={s.speedText}>{speed}×</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Controls ── */}
                <View style={s.controls}>
                    <SkipButton direction="prev" onPress={() => AudioStore.prev()} />
                    <SeekButton direction="back"    onPress={() => AudioStore.seekTo(Math.max(0, positionMs - 10000))} />
                    <PlayButton isPlaying={isPlaying} isLoading={isLoading} onPress={() => AudioStore.togglePlayPause()} />
                    <SeekButton direction="forward"  onPress={() => AudioStore.seekTo(Math.min(durationMs || 999999, positionMs + 10000))} />
                    <SkipButton direction="next" onPress={() => AudioStore.next()} />
                </View>

            </ScrollView>

            {/* Fixed surah nav bar */}
            <View style={[s.surahNav, { paddingBottom: insets.bottom + 8 }]}>
                <TouchableOpacity style={[s.surahNavBtn, (!surahId || surahId <= 1) && s.surahNavOff]} onPress={() => AudioStore.prevSurah()} disabled={!surahId || surahId <= 1}>
                    <Ionicons name="chevron-back" size={14} color={surahId && surahId > 1 ? GOLD : MUTED} />
                    <Text style={[s.surahNavText, (!surahId || surahId <= 1) && { color: MUTED }]}>Prev Surah</Text>
                </TouchableOpacity>
                <View>
                    {surahId != null && <Text style={s.surahNavCount}>{surahId} / 114</Text>}
                </View>
                <TouchableOpacity style={[s.surahNavBtn, (!surahId || surahId >= 114) && s.surahNavOff]} onPress={() => AudioStore.nextSurah()} disabled={!surahId || surahId >= 114}>
                    <Text style={[s.surahNavText, (!surahId || surahId >= 114) && { color: MUTED }]}>Next Surah</Text>
                    <Ionicons name="chevron-forward" size={14} color={surahId && surahId < 114 ? GOLD : MUTED} />
                </TouchableOpacity>
            </View>

            {/* Sheets */}
            <SleepTimerSheet visible={showSleep} sleepMinutes={sleepMin} sleepEndsAt={sleepEndsAt} onSelect={handleSleepSelect} onCancel={handleSleepCancel} onClose={() => setShowSleep(false)} />
            <InfoSheet visible={showInfo} surahId={surahId} ayahObj={currentAyahObj} onClose={() => setShowInfo(false)} />
            <ReciterSheet visible={showReciter} currentReciter={reciter} onSelect={handleReciterSelect} onClose={() => setShowReciter(false)} />
        </View>
    );
}

const s = StyleSheet.create({
    root:  { flex: 1 },
    scroll:{ paddingTop: 4 },
    topBar:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
    iconBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD_M },
    nowPlaying:{ color: MUTED, fontSize: 10, letterSpacing: 2.2, fontWeight: '800' },
    artWrap:{ marginHorizontal: 24, marginTop: 4, marginBottom: 4 },
    infoRow:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, marginTop: 18, gap: 12 },
    infoLeft:{ flex: 1 },
    titleLine:{ color: TEXT, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
    reciterLine:{ color: GOLD, fontSize: 13, marginTop: 5, opacity: 0.8 },
    reciterBtn:{ width: 38, height: 38, borderRadius: 19, backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD_M },

    controls:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 12, marginTop: 18, marginBottom: 4 },

    actionStrip:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 20, marginTop: 18, marginBottom: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    speedPill:{ backgroundColor: GOLD_L, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: GOLD_M, minWidth: 46, alignItems: 'center' },
    speedText:{ color: GOLD, fontSize: 13, fontWeight: '800' },

    surahNav:{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#080E18' },
    surahNavBtn:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD_L, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: GOLD_M },
    surahNavOff:{ opacity: 0.28 },
    surahNavText:{ color: GOLD, fontSize: 13, fontWeight: '700' },
    surahNavCount:{ color: MUTED, fontSize: 12, fontWeight: '600' },
});