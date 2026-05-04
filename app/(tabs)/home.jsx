import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, StatusBar, ActivityIndicator,
    Dimensions, RefreshControl,Image
} from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import supabase from '../../src/services/supabase';
import { getDeviceId } from '../../src/utils/device';
import { quranQuotes } from '../../src/constants/quranQuotes';

const { width } = Dimensions.get('window');

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.22)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';

// All 4 tiles identical: (screen - padding×2 - single gap) / 2 columns
const TILE_WIDTH = (width - 16 * 2 - 10) / 2;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getHijriDate() {
    try {
        return new Intl.DateTimeFormat('en-u-ca-islamic', {
            day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date());
    } catch { return null; }
}

function getGregorianDate() {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date());
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return { ar: 'صَبَاحُ الخَيْر', en: 'Good Morning' };
    if (h < 17) return { ar: 'مَسَاءُ الخَيْر', en: 'Good Afternoon' };
    return { ar: 'مَسَاءُ النُّور', en: 'Good Evening' };
}

// ── Quote picker ─────────────────────────────────────────────────────────────
// djb2 hash over the ISO date string "YYYY-MM-DD".
// • Deterministic for the whole day → no flicker on re-render or focus events.
// • Different every calendar day with good distribution.
// • Pure function, zero side-effects; called once via lazy useState initialiser.
function hashCode(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    }
    return h;
}

function pickDailyQuote(quotes) {
    const seed  = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const index = Math.abs(hashCode(seed)) % quotes.length;
    return quotes[index];
}

// ── Explore links (all equal weight) ─────────────────────────────────────────
const exploreLinks = [
    {
        label: 'Quran',
        sublabel: 'Read & recite',
        arabic: 'قُرْآن',
        icon: 'book-outline',
        iconLib: 'ion',
        route: '/quran',
    },
    {
        label: 'Salah & Qibla finder',
        sublabel: 'Track your salah',
        arabic: 'صَلَاة',
        icon: require('../../assets/icons/prayer.png'),
        iconLib: 'image',
        route: '/prayer-tracker',
    },
    {
        label: 'Streak',
        sublabel: 'Daily consistency',
        arabic: 'مُوَاظَبَة',
        icon: 'flame-outline',
        iconLib: 'ion',
        route: '/streak',
    },
    {
        label: 'Duas',
        sublabel: 'Supplications',
        arabic: 'أدعية',
        icon: require('../../assets/icons/dua.png'),
        iconLib: 'image',
        route: '/explore',
    },
];

