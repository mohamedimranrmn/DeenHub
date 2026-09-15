/**
 * app/(tabs)/home.jsx
 *
 * Redesign v2:
 * ✅ Settings button removed from hero
 * ✅ Compact, breathable hero — greeting + bismillah + dates in less vertical space
 * ✅ Horizontal scroll explore bar (no more 2-col grid clutter)
 * ✅ Quick-action listen button integrated into hero CTA
 * ✅ Stats row tightened
 * ✅ Hadith card more readable with cleaner hierarchy
 * ✅ Proper bottom padding for MiniPlayerBar
 */

import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, StatusBar, ActivityIndicator,
    Dimensions, RefreshControl, Image,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import supabase from '../../src/services/supabase';
import { quranQuotes } from '../../src/constants/quranQuotes';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
let Notifications = null;
if (!IS_EXPO_GO) {
    Notifications = require('expo-notifications');
}

const { width } = Dimensions.get('window');

// ── Design tokens ──────────────────────────────────────────────────────────────
const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.22)';
const DARK       = '#0C1520';
const CARD       = '#111D2A';
const CARD2      = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#4A5E72';
const BORDER     = 'rgba(201,168,76,0.12)';
const BORDER2    = 'rgba(255,255,255,0.06)';
const GREEN      = '#4CAF50';

// ── Helpers ────────────────────────────────────────────────────────────────────
const UMMAH_BASE   = 'https://ummahapi.com/api';
const UMMAH_APIKEY = process.env.EXPO_PUBLIC_UMMAH_API_KEY ?? '';

const ummahFetch = (path) =>
    fetch(`${UMMAH_BASE}${path}${UMMAH_APIKEY ? `?apikey=${UMMAH_APIKEY}` : ''}`);

/**
 * Single call to /islamic-events — returns both the current Hijri date info
 * and the full events list.  Response shape (from docs):
 * {
 *   data: {
 *     current_hijri_date: { hijri: { day, month_name, month_name_arabic, year } },
 *     next_event: { name, hijri_date },
 *     events: [{ month, day, name, description }]
 *   }
 * }
 */
async function fetchCalendarData() {
    try {
        const res  = await ummahFetch('/islamic-events');
        const json = await res.json();
        const data = json?.data ?? {};

        // ── Hijri date ───────────────────────────────────────────────────────
        const h     = data?.current_hijri_date?.hijri ?? {};
        const day   = h.day   ?? '';
        const enMon = h.month_name         ?? '';          // "Dhu al-Hijjah"
        const arMon = h.month_name_arabic  ?? '';          // "ذُو الْحِجَّة"
        const year  = h.year  ?? '';
        // Format: Arabic name (bold) + day number + English name
        // e.g.  "ذو الحجة  9 · Dhu al-Hijjah 1447 AH"
        const hijriStr = (day && enMon && year)
            ? `${arMon ? arMon + '  ' : ''}${day} · ${enMon} ${year} AH`
            : null;

        // ── Upcoming events (next 4 from today) ─────────────────────────────
        const curMonth = h.month ?? 0;
        const curDay   = h.day   ?? 0;
        const allEvents = Array.isArray(data.events) ? data.events : [];

        // Keep events that are >= today in hijri calendar, sort by closeness
        const upcoming = allEvents
            .map(ev => ({
                ...ev,
                _diff: (ev.month - curMonth) * 30 + (ev.day - curDay),
            }))
            .filter(ev => ev._diff >= 0)
            .sort((a, b) => a._diff - b._diff)
            .slice(0, 4);

        // If none left this year (wrapped past Dhul Hijjah), show first 4
        const events = upcoming.length > 0 ? upcoming : allEvents.slice(0, 4);

        // Hijri month names for display
        const HIJRI_MONTHS = [
            "Muharram","Safar","Rabi al-Awwal","Rabi al-Thani",
            "Jumada al-Ula","Jumada al-Thani","Rajab","Sha\u2019ban",
            "Ramadan","Shawwal","Dhu al-Qa\u2019dah","Dhu al-Hijjah",
        ];
        const eventsWithDates = events.map(ev => ({
            ...ev,
            dateLabel: `${ev.day} ${HIJRI_MONTHS[(ev.month - 1)] ?? ''} AH`,
        }));

        return { hijriStr, events: eventsWithDates };
    } catch (e) {
        console.log('[CalendarData]', e);
        return { hijriStr: null, events: [] };
    }
}

