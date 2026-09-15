/**
 * app/quran/search.jsx
 *
 * Full-text Quran search via the configured Quran API.
 *
 * Features:
 * - Debounced search
 * - Recent searches
 * - Result cards
 * - Arabic text
 * - Translation highlighting
 * - Navigation directly to the matching ayah
 */

import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    Keyboard,
} from 'react-native';

import {
    useEffect,
    useState,
    useRef,
    useCallback,
} from 'react';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { searchQuran } from '@/src/services/quranApi';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const DARK       = '#0C1520';
const CARD       = '#111C26';
const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.20)';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';
const HIGHLIGHT  = 'rgba(201,168,76,0.25)';

const MAX_RECENT = 8;
const DEBOUNCE_MS = 350;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalizeResults = (response) => {
    if (!response) {
        return [];
    }

    // Your normal API response
    if (Array.isArray(response?.data)) {
        return response.data;
    }

    // { data: { results: [] } }
    if (Array.isArray(response?.data?.results)) {
        return response.data.results;
    }

    // { results: [] }
    if (Array.isArray(response?.results)) {
        return response.results;
    }

    // { data: { verses: [] } }
    if (Array.isArray(response?.data?.verses)) {
        return response.data.verses;
    }

    // Direct array
    if (Array.isArray(response)) {
        return response;
    }

    return [];
};

const getSurahNumber = (item) =>
    Number(
        item?.surah_number ??
        item?.surahNumber ??
        item?.surah_id ??
        item?.surahId ??
        0
    );

const getAyahNumber = (item) =>
    Number(
        item?.ayah_number ??
        item?.ayahNumber ??
        item?.verse_number ??
        item?.verseNumber ??
        item?.ayah ??
        0
    );

const getArabicText = (item) =>
    item?.arabic_text ??
    item?.arabicText ??
    item?.text_arabic ??
    item?.text ??
    '';

const getTranslation = (item) =>
    item?.translation ??
    item?.translated_text ??
    item?.translation_text ??
    '';

const getTransliteration = (item) =>
    item?.transliteration ??
    item?.transliteration_text ??
    '';

