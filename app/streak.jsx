import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    StatusBar,
    Animated,
    Dimensions,
} from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import supabase from '@/src/services/supabase';
import { getDeviceId } from '@/src/utils/device';
import { getPrayerActiveDates } from '@/src/services/prayerLogs';
import {
    getDhikrDefinitions,
    getCustomDhikr,
    getDhikrActiveDates,
} from '@/src/services/dhikr';

import {
    todayLocalStr,
    toLocalDateStr,
    computeCurrentStreak,
    computeLongestStreak,
} from '@/src/utils/streaks';

const { width } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
    bg:          '#080E17',
    surface:     '#0D1824',
    surfaceAlt:  '#111F2E',
    surfaceUp:   '#162538',

    border:      'rgba(255,255,255,0.06)',
    borderGold:  'rgba(201,168,76,0.18)',
    borderBlue:  'rgba(99,160,220,0.22)',
    borderPurple:'rgba(167,139,250,0.22)',
    borderTeal:  'rgba(45,212,191,0.22)',

    gold:        '#C9A84C',
    goldDim:     'rgba(201,168,76,0.40)',
    goldSubtle:  'rgba(201,168,76,0.08)',

    blue:        '#63A0DC',
    blueSubtle:  'rgba(99,160,220,0.07)',

    green:       '#48BB78',
    greenSubtle: 'rgba(72,187,120,0.07)',

    purple:      '#A78BFA',
    purpleSubtle:'rgba(167,139,250,0.07)',

    teal:        '#2DD4BF',
    tealSubtle:  'rgba(45,212,191,0.07)',

    orange:      '#FB923C',
    orangeSubtle:'rgba(251,146,60,0.07)',
    borderOrange:'rgba(251,146,60,0.22)',

    text:        '#EEE8D5',
    textDim:     '#B8A98A',
    muted:       '#4A6070',
    mutedMid:    '#6B8090',
};

// ── Streak categories ─────────────────────────────────────────────────────────
// Quran intentionally excluded.
// Quran is saved/bookmarked, but is NOT a daily streak activity.

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
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayStr() {
    return todayLocalStr();
}

function dayLabel(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);

    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
}

/**
 * Convert a database timestamp into the user's local calendar date.
 *
 * Important:
 * completed_at is a timestamp, while our activity dates are
 * YYYY-MM-DD local dates.
 */
function timestampToLocalDate(timestamp) {
    if (!timestamp) return null;

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return null;

    return toLocalDateStr(date);
}

/**
 * Returns the local date on which a custom Dhikr was created.
 *
 * created_at may contain timezone information, so we convert it
 * through Date instead of simply using slice(0, 10).
 */
function createdAtToLocalDate(createdAt) {
    if (!createdAt) return null;

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) return null;

    return toLocalDateStr(date);
}