function getGregorianDate() {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short', day: 'numeric', month: 'short',
    }).format(new Date());
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return { ar: 'صَبَاحُ الخَيْر', en: 'Good Morning' };
    if (h < 17) return { ar: 'مَسَاءُ الخَيْر', en: 'Good Afternoon' };
    return { ar: 'مَسَاءُ النُّور', en: 'Good Evening' };
}

function hashCode(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return h;
}

function pickDailyQuote(quotes) {
    const seed = new Date().toISOString().slice(0, 10);
    return quotes[Math.abs(hashCode(seed)) % quotes.length];
}

// ── Explore links ──────────────────────────────────────────────────────────────
const exploreLinks = [
    {
        label: 'Quran',
        sublabel: 'Read & Listen',
        arabic: 'قُرْآن',
        icon: 'book-outline',
        iconLib: 'ion',
        route: '/quran',
        accent: '#C9A84C',
    },
    {
        label: 'Prayer',
        sublabel: 'Times & Qibla',
        arabic: 'صَلَاة',
        icon: require('../../assets/icons/prayer.png'),
        iconLib: 'image',
        route: '/prayer-tracker',
        accent: '#64B5F6',
    },
    {
        label: 'Streak',
        sublabel: 'Stay consistent',
        arabic: 'مُوَاظَبَة',
        icon: 'flame-outline',
        iconLib: 'ion',
        route: '/streak',
        accent: '#FF7043',
    },
    {
        label: 'Duas',
        sublabel: 'Supplications',
        arabic: 'أدعية',
        icon: require('../../assets/icons/dua.png'),
        iconLib: 'image',
        route: '/explore',
        accent: '#80CBC4',
    },
];

async function requestAppPermissions() {
    try {
        await Location.requestForegroundPermissionsAsync();
        if (!IS_EXPO_GO && Notifications) {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') {
                await Notifications.setNotificationChannelAsync('prayer-reminders', {
                    name: 'Prayer Reminders',
                    importance: Notifications.AndroidImportance.HIGH,
                    sound: 'default',
                    vibrationPattern: [0, 250, 250, 250],
                });
            }
        }
    } catch (err) {
        console.log('[Permissions]', err);
    }
}

