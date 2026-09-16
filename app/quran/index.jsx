/**
 * app/quran/index.jsx — Surah list
 *
 * Changes:
 * • SurahCard redesigned as a 2-column grid tile (was a single-column row) —
 *   more scannable, more visual, and cuts the scroll length of 114 items
 *   roughly in half.
 * • Each tile has a bookmark toggle, backed by `quran_bookmarks`
 *   (surah-level bookmark: ayah_number IS NULL)
 * • Local MiniPlayerBar removed — global one in _layout.tsx persists everywhere
 * • Bottom padding accounts for global MiniPlayerBar + tab bar
 */

import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, TextInput, StyleSheet, StatusBar,
} from 'react-native';
import { useEffect, useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSurahs } from '../../src/services/quranApi';
import AudioStore from '../../src/services/audioStore';
import supabase from '../../src/services/supabase';
import { getDeviceId } from '../../src/utils/device';

const DARK      = '#0C1520';
const CARD      = '#111C26';
const GOLD      = '#C9A84C';
const GOLD_L    = 'rgba(201,168,76,0.10)';
const GOLD_M    = 'rgba(201,168,76,0.20)';
const GREEN     = '#4CAF50';
const TEXT      = '#F0EAD6';
const TEXT_D    = '#C8B99A';
const MUTED     = '#5A6A7A';
const BORDER    = 'rgba(201,168,76,0.12)';

