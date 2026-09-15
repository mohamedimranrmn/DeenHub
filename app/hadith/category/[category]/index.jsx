import { useEffect, useState, useCallback, useMemo } from "react";
import {
    View, FlatList, TouchableOpacity, Text,
    StyleSheet, StatusBar, ActivityIndicator, TextInput,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import supabase from "../../../../src/services/supabase";
import { HADITH_CATEGORIES } from "../../../../src/constants/hadithCategories";

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

const UNCATEGORIZED_KEY = 'uncategorized';
const MIN_POPULAR_READS = 1; // hide the "Most Read" strip entirely if nothing has meaningful reads yet

// ── Featured card (horizontal "Most Read" strip) ──────────────────
function FeaturedChapterCard({ item, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} style={s.featCard} activeOpacity={0.8}>
            <View style={s.featBadge}>
                <Ionicons name="flame" size={11} color={C.gold} />
                <Text style={s.featBadgeText}>Popular</Text>
            </View>
            <Text style={s.featTitle} numberOfLines={3}>{item.chapter_name}</Text>
            <View style={s.featFooter}>
                <Text style={s.featChNum}>Ch. {item.chapter_number}</Text>
                <Text style={s.featReads}>{item.reads.toLocaleString()} reads</Text>
            </View>
        </TouchableOpacity>
    );
}

// ── Compact row (dense directory below) ────────────────────────────
function ChapterRow({ item, onPress }) {
    const isUncategorized = item.key === UNCATEGORIZED_KEY;
    const label = isUncategorized ? 'Uncategorized' : (item.chapter_name || `Chapter ${item.chapter_number}`);

    return (
        <TouchableOpacity onPress={onPress} style={s.row} activeOpacity={0.7}>
            <View style={[s.rowBadge, isUncategorized && s.rowBadgeMuted]}>
                <Text style={[s.rowBadgeText, isUncategorized && s.rowBadgeTextMuted]}>
                    {isUncategorized ? '—' : item.chapter_number}
                </Text>
            </View>
            <View style={s.rowBody}>
                <Text style={s.rowTitle} numberOfLines={1}>{label}</Text>
            </View>
            <Text style={s.rowCount}>{item.total != null ? item.total.toLocaleString() : '—'}</Text>
            <Ionicons name="chevron-forward" size={14} color={C.muted} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
    );
}