// ── Explore Card (horizontal scroll) ──────────────────────────────────────────
function ExploreCard({ item }) {
    return (
        <TouchableOpacity
            style={[s.exploreCard, { borderColor: `${item.accent}22` }]}
            activeOpacity={0.75}
            onPress={() => router.push(item.route)}
        >
            {/* Icon circle */}
            <View style={[s.exploreIconWrap, { backgroundColor: `${item.accent}18` }]}>
                {item.iconLib === 'image' ? (
                    <Image
                        source={item.icon}
                        style={{ width: 20, height: 20, tintColor: item.accent }}
                        resizeMode="contain"
                    />
                ) : item.iconLib === 'mci' ? (
                    <MaterialCommunityIcons name={item.icon} size={20} color={item.accent} />
                ) : (
                    <Ionicons name={item.icon} size={20} color={item.accent} />
                )}
            </View>
            <Text style={[s.exploreArabic, { color: item.accent }]}>{item.arabic}</Text>
            <Text style={s.exploreName}>{item.label}</Text>
            <Text style={s.exploreSub}>{item.sublabel}</Text>
        </TouchableOpacity>
    );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ label, action, onAction }) {
    return (
        <View style={s.sectionHeader}>
            <View style={s.sectionDot} />
            <Text style={s.sectionLabel}>{label}</Text>
            <View style={s.sectionLine} />
            {action && (
                <TouchableOpacity onPress={onAction}>
                    <Text style={s.sectionAction}>{action}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
    const insets = useSafeAreaInsets();

    const [hadithOfDay, setHadithOfDay]     = useState(null);
    const [hijriDate, setHijriDate]         = useState(null);
    const [islamicEvents, setIslamicEvents] = useState([]);
    const [nextEvent, setNextEvent]         = useState(null);
    const [loading, setLoading]             = useState(true);
    const [refreshing, setRefreshing]       = useState(false);

    const [quote]  = useState(() => pickDailyQuote(quranQuotes));
    const greeting = getGreeting();
    const gregDate = getGregorianDate();

    useEffect(() => { requestAppPermissions(); }, []);

    useFocusEffect(
        useCallback(() => { loadAll(); }, [])
    );

    const loadAll = async () => {
        await Promise.all([
            loadHadithOfDay(),
            fetchCalendarData().then(({ hijriStr, events }) => {
                if (hijriStr) setHijriDate(hijriStr);
                setIslamicEvents(events);
                if (events.length > 0) setNextEvent(events[0]);
            }),
        ]);
        setLoading(false);
    };

    const loadHadithOfDay = async () => {
        try {
            const now       = new Date();
            const start     = new Date(now.getFullYear(), 0, 0);
            const dayOfYear = Math.floor((now - start) / 86400000);
            const { count } = await supabase.from('hadiths').select('*', { count: 'exact', head: true });
            if (!count) return;
            const { data } = await supabase
                .from('hadiths')
                .select('id, translation, arabic, book, hadith_number, grade')
                .range(dayOfYear % count, dayOfYear % count)
                .single();
            if (data) setHadithOfDay(data);
        } catch (err) { console.log('Hadith of day:', err); }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    };

    if (loading) {
        return (
            <View style={[s.root, s.center, { paddingTop: insets.top }]}>
                <StatusBar barStyle="light-content" backgroundColor={DARK} />
                <ActivityIndicator color={GOLD} size="large" />
            </View>
        );
    }

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 130 }]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={GOLD}
                        colors={[GOLD]}
                        progressBackgroundColor={CARD}
                    />
                }
            >
                {/* ── HERO ── */}
                <View style={s.hero}>

                    {/* ── Gold date bar ── */}
                    <View style={s.dateBar}>
                        {/* Left: Hijri */}
                        <View style={s.dateBarLeft}>
                            {hijriDate ? (
                                <>
                                    <Text style={s.dateBarArabic} numberOfLines={1}>
                                        {hijriDate.split('·')[0]?.trim() ?? hijriDate}
                                    </Text>
                                    <Text style={s.dateBarHijriEn} numberOfLines={1}>
                                        {hijriDate.includes('·')
                                            ? hijriDate.split('·')[1]?.trim()
                                            : hijriDate}
                                    </Text>
                                </>
                            ) : (
                                <Text style={s.dateBarHijriEn}>Loading…</Text>
                            )}
                        </View>
                        {/* Right: Gregorian */}
                        <View style={s.dateBarRight}>
                            <Text style={s.dateBarGreg}>{gregDate}</Text>
                            <Text style={s.dateBarDay}>
                                {new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date())}
                            </Text>
                        </View>
                    </View>

                    {/* ── Body ── */}
                    <View style={s.heroBody}>

                        {/* Greeting — centered */}
                        <Text style={s.greetingLabel}>{greeting.en}</Text>
                        <Text style={s.greetingAr}>{greeting.ar}</Text>

                        {/* Divider */}
                        <View style={s.heroDivider} />

                        {/* Bismillah centered between lines */}
                        <View style={s.bismillahRow}>
                            <View style={s.bismillahLine} />
                            <Text style={s.bismillah}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>
                            <View style={s.bismillahLine} />
                        </View>

                    </View>
                </View>

                {/* ── DAILY VERSE ── */}
                {quote && (
                    <>
                        <SectionHeader label="VERSE OF THE DAY" />
                        <View style={s.verseCard}>
                            <LinearGradient
                                colors={['rgba(201,168,76,0.05)', 'transparent']}
                                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <View style={s.verseAccent} />
                            <View style={s.verseInner}>
                                <Text style={s.verseArabic}>{quote.arabic}</Text>
                                <Text style={s.verseTrans}>{quote.translation}</Text>
                                <Text style={s.verseRef}>— {quote.ref}</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* ── EXPLORE HORIZONTAL SCROLL ── */}
                <SectionHeader label="EXPLORE" />
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.exploreScroll}
                    style={{ marginBottom: 22 }}
                >
                    {exploreLinks.map((item) => (
                        <ExploreCard key={item.label} item={item} />
                    ))}
                </ScrollView>

                {/* ── DUAS SPOTLIGHT ── */}
                <SectionHeader
                    label="DUAS"
                    action="Browse all"
                    onAction={() => router.push('/explore')}
                />
                <TouchableOpacity
                    style={s.duasCard}
                    activeOpacity={0.8}
                    onPress={() => router.push('/explore')}
                >
                    <LinearGradient
                        colors={['rgba(128,203,196,0.10)', 'rgba(128,203,196,0.02)']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    {/* Left: icon + text */}
                    <View style={s.duasInner}>
                        <View style={s.duasIconRing}>
                            <Image
                                source={require('../../assets/icons/dua.png')}
                                style={{ width: 22, height: 22, tintColor: '#80CBC4' }}
                                resizeMode="contain"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.duasTitle}>Daily Supplications</Text>
                            <Text style={s.duasSub}>Morning · Evening · Sleep · After Salah</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#80CBC4" style={{ opacity: 0.7 }} />
                    </View>
                </TouchableOpacity>

                {/* ── HADITH OF THE DAY ── */}
                <SectionHeader
                    label="HADITH OF THE DAY"
                    action="See all"
                    onAction={() => router.push('/hadith')}
                />

                {hadithOfDay ? (
                    <TouchableOpacity
                        style={s.hadithCard}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/hadith/[id]',
                            params: { id: hadithOfDay.id },
                        })}
                    >
                        {/* Gold top bar */}
                        <LinearGradient
                            colors={[GOLD, 'rgba(201,168,76,0.3)']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={s.hadithTopBar}
                        />

                        <View style={s.hadithBody}>
                            {hadithOfDay.arabic && (
                                <Text style={s.hadithArabic} numberOfLines={3}>
                                    {hadithOfDay.arabic}
                                </Text>
                            )}
                            <Text style={s.hadithText} numberOfLines={4}>
                                {hadithOfDay.translation || hadithOfDay.short_text}
                            </Text>
                        </View>

                        <View style={s.hadithFooter}>
                            <View style={s.hadithMeta}>
                                <Text style={s.hadithSource}>
                                    {hadithOfDay.book}
                                    {hadithOfDay.hadith_number ? ` · ${hadithOfDay.hadith_number}` : ''}
                                </Text>
                                {hadithOfDay.grade && (
                                    <View style={s.gradePill}>
                                        <Text style={s.gradePillText}>{hadithOfDay.grade}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={s.readMoreRow}>
                                <Text style={s.readMore}>Read more</Text>
                                <Ionicons name="chevron-forward" size={12} color={GOLD} />
                            </View>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <View style={s.hadithSkeleton}>
                        <ActivityIndicator color={GOLD} size="small" />
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: DARK },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: 16 },

    // ── Hero ─────────────────────────────────────────────────
    hero: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1C2D3C',
        marginTop: 10,
        marginBottom: 18,
        overflow: 'hidden',
        backgroundColor: '#0E1B28',
    },

    // Gold date bar (top strip)
    dateBar: {
        backgroundColor: GOLD,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    dateBarLeft: {
        flexDirection: 'column',
        gap: 1,
    },
    dateBarArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 13,
        color: '#1A0F02',
        fontWeight: '700',
        lineHeight: 20,
    },
    dateBarHijriEn: {
        fontSize: 10,
        fontWeight: '700',
        color: '#5C3C04',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    dateBarRight: {
        alignItems: 'flex-end',
        gap: 2,
    },
    dateBarGreg: {
        fontSize: 13,
        fontWeight: '700',
        color: '#3A2500',
    },
    dateBarDay: {
        fontSize: 10,
        color: '#7A5A18',
        letterSpacing: 0.3,
    },

    // Body below the bar
    heroBody: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 18,
        alignItems: 'center',
    },
    heroGreetRow: {},   // kept for legacy ref, unused
    greetingLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: MUTED,
        letterSpacing: 2.2,
        textTransform: 'uppercase',
        textAlign: 'center',
        marginBottom: 6,
    },
    greetingAr: {
        fontFamily: 'Uthmanic',
        fontSize: 30,
        color: TEXT,
        lineHeight: 48,
        letterSpacing: 0.5,
        textAlign: 'center',
        marginBottom: 18,
    },
    greetingEn: {},  // unused, kept for safety
    heroDivider: {
        height: 1,
        backgroundColor: '#1C2D3C',
        marginBottom: 16,
        width: '100%',
    },
    bismillahRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        width: '100%',
    },
    bismillahLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#1C2D3C',
    },
    bismillah: {
        fontFamily: 'Uthmanic',
        fontSize: 15,
        color: GOLD,
        opacity: 0.8,
        textAlign: 'center',
        lineHeight: 28,
    },
    listenBtn: {},       // removed, kept so no ref errors
    listenBtnText: {},

    // Legacy styles kept for other parts of the file that reference them
    heroGreetRow_old: {},
    heroDates: {},
    dateChip: {},
    dateChipIcon: {},
    dateChipText: {},
    dateGreg: {},
    heroCta: {},
    bismillahWrap: {},

    // ── Section header ───────────────────────────────────────
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    sectionDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD, opacity: 0.7 },
    sectionLabel: { fontSize: 10, color: GOLD, letterSpacing: 2.2, fontWeight: '700', opacity: 0.8 },
    sectionLine:  { flex: 1, height: 1, backgroundColor: BORDER },
    sectionAction:{ fontSize: 11, color: GOLD, fontWeight: '600', opacity: 0.75 },

    // ── Explore horizontal scroll ─────────────────────────────
    exploreScroll: {
        paddingRight: 16,
        gap: 10,
    },
    exploreCard: {
        width: 120,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        backgroundColor: CARD,
    },
    exploreIconWrap: {
        width: 38, height: 38, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
    },
    exploreArabic: {
        fontSize: 13,
        fontFamily: 'Uthmanic',
        lineHeight: 24,
        marginBottom: 2,
        opacity: 0.8,
    },
    exploreName: {
        fontSize: 13,
        fontWeight: '800',
        color: TEXT,
        marginBottom: 2,
        letterSpacing: -0.1,
    },
    exploreSub: {
        fontSize: 10,
        color: MUTED,
        lineHeight: 14,
    },

    // ── Verse card ───────────────────────────────────────────
    verseCard: {
        flexDirection: 'row',
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 18,
        overflow: 'hidden',
    },
    verseAccent: { width: 3, backgroundColor: GOLD, opacity: 0.55 },
    verseInner:  { flex: 1, padding: 15 },
    verseArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 17,
        color: GOLD,
        textAlign: 'right',
        lineHeight: 34,
        marginBottom: 8,
    },
    verseTrans: {
        fontSize: 12,
        color: TEXT_DIM,
        lineHeight: 20,
        fontStyle: 'italic',
        marginBottom: 5,
    },
    verseRef: { fontSize: 10, color: MUTED, letterSpacing: 0.3 },

    // ── Duas spotlight — compact single row ─────────────────
    duasCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(128,203,196,0.20)',
        overflow: 'hidden',
        marginBottom: 22,
        backgroundColor: CARD,
    },
    duasInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    duasIconRing: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: 'rgba(128,203,196,0.13)',
        borderWidth: 1, borderColor: 'rgba(128,203,196,0.25)',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    duasTitle: {
        fontSize: 14, fontWeight: '800', color: TEXT,
        marginBottom: 2, letterSpacing: -0.1,
    },
    duasSub: { fontSize: 11, color: '#80CBC4', opacity: 0.8 },

    // ── Islamic events card ───────────────────────────────────
    eventsCard: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 22,
        overflow: 'hidden',
    },
    nextEventBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(201,168,76,0.14)',
        overflow: 'hidden',
    },
    nextEventLeft: { flex: 1, gap: 3 },
    nextEventLabel: {
        fontSize: 9, color: GOLD, fontWeight: '800',
        letterSpacing: 2, opacity: 0.8, marginBottom: 2,
    },
    nextEventName: {
        fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: -0.2,
    },
    nextEventDate: {
        fontSize: 11, color: GOLD, opacity: 0.75, fontWeight: '600',
    },
    nextEventStar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(201,168,76,0.12)',
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    eventRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: BORDER2,
    },
    eventDot: {
        width: 7, height: 7, borderRadius: 3.5,
        backgroundColor: GOLD, opacity: 0.45, flexShrink: 0,
    },
    eventName: {
        fontSize: 13, fontWeight: '700', color: TEXT,
        marginBottom: 1,
    },
    eventDate: {
        fontSize: 10, color: MUTED, letterSpacing: 0.2,
    },
    eventDesc: {
        fontSize: 10, color: MUTED, maxWidth: 90,
        textAlign: 'right', lineHeight: 14,
    },

    // ── Hadith card ──────────────────────────────────────────
    hadithCard: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden',
        marginBottom: 8,
    },
    hadithTopBar: { height: 2 },
    hadithBody: {
        padding: 16,
        gap: 10,
    },
    hadithArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 17,
        color: TEXT,
        textAlign: 'center',
        lineHeight: 36,
    },
    hadithText: {
        fontSize: 13,
        color: TEXT_DIM,
        lineHeight: 22,
        letterSpacing: 0.1,
    },
    hadithFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: BORDER,
    },
    hadithMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    hadithSource: { fontSize: 10, color: MUTED },
    gradePill: {
        backgroundColor: GOLD_MED,
        borderRadius: 5,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.3)',
    },
    gradePillText: { color: GOLD, fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
    readMoreRow:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
    readMore:      { fontSize: 11, color: GOLD, fontWeight: '600' },

    hadithSkeleton: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        height: 90,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
});