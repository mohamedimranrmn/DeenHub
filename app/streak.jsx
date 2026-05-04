import {
    View, Text, TouchableOpacity, StyleSheet,
    ScrollView, StatusBar, Animated, Dimensions,
} from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import supabase from '@/src/services/supabase';
import { getDeviceId } from '@/src/utils/device';

const { width } = Dimensions.get('window');

// ── Design tokens (shared system) ────────────────────────────────────────────
const C = {
    bg:         '#080E17',
    surface:    '#0D1824',
    surfaceAlt: '#111F2E',
    surfaceUp:  '#162538',
    border:     'rgba(255,255,255,0.06)',
    borderGold: 'rgba(201,168,76,0.18)',
    borderBlue: 'rgba(99,160,220,0.22)',
    borderGreen:'rgba(72,187,120,0.22)',
    borderPurple:'rgba(167,139,250,0.22)',
    borderTeal: 'rgba(45,212,191,0.22)',

    gold:       '#C9A84C',
    goldDim:    'rgba(201,168,76,0.40)',
    goldSubtle: 'rgba(201,168,76,0.08)',

    blue:       '#63A0DC',
    blueSubtle: 'rgba(99,160,220,0.07)',

    green:      '#48BB78',
    greenSubtle:'rgba(72,187,120,0.07)',

    purple:     '#A78BFA',
    purpleSubtle:'rgba(167,139,250,0.07)',

    teal:       '#2DD4BF',
    tealSubtle: 'rgba(45,212,191,0.07)',

    orange:     '#FB923C',
    orangeSubtle:'rgba(251,146,60,0.07)',
    borderOrange:'rgba(251,146,60,0.22)',

    text:       '#EEE8D5',
    textDim:    '#B8A98A',
    muted:      '#4A6070',
    mutedMid:   '#6B8090',
};

// ── Streak categories ─────────────────────────────────────────────────────────
const STREAK_TYPES = [
    {
        key: 'prayer',
        label: 'Prayer',
        arabic: 'صَلاة',
        icon: 'moon-outline',
        color: C.gold,
        subtle: C.goldSubtle,
        border: C.borderGold,
        description: 'Daily Salah complete',
    },
    {
        key: 'dhikr',
        label: 'Dhikr',
        arabic: 'ذِكْر',
        icon: 'radio-button-on-outline',
        color: C.teal,
        subtle: C.tealSubtle,
        border: C.borderTeal,
        description: 'Daily remembrance',
    },
    {
        key: 'hadith',
        label: 'Hadith',
        arabic: 'حَدِيث',
        icon: 'book-outline',
        color: C.blue,
        subtle: C.blueSubtle,
        border: C.borderBlue,
        description: 'Daily hadith read',
    },
    {
        key: 'lesson',
        label: 'Lessons',
        arabic: 'دَرْس',
        icon: 'school-outline',
        color: C.purple,
        subtle: C.purpleSubtle,
        border: C.borderPurple,
        description: 'Daily lesson completed',
    },
    {
        key: 'quran',
        label: 'Quran',
        arabic: 'قُرْآن',
        icon: 'library-outline',
        color: C.green,
        subtle: C.greenSubtle,
        border: C.borderGreen,
        description: 'Daily Quran recitation',
    },
];

function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

function dayLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return ['S','M','T','W','T','F','S'][d.getDay()];
}

// ── Animated stat card ────────────────────────────────────────────────────────
function StatCard({ value, label, color, delay = 0 }) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: 1,
            duration: 500,
            delay,
            useNativeDriver: true,
        }).start();
    }, [value]);

    return (
        <Animated.View style={[styles.statCard, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [10, 0] }) }] }]}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            <View style={[styles.statAccentBar, { backgroundColor: color }]} />
        </Animated.View>
    );
}

// ── Streak type row ───────────────────────────────────────────────────────────
function StreakRow({ type, current, isTop }) {
    const barAnim = useRef(new Animated.Value(0)).current;
    const maxVisible = 30;
    const pct = Math.min(current / maxVisible, 1);

    useEffect(() => {
        Animated.timing(barAnim, {
            toValue: pct,
            duration: 700,
            delay: 100,
            useNativeDriver: false,
        }).start();
    }, [current]);

    return (
        <View style={[styles.streakRow, isTop && styles.streakRowTop]}>
            <View style={[styles.streakIconWrap, { backgroundColor: type.subtle, borderColor: type.border }]}>
                <Ionicons name={type.icon} size={15} color={type.color} />
            </View>

            <View style={styles.streakRowMid}>
                <View style={styles.streakRowHeader}>
                    <View>
                        <Text style={styles.streakRowLabel}>{type.label}</Text>
                        <Text style={styles.streakRowArabic}>{type.arabic}</Text>
                    </View>
                    <View style={styles.streakDaysWrap}>
                        <Text style={[styles.streakDaysNum, { color: current > 0 ? type.color : C.muted }]}>
                            {current > 0 ? current : '—'}
                        </Text>
                        {current > 0 && <Text style={styles.streakDaysSuffix}>days</Text>}
                    </View>
                </View>

                {/* Progress bar */}
                <View style={styles.streakBarTrack}>
                    <Animated.View style={[
                        styles.streakBarFill,
                        {
                            width: barAnim.interpolate({ inputRange: [0,1], outputRange: ['0%', '100%'] }),
                            backgroundColor: current > 0 ? type.color : C.muted,
                            opacity: current > 0 ? 0.8 : 0.2,
                        }
                    ]} />
                </View>

                <Text style={styles.streakDesc}>{type.description}</Text>
            </View>
        </View>
    );
}