export default function HadithChapterListScreen() {
    const insets       = useSafeAreaInsets();
    const { category } = useLocalSearchParams();
    const source        = decodeURIComponent(category);

    const [chapters,    setChapters]    = useState([]);
    const [popular,     setPopular]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [filterText,  setFilterText]  = useState('');

    const categoryMeta = HADITH_CATEGORIES.find(c => c.key === source);
    const accentColor  = categoryMeta?.color ?? C.gold;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: chapterRows, error: chErr } = await supabase
                .from('hadith_chapter_counts')
                .select('chapter_number, chapter_name, total')
                .eq('source', source)
                .not('chapter_number', 'is', null)
                .order('chapter_number', { ascending: true });

            if (chErr) throw chErr;

            const { count: uncatCount, error: uncatErr } = await supabase
                .from('hadiths')
                .select('*', { count: 'exact', head: true })
                .eq('source', source)
                .is('chapter_number', null);

            if (uncatErr) throw uncatErr;

            const rows = (chapterRows || []).map(r => ({
                key: `ch-${r.chapter_number}`,
                chapter_number: r.chapter_number,
                chapter_name:   r.chapter_name,
                total:          r.total,
            }));

            if (uncatCount && uncatCount > 0) {
                rows.push({ key: UNCATEGORIZED_KEY, total: uncatCount });
            }

            setChapters(rows);
        } catch (err) {
            console.error('HadithChapterList:', err.message);
            setError('Could not load chapters. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [source]);

    const loadPopular = useCallback(async () => {
        try {
            const { data, error: popErr } = await supabase
                .from('hadith_chapter_popularity')
                .select('chapter_number, chapter_name, reads')
                .eq('source', source)
                .gte('reads', MIN_POPULAR_READS)
                .order('reads', { ascending: false })
                .limit(5);

            if (popErr) throw popErr;
            setPopular(data || []);
        } catch (err) {
            // Non-critical — just skip the featured strip if this fails or the view isn't there yet.
            console.warn('HadithChapterPopularity:', err.message);
            setPopular([]);
        }
    }, [source]);

    useEffect(() => { load(); loadPopular(); }, [load, loadPopular]);

    const filteredChapters = useMemo(() => {
        const q = filterText.trim().toLowerCase();
        if (!q) return chapters;
        return chapters.filter(c => {
            const name = (c.key === UNCATEGORIZED_KEY ? 'uncategorized general' : (c.chapter_name || '')).toLowerCase();
            const num  = c.chapter_number != null ? String(c.chapter_number) : '';
            return name.includes(q) || num === q;
        });
    }, [chapters, filterText]);

    const isFiltering = filterText.trim().length > 0;

    const handlePress = (item) => {
        const chapterParam = item.key === UNCATEGORIZED_KEY ? UNCATEGORIZED_KEY : item.chapter_number;
        const title = item.key === UNCATEGORIZED_KEY
            ? 'Uncategorized'
            : (item.chapter_name || `Chapter ${item.chapter_number}`);

        router.push({
            pathname: `/hadith/category/${encodeURIComponent(source)}/chapter/${chapterParam}`,
            params: { title },
        });
    };

    const grandTotal = chapters.reduce((sum, c) => sum + (c.total || 0), 0);

    const renderRow = useCallback(({ item }) => (
        <ChapterRow item={item} onPress={() => handlePress(item)} />
    ), [source]);

    const renderListHeader = () => (
        <View>
            {!isFiltering && popular.length > 0 ? (
                <View style={s.featSection}>
                    <Text style={s.sectionLabel}>Most Popular</Text>
                    <FlatList
                        data={popular}
                        keyExtractor={item => `pop-${item.chapter_number}`}
                        renderItem={({ item }) => (
                            <FeaturedChapterCard
                                item={item}
                                onPress={() => handlePress({ key: `ch-${item.chapter_number}`, chapter_number: item.chapter_number, chapter_name: item.chapter_name })}
                            />
                        )}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.featList}
                    />
                </View>
            ) : null}

            <Text style={s.sectionLabel}>
                {isFiltering
                    ? `${filteredChapters.length} ${filteredChapters.length === 1 ? 'match' : 'matches'}`
                    : `All Chapters · ${grandTotal.toLocaleString()} hadiths`}
            </Text>
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

                <TouchableOpacity
                    style={s.navBtn}
                    onPress={() => router.push(`/hadith/search?source=${encodeURIComponent(source)}`)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="search-outline" size={19} color={C.mutedMid} />
                </TouchableOpacity>
            </View>

            {/* ── Filter box ── */}
            <View style={s.filterWrap}>
                <Ionicons name="filter-outline" size={15} color={C.muted} style={{ marginRight: 8 }} />
                <TextInput
                    value={filterText}
                    onChangeText={setFilterText}
                    placeholder="Filter chapters (e.g. Zakat, Fasting…)"
                    placeholderTextColor={C.muted}
                    style={s.filterInput}
                    selectionColor={C.gold}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                {filterText.length > 0 ? (
                    <TouchableOpacity onPress={() => setFilterText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color={C.muted} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* ── Content ── */}
            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={C.gold} size="large" />
                    <Text style={s.loadingText}>Loading chapters…</Text>
                </View>
            ) : error ? (
                <View style={s.center}>
                    <Ionicons name="warning-outline" size={30} color={C.muted} />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={load}>
                        <Text style={s.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : chapters.length === 0 ? (
                <View style={s.center}>
                    <Text style={s.emptyArabic}>لا توجد أحاديث</Text>
                    <Text style={s.emptyText}>No hadiths found.</Text>
                </View>
            ) : filteredChapters.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="search" size={28} color={C.muted} style={{ opacity: 0.35 }} />
                    <Text style={s.emptyText}>No chapters match "{filterText.trim()}"</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredChapters}
                    keyExtractor={item => item.key}
                    renderItem={renderRow}
                    ListHeaderComponent={renderListHeader}
                    contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={s.rowSeparator} />}
                    initialNumToRender={20}
                    windowSize={10}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
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

    filterWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 12, height: 42,
        marginHorizontal: 14, marginTop: 12, marginBottom: 4,
    },
    filterInput: { flex: 1, color: C.text, fontSize: 13.5, letterSpacing: 0.1 },

    list: { paddingHorizontal: 14, paddingTop: 4 },

    sectionLabel: {
        fontSize: 11, color: C.muted, letterSpacing: 0.6,
        textTransform: 'uppercase', paddingVertical: 10,
    },

    // ── Featured strip ──────────────────────────────────────
    featSection: { marginBottom: 4 },
    featList:    { gap: 10, paddingBottom: 4, paddingRight: 4 },
    featCard: {
        width: 168,
        backgroundColor: C.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.goldMed,
        padding: 14,
        justifyContent: 'space-between',
    },
    featBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: C.goldLight,
        borderRadius: 6, borderWidth: 1, borderColor: C.goldMed,
        paddingHorizontal: 7, paddingVertical: 3,
        marginBottom: 10,
    },
    featBadgeText: { fontSize: 9, color: C.gold, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    featTitle: { color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 19, marginBottom: 14, minHeight: 57 },
    featFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    featChNum:  { fontSize: 10, color: C.mutedMid, fontWeight: '600' },
    featReads:  { fontSize: 10, color: C.muted },

    // ── Compact directory rows ───────────────────────────────
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    rowBadge: {
        width: 30, height: 30, borderRadius: 8,
        backgroundColor: C.goldLight, borderWidth: 1, borderColor: C.goldMed,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 12,
    },
    rowBadgeMuted: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: C.border },
    rowBadgeText: { fontSize: 11, fontWeight: '700', color: C.gold },
    rowBadgeTextMuted: { color: C.mutedMid },
    rowBody: { flex: 1, paddingRight: 8 },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: '500' },
    rowCount: { fontSize: 12, color: C.muted, minWidth: 44, textAlign: 'right' },
    rowSeparator: { height: 1, backgroundColor: C.border },

    center:           { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
    loadingText:      { color: C.muted, fontSize: 13, marginTop: 4 },
    errorText:        { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 260 },
    retryBtn: {
        paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10,
        backgroundColor: C.goldLight, borderWidth: 1, borderColor: C.goldMed,
    },
    retryText:  { color: C.gold, fontSize: 13, fontWeight: '600' },
    emptyArabic:{ fontSize: 26, color: C.gold, opacity: 0.3 },
    emptyText:  { color: C.muted, fontSize: 13, textAlign: 'center' },
});