import { useEffect, useState, useRef, useCallback } from "react";
import {
    View, FlatList, TouchableOpacity, Text,
    StyleSheet, StatusBar, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import supabase from "../../../../../src/services/supabase";
import { HADITH_CATEGORIES } from "../../../../../src/constants/hadithCategories";

const PAGE_SIZE   = 30;
const CARD_HEIGHT = 110;
const UNCATEGORIZED_KEY = 'uncategorized';

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

function HadithCard({ item, onPress }) {
    const preview = item.full_text ? item.full_text.slice(0, 160) : '—';
    const numLabel = item.hadith_number ? `Hadith ${item.hadith_number}` : `#${item.id}`;

    return (
        <TouchableOpacity onPress={onPress} style={s.card} activeOpacity={0.75}>
            <View style={s.cardAccent} />
            <View style={s.cardInner}>
                <View style={s.cardTopRow}>
                    <View style={s.numPill}>
                        <Text style={s.numPillText}>{numLabel}</Text>
                    </View>
                    {item.grade ? (
                        <View style={s.gradePill}>
                            <Text style={s.gradeText}>{item.grade}</Text>
                        </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={13} color={C.muted} style={s.chevron} />
                </View>

                <Text style={s.preview} numberOfLines={3}>{preview}</Text>

                {item.book ? (
                    <View style={s.cardFooter}>
                        <Ionicons name="library-outline" size={11} color={C.muted} />
                        <Text style={s.bookTag} numberOfLines={1}>{item.book}</Text>
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
    );
}

export default function HadithChapterScreen() {
    const insets = useSafeAreaInsets();
    const { category, chapterNumber, title } = useLocalSearchParams();

    const source           = decodeURIComponent(category);
    const isUncategorized  = chapterNumber === UNCATEGORIZED_KEY;
    const chapterNum       = isUncategorized ? null : Number(chapterNumber);

    const [hadiths,     setHadiths]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error,       setError]       = useState(null);
    const [hasMore,     setHasMore]     = useState(true);
    const [totalCount,  setTotalCount]  = useState(null);

    const lastIdRef    = useRef(0);
    const isLoadingRef = useRef(false);

    const categoryMeta = HADITH_CATEGORIES.find(c => c.key === source);
    const chapterTitle = title ? decodeURIComponent(title) : (isUncategorized ? 'Uncategorized' : `Chapter ${chapterNumber}`);

    const applyChapterFilter = (query) =>
        isUncategorized ? query.is('chapter_number', null) : query.eq('chapter_number', chapterNum);

    useEffect(() => {
        const fetchCount = async () => {
            let q = supabase
                .from('hadiths')
                .select('*', { count: 'exact', head: true })
                .eq('source', source);
            q = applyChapterFilter(q);
            const { count } = await q;
            if (count !== null) setTotalCount(count);
        };
        fetchCount();
    }, [source, chapterNumber]);

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

            query = applyChapterFilter(query);

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
            console.error('HadithChapter:', err.message);
            setError('Could not load hadiths. Please try again.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isLoadingRef.current = false;
        }
    }, [source, chapterNumber]);

    useEffect(() => { loadPage(true); }, [source, chapterNumber]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore && !loading) loadPage(false);
    };

    const getItemLayout = useCallback((_, index) => ({
        length: CARD_HEIGHT + 10,
        offset: (CARD_HEIGHT + 10) * index,
        index,
    }), []);

    const renderItem = useCallback(({ item }) => (
        <HadithCard
            item={item}
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
                    <Text style={s.navSuper} numberOfLines={1}>
                        {categoryMeta?.title ?? source}
                    </Text>
                    <Text style={s.navTitle} numberOfLines={1}>{chapterTitle}</Text>
                </View>

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
    navSuper:    { fontSize: 11, color: C.gold, opacity: 0.65, letterSpacing: 0.6, lineHeight: 15, marginBottom: 1, textTransform: 'uppercase' },
    navTitle:    { color: C.text, fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },

    list:            { paddingHorizontal: 14, paddingTop: 4, gap: 10 },
    listHeader:      { paddingHorizontal: 6, paddingVertical: 10 },
    listHeaderText:  { fontSize: 11, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },

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
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
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
    numPill: {
        backgroundColor: C.goldLight,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: C.goldMed,
    },
    numPillText: {
        fontSize: 10,
        color: C.gold,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    gradePill: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: C.border,
    },
    gradeText: {
        fontSize: 9,
        color: C.mutedMid,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    chevron: { marginLeft: 'auto' },

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
    bookTag: {
        fontSize: 11,
        color: C.muted,
        letterSpacing: 0.2,
        flex: 1,
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