// ── Week mini-calendar ────────────────────────────────────────────────────────
function WeekCalendar({ weekData }) {
    return (
        <View style={styles.weekCalendar}>
            {weekData.map((day, i) => {
                const isPerfect = day.prayerCount === 5;
                const hasActivity = day.prayerCount > 0 || day.hadDhikr || day.hadHadith || day.hadLesson || day.hadQuran;
                const today = day.isToday;

                return (
                    <View key={i} style={styles.weekCalCol}>
                        <Text style={[styles.weekCalDay, today && { color: C.gold, fontWeight: '700' }]}>
                            {dayLabel(day.date)}
                        </Text>
                        <View style={[
                            styles.weekCalDot,
                            isPerfect && { backgroundColor: C.green, borderColor: C.green },
                            !isPerfect && hasActivity && { backgroundColor: C.goldSubtle, borderColor: C.gold },
                            today && !isPerfect && !hasActivity && { borderColor: C.gold },
                        ]}>
                            {isPerfect && <Ionicons name="checkmark" size={10} color={C.bg} />}
                            {!isPerfect && day.prayerCount > 0 && (
                                <Text style={styles.weekCalCount}>{day.prayerCount}</Text>
                            )}
                        </View>
                        {today && <View style={styles.weekCalTodayDot} />}
                    </View>
                );
            })}
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Streak() {
    const insets = useSafeAreaInsets();

    const [streakData, setStreakData]       = useState({ current: 0, longest: 0 });
    const [weekData, setWeekData]           = useState([]);
    const [categoryStreaks, setCategoryStreaks] = useState({});
    const [perfectDays, setPerfectDays]     = useState(0);
    const [loading, setLoading]             = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    const loadAll = async () => {
        setLoading(true);
        await Promise.all([
            loadStreak(),
            loadWeekData(),
            loadCategoryStreaks(),
        ]);
        setLoading(false);
    };

    // ── Load main prayer streak ────────────────────────────
    const loadStreak = async () => {
        try {
            const device_id = await getDeviceId();
            const { data } = await supabase
                .from('streaks')
                .select('*')
                .eq('device_id', device_id)
                .maybeSingle();
            if (data) setStreakData({ current: data.current ?? 0, longest: data.longest ?? 0 });
        } catch (e) { console.error('loadStreak:', e.message); }
    };

    // ── Load week prayer data ──────────────────────────────
    const loadWeekData = async () => {
        try {
            const device_id = await getDeviceId();
            const today = getTodayStr();
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                days.push(d.toISOString().slice(0, 10));
            }

            // Prayer logs
            const { data: prayerLogs } = await supabase
                .from('prayer_logs')
                .select('date, fajr, dhuhr, asr, maghrib, isha')
                .eq('device_id', device_id)
                .in('date', days);

            // Habits (dhikr, quran)
            const { data: habits } = await supabase
                .from('habits')
                .select('date, dhikr, quran')
                .eq('device_id', device_id)
                .in('date', days);

            const PRAYERS_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
            const mapped = days.map(date => {
                const pRow = prayerLogs?.find(r => r.date === date);
                const hRow = habits?.find(r => r.date === date);
                const prayerCount = pRow ? PRAYERS_KEYS.filter(k => pRow[k]).length : 0;
                return {
                    date,
                    isToday: date === today,
                    prayerCount,
                    hadDhikr: !!hRow?.dhikr,
                    hadQuran: !!hRow?.quran,
                    // lesson & hadith don't have daily logs per schema — default false
                    hadHadith: false,
                    hadLesson: false,
                };
            });

            setWeekData(mapped);
            setPerfectDays(mapped.filter(d => d.prayerCount === 5).length);
        } catch (e) { console.error('loadWeekData:', e.message); }
    };

    // ── Compute category streaks ───────────────────────────
    // Prayer streak comes from streaks table.
    // Dhikr & Quran come from habits table (boolean per day).
    // Hadith & Lesson: lesson_progress gives completed lessons;
    // we approximate a streak as consecutive days with completions.
    const loadCategoryStreaks = async () => {
        try {
            const device_id = await getDeviceId();

            // Build last 60 days
            const days = [];
            for (let i = 0; i < 60; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                days.push(d.toISOString().slice(0, 10));
            }

            // Prayer streak from streaks table
            const { data: streakRow } = await supabase
                .from('streaks').select('current').eq('device_id', device_id).maybeSingle();
            const prayerStreak = streakRow?.current ?? 0;

            // Habits
            const { data: habitRows } = await supabase
                .from('habits')
                .select('date, dhikr, quran')
                .eq('device_id', device_id)
                .in('date', days);

            const calcHabitStreak = (key) => {
                let streak = 0;
                for (const day of days) {
                    const row = habitRows?.find(r => r.date === day);
                    if (row?.[key]) streak++;
                    else break;
                }
                return streak;
            };

            const dhikrStreak  = calcHabitStreak('dhikr');
            const quranStreak  = calcHabitStreak('quran');

            // Lesson progress — count distinct dates with completions
            const { data: lessonDates } = await supabase
                .from('lesson_progress')
                .select('completed_at')
                .eq('device_id', device_id)
                .eq('completed', true)
                .not('completed_at', 'is', null);

            const lessonDaySet = new Set(
                (lessonDates ?? []).map(r => r.completed_at?.slice(0, 10))
            );

            const calcDateSetStreak = (set) => {
                let streak = 0;
                for (const day of days) {
                    if (set.has(day)) streak++;
                    else break;
                }
                return streak;
            };

            const lessonStreak = calcDateSetStreak(lessonDaySet);

            // Hadith — no per-device log in schema; show 0 (extend when you add tracking)
            const hadithStreak = 0;

            setCategoryStreaks({
                prayer: prayerStreak,
                dhikr:  dhikrStreak,
                hadith: hadithStreak,
                lesson: lessonStreak,
                quran:  quranStreak,
            });
        } catch (e) { console.error('loadCategoryStreaks:', e.message); }
    };

    const hijriDate = (() => {
        try {
            return new Intl.DateTimeFormat('en-u-ca-islamic', {
                day: 'numeric', month: 'long', year: 'numeric',
            }).format(new Date());
        } catch { return null; }
    })();

    const topStreak = Math.max(...Object.values(categoryStreaks), 0);

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* ── HEADER ──────────────────────────────── */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>STREAK OVERVIEW</Text>
                        {hijriDate && <Text style={styles.hijri}>{hijriDate}</Text>}
                    </View>
                    {topStreak > 0 && (
                        <View style={styles.headerFlame}>
                            <Text style={styles.headerFlameEmoji}>🔥</Text>
                            <Text style={styles.headerFlameNum}>{topStreak}</Text>
                        </View>
                    )}
                </View>

                {/* ── TOP 3 STATS ─────────────────────────── */}
                <View style={styles.statsRow}>
                    <StatCard
                        value={streakData.current}
                        label={'Current\nStreak'}
                        color={C.gold}
                        delay={0}
                    />
                    <StatCard
                        value={streakData.longest}
                        label={'Longest\nStreak'}
                        color={C.blue}
                        delay={80}
                    />
                    <StatCard
                        value={perfectDays}
                        label={'Perfect\nDays'}
                        color={C.green}
                        delay={160}
                    />
                </View>

                {/* ── WEEK CALENDAR ────────────────────────── */}
                <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionLabel}>THIS WEEK</Text>
                        <Text style={styles.sectionMeta}>
                            {perfectDays} perfect {perfectDays === 1 ? 'day' : 'days'}
                        </Text>
                    </View>
                    <View style={styles.card}>
                        {weekData.length > 0
                            ? <WeekCalendar weekData={weekData} />
                            : <View style={styles.emptyRow}>
                                <Ionicons name="calendar-outline" size={18} color={C.muted} />
                                <Text style={styles.emptyText}>No data yet</Text>
                            </View>
                        }
                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: C.green }]} />
                                <Text style={styles.legendText}>Perfect (5/5)</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: C.gold, opacity: 0.6 }]} />
                                <Text style={styles.legendText}>Partial</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── CATEGORY STREAKS ─────────────────────── */}
                <View style={styles.sectionBlock}>
                    <Text style={styles.sectionLabel}>ACTIVITY STREAKS</Text>
                    <View style={styles.card}>
                        {STREAK_TYPES.map((type, i) => (
                            <StreakRow
                                key={type.key}
                                type={type}
                                current={categoryStreaks[type.key] ?? 0}
                                isTop={i === 0}
                            />
                        ))}
                    </View>
                </View>

                {/* ── MOTIVATION FOOTER ─────────────────────── */}
                <View style={styles.motivationCard}>
                    <Text style={styles.motivationArabic}>وَاذْكُرُوا اللَّهَ كَثِيرًا</Text>
                    <Text style={styles.motivationTrans}>
                        "And remember Allah often…"
                    </Text>
                    <Text style={styles.motivationRef}>— Quran 62:10</Text>
                </View>

            </ScrollView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 16, paddingTop: 20 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24,
    },
    eyebrow: {
        fontSize: 9, color: C.gold, letterSpacing: 3, fontWeight: '700', opacity: 0.7, marginBottom: 6,
    },
    hijri: {
        fontSize: 13, color: C.gold, fontWeight: '600', letterSpacing: 0.3,
    },
    headerFlame: {
        alignItems: 'center',
        backgroundColor: 'rgba(201,168,76,0.06)',
        borderRadius: 12, borderWidth: 1, borderColor: C.borderGold,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    headerFlameEmoji: { fontSize: 18, lineHeight: 20 },
    headerFlameNum:   { fontSize: 22, fontWeight: '800', color: C.gold, lineHeight: 24 },

    // ── Stats row ─────────────────────────────────────────
    statsRow: {
        flexDirection: 'row', gap: 8, marginBottom: 20,
    },
    statCard: {
        flex: 1, alignItems: 'center',
        backgroundColor: C.surface, borderRadius: 12,
        borderWidth: 1, borderColor: C.border,
        paddingVertical: 16, paddingHorizontal: 8,
        overflow: 'hidden', position: 'relative',
    },
    statValue:     { fontSize: 28, fontWeight: '700', lineHeight: 32 },
    statLabel:     { fontSize: 10, color: C.muted, textAlign: 'center', lineHeight: 14, marginTop: 4, letterSpacing: 0.2 },
    statAccentBar: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, borderRadius: 1 },

    // ── Section ───────────────────────────────────────────
    sectionBlock: { marginBottom: 20 },
    sectionHeaderRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
    },
    sectionLabel: {
        fontSize: 9, color: C.gold, letterSpacing: 2.8, fontWeight: '700',
        opacity: 0.7, textTransform: 'uppercase',
    },
    sectionMeta: { fontSize: 11, color: C.mutedMid },
    card: {
        backgroundColor: C.surface, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        overflow: 'hidden',
    },

    // ── Week calendar ─────────────────────────────────────
    weekCalendar: {
        flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 18, gap: 4,
    },
    weekCalCol:    { flex: 1, alignItems: 'center', gap: 6 },
    weekCalDay:    { fontSize: 10, color: C.muted, fontWeight: '600', letterSpacing: 0.3 },
    weekCalDot: {
        width: 28, height: 28, borderRadius: 14,
        borderWidth: 1, borderColor: C.border,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    weekCalCount:    { fontSize: 10, color: C.gold, fontWeight: '700' },
    weekCalTodayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold },
    legendRow: {
        flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 14,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot:  { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 10, color: C.muted },

    // ── Streak rows ───────────────────────────────────────
    streakRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingHorizontal: 14, paddingVertical: 14,
        borderTopWidth: 1, borderTopColor: C.border,
        gap: 12,
    },
    streakRowTop: { borderTopWidth: 0 },
    streakIconWrap: {
        width: 34, height: 34, borderRadius: 10,
        borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
    },
    streakRowMid:    { flex: 1 },
    streakRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    streakRowLabel:  { fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: 0.15, marginBottom: 1 },
    streakRowArabic: { fontSize: 11, color: C.muted, fontFamily: 'Uthmanic' },
    streakDaysWrap:  { alignItems: 'flex-end' },
    streakDaysNum:   { fontSize: 22, fontWeight: '800', lineHeight: 24 },
    streakDaysSuffix:{ fontSize: 10, color: C.muted, letterSpacing: 0.3 },
    streakBarTrack: {
        height: 3, backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 2, overflow: 'hidden', marginBottom: 5,
    },
    streakBarFill: { height: '100%', borderRadius: 2 },
    streakDesc: { fontSize: 10, color: C.muted, letterSpacing: 0.2 },

    // ── Empty ─────────────────────────────────────────────
    emptyRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 24,
    },
    emptyText: { fontSize: 13, color: C.muted },

    // ── Motivation footer ─────────────────────────────────
    motivationCard: {
        backgroundColor: C.surface,
        borderRadius: 14, borderWidth: 1, borderColor: C.borderGold,
        padding: 20, alignItems: 'center', marginBottom: 8,
    },
    motivationArabic: {
        fontSize: 18, color: C.gold, fontFamily: 'Uthmanic',
        textAlign: 'center', marginBottom: 8, lineHeight: 26,
    },
    motivationTrans: {
        fontSize: 13, color: C.textDim, textAlign: 'center',
        fontStyle: 'italic', lineHeight: 19, marginBottom: 4,
    },
    motivationRef: { fontSize: 10, color: C.muted, letterSpacing: 0.5 },
});