// ── Animated stat card ─────────────────────────────────────────────────────────

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
        <Animated.View
            style={[
                styles.statCard,
                {
                    opacity: anim,
                    transform: [
                        {
                            translateY: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [10, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            <Text style={[styles.statValue, { color }]}>
                {value}
            </Text>

            <Text style={styles.statLabel}>
                {label}
            </Text>

            <View
                style={[
                    styles.statAccentBar,
                    { backgroundColor: color },
                ]}
            />
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
        <View
            style={[
                styles.streakRow,
                isTop && styles.streakRowTop,
            ]}
        >
            <View
                style={[
                    styles.streakIconWrap,
                    {
                        backgroundColor: type.subtle,
                        borderColor: type.border,
                    },
                ]}
            >
                <Ionicons
                    name={type.icon}
                    size={15}
                    color={type.color}
                />
            </View>

            <View style={styles.streakRowMid}>
                <View style={styles.streakRowHeader}>
                    <View>
                        <Text style={styles.streakRowLabel}>
                            {type.label}
                        </Text>

                        <Text style={styles.streakRowArabic}>
                            {type.arabic}
                        </Text>
                    </View>

                    <View style={styles.streakDaysWrap}>
                        <Text
                            style={[
                                styles.streakDaysNum,
                                {
                                    color:
                                        current > 0
                                            ? type.color
                                            : C.muted,
                                },
                            ]}
                        >
                            {current > 0 ? current : '—'}
                        </Text>

                        {current > 0 && (
                            <Text style={styles.streakDaysSuffix}>
                                days
                            </Text>
                        )}
                    </View>
                </View>

                <View style={styles.streakBarTrack}>
                    <Animated.View
                        style={[
                            styles.streakBarFill,
                            {
                                width: barAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                                backgroundColor:
                                    current > 0
                                        ? type.color
                                        : C.muted,
                                opacity:
                                    current > 0 ? 0.8 : 0.2,
                            },
                        ]}
                    />
                </View>

                <Text style={styles.streakDesc}>
                    {type.description}
                </Text>
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

                const hasActivity =
                    day.prayerCount > 0 ||
                    day.hadDhikr ||
                    day.hadHadith ||
                    day.hadLesson;

                const today = day.isToday;

                return (
                    <View
                        key={i}
                        style={styles.weekCalCol}
                    >
                        <Text
                            style={[
                                styles.weekCalDay,
                                today && {
                                    color: C.gold,
                                    fontWeight: '700',
                                },
                            ]}
                        >
                            {dayLabel(day.date)}
                        </Text>

                        <View
                            style={[
                                styles.weekCalDot,

                                isPerfect && {
                                    backgroundColor: C.green,
                                    borderColor: C.green,
                                },

                                !isPerfect &&
                                hasActivity && {
                                    backgroundColor:
                                    C.goldSubtle,
                                    borderColor: C.gold,
                                },

                                today &&
                                !isPerfect &&
                                !hasActivity && {
                                    borderColor: C.gold,
                                },
                            ]}
                        >
                            {isPerfect && (
                                <Ionicons
                                    name="checkmark"
                                    size={10}
                                    color={C.bg}
                                />
                            )}

                            {!isPerfect &&
                                day.prayerCount > 0 && (
                                    <Text style={styles.weekCalCount}>
                                        {day.prayerCount}
                                    </Text>
                                )}
                        </View>

                        {today && (
                            <View style={styles.weekCalTodayDot} />
                        )}
                    </View>
                );
            })}
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Streak() {
    const insets = useSafeAreaInsets();

    const [streakData, setStreakData] = useState({
        current: 0,
        longest: 0,
    });

    const [weekData, setWeekData] = useState([]);

    const [categoryStreaks, setCategoryStreaks] = useState({});

    const [perfectDays, setPerfectDays] = useState(0);

    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    // ── Load everything ───────────────────────────────────────────────────────

    const loadAll = async () => {
        setLoading(true);

        await Promise.all([
            loadStreak(),
            loadWeekData(),
            loadCategoryStreaks(),
        ]);

        setLoading(false);
    };

    // ── Main Prayer streak ────────────────────────────────────────────────────

    const loadStreak = async () => {
        try {
            const activeDates = await getPrayerActiveDates();

            setStreakData({
                current: computeCurrentStreak(activeDates),
                longest: computeLongestStreak(activeDates),
            });
        } catch (e) {
            console.error(
                'loadStreak:',
                e?.message || e
            );
        }
    };

    // ── Weekly activity data ───────────────────────────────────────────────────

    const loadWeekData = async () => {
        try {
            const device_id = await getDeviceId();

            const today = getTodayStr();

            // Last 7 local calendar days, including today.
            const days = [];

            for (let i = 6; i >= 0; i--) {
                const d = new Date();

                d.setDate(d.getDate() - i);

                days.push(toLocalDateStr(d));
            }

            // Get global + custom Dhikr definitions so that weekly Dhikr
            // completion can be calculated against the actual expected set.
            const [
                globalDhikr,
                customDhikr,
                { data: prayerLogs },
                { data: dhikrLogRows },
                { data: hadithLogRows },
                { data: lessonRows },
            ] = await Promise.all([
                getDhikrDefinitions(),
                getCustomDhikr(),

                supabase
                    .from('prayer_logs')
                    .select(
                        'date, fajr, dhuhr, asr, maghrib, isha'
                    )
                    .eq('device_id', device_id)
                    .in('date', days),

                supabase
                    .from('dhikr_logs')
                    .select(
                        'date, dhikr_id, completed'
                    )
                    .eq('device_id', device_id)
                    .in('date', days),

                supabase
                    .from('hadith_logs')
                    .select('date, read')
                    .eq('device_id', device_id)
                    .in('date', days),

                supabase
                    .from('lesson_progress')
                    .select('completed_at')
                    .eq('device_id', device_id)
                    .eq('completed', true)
                    .not('completed_at', 'is', null),
            ]);

            const PRAYER_KEYS = [
                'fajr',
                'dhuhr',
                'asr',
                'maghrib',
                'isha',
            ];

            // ── Group Dhikr logs by date ───────────────────────────────────────

            const dhikrLogsByDate = {};

            for (const row of dhikrLogRows ?? []) {
                if (!dhikrLogsByDate[row.date]) {
                    dhikrLogsByDate[row.date] = new Map();
                }

                dhikrLogsByDate[row.date].set(
                    row.dhikr_id,
                    row.completed === true
                );
            }

            // ── Lesson completion dates ───────────────────────────────────────

            const lessonDaySet = new Set(
                (lessonRows ?? [])
                    .map(row =>
                        timestampToLocalDate(
                            row.completed_at
                        )
                    )
                    .filter(Boolean)
            );

            // ── Determine whether Dhikr was complete on a day ────────────────
            //
            // Global Dhikr are expected every day.
            //
            // Custom Dhikr are expected only from the date they were created.
            //
            // Missing a log row means NOT completed.

            const isDhikrDayComplete = date => {
                const logs =
                    dhikrLogsByDate[date] ?? new Map();

                const applicableCustomDhikr =
                    (customDhikr ?? []).filter(dhikr => {
                        const createdDate =
                            createdAtToLocalDate(
                                dhikr.created_at
                            );

                        // If created_at is unavailable, retain the
                        // safer assumption that the Dhikr applies.
                        if (!createdDate) return true;

                        return createdDate <= date;
                    });

                const expectedDhikr = [
                    ...(globalDhikr ?? []),
                    ...applicableCustomDhikr,
                ];

                // No definitions means there is no Dhikr activity
                // to count as complete.
                if (expectedDhikr.length === 0) {
                    return false;
                }

                return expectedDhikr.every(
                    dhikr =>
                        logs.get(dhikr.id) === true
                );
            };

            // ── Map the 7 days ────────────────────────────────────────────────

            const mapped = days.map(date => {
                const pRow = (prayerLogs ?? []).find(
                    row => row.date === date
                );

                const prayerCount = pRow
                    ? PRAYER_KEYS.filter(
                        key => pRow[key] === true
                    ).length
                    : 0;

                const hadDhikr =
                    isDhikrDayComplete(date);

                const hadHadith =
                    (hadithLogRows ?? []).some(
                        row =>
                            row.date === date &&
                            row.read === true
                    );

                const hadLesson =
                    lessonDaySet.has(date);

                return {
                    date,
                    isToday: date === today,
                    prayerCount,
                    hadDhikr,
                    hadHadith,
                    hadLesson,
                };
            });

            setWeekData(mapped);

            // "Perfect day" continues to mean all five prayers,
            // independent of Dhikr/Hadith/Lesson.
            setPerfectDays(
                mapped.filter(
                    day => day.prayerCount === 5
                ).length
            );
        } catch (e) {
            console.error(
                'loadWeekData:',
                e?.message || e
            );
        }
    };

    // ── Category streaks ──────────────────────────────────────────────────────

    const loadCategoryStreaks = async () => {
        try {
            const device_id = await getDeviceId();

            const [
                prayerActiveDates,
                dhikrActiveDates,
                { data: hadithRows },
                { data: lessonRows },
            ] = await Promise.all([
                // Prayer is active only when all five prayers
                // are complete for a date.
                getPrayerActiveDates(),

                // Dhikr service determines whether ALL expected
                // Dhikr were completed for each date.
                getDhikrActiveDates(),

                // Hadith is active when at least one Hadith was
                // read on that date.
                supabase
                    .from('hadith_logs')
                    .select('date')
                    .eq('device_id', device_id)
                    .eq('read', true),

                // Lesson is active when at least one lesson was
                // completed on that date.
                supabase
                    .from('lesson_progress')
                    .select('completed_at')
                    .eq('device_id', device_id)
                    .eq('completed', true)
                    .not('completed_at', 'is', null),
            ]);

            // ── Hadith active dates ───────────────────────────────────────────

            const hadithActiveDates = [
                ...new Set(
                    (hadithRows ?? [])
                        .map(row => row.date)
                        .filter(Boolean)
                ),
            ];

            // ── Lesson active dates ───────────────────────────────────────────

            const lessonActiveDates = [
                ...new Set(
                    (lessonRows ?? [])
                        .map(row =>
                            timestampToLocalDate(
                                row.completed_at
                            )
                        )
                        .filter(Boolean)
                ),
            ];

            setCategoryStreaks({
                prayer: computeCurrentStreak(
                    prayerActiveDates
                ),

                dhikr: computeCurrentStreak(
                    dhikrActiveDates
                ),

                hadith: computeCurrentStreak(
                    hadithActiveDates
                ),

                lesson: computeCurrentStreak(
                    lessonActiveDates
                ),
            });
        } catch (e) {
            console.error(
                'loadCategoryStreaks:',
                e?.message || e
            );
        }
    };

    // ── Hijri date ────────────────────────────────────────────────────────────

    const hijriDate = (() => {
        try {
            return new Intl.DateTimeFormat(
                'en-u-ca-islamic',
                {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                }
            ).format(new Date());
        } catch {
            return null;
        }
    })();

    const topStreak = Math.max(
        ...Object.values(categoryStreaks),
        0
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View
            style={[
                styles.root,
                { paddingTop: insets.top },
            ]}
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={C.bg}
                translucent
            />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.scroll,
                    {
                        paddingBottom:
                            insets.bottom + 40,
                    },
                ]}
            >
                {/* ── HEADER ─────────────────────────────── */}

                <View style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>
                            STREAK OVERVIEW
                        </Text>

                        {hijriDate && (
                            <Text style={styles.hijri}>
                                {hijriDate}
                            </Text>
                        )}
                    </View>

                    {topStreak > 0 && (
                        <View style={styles.headerFlame}>
                            <Text
                                style={
                                    styles.headerFlameEmoji
                                }
                            >
                                🔥
                            </Text>

                            <Text
                                style={
                                    styles.headerFlameNum
                                }
                            >
                                {topStreak}
                            </Text>
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

                {/* ── WEEK CALENDAR ───────────────────────── */}

                <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionLabel}>
                            THIS WEEK
                        </Text>

                        <Text style={styles.sectionMeta}>
                            {perfectDays} perfect{' '}
                            {perfectDays === 1
                                ? 'day'
                                : 'days'}
                        </Text>
                    </View>

                    <View style={styles.card}>
                        {weekData.length > 0 ? (
                            <WeekCalendar
                                weekData={weekData}
                            />
                        ) : (
                            <View style={styles.emptyRow}>
                                <Ionicons
                                    name="calendar-outline"
                                    size={18}
                                    color={C.muted}
                                />

                                <Text
                                    style={
                                        styles.emptyText
                                    }
                                >
                                    No data yet
                                </Text>
                            </View>
                        )}

                        <View style={styles.legendRow}>
                            <View
                                style={styles.legendItem}
                            >
                                <View
                                    style={[
                                        styles.legendDot,
                                        {
                                            backgroundColor:
                                            C.green,
                                        },
                                    ]}
                                />

                                <Text
                                    style={
                                        styles.legendText
                                    }
                                >
                                    Perfect (5/5)
                                </Text>
                            </View>

                            <View
                                style={styles.legendItem}
                            >
                                <View
                                    style={[
                                        styles.legendDot,
                                        {
                                            backgroundColor:
                                            C.gold,
                                            opacity: 0.6,
                                        },
                                    ]}
                                />

                                <Text
                                    style={
                                        styles.legendText
                                    }
                                >
                                    Partial
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── CATEGORY STREAKS ────────────────────── */}

                <View style={styles.sectionBlock}>
                    <Text style={styles.sectionLabel}>
                        ACTIVITY STREAKS
                    </Text>

                    <View style={styles.card}>
                        {STREAK_TYPES.map(
                            (type, i) => (
                                <StreakRow
                                    key={type.key}
                                    type={type}
                                    current={
                                        categoryStreaks[
                                            type.key
                                            ] ?? 0
                                    }
                                    isTop={i === 0}
                                />
                            )
                        )}
                    </View>
                </View>

                {/* ── MOTIVATION FOOTER ───────────────────── */}

                <View
                    style={styles.motivationCard}
                >
                    <Text
                        style={
                            styles.motivationArabic
                        }
                    >
                        وَاذْكُرُوا اللَّهَ كَثِيرًا
                    </Text>

                    <Text
                        style={
                            styles.motivationTrans
                        }
                    >
                        "And remember Allah often…"
                    </Text>

                    <Text
                        style={
                            styles.motivationRef
                        }
                    >
                        — Quran 62:10
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: C.bg,
    },

    scroll: {
        paddingHorizontal: 16,
        paddingTop: 20,
    },

    // ── Header ────────────────────────────────────────────

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },

    eyebrow: {
        fontSize: 9,
        color: C.gold,
        letterSpacing: 3,
        fontWeight: '700',
        opacity: 0.7,
        marginBottom: 6,
    },

    hijri: {
        fontSize: 13,
        color: C.gold,
        fontWeight: '600',
        letterSpacing: 0.3,
    },

    headerFlame: {
        alignItems: 'center',
        backgroundColor:
            'rgba(201,168,76,0.06)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.borderGold,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },

    headerFlameEmoji: {
        fontSize: 18,
        lineHeight: 20,
    },

    headerFlameNum: {
        fontSize: 22,
        fontWeight: '800',
        color: C.gold,
        lineHeight: 24,
    },

    // ── Stats ─────────────────────────────────────────────

    statsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 20,
    },

    statCard: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: C.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        paddingVertical: 16,
        paddingHorizontal: 8,
        overflow: 'hidden',
        position: 'relative',
    },

    statValue: {
        fontSize: 28,
        fontWeight: '700',
        lineHeight: 32,
    },

    statLabel: {
        fontSize: 10,
        color: C.muted,
        textAlign: 'center',
        lineHeight: 14,
        marginTop: 4,
        letterSpacing: 0.2,
    },

    statAccentBar: {
        position: 'absolute',
        bottom: 0,
        left: '15%',
        right: '15%',
        height: 2,
        borderRadius: 1,
    },

    // ── Sections ──────────────────────────────────────────

    sectionBlock: {
        marginBottom: 20,
    },

    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },

    sectionLabel: {
        fontSize: 9,
        color: C.gold,
        letterSpacing: 2.8,
        fontWeight: '700',
        opacity: 0.7,
        textTransform: 'uppercase',
    },

    sectionMeta: {
        fontSize: 11,
        color: C.mutedMid,
    },

    card: {
        backgroundColor: C.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
    },

    // ── Week calendar ─────────────────────────────────────

    weekCalendar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 4,
    },

    weekCalCol: {
        flex: 1,
        alignItems: 'center',
        gap: 6,
    },

    weekCalDay: {
        fontSize: 10,
        color: C.muted,
        fontWeight: '600',
        letterSpacing: 0.3,
    },

    weekCalDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },

    weekCalCount: {
        fontSize: 10,
        color: C.gold,
        fontWeight: '700',
    },

    weekCalTodayDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.gold,
    },

    legendRow: {
        flexDirection: 'row',
        gap: 16,
        paddingHorizontal: 16,
        paddingBottom: 14,
    },

    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },

    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },

    legendText: {
        fontSize: 10,
        color: C.muted,
    },

    // ── Streak rows ───────────────────────────────────────

    streakRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: C.border,
        gap: 12,
    },

    streakRowTop: {
        borderTopWidth: 0,
    },

    streakIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },

    streakRowMid: {
        flex: 1,
    },

    streakRowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },

    streakRowLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: C.text,
        letterSpacing: 0.15,
        marginBottom: 1,
    },

    streakRowArabic: {
        fontSize: 11,
        color: C.muted,
        fontFamily: 'Uthmanic',
    },

    streakDaysWrap: {
        alignItems: 'flex-end',
    },

    streakDaysNum: {
        fontSize: 22,
        fontWeight: '800',
        lineHeight: 24,
    },

    streakDaysSuffix: {
        fontSize: 10,
        color: C.muted,
        letterSpacing: 0.3,
    },

    streakBarTrack: {
        height: 3,
        backgroundColor:
            'rgba(255,255,255,0.04)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 5,
    },

    streakBarFill: {
        height: '100%',
        borderRadius: 2,
    },

    streakDesc: {
        fontSize: 10,
        color: C.muted,
        letterSpacing: 0.2,
    },

    // ── Empty ─────────────────────────────────────────────

    emptyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 24,
    },

    emptyText: {
        fontSize: 13,
        color: C.muted,
    },

    // ── Motivation ────────────────────────────────────────

    motivationCard: {
        backgroundColor: C.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.borderGold,
        padding: 20,
        alignItems: 'center',
        marginBottom: 8,
    },

    motivationArabic: {
        fontSize: 18,
        color: C.gold,
        fontFamily: 'Uthmanic',
        textAlign: 'center',
        marginBottom: 8,
        lineHeight: 26,
    },

    motivationTrans: {
        fontSize: 13,
        color: C.textDim,
        textAlign: 'center',
        fontStyle: 'italic',
        lineHeight: 19,
        marginBottom: 4,
    },

    motivationRef: {
        fontSize: 10,
        color: C.muted,
        letterSpacing: 0.5,
    },
});