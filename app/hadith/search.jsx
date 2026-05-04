import { useEffect, useState, useRef, useCallback } from "react";
import {
    View, FlatList, Text, StyleSheet,
    StatusBar, ActivityIndicator, TouchableOpacity,
    TextInput, Keyboard,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import supabase from "../../src/services/supabase";
import { HADITH_CATEGORIES } from "../../src/constants/hadithCategories";

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.08)';
const GOLD_MED   = 'rgba(201,168,76,0.18)';
const DARK       = '#0C1520';
const CARD       = '#111D2B';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#B8A88A';
const MUTED      = '#4A5A6A';
const MUTED_MID  = '#7A8A9A';
const BORDER     = 'rgba(255,255,255,0.06)';

// Inline highlight matching text
function HighlightText({ text, query, style, numberOfLines }) {
    if (!text || !query?.trim()) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;

    const lower   = text.toLowerCase();
    const pattern = query.trim().toLowerCase();
    const idx     = lower.indexOf(pattern);

    if (idx === -1) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;

    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {text.slice(0, idx)}
            <Text style={[style, s.highlight]}>{text.slice(idx, idx + pattern.length)}</Text>
            {text.slice(idx + pattern.length)}
        </Text>
    );
}

function ResultCard({ item, query, onPress }) {
    const categoryMeta = HADITH_CATEGORIES.find(c => c.key === item.source);
    const accentColor  = categoryMeta?.color ?? GOLD;
    const preview      = item.full_text ? item.full_text.slice(0, 200) : '';

    return (
        <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
            {/* Arabic if present */}
            {item.arabic ? (
                <Text style={s.arabic} numberOfLines={2}>{item.arabic}</Text>
            ) : null}

            {/* English preview with highlight */}
            <HighlightText
                text={preview}
                query={query}
                style={s.translation}
                numberOfLines={3}
            />

            {/* Footer */}
            <View style={s.cardFooter}>
                <View style={[s.sourceDot, { backgroundColor: accentColor }]} />
                <Text style={s.sourceText} numberOfLines={1}>
                    {item.source}
                    {item.hadith_number ? `  ·  Hadith ${item.hadith_number}` : ''}
                </Text>
                {item.grade ? (
                    <View style={s.gradePill}>
                        <Text style={[s.gradeText, { color: accentColor }]}>{item.grade}</Text>
                    </View>
                ) : null}
                <Ionicons name="chevron-forward" size={12} color={MUTED} style={{ marginLeft: 'auto' }} />
            </View>
        </TouchableOpacity>
    );
}

const DEBOUNCE_MS = 350;
const RESULTS_LIMIT = 40;