const getSurahName = (item) =>
    item?.surah_name ??
    item?.surahName ??
    item?.surah?.name ??
    `Surah ${getSurahNumber(item)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Result card
// ─────────────────────────────────────────────────────────────────────────────

const ResultCard = ({
                        item,
                        query,
                        onPress,
                    }) => {
    const translation = String(
        getTranslation(item)
    );

    const searchText = query
        .trim()
        .toLowerCase();

    const lowerTranslation =
        translation.toLowerCase();

    const idx =
        searchText.length > 0
            ? lowerTranslation.indexOf(searchText)
            : -1;

    let before = translation;
    let match = '';
    let after = '';

    if (idx !== -1) {
        before = translation.slice(0, idx);

        match = translation.slice(
            idx,
            idx + searchText.length
        );

        after = translation.slice(
            idx + searchText.length
        );
    }

    const surahNumber =
        getSurahNumber(item);

    const ayahNumber =
        getAyahNumber(item);

    const arabicText =
        getArabicText(item);

    const surahName =
        getSurahName(item);

    return (
        <TouchableOpacity
            style={s.card}
            onPress={onPress}
            activeOpacity={0.75}
        >
            {/* Header */}
            <View style={s.cardHeader}>
                <View style={s.refBadge}>
                    <Text style={s.refText}>
                        {surahNumber}:{ayahNumber}
                    </Text>
                </View>

                <Text
                    style={s.surahName}
                    numberOfLines={1}
                >
                    {surahName}
                </Text>

                <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={MUTED}
                />
            </View>

            {/* Arabic */}
            {arabicText ? (
                <Text
                    style={s.arabicText}
                    numberOfLines={3}
                >
                    {arabicText}
                </Text>
            ) : null}

            {/* Translation */}
            {translation ? (
                <Text
                    style={s.translationText}
                    numberOfLines={4}
                >
                    {before}

                    {match ? (
                        <Text style={s.highlight}>
                            {match}
                        </Text>
                    ) : null}

                    {after}
                </Text>
            ) : null}
        </TouchableOpacity>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Recent search chip
// ─────────────────────────────────────────────────────────────────────────────

const RecentChip = ({
                        label,
                        onPress,
                        onRemove,
                    }) => (
    <View style={s.chip}>
        <TouchableOpacity
            onPress={onPress}
            style={s.chipLabel}
        >
            <Ionicons
                name="time-outline"
                size={12}
                color={MUTED}
                style={{ marginRight: 4 }}
            />

            <Text style={s.chipText}>
                {label}
            </Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={onRemove}
            hitSlop={{
                top: 6,
                bottom: 6,
                left: 6,
                right: 6,
            }}
        >
            <Ionicons
                name="close"
                size={12}
                color={MUTED}
            />
        </TouchableOpacity>
    </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function SearchScreen() {
    const insets =
        useSafeAreaInsets();

    const [query, setQuery] =
        useState('');

    const [results, setResults] =
        useState([]);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState(null);

    const [hasSearched, setHasSearched] =
        useState(false);

    const [recent, setRecent] =
        useState([]);

    const debounceRef =
        useRef(null);

    const requestIdRef =
        useRef(0);

    const inputRef =
        useRef(null);

    // ─────────────────────────────────────────────────────────────────────────
    // Search
    // ─────────────────────────────────────────────────────────────────────────

    const performSearch =
        useCallback(async (value) => {
            const q =
                String(value ?? '').trim();

            if (q.length < 2) {
                setResults([]);
                setHasSearched(false);
                setError(null);
                return;
            }

            const requestId =
                ++requestIdRef.current;

            setLoading(true);
            setError(null);

            try {
                const response =
                    await searchQuran(q);

                /*
                 * Ignore an older request if the user
                 * has already started a newer search.
                 */
                if (
                    requestId !==
                    requestIdRef.current
                ) {
                    return;
                }

                if (
                    response?.success === false
                ) {
                    throw new Error(
                        response?.message ||
                        'Search request failed.'
                    );
                }

                const normalized =
                    normalizeResults(response);

                setResults(normalized);
                setHasSearched(true);

                // Recent searches
                setRecent((previous) => {
                    const lower =
                        q.toLowerCase();

                    const filtered =
                        previous.filter(
                            (term) =>
                                term.toLowerCase() !==
                                lower
                        );

                    return [
                        q,
                        ...filtered,
                    ].slice(
                        0,
                        MAX_RECENT
                    );
                });
            } catch (e) {
                if (
                    requestId !==
                    requestIdRef.current
                ) {
                    return;
                }

                console.error(
                    '[SearchScreen]',
                    e
                );

                setResults([]);
                setHasSearched(true);

                setError(
                    e?.message ||
                    'Search failed. Check your connection.'
                );
            } finally {
                if (
                    requestId ===
                    requestIdRef.current
                ) {
                    setLoading(false);
                }
            }
        }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Input
    // ─────────────────────────────────────────────────────────────────────────

    const handleChange =
        useCallback(
            (text) => {
                setQuery(text);

                if (debounceRef.current) {
                    clearTimeout(
                        debounceRef.current
                    );
                }

                if (!text.trim()) {
                    setResults([]);
                    setHasSearched(false);
                    setError(null);
                    setLoading(false);
                    return;
                }

                debounceRef.current =
                    setTimeout(() => {
                        performSearch(text);
                    }, DEBOUNCE_MS);
            },
            [performSearch]
        );

    // ─────────────────────────────────────────────────────────────────────────
    // Cleanup
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(
                    debounceRef.current
                );
            }

            requestIdRef.current++;
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Clear
    // ─────────────────────────────────────────────────────────────────────────

    const handleClear = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(
                debounceRef.current
            );
        }

        requestIdRef.current++;

        setQuery('');
        setResults([]);
        setHasSearched(false);
        setError(null);
        setLoading(false);

        inputRef.current?.focus();
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Recent
    // ─────────────────────────────────────────────────────────────────────────

    const applyRecent =
        useCallback(
            (term) => {
                if (debounceRef.current) {
                    clearTimeout(
                        debounceRef.current
                    );
                }

                setQuery(term);

                performSearch(term);

                Keyboard.dismiss();
            },
            [performSearch]
        );

    const removeRecent =
        useCallback((term) => {
            setRecent((previous) =>
                previous.filter(
                    (item) =>
                        item !== term
                )
            );
        }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Navigate to ayah
    // ─────────────────────────────────────────────────────────────────────────

    const handleResultPress =
        useCallback((item) => {
            Keyboard.dismiss();

            const surahNumber =
                getSurahNumber(item);

            const ayahNumber =
                getAyahNumber(item);

            if (
                !surahNumber ||
                !ayahNumber
            ) {
                console.warn(
                    '[SearchScreen] Invalid ayah result:',
                    item
                );
                return;
            }

            const encodeParam =
                (value) =>
                    encodeURIComponent(
                        String(value ?? '')
                    );

            router.push({
                pathname:
                    `/quran/ayah/${surahNumber}/${ayahNumber}`,

                params: {
                    prefill_arabic:
                        encodeParam(
                            getArabicText(item)
                        ),

                    prefill_translation:
                        encodeParam(
                            getTranslation(item)
                        ),

                    prefill_transliteration:
                        encodeParam(
                            getTransliteration(item)
                        ),

                    prefill_surah_name:
                        encodeParam(
                            getSurahName(item)
                        ),
                },
            });
        }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // FlatList
    // ─────────────────────────────────────────────────────────────────────────

    const renderItem =
        useCallback(
            ({ item }) => (
                <ResultCard
                    item={item}
                    query={query}
                    onPress={() =>
                        handleResultPress(
                            item
                        )
                    }
                />
            ),
            [
                query,
                handleResultPress,
            ]
        );

    const keyExtractor =
        useCallback(
            (item, index) => {
                const surah =
                    getSurahNumber(item);

                const ayah =
                    getAyahNumber(item);

                return `${surah}-${ayah}-${index}`;
            },
            []
        );

    const showEmpty =
        hasSearched &&
        results.length === 0 &&
        !loading &&
        !error;

    const showRecent =
        !hasSearched &&
        recent.length > 0 &&
        !query;

    // ─────────────────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <View
            style={[
                s.root,
                {
                    paddingTop:
                    insets.top,
                },
            ]}
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={DARK}
            />

            {/* Top bar */}

            <View style={s.topBar}>
                <TouchableOpacity
                    style={s.backBtn}
                    onPress={() =>
                        router.back()
                    }
                    hitSlop={{
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10,
                    }}
                >
                    <Ionicons
                        name="chevron-back"
                        size={22}
                        color={GOLD}
                    />
                </TouchableOpacity>

                <Text style={s.topTitle}>
                    Search Quran
                </Text>

                <View
                    style={{
                        width: 36,
                    }}
                />
            </View>

            {/* Search input */}

            <View style={s.searchWrap}>
                <Ionicons
                    name="search-outline"
                    size={16}
                    color={MUTED}
                />

                <TextInput
                    ref={inputRef}
                    style={s.searchInput}
                    placeholder="Search by keyword or phrase…"
                    placeholderTextColor={MUTED}
                    value={query}
                    onChangeText={
                        handleChange
                    }
                    returnKeyType="search"
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="none"
                    onSubmitEditing={() => {
                        if (
                            debounceRef.current
                        ) {
                            clearTimeout(
                                debounceRef.current
                            );
                        }

                        performSearch(
                            query
                        );
                    }}
                />

                {loading && (
                    <ActivityIndicator
                        size="small"
                        color={GOLD}
                    />
                )}

                {query.length > 0 &&
                    !loading && (
                        <TouchableOpacity
                            onPress={
                                handleClear
                            }
                            hitSlop={{
                                top: 8,
                                bottom: 8,
                                left: 8,
                                right: 8,
                            }}
                        >
                            <Ionicons
                                name="close-circle"
                                size={16}
                                color={MUTED}
                            />
                        </TouchableOpacity>
                    )}
            </View>

            {/* Results count */}

            {hasSearched &&
                results.length > 0 && (
                    <Text
                        style={s.countText}
                    >
                        {results.length}{' '}
                        result
                        {results.length !==
                        1
                            ? 's'
                            : ''}{' '}
                        for "{query}"
                    </Text>
                )}

            {/* Recent searches */}

            {showRecent && (
                <View
                    style={
                        s.recentSection
                    }
                >
                    <Text
                        style={
                            s.sectionLabel
                        }
                    >
                        Recent Searches
                    </Text>

                    <View
                        style={s.chipRow}
                    >
                        {recent.map(
                            (term) => (
                                <RecentChip
                                    key={term}
                                    label={term}
                                    onPress={() =>
                                        applyRecent(
                                            term
                                        )
                                    }
                                    onRemove={() =>
                                        removeRecent(
                                            term
                                        )
                                    }
                                />
                            )
                        )}
                    </View>
                </View>
            )}

            {/* Initial placeholder */}

            {!query &&
                !showRecent && (
                    <View
                        style={
                            s.placeholder
                        }
                    >
                        <Ionicons
                            name="search-outline"
                            size={52}
                            color={MUTED}
                            style={{
                                opacity: 0.5,
                            }}
                        />

                        <Text
                            style={
                                s.placeholderTitle
                            }
                        >
                            Search the Holy Quran
                        </Text>

                        <Text
                            style={
                                s.placeholderSub
                            }
                        >
                            Type a keyword,
                            phrase, or topic
                            to find relevant
                            ayahs.
                        </Text>
                    </View>
                )}

            {/* Error */}

            {error && (
                <View
                    style={s.errorWrap}
                >
                    <Ionicons
                        name="wifi-outline"
                        size={36}
                        color={MUTED}
                    />

                    <Text
                        style={s.errorText}
                    >
                        {error}
                    </Text>

                    <TouchableOpacity
                        style={
                            s.retryBtn
                        }
                        onPress={() =>
                            performSearch(
                                query
                            )
                        }
                    >
                        <Text
                            style={
                                s.retryText
                            }
                        >
                            Retry
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* No results */}

            {showEmpty && (
                <View
                    style={s.placeholder}
                >
                    <Ionicons
                        name="search-outline"
                        size={44}
                        color={MUTED}
                        style={{
                            opacity: 0.4,
                        }}
                    />

                    <Text
                        style={
                            s.placeholderTitle
                        }
                    >
                        No results found
                    </Text>

                    <Text
                        style={
                            s.placeholderSub
                        }
                    >
                        Try a different
                        keyword or phrase.
                    </Text>
                </View>
            )}

            {/* Results */}

            {results.length > 0 && (
                <FlatList
                    data={results}
                    keyExtractor={
                        keyExtractor
                    }
                    renderItem={
                        renderItem
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[
                        s.listContent,
                        {
                            paddingBottom:
                                insets.bottom +
                                32,
                        },
                    ]}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                    windowSize={10}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: DARK,
    },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },

    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: GOLD_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },

    topTitle: {
        color: TEXT,
        fontSize: 16,
        fontWeight: '700',
    },

    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: CARD,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        marginHorizontal: 16,
        marginTop: 14,
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },

    searchInput: {
        flex: 1,
        color: TEXT,
        fontSize: 15,
        padding: 0,
    },

    countText: {
        color: MUTED,
        fontSize: 11,
        letterSpacing: 0.4,
        marginHorizontal: 20,
        marginBottom: 6,
    },

    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },

    card: {
        backgroundColor: CARD,
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: BORDER,
    },

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },

    refBadge: {
        backgroundColor: GOLD_MED,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor:
            'rgba(201,168,76,0.35)',
    },

    refText: {
        color: GOLD,
        fontSize: 12,
        fontWeight: '700',
    },

    surahName: {
        flex: 1,
        color: TEXT_DIM,
        fontSize: 13,
    },

    arabicText: {
        fontFamily: 'Uthmanic',
        fontSize: 20,
        color: TEXT,
        textAlign: 'right',
        lineHeight: 38,
        marginBottom: 8,
        writingDirection: 'rtl',
    },

    translationText: {
        color: TEXT_DIM,
        fontSize: 13,
        lineHeight: 20,
    },

    highlight: {
        backgroundColor: HIGHLIGHT,
        color: GOLD,
        fontWeight: '700',
    },

    recentSection: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },

    sectionLabel: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 12,
    },

    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },

    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: CARD,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: BORDER,
        gap: 6,
    },

    chipLabel: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    chipText: {
        color: TEXT_DIM,
        fontSize: 13,
    },

    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 40,
    },

    placeholderTitle: {
        color: TEXT_DIM,
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },

    placeholderSub: {
        color: MUTED,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
    },

    errorWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 20,
    },

    errorText: {
        color: TEXT_DIM,
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 32,
    },

    retryBtn: {
        backgroundColor: GOLD_LIGHT,
        borderRadius: 10,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: GOLD_MED,
    },

    retryText: {
        color: GOLD,
        fontWeight: '700',
        fontSize: 14,
    },
});