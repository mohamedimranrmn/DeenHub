import { useEffect, useState, useRef, useCallback } from "react";
import {
    View, FlatList, TouchableOpacity, Text,
    StyleSheet, StatusBar, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import supabase from "../../../src/services/supabase";
import { DUA_CATEGORIES } from "../../../src/constants/duaCategories";

const PAGE_SIZE   = 30;
const CARD_HEIGHT = 110;

const C = {
    bg:        '#0C1520',
    card:      '#111D2B',
    text:      '#F0EAD6',
    textDim:   '#B8A88A',
    gold:      '#C9A84C',
    goldLight: 'rgba(201,168,76,0.08)',
    goldMed:   'rgba(201,168,76,0.18)',
    muted:     '#4A5A6A',
    mutedMid:  '#7A8A9A',
    border:    'rgba(255,255,255,0.06)',
    borderGold:'rgba(201,168,76,0.10)',
};

// Matches a dua whose PRIMARY category is this one, OR whose `tags`
// array includes it — a dua can legitimately belong to more than one
// category (e.g. a Bismillah dua fits both "general" and "eating_drinking")
// without being stored as duplicate rows.
function matchesCategory(query, decodedKey) {
    return query.or(`category.eq.${decodedKey},tags.cs.{${decodedKey}}`);
}

function DuaCard({ item, onPress }) {
    const preview = item.translation
        ? item.translation.slice(0, 160)
        : (item.title?.slice(0, 160) || '—');

    return (
        <TouchableOpacity onPress={onPress} style={s.card} activeOpacity={0.75}>
            {/* Gold left accent bar */}
            <View style={s.cardAccent} />

            <View style={s.cardInner}>
                {/* Top row: title pill + chevron */}
                <View style={s.cardTopRow}>
                    {item.title ? (
                        <View style={s.titlePill}>
                            <Text style={s.titlePillText} numberOfLines={1}>{item.title}</Text>
                        </View>
                    ) : (
                        <View style={s.titlePill}>
                            <Text style={s.titlePillText}>#{item.id}</Text>
                        </View>
                    )}
                    <Ionicons name="chevron-forward" size={13} color={C.muted} style={s.chevron} />
                </View>

                {/* Arabic headline */}
                {item.arabic ? (
                    <Text style={s.arabic} numberOfLines={2}>{item.arabic}</Text>
                ) : null}

                {/* Translation preview */}
                <Text style={s.preview} numberOfLines={3}>{preview}</Text>

                {/* Reference footer */}
                {item.reference ? (
                    <View style={s.cardFooter}>
                        <Ionicons name="book-outline" size={11} color={C.muted} />
                        <Text style={s.refTag} numberOfLines={1}>{item.reference}</Text>
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
    );
}

export default function DuaCategoryScreen() {
    const insets       = useSafeAreaInsets();
    const { category } = useLocalSearchParams();
    const decodedKey   = decodeURIComponent(category);

    const [duas,        setDuas]        = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error,       setError]       = useState(null);
    const [hasMore,     setHasMore]     = useState(true);
    const [totalCount,  setTotalCount]  = useState(null);

    const lastIdRef    = useRef(0);
    const isLoadingRef = useRef(false);

    const categoryMeta = DUA_CATEGORIES.find(c => c.key === decodedKey);

    // ── Fetch total count once ─────────────────────────────────────────────
    useEffect(() => {
        const fetchCount = async () => {
            const { count } = await matchesCategory(
                supabase.from('duas').select('*', { count: 'exact', head: true }),
                decodedKey
            );
            if (count !== null) setTotalCount(count);
        };
        fetchCount();
    }, [decodedKey]);

    // ── Cursor-based pagination ────────────────────────────────────────────
    const loadPage = useCallback(async (reset = false) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;

        if (reset) {
            setLoading(true);
            setError(null);
            lastIdRef.current = 0;
        } else {
            setLoadingMore(true);
        }

        try {
            let query = matchesCategory(
                supabase
                    .from('duas')
                    .select('id, arabic, translation, title, reference'),
                decodedKey
            )
                .order('id', { ascending: true })
                .limit(PAGE_SIZE);

            if (!reset && lastIdRef.current > 0) {
                query = query.gt('id', lastIdRef.current);
            }

            const { data, error: err } = await query;
            if (err) throw err;

            const incoming = data || [];
            if (incoming.length > 0) {
                lastIdRef.current = incoming[incoming.length - 1].id;
            }

            setDuas(prev => reset ? incoming : [...prev, ...incoming]);
            setHasMore(incoming.length === PAGE_SIZE);
        } catch (err) {
            console.error('DuaCategory:', err.message);
            setError('Could not load duas. Please try again.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isLoadingRef.current = false;
        }
    }, [decodedKey]);

    useEffect(() => { loadPage(true); }, [decodedKey]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore && !loading) loadPage(false);
    };

    const getItemLayout = useCallback((_, index) => ({
        length: CARD_HEIGHT + 10,
        offset: (CARD_HEIGHT + 10) * index,
        index,
    }), []);

    const renderItem = useCallback(({ item }) => (
        <DuaCard
            item={item}
            onPress={() => router.push(`/explore/dua/${item.id}`)}
        />
    ), []);

    const keyExtractor = useCallback((item) => item.id.toString(), []);

    const renderFooter = () => {
        if (!loadingMore) return null;
        return (
            <View style={s.footerLoader}>
                <ActivityIndicator color={C.gold} size="small" />
            </View>
        );
    };

    const renderHeader = () => (
        <View style={s.listHeader}>
            {totalCount !== null ? (
                <Text style={s.listHeaderText}>
                    {totalCount.toLocaleString()} duas
                    {duas.length > 0 && duas.length < totalCount
                        ? ` · ${duas.length.toLocaleString()} loaded`
                        : duas.length >= totalCount && duas.length > 0
                            ? ' · complete'
                            : ''
                    }
                </Text>
            ) : null}
        </View>
    );

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />

            {/* ── Navbar ── */}
            <View style={s.nav}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={s.navBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={22} color={C.gold} />
                </TouchableOpacity>

                <View style={s.navCenter}>
                    {categoryMeta?.arabic ? (
                        <Text style={s.arabicAccent}>{categoryMeta.arabic}</Text>
                    ) : null}
                    <Text style={s.navTitle} numberOfLines={1}>
                        {categoryMeta?.title ?? decodedKey}
                    </Text>
                </View>

                <TouchableOpacity
                    style={s.navBtn}
                    onPress={() => router.push(`/explore/search?category=${encodeURIComponent(decodedKey)}`)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="search-outline" size={19} color={C.mutedMid} />
                </TouchableOpacity>
            </View>

            {/* ── Content ── */}
            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={C.gold} size="large" />
                    <Text style={s.loadingText}>Loading duas…</Text>
                </View>
            ) : error ? (
                <View style={s.center}>
                    <Ionicons name="warning-outline" size={30} color={C.muted} />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => loadPage(true)}>
                        <Text style={s.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : duas.length === 0 ? (
                <View style={s.center}>
                    <Text style={s.emptyArabic}>لا توجد أدعية</Text>
                    <Text style={s.emptyText}>No duas in this category yet.</Text>
                </View>
            ) : (
                <FlatList
                    data={duas}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListHeaderComponent={renderHeader}
                    ListFooterComponent={renderFooter}
                    getItemLayout={getItemLayout}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={10}
                    initialNumToRender={15}
                    updateCellsBatchingPeriod={50}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    nav: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingHorizontal: 12,
        paddingVertical: 10, borderBottomWidth: 1,
        borderBottomColor: C.border, backgroundColor: C.bg,
    },
    navBtn:      { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    navCenter:   { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
    arabicAccent:{ fontSize: 12, color: C.gold, opacity: 0.65, letterSpacing: 0.8, lineHeight: 16, marginBottom: 1 },
    navTitle:    { color: C.text, fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },

    list:           { paddingHorizontal: 14, paddingTop: 4, gap: 10 },
    listHeader:     { paddingHorizontal: 6, paddingVertical: 10 },
    listHeaderText: { fontSize: 11, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },

    // ── Premium dua card ─────────────────────────────────────
    card: {
        backgroundColor: C.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.borderGold,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    cardAccent: {
        width: 3,
        backgroundColor: C.gold,
        opacity: 0.55,
    },
    cardInner: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 15,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },
    titlePill: {
        backgroundColor: C.goldLight,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: C.goldMed,
        flex: 1,
    },
    titlePillText: {
        fontSize: 10,
        color: C.gold,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    chevron: { flexShrink: 0 },

    arabic: {
        fontSize: 18,
        color: C.text,
        textAlign: 'right',
        lineHeight: 32,
        marginBottom: 10,
    },
    preview: {
        color: C.textDim,
        fontSize: 14,
        lineHeight: 23,
        letterSpacing: 0.1,
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    refTag: {
        fontSize: 11,
        color: C.muted,
        letterSpacing: 0.2,
        flex: 1,
    },

    footerLoader: { paddingVertical: 24, alignItems: 'center' },
    center:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText:  { color: C.muted, fontSize: 13, marginTop: 4 },
    errorText:    { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 260 },
    retryBtn: {
        paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10,
        backgroundColor: C.goldLight, borderWidth: 1, borderColor: C.goldMed,
    },
    retryText:   { color: C.gold, fontSize: 13, fontWeight: '600' },
    emptyArabic: { fontSize: 26, color: C.gold, opacity: 0.3 },
    emptyText:   { color: C.muted, fontSize: 13 },
});