export default function HadithSearchScreen() {
    const insets          = useSafeAreaInsets();
    const { q: initialQ, source: sourceFilter } = useLocalSearchParams();

    const [inputValue,  setInputValue]  = useState(initialQ ?? "");
    const [activeQuery, setActiveQuery] = useState("");
    const [results,     setResults]     = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    const inputRef    = useRef(null);
    const debounceRef = useRef(null);
    const abortRef    = useRef(false);

    // Debounce input → fire search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = inputValue.trim();
        if (!trimmed) {
            setActiveQuery("");
            setResults([]);
            setHasSearched(false);
            setError(null);
            return;
        }
        debounceRef.current = setTimeout(() => {
            setActiveQuery(trimmed);
        }, DEBOUNCE_MS);
        return () => clearTimeout(debounceRef.current);
    }, [inputValue]);

    useEffect(() => {
        if (activeQuery) executeSearch(activeQuery);
    }, [activeQuery]);

    // Auto-focus / run initial query
    useEffect(() => {
        if (initialQ?.trim()) {
            executeSearch(initialQ.trim());
        } else {
            setTimeout(() => inputRef.current?.focus(), 150);
        }
    }, []);

    const executeSearch = useCallback(async (query) => {
        abortRef.current = true; // cancel any in-flight conceptual request
        setLoading(true);
        setError(null);
        setHasSearched(true);

        try {
            // Try full-text search RPC first (if you have one set up)
            const { data: rpcData, error: rpcErr } = await supabase.rpc("search_hadiths", {
                search_query: query,
                result_limit:  RESULTS_LIMIT,
                source_filter: sourceFilter ?? null,
            });

            if (!rpcErr && rpcData) {
                setResults(rpcData);
                setLoading(false);
                return;
            }

            // Fallback: ilike on full_text
            let q = supabase
                .from("hadiths")
                .select("id, arabic, full_text, source, hadith_number, grade, book")
                .ilike("full_text", `%${query}%`)
                .limit(RESULTS_LIMIT)
                .order("id", { ascending: true });

            if (sourceFilter) q = q.eq("source", sourceFilter);

            const { data: fallback, error: fbErr } = await q;
            if (fbErr) throw fbErr;

            setResults(fallback || []);
        } catch (e) {
            console.error("HadithSearch:", e.message);
            setError("Search failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [sourceFilter]);

    const handleSubmit = () => {
        Keyboard.dismiss();
        const trimmed = inputValue.trim();
        if (trimmed) setActiveQuery(trimmed);
    };

    const handleClear = () => {
        setInputValue("");
        setResults([]);
        setHasSearched(false);
        setError(null);
        inputRef.current?.focus();
    };

    const renderItem = useCallback(({ item }) => (
        <ResultCard
            item={item}
            query={activeQuery}
            onPress={() => router.push(`/hadith/${item.id}`)}
        />
    ), [activeQuery]);

    const keyExtractor = useCallback((item) => item.id.toString(), []);

    const isEmpty = hasSearched && !loading && results.length === 0 && !error;

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />

            {/* ── Navbar ── */}
            <View style={s.nav}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={s.navBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="chevron-back" size={22} color={GOLD} />
                </TouchableOpacity>

                <View style={s.searchBar}>
                    <Ionicons name="search-outline" size={16} color={MUTED} />
                    <TextInput
                        ref={inputRef}
                        value={inputValue}
                        onChangeText={setInputValue}
                        onSubmitEditing={handleSubmit}
                        placeholder="Search hadiths…"
                        placeholderTextColor={MUTED}
                        returnKeyType="search"
                        style={s.searchInput}
                        selectionColor={GOLD}
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    {inputValue.length > 0 ? (
                        <TouchableOpacity
                            onPress={handleClear}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="close-circle" size={16} color={MUTED} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* ── Status bar ── */}
            {(hasSearched || loading) ? (
                <View style={s.statusRow}>
                    {loading ? (
                        <View style={s.statusLeft}>
                            <ActivityIndicator color={GOLD} size="small" />
                            <Text style={s.statusText}>Searching…</Text>
                        </View>
                    ) : (
                        <View style={s.statusLeft}>
                            <Text style={s.statusCount}>{results.length}</Text>
                            <Text style={s.statusText}>
                                {results.length === 1 ? 'result' : 'results'} for
                            </Text>
                            <Text style={s.statusQuery}>"{activeQuery}"</Text>
                            {results.length === RESULTS_LIMIT ? (
                                <Text style={s.statusCap}>  (top {RESULTS_LIMIT})</Text>
                            ) : null}
                        </View>
                    )}
                </View>
            ) : null}

            {/* ── Main content ── */}
            {!hasSearched && !loading ? (
                <View style={s.center}>
                    <View style={s.promptIconWrap}>
                        <Text style={s.promptArabic}>بحث</Text>
                    </View>
                    <Text style={s.promptTitle}>Search Hadiths</Text>
                    <Text style={s.promptHint}>
                        Search by keywords, Arabic text, or topic
                    </Text>
                </View>
            ) : error ? (
                <View style={s.center}>
                    <Ionicons name="warning-outline" size={30} color={MUTED} />
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={() => executeSearch(activeQuery)}>
                        <Text style={s.retryText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : isEmpty ? (
                <View style={s.center}>
                    <Ionicons name="search" size={36} color={MUTED} style={{ opacity: 0.35, marginBottom: 4 }} />
                    <Text style={s.emptyTitle}>No hadiths found</Text>
                    <Text style={s.emptyHint}>Try different keywords or Arabic text</Text>
                </View>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    ItemSeparatorComponent={() => (
                        <View style={{ height: 1, backgroundColor: BORDER, marginHorizontal: 0 }} />
                    )}
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: DARK },

    nav: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER,
        gap: 10,
    },
    navBtn: {
        width: 38, height: 38, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    searchBar: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        gap: 8, backgroundColor: CARD,
        borderRadius: 12, borderWidth: 1, borderColor: BORDER,
        paddingHorizontal: 12, height: 42,
    },
    searchInput: { flex: 1, color: TEXT, fontSize: 14, letterSpacing: 0.2 },

    statusRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    statusLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    statusCount: { fontSize: 14, fontWeight: '800', color: GOLD },
    statusText:  { fontSize: 12, color: MUTED },
    statusQuery: { fontSize: 12, color: TEXT, fontWeight: '600' },
    statusCap:   { fontSize: 11, color: MUTED, fontStyle: 'italic' },

    list: { paddingHorizontal: 0, paddingTop: 0 },

    // ── Result card — full width, clean ──
    card: {
        backgroundColor: CARD,
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    arabic: {
        fontSize: 16, color: TEXT, textAlign: 'right',
        lineHeight: 28, marginBottom: 8,
    },
    translation: {
        fontSize: 14, color: TEXT_DIM, lineHeight: 22, marginBottom: 12,
    },
    highlight: { color: GOLD, fontWeight: '700', backgroundColor: 'rgba(201,168,76,0.12)' },

    cardFooter: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    sourceDot: {
        width: 6, height: 6, borderRadius: 3,
    },
    sourceText: {
        fontSize: 11, color: MUTED_MID, flex: 1,
    },
    gradePill: {
        backgroundColor: GOLD_LIGHT,
        borderRadius: 4, borderWidth: 1, borderColor: GOLD_MED,
        paddingHorizontal: 6, paddingVertical: 1,
    },
    gradeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },

    center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
    promptIconWrap: {
        width: 60, height: 60, borderRadius: 18,
        backgroundColor: GOLD_LIGHT, borderWidth: 1, borderColor: GOLD_MED,
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    promptArabic: { fontSize: 22, color: GOLD, opacity: 0.8 },
    promptTitle:  { fontSize: 18, fontWeight: '700', color: TEXT },
    promptHint:   { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19 },
    emptyTitle:   { fontSize: 16, fontWeight: '600', color: TEXT },
    emptyHint:    { fontSize: 13, color: MUTED, textAlign: 'center' },
    errorText:    { fontSize: 13, color: MUTED, textAlign: 'center' },
    retryBtn: {
        paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10,
        backgroundColor: GOLD_LIGHT, borderWidth: 1, borderColor: GOLD_MED,
    },
    retryText: { color: GOLD, fontSize: 13, fontWeight: '600' },
});