export default function HomeScreen() {
    const insets = useSafeAreaInsets();

    const [hadithOfDay, setHadithOfDay] = useState(null);
    const [stats, setStats]             = useState({ hadiths: 0, bookmarks: 0 });
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);

    // Lazy initialiser — runs exactly once at mount, never re-runs on focus.
    // No setQuote call anywhere, no extra render, no flicker.
    const [quote] = useState(() => pickDailyQuote(quranQuotes));

    const greeting  = getGreeting();
    const hijriDate = getHijriDate();
    const gregDate  = getGregorianDate();

    // useFocusEffect only triggers network fetches — quote is intentionally absent.
    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    const loadAll = async () => {
        await Promise.all([loadHadithOfDay(), loadStats()]);
        setLoading(false);
    };

    const loadHadithOfDay = async () => {
        try {
            const now       = new Date();
            const start     = new Date(now.getFullYear(), 0, 0);
            const dayOfYear = Math.floor((now - start) / 86400000);

            const { count } = await supabase
                .from('hadiths')
                .select('*', { count: 'exact', head: true });

            if (!count) return;

            const { data } = await supabase
                .from('hadiths')
                .select('id, translation, arabic, book, hadith_number, grade')
                .range(dayOfYear % count, dayOfYear % count)
                .single();

            if (data) setHadithOfDay(data);
        } catch (err) {
            console.log('Hadith of day error:', err);
        }
    };

    const loadStats = async () => {
        try {
            const device_id = getDeviceId();

            const [{ count: hadithCount }, { count: bookmarkCount }] = await Promise.all([
                supabase.from('hadiths').select('*', { count: 'exact', head: true }),
                supabase
                    .from('bookmarks')
                    .select('*', { count: 'exact', head: true })
                    .eq('device_id', device_id),
            ]);

            setStats({ hadiths: hadithCount ?? 0, bookmarks: bookmarkCount ?? 0 });
        } catch (err) {
            console.log('Stats error:', err);
        }
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
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor={GOLD}
                        colors={[GOLD]}
                    />
                }
            >
                {/* ── HEADER ── */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.bismillah}>
                            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                        </Text>
                        <Text style={s.greetingAr}>{greeting.ar}</Text>
                        <Text style={s.greetingEn}>{greeting.en}</Text>
                    </View>
                </View>

                {/* ── DATE BANNER ── */}
                <View style={s.dateBanner}>
                    <View style={s.dateBannerInner}>
                        {hijriDate ? (
                            <Text style={s.hijriDate}>{hijriDate}</Text>
                        ) : null}
                        <Text style={s.gregDate}>{gregDate}</Text>
                    </View>
                    <Text style={s.dateDecor}>☽</Text>
                </View>

                {/* ── QURAN REMINDER ── */}
                {quote && (
                    <View style={s.reminderBanner}>
                        <Text style={s.reminderArabic}>{quote.arabic}</Text>
                        <Text style={s.reminderTrans}>{quote.translation}</Text>
                        <Text style={s.reminderRef}>— {quote.ref}</Text>
                    </View>
                )}

                {/* ── EXPLORE ── */}
                <Text style={s.sectionLabel}>EXPLORE</Text>

                {/* Clean 2×2 grid — identical tiles, no special-casing */}
                <View style={s.grid}>
                    {exploreLinks.map((item) => (
                        <TouchableOpacity
                            key={item.label}
                            style={s.tile}
                            activeOpacity={0.72}
                            onPress={() => router.push(item.route)}
                        >
                            <View style={s.tileIconWrap}>
                                {item.iconLib === 'image' ? (
                                    <Image
                                        source={item.icon}
                                        style={{ width: 22, height: 22, tintColor: GOLD }}
                                        resizeMode="contain"
                                    />
                                ) : item.iconLib === 'mci' ? (
                                    <MaterialCommunityIcons
                                        name={item.icon}
                                        size={22}
                                        color={GOLD}
                                    />
                                ) : (
                                    <Ionicons name={item.icon} size={22} color={GOLD} />
                                )}
                            </View>
                            <Text style={s.tileArabic}>{item.arabic}</Text>
                            <Text style={s.tileLabel}>{item.label}</Text>
                            <Text style={s.tileSub}>{item.sublabel}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── HADITH OF THE DAY ── */}
                <View style={s.sectionRow}>
                    <View style={s.sectionRule} />
                    <Text style={s.sectionLabel}>HADITH OF THE DAY</Text>
                    <View style={s.sectionRule} />
                </View>

                {hadithOfDay ? (
                    <TouchableOpacity
                        style={s.hadithCard}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/hadith/[id]',
                            params: { id: hadithOfDay.id },
                        })}
                    >
                        <View style={s.hadithCardAccent} />

                        {hadithOfDay.arabic ? (
                            <>
                                <Text style={s.hadithArabic}>{hadithOfDay.arabic}</Text>
                                <View style={s.hadithDivider} />
                            </>
                        ) : null}

                        <Text style={s.openQuote}>❝</Text>
                        <Text style={s.hadithText}>
                            {hadithOfDay.translation || hadithOfDay.short_text}
                        </Text>
                        <Text style={s.closeQuote}>❞</Text>

                        <View style={s.hadithFooter}>
                            <View style={s.hadithFooterLeft}>
                                <Text style={s.hadithSource}>
                                    {hadithOfDay.book}
                                    {hadithOfDay.hadith_number
                                        ? ` • Hadith ${hadithOfDay.hadith_number}`
                                        : ''}
                                </Text>
                            </View>
                            <View style={s.hadithRight}>
                                {hadithOfDay.grade ? (
                                    <View style={s.gradePill}>
                                        <Text style={s.gradePillText}>{hadithOfDay.grade}</Text>
                                    </View>
                                ) : null}
                                <View style={s.readMoreBtn}>
                                    <Text style={s.readMoreText}>Read Full Hadith</Text>
                                    <Ionicons name="chevron-forward" size={12} color={GOLD} />
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <View style={s.hadithCardEmpty}>
                        <ActivityIndicator color={GOLD} size="small" />
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: DARK },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: 16, paddingTop: 8 },

    // ── Header ───────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingBottom: 18,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        marginHorizontal: -16,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    headerLeft: { flex: 1 },
    bismillah: {
        fontFamily: 'Uthmanic',
        fontSize: 13,
        color: GOLD,
        opacity: 0.65,
        letterSpacing: 1,
        marginBottom: 8,
    },
    greetingAr: {
        fontFamily: 'Uthmanic',
        fontSize: 11,
        color: MUTED,
        letterSpacing: 1.5,
        marginBottom: 3,
    },
    greetingEn: {
        fontSize: 24,
        fontWeight: '700',
        color: TEXT,
        letterSpacing: 0.3,
    },

    // ── Date banner ──────────────────────────────────────────
    dateBanner: {
        backgroundColor: CARD,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    dateBannerInner: { flex: 1 },
    hijriDate: {
        fontSize: 13,
        color: GOLD,
        fontWeight: '600',
        letterSpacing: 0.3,
        marginBottom: 2,
    },
    gregDate: {
        fontSize: 12,
        color: MUTED,
        letterSpacing: 0.3,
    },
    dateDecor: {
        fontSize: 24,
        color: GOLD,
        opacity: 0.3,
    },

    // ── Section labels ───────────────────────────────────────
    sectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 10,
        color: GOLD,
        letterSpacing: 2.5,
        fontWeight: '700',
        opacity: 0.8,
        marginBottom: 8,
    },
    sectionRule: {
        flex: 1,
        height: 1,
        backgroundColor: BORDER,
    },

    // ── Explore grid ─────────────────────────────────────────
    // TILE_WIDTH is a module-level constant so StyleSheet.create() has the
    // value at parse time — no inline style override needed in the map().
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 28,
    },
    tile: {
        width: TILE_WIDTH,
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 16,
        overflow: 'hidden',
    },
    tileIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: GOLD_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    tileArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 11,
        color: GOLD,
        opacity: 0.6,
        letterSpacing: 1,
        marginBottom: 2,
    },
    tileLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: TEXT,
        marginBottom: 3,
    },
    tileSub: {
        fontSize: 11,
        color: MUTED,
        letterSpacing: 0.2,
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
    hadithCardAccent: {
        height: 3,
        backgroundColor: GOLD,
        opacity: 0.5,
    },
    hadithArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 20,
        color: TEXT,
        textAlign: 'center',
        lineHeight: 38,
        writingDirection: 'rtl',
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 4,
    },
    hadithDivider: {
        height: 1,
        backgroundColor: BORDER,
        marginHorizontal: 20,
        marginVertical: 14,
    },
    openQuote: {
        fontSize: 36,
        color: GOLD,
        opacity: 0.2,
        paddingHorizontal: 20,
        lineHeight: 40,
        marginBottom: -8,
    },
    hadithText: {
        fontSize: 15,
        color: TEXT_DIM,
        lineHeight: 26,
        paddingHorizontal: 20,
        paddingBottom: 4,
        letterSpacing: 0.2,
    },
    closeQuote: {
        fontSize: 36,
        color: GOLD,
        opacity: 0.2,
        textAlign: 'right',
        paddingHorizontal: 20,
        lineHeight: 40,
        marginBottom: 12,
    },
    hadithFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    hadithFooterLeft: { flex: 1, marginRight: 8 },
    hadithSource: {
        fontSize: 12,
        color: MUTED,
        fontStyle: 'italic',
    },
    hadithRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    gradePill: {
        backgroundColor: GOLD_MED,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.35)',
    },
    gradePillText: {
        color: GOLD,
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    readMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    readMoreText: {
        fontSize: 12,
        color: GOLD,
        fontWeight: '600',
    },
    hadithCardEmpty: {
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },

    // ── Quran reminder ───────────────────────────────────────
    reminderBanner: {
        marginTop: 24,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
        alignItems: 'center',
        marginBottom: 28,
    },
    reminderArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 18,
        color: GOLD,
        textAlign: 'center',
        lineHeight: 32,
        marginBottom: 10,
        writingDirection: 'rtl',
    },
    reminderTrans: {
        fontSize: 13,
        color: TEXT_DIM,
        textAlign: 'center',
        lineHeight: 20,
        fontStyle: 'italic',
        marginBottom: 6,
    },
    reminderRef: {
        fontSize: 11,
        color: MUTED,
        letterSpacing: 0.5,
    },
});