// ── Surah Card — 2-column grid tile ───────────────────────────────────────────
const SurahCard = ({ item, onPress, isActive, isBookmarked, onToggleBookmark }) => {
    const place = item.revelation_place
        ? item.revelation_place.charAt(0).toUpperCase() + item.revelation_place.slice(1)
        : null;

    return (
        <TouchableOpacity
            style={[s.card, isActive && s.cardActive]}
            activeOpacity={0.8}
            onPress={onPress}
        >
            {/* Active indicator */}
            {isActive && <View style={s.activeBar} />}

            {/* Top row: number badge + bookmark */}
            <View style={s.cardTopRow}>
                <View style={[s.badge, isActive && s.badgeActive]}>
                    <Text style={[s.badgeText, isActive && s.badgeTextActive]}>
                        {item.number}
                    </Text>
                </View>

                <TouchableOpacity
                    style={s.bookmarkBtn}
                    onPress={() => onToggleBookmark(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons
                        name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                        size={16}
                        color={isBookmarked ? GOLD : MUTED}
                    />
                </TouchableOpacity>
            </View>

            {/* Arabic name — the visual anchor of the tile */}
            <Text
                style={[s.arabic, isActive && s.arabicActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {item.name_arabic}
            </Text>

            {/* English name */}
            <View style={s.nameRow}>
                <Text style={s.english} numberOfLines={1}>
                    {item.name_english}
                </Text>
                {isActive && (
                    <Ionicons name="volume-medium" size={12} color={GREEN} />
                )}
            </View>

            {/* Translation */}
            <Text style={s.translation} numberOfLines={1}>
                {item.name_translation}
            </Text>

            {/* Footer: revelation place + ayah count */}
            <View style={s.cardFooter}>
                {place && (
                    <View style={s.metaChip}>
                        <Ionicons
                            name={place === 'Meccan' ? 'moon-outline' : 'business-outline'}
                            size={10}
                            color={MUTED}
                        />
                        <Text style={s.metaChipText}>{place}</Text>
                    </View>
                )}
                <Text style={s.meta}>{item.verses_count} Ayahs</Text>
            </View>
        </TouchableOpacity>
    );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function QuranScreen() {
    const insets = useSafeAreaInsets();

    const [filtered, setFiltered]         = useState([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState(null);
    const [query, setQuery]               = useState('');
    const [lastRead, setLastRead]         = useState(null);
    const [shuffleSurahs, setShuffleSurahs] = useState(false);
    const [shuffleBannerVisible, setShuffleBannerVisible] = useState(false);
    const [audio, setAudio]               = useState(AudioStore.getState());
    const [bookmarkedSurahs, setBookmarkedSurahs] = useState(new Set());
    const shuffleBannerTimer = useRef(null);

    const allSurahs = useRef([]);

    useEffect(() => {
        const unsub = AudioStore.subscribe(setAudio);
        return unsub;
    }, []);

    useEffect(() => {
        loadSurahs();
        loadBookmarks();
        AsyncStorage.getItem('last_read_surah')
            .then(v => v && setLastRead(JSON.parse(v)))
            .catch(() => {});
    }, []);

    const loadBookmarks = async () => {
        try {
            const device_id = await getDeviceId();
            const { data, error } = await supabase
                .from('quran_bookmarks')
                .select('surah_number')
                .eq('device_id', device_id)
                .is('ayah_number', null);
            if (!error && Array.isArray(data)) {
                setBookmarkedSurahs(new Set(data.map(r => r.surah_number)));
            }
        } catch (_) {}
    };

    const toggleSurahBookmark = useCallback(async (item) => {
        const num = item.number;
        const wasBookmarked = bookmarkedSurahs.has(num);

        // Optimistic update
        setBookmarkedSurahs(prev => {
            const next = new Set(prev);
            wasBookmarked ? next.delete(num) : next.add(num);
            return next;
        });

        try {
            const device_id = await getDeviceId();
            if (wasBookmarked) {
                await supabase.from('quran_bookmarks').delete()
                    .eq('device_id', device_id).eq('surah_number', num).is('ayah_number', null);
            } else {
                await supabase.from('quran_bookmarks').insert({
                    device_id, surah_number: num, ayah_number: null,
                });
            }
        } catch (e) {
            console.error('[SurahBookmark]', e);
            // Revert on failure
            setBookmarkedSurahs(prev => {
                const next = new Set(prev);
                wasBookmarked ? next.add(num) : next.delete(num);
                return next;
            });
        }
    }, [bookmarkedSurahs]);

    useEffect(() => {
        AudioStore.setShuffleSurahs(shuffleSurahs);
        if (shuffleSurahs) {
            setShuffleBannerVisible(true);
            clearTimeout(shuffleBannerTimer.current);
            shuffleBannerTimer.current = setTimeout(() => setShuffleBannerVisible(false), 2800);
        } else {
            setShuffleBannerVisible(false);
            clearTimeout(shuffleBannerTimer.current);
        }
        return () => clearTimeout(shuffleBannerTimer.current);
    }, [shuffleSurahs]);

    const applyFilters = (list, q) => {
        let result = list;
        if (q.trim()) {
            const lq = q.trim().toLowerCase();
            result = result.filter(s =>
                s.name_english?.toLowerCase().includes(lq) ||
                s.name_translation?.toLowerCase().includes(lq) ||
                String(s.number).includes(lq)
            );
        }
        return result;
    };

    const loadSurahs = async () => {
        try {
            setLoading(true);
            setError(null);
            const res  = await getSurahs();
            const list = res?.data?.surahs;
            if (res?.success && Array.isArray(list) && list.length > 0) {
                allSurahs.current = list;
                setFiltered(applyFilters(list, query));
            } else {
                setError('Could not load surahs.');
            }
        } catch {
            setError('Network error. Check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = useCallback((text) => {
        setQuery(text);
        setFiltered(applyFilters(allSurahs.current, text));
    }, []);

    const persistLastRead = useCallback(async (number, ayah = null) => {
        try {
            const surah = allSurahs.current.find(
                su => Number(su.number) === Number(number)
            );

            const name = surah?.name_english
                ?? (Number(lastRead?.number) === Number(number)
                    ? lastRead?.name
                    : null)
                ?? `Surah ${number}`;

            const next = {
                number: Number(number),
                name,
                ayah: ayah ? Number(ayah) : null,
            };

            await AsyncStorage.setItem(
                'last_read_surah',
                JSON.stringify(next)
            );

            setLastRead(next);
        } catch (_) {}
    }, [lastRead]);

    // Any real playback anywhere in the app (surah screen, ayah screen, search,
    // player) flows through this same AudioStore subscription — so this is the
    // one place that needs to persist "last read", instead of multiple screens
    // writing partial objects to the same AsyncStorage key.
    useEffect(() => {
        if (loading) return; // wait until allSurahs is populated so the name resolves
        if (!audio.surahId || !audio.playingAyah) return;
        persistLastRead(audio.surahId, audio.playingAyah);
    }, [audio.surahId, audio.playingAyah, loading, persistLastRead]);

    const handleSurahPress = useCallback(async (item) => {
        // Opening a surah fresh from the browse list — no specific ayah yet.
        await persistLastRead(item.number, null);
        router.push(`/quran/surah/${item.number}`);
    }, [persistLastRead]);

    const renderItem = useCallback(({ item }) => (
        <SurahCard
            item={item}
            isActive={audio.surahId === item.number}
            isBookmarked={bookmarkedSurahs.has(item.number)}
            onPress={() => handleSurahPress(item)}
            onToggleBookmark={toggleSurahBookmark}
        />
    ), [audio.surahId, handleSurahPress, bookmarkedSurahs, toggleSurahBookmark]);

    const keyExtractor = useCallback((item) => item.number.toString(), []);

    if (loading) return (
        <View style={[s.root, s.centerFill, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={s.loadingText}>Loading Quran…</Text>
        </View>
    );

    if (error) return (
        <View style={[s.root, s.centerFill, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <Ionicons name="wifi-outline" size={44} color={MUTED} />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={loadSurahs}>
                <Text style={s.retryText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* ── Header ─────────────────────────────── */}
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={20} color={GOLD} />
                    </TouchableOpacity>
                </View>

                <View style={s.headerCenter}>
                    <Text style={s.headerAr}>القُرْآن الكَرِيم</Text>
                    <Text style={s.headerEn}>Holy Quran</Text>
                </View>

                <View style={s.headerRight}>
                    <TouchableOpacity
                        style={[s.iconBtn, shuffleSurahs && s.iconBtnShuffle]}
                        onPress={() => setShuffleSurahs(p => !p)}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="shuffle" size={16} color={shuffleSurahs ? DARK : GOLD} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={s.iconBtn}
                        onPress={() => router.push('/quran/search')}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="search-outline" size={18} color={GOLD} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Shuffle toast — auto-dismisses ─────── */}
            {shuffleBannerVisible && (
                <View style={s.shuffleToast}>
                    <Ionicons name="shuffle" size={13} color={GREEN} />
                    <Text style={s.shuffleToastText}>Shuffle on</Text>
                </View>
            )}

            <FlatList
                data={filtered}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                numColumns={2}
                columnWrapperStyle={s.row}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 140 }]}
                ListHeaderComponent={
                    <View>
                        {/* Last read */}
                        {lastRead && (
                            <TouchableOpacity
                                style={s.lastReadCard}
                                onPress={() => {
                                    router.push({
                                        pathname: `/quran/surah/${lastRead.number}`,
                                        params: {
                                            notificationAyah: lastRead.ayah ? String(lastRead.ayah) : undefined,
                                            autoPlay: lastRead.ayah ? '1' : undefined,
                                        },
                                    });
                                }}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['rgba(201,168,76,0.18)', 'rgba(201,168,76,0.06)']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                <View style={s.lastReadIcon}>
                                    <Ionicons name="bookmark" size={16} color={GOLD} />
                                </View>
                                <View style={s.lastReadInfo}>
                                    <Text style={s.lastReadLabel}>Continue Reading</Text>
                                    <Text style={s.lastReadName} numberOfLines={1}>
                                        {lastRead.name ?? `Surah ${lastRead.number}`}{lastRead.ayah ? ` · Ayah ${lastRead.ayah}` : ''}
                                    </Text>
                                </View>
                                <Ionicons name="play-circle" size={32} color={GOLD} />
                            </TouchableOpacity>
                        )}

                        {/* Search bar */}
                        <View style={s.searchWrap}>
                            <Ionicons name="search-outline" size={16} color={MUTED} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search by name or number…"
                                placeholderTextColor={MUTED}
                                value={query}
                                onChangeText={handleSearch}
                                returnKeyType="search"
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            {query.length > 0 && (
                                <TouchableOpacity onPress={() => handleSearch('')}>
                                    <Ionicons name="close-circle" size={16} color={MUTED} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {query.trim().length > 0 && (
                            <Text style={s.resultCount}>
                                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                            </Text>
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <View style={s.emptyWrap}>
                        <Ionicons name="search-outline" size={36} color={MUTED} />
                        <Text style={s.emptyText}>No surahs match "{query}"</Text>
                    </View>
                }
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={10}
                removeClippedSubviews
            />
        </View>
    );
}

const s = StyleSheet.create({
    root:       { flex: 1, backgroundColor: DARK },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

    // ── Header ───────────────────────────────────────────────
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    headerLeft:   { width: 80, alignItems: 'flex-start' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerRight:  { width: 80, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    headerAr:  { fontFamily: 'Uthmanic', fontSize: 16, color: GOLD, letterSpacing: 0.5 },
    headerEn:  { fontSize: 11, color: TEXT_D, fontWeight: '600', letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase' },

    iconBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: GOLD_M,
    },
    iconBtnShuffle: { backgroundColor: GREEN, borderColor: GREEN },

    // ── Shuffle toast ─────────────────────────────────────────
    shuffleToast: {
        position: 'absolute', top: 70, alignSelf: 'center', zIndex: 99,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(76,175,80,0.92)',
        borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
        shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 10, elevation: 12,
    },
    shuffleToastText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // ── List ──────────────────────────────────────────────────
    listContent: { paddingHorizontal: 16, paddingTop: 4 },

    // ── Stats row ─────────────────────────────────────────────
    statsRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD, borderRadius: 16, marginTop: 16, marginBottom: 14,
        paddingVertical: 16, borderWidth: 1, borderColor: BORDER,
    },
    statItem:    { flex: 1, alignItems: 'center' },
    statNum:     { color: GOLD, fontSize: 20, fontWeight: '800' },
    statLabel:   { color: MUTED, fontSize: 11, marginTop: 2, letterSpacing: 0.3 },
    statDivider: { width: 1, height: 30, backgroundColor: BORDER },

    // ── Last read card ────────────────────────────────────────
    lastReadCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: CARD, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
        marginBottom: 14, overflow: 'hidden',
    },
    lastReadIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: GOLD_M, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: GOLD_M, flexShrink: 0,
    },
    lastReadInfo:  { flex: 1 },
    lastReadLabel: { color: MUTED, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
    lastReadName:  { color: TEXT, fontSize: 14, fontWeight: '700' },

    // ── Search ────────────────────────────────────────────────
    searchWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD, borderRadius: 14,
        borderWidth: 1, borderColor: BORDER,
        marginBottom: 10,
        paddingHorizontal: 12, paddingVertical: 11, gap: 8,
    },
    searchInput:  { flex: 1, color: TEXT, fontSize: 14, padding: 0 },
    resultCount:  { color: MUTED, fontSize: 11, marginBottom: 8, marginLeft: 2 },

    // ── Surah grid ────────────────────────────────────────────
    row: {
        justifyContent: 'space-between',
    },

    // ── Surah card (grid tile) ──────────────────────────────────
    card: {
        width: '48.5%',
        borderRadius: 18,
        marginBottom: 12,
        backgroundColor: CARD,
        borderWidth: 1, borderColor: BORDER,
        paddingVertical: 14, paddingHorizontal: 14,
        position: 'relative', overflow: 'hidden',
        minHeight: 148,
    },
    cardActive: { borderColor: 'rgba(76,175,80,0.35)', backgroundColor: 'rgba(76,175,80,0.08)' },
    activeBar: {
        position: 'absolute', left: 0, top: 0, right: 0,
        height: 3, backgroundColor: GREEN,
    },
    cardTopRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
    },
    badge: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: GOLD_L,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: GOLD_M,
    },
    badgeActive:     { backgroundColor: GREEN, borderColor: GREEN },
    badgeText:       { color: GOLD, fontWeight: '700', fontSize: 12 },
    badgeTextActive: { color: DARK },
    bookmarkBtn:     { padding: 2 },

    arabic: {
        fontFamily: 'Uthmanic', color: GOLD, fontSize: 24,
        textAlign: 'right', marginBottom: 8, lineHeight: 34,
    },
    arabicActive: { color: '#7AE87F' },

    nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
    english:     { color: TEXT, fontSize: 14, fontWeight: '700', flexShrink: 1 },
    translation: { color: TEXT_D, fontSize: 11.5, marginBottom: 10 },

    cardFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto',
    },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: GOLD_L, borderRadius: 8,
        paddingHorizontal: 6, paddingVertical: 3,
    },
    metaChipText: { color: MUTED, fontSize: 9.5, fontWeight: '600' },
    meta:         { color: MUTED, fontSize: 10.5, letterSpacing: 0.2 },

    // ── Empty / error ─────────────────────────────────────────
    emptyWrap:   { paddingTop: 60, alignItems: 'center', gap: 12 },
    emptyText:   { color: MUTED, fontSize: 14 },
    loadingText: { color: MUTED, fontSize: 13, marginTop: 8 },
    errorText:   { color: TEXT_D, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retryBtn:    { backgroundColor: GOLD_L, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1, borderColor: GOLD_M },
    retryText:   { color: GOLD, fontWeight: '700', fontSize: 14 },
});