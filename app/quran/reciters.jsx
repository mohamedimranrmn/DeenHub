/**
 * app/quran/reciters.jsx
 *
 * Quran Foundation chapter-reciter selection.
 *
 * Features:
 * - Loads all chapter reciters from the backend
 * - Supports { reciters: [] } and { data: { reciters: [] } } responses
 * - Correctly handles nested style/qirat objects
 * - Search by name, translated name, style, and qira'at
 * - Persists selected chapter-reciter in AsyncStorage
 * - Changes the existing AudioStore player without recreating it
 */

import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    StatusBar,
    TextInput,
} from 'react-native';

import {
    useEffect,
    useState,
    useCallback,
} from 'react';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getReciters } from '../../src/services/quranApi';
import AudioStore from '../../src/services/audioStore';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const DARK   = '#0C1520';
const CARD   = '#111C26';
const GOLD   = '#C9A84C';
const GOLD_L = 'rgba(201,168,76,0.10)';
const GOLD_M = 'rgba(201,168,76,0.20)';
const TEXT   = '#F0EAD6';
const TEXT_D = '#C8B99A';
const MUTED  = '#5A6A7A';
const BORDER = 'rgba(201,168,76,0.12)';

const SELECTED_RECITER_KEY = 'selected_reciter';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getStyleName = (reciter) => {
    if (typeof reciter?.style === 'string') {
        return reciter.style;
    }

    return (
        reciter?.style?.name ??
        reciter?.style?.translated_name?.name ??
        ''
    );
};

const getQiratName = (reciter) => {
    if (typeof reciter?.qirat === 'string') {
        return reciter.qirat;
    }

    return (
        reciter?.qirat?.name ??
        reciter?.qirat?.translated_name?.name ??
        ''
    );
};

const getLanguageName = (reciter) => {
    if (typeof reciter?.language === 'string') {
        return reciter.language;
    }

    return (
        reciter?.language?.name ??
        reciter?.language_name ??
        ''
    );
};

const getTranslatedName = (reciter) => {
    if (typeof reciter?.translated_name === 'string') {
        return reciter.translated_name;
    }

    return (
        reciter?.translated_name?.name ??
        ''
    );
};

