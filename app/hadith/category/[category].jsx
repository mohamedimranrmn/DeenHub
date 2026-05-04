import { useEffect, useState, useRef, useCallback } from "react";
import {
    View, FlatList, TouchableOpacity, Text,
    StyleSheet, StatusBar, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import supabase from "../../../src/services/supabase";
import { HADITH_CATEGORIES } from "../../../src/constants/hadithCategories";

const PAGE_SIZE   = 30;
const CARD_HEIGHT = 110;

const C = {
    bg:        '#0C1520',
    card:      '#111D2B',
    cardHover: '#162435',
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

function HadithCard({ item, onPress, index }) {
    const preview = item.full_text ? item.full_text.slice(0, 150) : '—';

    return (
        <TouchableOpacity onPress={onPress} style={s.card} activeOpacity={0.72}>
            {/* Top row: number + grade */}
            <View style={s.cardMeta}>
                <Text style={s.cardNumber}>
                    {item.hadith_number ? `Hadith ${item.hadith_number}` : `#${item.id}`}
                </Text>
                {item.grade ? (
                    <View style={s.gradePill}>
                        <Text style={s.gradeText}>{item.grade}</Text>
                    </View>
                ) : null}
                <Ionicons name="chevron-forward" size={12} color={C.muted} style={{ marginLeft: 'auto' }} />
            </View>

            {/* Preview text */}
            <Text style={s.preview} numberOfLines={3}>{preview}</Text>

            {/* Book tag */}
            {item.book ? (
                <Text style={s.bookTag} numberOfLines={1}>{item.book}</Text>
            ) : null}
        </TouchableOpacity>
    );
}

export default function HadithCategoryScreen() {
    const insets       = useSafeAreaInsets();
    const { category } = useLocalSearchParams();
    const source       = decodeURIComponent(category);

    const [hadiths,     setHadiths]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error,       setError]       = useState(null);
    const [hasMore,     setHasMore]     = useState(true);
    const [totalCount,  setTotalCount]  = useState(null);

    const lastIdRef    = useRef(0);
    const isLoadingRef = useRef(false);

    const categoryMeta = HADITH_CATEGORIES.find(c => c.key === source);
    const accentColor  = categoryMeta?.color ?? C.gold;

    useEffect(() => {
        const fetchCount = async () => {
            const { count } = await supabase
                .from('hadiths')
                .select('*', { count: 'exact', head: true })
                .eq('source', source);
            if (count !== null) setTotalCount(count);
        };
        fetchCount();
    }, [source]);

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
            let query = supabase
                .from('hadiths')
                .select('id, full_text, hadith_number, grade, book')
                .eq('source', source)
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

            setHadiths(prev => reset ? incoming : [...prev, ...incoming]);
            setHasMore(incoming.length === PAGE_SIZE);
        } catch (err) {
            console.error('HadithCategory:', err.message);
            setError('Could not load hadiths. Please try again.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isLoadingRef.current = false;
        }
    }, [source]);

    useEffect(() => { loadPage(true); }, [source]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore && !loading) loadPage(false);
    };

    const getItemLayout = useCallback((_, index) => ({
        length: CARD_HEIGHT + 10,
        offset: (CARD_HEIGHT + 10) * index,
        index,
    }), []);

    const renderItem = useCallback(({ item, index }) => (
        <HadithCard
            item={item}
            index={index}
            onPress={() => router.push(`/hadith/${item.id}`)}
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
                    {totalCount.toLocaleString()} hadiths
                    {hadiths.length > 0 && hadiths.length < totalCount
                        ? ` · ${hadiths.length.toLocaleString()} loaded`
                        : hadiths.length >= totalCount && hadiths.length > 0
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
                        {categoryMeta?.title ?? source}
                    </Text>
                </View>

                {/* Search button */}
                <TouchableOpacity
                    style={s.navBtn}
                    onPress={() => router.push(`/hadith/search?source=${encodeURIComponent(source)}`)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="search-outline" size={19} color={C.mutedMid} />
                </TouchableOpacity>
            </View>

            {/* ── Content ── */}
            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={C.gold} size="large" />
                    <Text style={s.loadingText}>Loading hadiths…</Text>
                </View>
            ) : error ? (
                <View style={s.center}>
                    <Ionicons name="warning-outline" size={30} color={C.muted} />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => loadPage(true)}>
                        <Text style={s.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : hadiths.length === 0 ? (
                <View style={s.center}>
                    <Text style={s.emptyArabic}>لا توجد أحاديث</Text>
                    <Text style={s.emptyText}>No hadiths found.</Text>
                </View>
            ) : (
                <FlatList
                    data={hadiths}
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
                    ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 4 }} />}
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

    list:            { paddingHorizontal: 0 },
    listHeader:      { paddingHorizontal: 20, paddingVertical: 12 },
    listHeaderText:  { fontSize: 11, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },

    // ── Premium card — full width, no left bar ──
    card: {
        backgroundColor: C.card,
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    cardMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },
    cardNumber: {
        fontSize: 10,
        color: C.gold,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    gradePill: {
        backgroundColor: C.goldLight,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: C.goldMed,
    },
    gradeText: { fontSize: 9, color: C.gold, fontWeight: '700', letterSpacing: 0.2 },

    preview: {
        color: C.textDim,
        fontSize: 14,
        lineHeight: 22,
        letterSpacing: 0.1,
        marginBottom: 10,
    },
    bookTag: {
        fontSize: 10,
        color: C.muted,
        letterSpacing: 0.3,
    },

    footerLoader:     { paddingVertical: 24, alignItems: 'center' },
    center:           { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText:      { color: C.muted, fontSize: 13, marginTop: 4 },
    errorText:        { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 260 },
    retryBtn: {
        paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10,
        backgroundColor: C.goldLight, borderWidth: 1, borderColor: C.goldMed,
    },
    retryText:  { color: C.gold, fontSize: 13, fontWeight: '600' },
    emptyArabic:{ fontSize: 26, color: C.gold, opacity: 0.3 },
    emptyText:  { color: C.muted, fontSize: 13 },
});