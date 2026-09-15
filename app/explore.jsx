import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, StatusBar, ActivityIndicator,
    Animated,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import supabase from '../src/services/supabase';
import { DUA_CATEGORIES } from '../src/constants/duaCategories';

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.08)';
const GOLD_MED   = 'rgba(201,168,76,0.18)';
const DARK       = '#0C1520';
const CARD       = '#111D2B';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#4A5A6A';
const MUTED_MID  = '#7A8A9A';
const BORDER     = 'rgba(255,255,255,0.06)';

export default function DuaScreen() {
    const insets = useSafeAreaInsets();
    const [query,          setQuery]          = useState('');
    const [categoryCounts, setCategoryCounts] = useState({});
    const [totalDuas,      setTotalDuas]      = useState(0);
    const [countsLoading,  setCountsLoading]  = useState(true);
    const searchAnim  = useRef(new Animated.Value(0)).current;
    const headerAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        fetchCounts();
    }, []);

    // A dua can belong to more than one category (see `tags`), so per-tile
    // counts and the overall total are fetched separately — summing the
    // tile counts would double-count any dua that's tagged into two
    // categories, which doesn't happen with hadith (one source each).
    const fetchCounts = async () => {
        setCountsLoading(true);
        try {
            const [{ data: rows, error: tagsErr }, { count, error: countErr }] =
                await Promise.all([
                    supabase.from('duas').select('tags'),
                    supabase.from('duas').select('*', { count: 'exact', head: true }),
                ]);

            if (tagsErr) throw tagsErr;
            if (countErr) throw countErr;

            const counts = {};
            rows?.forEach(row => {
                (row.tags || []).forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            });
            setCategoryCounts(counts);
            if (count !== null) setTotalDuas(count);
        } catch (e) {
            console.error('DuaCounts:', e.message);
        } finally {
            setCountsLoading(false);
        }
    };

    const visibleCategories = DUA_CATEGORIES.filter(
        cat => (categoryCounts[cat.key] ?? 0) > 0
    );

    const handleSearchFocus = () =>
        Animated.timing(searchAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    const handleSearchBlur = () =>
        Animated.timing(searchAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();

    const handleSearch = () => {
        const trimmed = query.trim();
        if (trimmed) router.push(`/explore/search?q=${encodeURIComponent(trimmed)}`);
    };

    const searchBorderColor = searchAnim.interpolate({
        inputRange:  [0, 1],
        outputRange: ['rgba(255,255,255,0.06)', 'rgba(201,168,76,0.30)'],
    });

    const renderCategory = ({ item }) => {
        const count = categoryCounts[item.key];
        return (
            <TouchableOpacity
                style={s.card}
                onPress={() => router.push(`/explore/category/${encodeURIComponent(item.key)}`)}
                activeOpacity={0.72}
            >
                {/* Accent bar along the top — reads better on a squarer grid tile */}
                <View style={[s.cardAccent, { backgroundColor: item.color ?? GOLD }]} />

                <View style={s.cardInner}>
                    {/* Arabic title */}
                    <Text style={s.cardArabic} numberOfLines={1}>{item.arabic}</Text>

                    {/* English title */}
                    <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>

                    {/* Footer: color dot + accurate count, or a loading dash while counts resolve */}
                    <View style={s.cardFooter}>
                        <View style={[s.cardDot, { backgroundColor: item.color ?? GOLD }]} />
                        <Text style={s.cardCount} numberOfLines={1}>
                            {count != null ? `${count.toLocaleString()} duas` : '—'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />

            {/* ── Header ── */}
            <Animated.View style={[s.header, {
                opacity: headerAnim,
                transform: [{ translateY: headerAnim.interpolate({
                        inputRange: [0, 1], outputRange: [-10, 0],
                    }) }],
            }]}>
                <View>
                    <Text style={s.headerSuper}>الأدعية</Text>
                    <Text style={s.headerTitle}>Duas</Text>
                    <Text style={s.headerSub}>
                        {countsLoading
                            ? '—'
                            : `${totalDuas.toLocaleString()} duas · ${visibleCategories.length} categories`
                        }
                    </Text>
                </View>
                <TouchableOpacity
                    style={s.headerBtn}
                    onPress={() => router.push('/explore/saved-duas')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="bookmark-outline" size={18} color={GOLD} />
                </TouchableOpacity>
            </Animated.View>

            {/* ── Search bar ── */}
            <Animated.View style={[s.searchWrap, { borderColor: searchBorderColor }]}>
                <Ionicons name="search-outline" size={15} color={MUTED} style={s.searchIcon} />
                <TextInput
                    placeholder="Search duas, Arabic, topics…"
                    placeholderTextColor={MUTED}
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={handleSearch}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                    returnKeyType="search"
                    style={s.searchInput}
                    selectionColor={GOLD}
                />
                {query.length > 0 ? (
                    <TouchableOpacity onPress={() => setQuery('')}
                                      hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
                        <Ionicons name="close-circle" size={16} color={MUTED} />
                    </TouchableOpacity>
                ) : null}
            </Animated.View>

            {/* ── Categories label ── */}
            <Text style={s.sectionLabel}>Categories</Text>

            {/* ── Grid ── */}
            {countsLoading ? (
                <View style={s.loader}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loaderText}>Loading categories…</Text>
                </View>
            ) : (
                <FlatList
                    data={visibleCategories}
                    keyExtractor={item => item.key}
                    renderItem={renderCategory}
                    numColumns={2}
                    columnWrapperStyle={s.gridRow}
                    contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: DARK },

    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'flex-end', marginTop: 16, marginBottom: 20,
        paddingHorizontal: 20,
    },
    headerSuper: { fontFamily: 'Uthmanic', fontSize: 14, color: GOLD, opacity: 0.7, marginBottom: 3, letterSpacing: 1, lineHeight: 28 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    headerSub:   { fontSize: 12, color: MUTED_MID, marginTop: 3 },
    headerBtn: {
        width: 42, height: 42, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
        paddingHorizontal: 14, marginBottom: 20, height: 48,
        marginHorizontal: 20,
    },
    searchIcon:  { marginRight: 10 },
    searchInput: { flex: 1, fontSize: 14, color: TEXT, height: '100%' },

    sectionLabel: {
        fontSize: 10,
        color: MUTED,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        paddingHorizontal: 20,
        marginBottom: 4,
    },

    listContent: { paddingHorizontal: 14, paddingTop: 6 },
    gridRow:     { gap: 10, marginBottom: 10 },

    // ── Grid tile (2 per row) ────────────────────────────────
    card: {
        flex: 1,
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.10)',
        overflow: 'hidden',
        minHeight: 128,
    },
    cardAccent: {
        height: 3,
        width: '100%',
        opacity: 0.7,
    },
    cardInner: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 14,
        justifyContent: 'space-between',
        alignItems: 'center',
    },

    cardArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 17,
        color: TEXT,
        lineHeight: 30,
        marginBottom: 6,
        textAlign: 'center',
    },

    cardTitle: {
        fontSize: 12.5,
        color: TEXT_DIM,
        fontWeight: '500',
        letterSpacing: 0.1,
        lineHeight: 17,
        marginBottom: 10,
        textAlign: 'center',
    },

    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
    },
    cardCount: {
        fontSize: 10.5,
        color: MUTED_MID,
        letterSpacing: 0.1,
        flexShrink: 1,
        textAlign: 'center',
    },
    cardDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        opacity: 0.8,
    },
    loader:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { color: MUTED_MID, fontSize: 13 },
});