const normalizeReciter = (reciter) => {
    if (!reciter || typeof reciter !== 'object') {
        return null;
    }

    if (reciter.id == null) {
        return null;
    }

    return {
        id: reciter.id,
        name: reciter.name ?? getTranslatedName(reciter) ?? `Reciter ${reciter.id}`,
        translated_name: reciter.translated_name ?? null,
        style: reciter.style ?? null,
        qirat: reciter.qirat ?? null,
        language: reciter.language ?? null,
        source: 'quran-foundation',
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function RecitersScreen() {
    const insets = useSafeAreaInsets();

    const [reciters, setReciters] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [selected, setSelected] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');

    // ─────────────────────────────────────────────────────────────────────────
    // Load saved reciter
    // ─────────────────────────────────────────────────────────────────────────

    const loadSelected = useCallback(async () => {
        try {
            const saved = await AsyncStorage.getItem(
                SELECTED_RECITER_KEY
            );

            if (!saved) return;

            const parsed = JSON.parse(saved);

            if (parsed?.id != null) {
                setSelected(parsed);
            }
        } catch (e) {
            console.warn('[Reciters] Could not load selected reciter:', e);
        }
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Fetch reciters
    // ─────────────────────────────────────────────────────────────────────────

    const fetchReciters = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const json = await getReciters();

            console.log(
                '[Reciters] API response:',
                JSON.stringify(json).slice(0, 500)
            );

            /*
             * Supported response shapes:
             *
             * 1. { reciters: [...] }
             * 2. { data: { reciters: [...] } }
             * 3. { data: [...] }
             * 4. [...]
             */

            let list = [];

            if (Array.isArray(json)) {
                list = json;
            } else if (Array.isArray(json?.reciters)) {
                list = json.reciters;
            } else if (Array.isArray(json?.data?.reciters)) {
                list = json.data.reciters;
            } else if (Array.isArray(json?.data)) {
                list = json.data;
            }

            const clean = list
                .map(normalizeReciter)
                .filter(Boolean);

            console.log(
                `[Reciters] Loaded ${clean.length} reciters`
            );

            setReciters(clean);
            setFiltered(clean);

            if (clean.length === 0) {
                setError('No reciters were returned by the server.');
            }
        } catch (e) {
            console.error('[Reciters] Fetch error:', e);

            setReciters([]);
            setFiltered([]);
            setError(
                e?.message ||
                'Could not load reciters. Check your connection.'
            );
        } finally {
            setLoading(false);
        }
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // Initial load
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        loadSelected();
        fetchReciters();
    }, [loadSelected, fetchReciters]);

    // ─────────────────────────────────────────────────────────────────────────
    // Search
    // ─────────────────────────────────────────────────────────────────────────

    const handleSearch = useCallback(
        (text) => {
            setQuery(text);

            const search = text.trim().toLowerCase();

            if (!search) {
                setFiltered(reciters);
                return;
            }

            const filteredResults = reciters.filter((reciter) => {
                const name = String(
                    reciter?.name ?? ''
                ).toLowerCase();

                const translatedName = String(
                    getTranslatedName(reciter)
                ).toLowerCase();

                const style = String(
                    getStyleName(reciter)
                ).toLowerCase();

                const qirat = String(
                    getQiratName(reciter)
                ).toLowerCase();

                const language = String(
                    getLanguageName(reciter)
                ).toLowerCase();

                return (
                    name.includes(search) ||
                    translatedName.includes(search) ||
                    style.includes(search) ||
                    qirat.includes(search) ||
                    language.includes(search)
                );
            });

            setFiltered(filteredResults);
        },
        [reciters]
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Select reciter
    // ─────────────────────────────────────────────────────────────────────────

    const selectReciter = async (reciter) => {
        try {
            const obj = normalizeReciter(reciter);

            if (!obj?.id) {
                throw new Error(
                    'Selected reciter does not have a valid Quran Foundation ID.'
                );
            }

            console.log(
                '[Reciters] Selecting:',
                obj.name,
                'ID:',
                obj.id
            );

            setSelected(obj);

            await AsyncStorage.setItem(
                SELECTED_RECITER_KEY,
                JSON.stringify(obj)
            );

            /*
             * If a Surah is currently loaded, AudioStore changes the
             * chapter source on the existing native player.
             *
             * No player recreation.
             * No stop().
             * No setTimeout().
             */

            const audioState = AudioStore.getState();

            if (audioState?.surahId) {
                await AudioStore.changeReciter(obj);
            }

            router.back();
        } catch (e) {
            console.error('[Reciters] Selection error:', e);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render item
    // ─────────────────────────────────────────────────────────────────────────

    const renderItem = useCallback(
        ({ item }) => {
            const isSelected =
                selected?.id != null &&
                item?.id != null &&
                String(selected.id) === String(item.id);

            const styleName = getStyleName(item);
            const qiratName = getQiratName(item);

            const metaParts = [
                styleName,
                qiratName,
            ].filter(Boolean);

            return (
                <TouchableOpacity
                    style={[
                        s.row,
                        isSelected && s.rowActive,
                    ]}
                    onPress={() => selectReciter(item)}
                    activeOpacity={0.75}
                >
                    {/* Avatar */}
                    <View
                        style={[
                            s.avatarWrap,
                            isSelected && s.avatarWrapActive,
                        ]}
                    >
                        <Ionicons
                            name={
                                isSelected
                                    ? 'mic'
                                    : 'mic-outline'
                            }
                            size={18}
                            color={
                                isSelected
                                    ? DARK
                                    : GOLD
                            }
                        />
                    </View>

                    {/* Info */}
                    <View style={s.rowInfo}>
                        <Text
                            style={[
                                s.rowName,
                                isSelected && s.rowNameActive,
                            ]}
                            numberOfLines={1}
                        >
                            {item.name}
                        </Text>

                        {metaParts.length > 0 && (
                            <Text
                                style={[
                                    s.rowMeta,
                                    isSelected &&
                                    s.rowMetaActive,
                                ]}
                                numberOfLines={1}
                            >
                                {metaParts.join('  ·  ')}
                            </Text>
                        )}
                    </View>

                    {/* Selected indicator */}
                    {isSelected ? (
                        <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={DARK}
                        />
                    ) : (
                        <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={MUTED}
                        />
                    )}
                </TouchableOpacity>
            );
        },
        [selected]
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Key extractor
    // ─────────────────────────────────────────────────────────────────────────

    const keyExtractor = useCallback(
        (item, index) =>
            item?.id != null
                ? String(item.id)
                : `${item?.name ?? 'reciter'}-${index}`,
        []
    );

    // ─────────────────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <View
            style={[
                s.root,
                { paddingTop: insets.top },
            ]}
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={DARK}
            />

            {/* ───────────────── Top bar ───────────────── */}

            <View style={s.topBar}>
                <TouchableOpacity
                    style={s.backBtn}
                    onPress={() => router.back()}
                    hitSlop={{
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10,
                    }}
                >
                    <Ionicons
                        name="chevron-back"
                        size={20}
                        color={GOLD}
                    />
                </TouchableOpacity>

                <View style={s.titleWrap}>
                    <Text style={s.title}>
                        Reciters
                    </Text>

                    {selected?.name ? (
                        <Text
                            style={s.titleSub}
                            numberOfLines={1}
                        >
                            ✓ {selected.name}
                        </Text>
                    ) : null}
                </View>

                <View style={{ width: 36 }} />
            </View>

            {/* ───────────────── Search ───────────────── */}

            <View style={s.searchWrap}>
                <Ionicons
                    name="search-outline"
                    size={14}
                    color={MUTED}
                />

                <TextInput
                    style={s.searchInput}
                    placeholder="Search reciters…"
                    placeholderTextColor={MUTED}
                    value={query}
                    onChangeText={handleSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                />

                {query.length > 0 && (
                    <TouchableOpacity
                        onPress={() => handleSearch('')}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name="close-circle"
                            size={14}
                            color={MUTED}
                        />
                    </TouchableOpacity>
                )}
            </View>

            {/* ───────────────── Loading ───────────────── */}

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator
                        size="large"
                        color={GOLD}
                    />

                    <Text style={s.loadingText}>
                        Loading reciters…
                    </Text>
                </View>
            ) : reciters.length === 0 ? (
                /* ───────────────── Error / Empty ───────────────── */
                <View style={s.center}>
                    <Ionicons
                        name="mic-off-outline"
                        size={40}
                        color={MUTED}
                    />

                    <Text style={s.emptyText}>
                        {error || 'No reciters found'}
                    </Text>

                    <TouchableOpacity
                        style={s.retryBtn}
                        onPress={fetchReciters}
                    >
                        <Text style={s.retryText}>
                            Retry
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : (
                /* ───────────────── Reciter list ───────────────── */
                <FlatList
                    data={filtered}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[
                        s.list,
                        {
                            paddingBottom:
                                insets.bottom + 32,
                        },
                    ]}
                    ListHeaderComponent={
                        <Text style={s.countLabel}>
                            {filtered.length}{' '}
                            {filtered.length === 1
                                ? 'reciter'
                                : 'reciters'}
                        </Text>
                    }
                    ListEmptyComponent={
                        <View
                            style={{
                                paddingTop: 40,
                                alignItems: 'center',
                            }}
                        >
                            <Ionicons
                                name="search-outline"
                                size={32}
                                color={MUTED}
                            />

                            <Text
                                style={[
                                    s.emptyText,
                                    { marginTop: 10 },
                                ]}
                            >
                                No results for "{query}"
                            </Text>
                        </View>
                    }
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

    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
        gap: 14,
    },

    loadingText: {
        color: MUTED,
        fontSize: 13,
    },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },

    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: GOLD_L,
        alignItems: 'center',
        justifyContent: 'center',
    },

    titleWrap: {
        flex: 1,
        alignItems: 'center',
    },

    title: {
        color: TEXT,
        fontSize: 16,
        fontWeight: '700',
    },

    titleSub: {
        color: GOLD,
        fontSize: 11,
        marginTop: 2,
        maxWidth: 240,
        textAlign: 'center',
    },

    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: CARD,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER,
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },

    searchInput: {
        flex: 1,
        color: TEXT,
        fontSize: 14,
        padding: 0,
    },

    countLabel: {
        color: MUTED,
        fontSize: 11,
        paddingHorizontal: 4,
        paddingBottom: 8,
        paddingTop: 10,
        letterSpacing: 0.3,
    },

    list: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: CARD,
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: BORDER,
    },

    rowActive: {
        backgroundColor: GOLD,
        borderColor: GOLD,
    },

    avatarWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: GOLD_L,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: GOLD_M,
        flexShrink: 0,
    },

    avatarWrapActive: {
        backgroundColor: 'rgba(12,21,32,0.25)',
        borderColor: 'rgba(12,21,32,0.3)',
    },

    rowInfo: {
        flex: 1,
    },

    rowName: {
        color: TEXT,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 3,
    },

    rowNameActive: {
        color: DARK,
    },

    rowMeta: {
        color: MUTED,
        fontSize: 11,
    },

    rowMetaActive: {
        color: 'rgba(12,21,32,0.6)',
    },

    emptyText: {
        color: TEXT_D,
        fontSize: 14,
        textAlign: 'center',
    },

    retryBtn: {
        backgroundColor: GOLD_L,
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: GOLD_M,
    },

    retryText: {
        color: GOLD,
        fontWeight: '700',
        fontSize: 14,
    },
});