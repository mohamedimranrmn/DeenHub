/**
 * app/quran/saved.jsx
 *
 * Saved (bookmarked) Surahs & Ayahs — backed by `quran_bookmarks`.
 * Surah-level bookmark: ayah_number IS NULL
 * Ayah-level bookmark:  ayah_number set
 *
 * Mirrors the swipe-left-to-remove pattern used by the saved-hadiths,
 * saved-duas, and bookmarked-lessons screens (react-native-gesture-handler
 * Swipeable), replacing the old inline trash-icon button.
 */

import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, StatusBar, Animated,
} from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import supabase from '../../src/services/supabase';
import { getDeviceId } from '../../src/utils/device';
import { getSurahs } from '../../src/services/quranApi';

const DARK   = '#0C1520';
const CARD   = '#111C26';
const GOLD   = '#C9A84C';
const GOLD_L = 'rgba(201,168,76,0.10)';
const GOLD_M = 'rgba(201,168,76,0.20)';
const TEXT   = '#F0EAD6';
const TEXT_D = '#C8B99A';
const MUTED  = '#5A6A7A';
const BORDER = 'rgba(201,168,76,0.12)';
const RED    = '#B71C1C';

export default function SavedQuranScreen() {
    const insets = useSafeAreaInsets();
    const [loading, setLoading]   = useState(true);
    const [surahs, setSurahs]     = useState([]); // bookmark rows, ayah_number === null
    const [ayahs, setAyahs]       = useState([]); // bookmark rows, ayah_number set
    const [surahMap, setSurahMap] = useState({});
    const [showHint, setShowHint] = useState(true);
    const swipeableRefs           = useRef({});

    useFocusEffect(useCallback(() => { load(); }, []));

    const load = async () => {
        setLoading(true);
        try {
            const device_id = await getDeviceId();

            const [{ data: rows }, surahRes] = await Promise.all([
                supabase
                    .from('quran_bookmarks')
                    .select('*')
                    .eq('device_id', device_id)
                    .order('created_at', { ascending: false }),
                getSurahs(),
            ]);

            const list = surahRes?.data?.surahs ?? [];
            const map  = {};
            list.forEach(sur => { map[sur.number] = sur; });
            setSurahMap(map);

            const all = rows ?? [];
            setSurahs(all.filter(r => r.ayah_number === null));
            setAyahs(all.filter(r => r.ayah_number !== null));
        } catch (e) {
            console.error('[SavedQuran]', e);
        } finally {
            setLoading(false);
        }
    };

    const removeBookmark = useCallback(async (row) => {
        // Optimistic remove
        if (row.ayah_number === null) {
            setSurahs(prev => prev.filter(r => r.surah_number !== row.surah_number));
        } else {
            setAyahs(prev => prev.filter(r => !(r.surah_number === row.surah_number && r.ayah_number === row.ayah_number)));
        }
        try {
            const device_id = await getDeviceId();
            let q = supabase.from('quran_bookmarks').delete()
                .eq('device_id', device_id)
                .eq('surah_number', row.surah_number);
            q = row.ayah_number === null ? q.is('ayah_number', null) : q.eq('ayah_number', row.ayah_number);
            const { error } = await q;
            if (error) throw error;
        } catch (e) {
            console.error('[SavedQuran] remove:', e);
            load(); // resync on failure
        }
    }, []);

    const renderRightActions = (progress, dragX, key, row) => {
        const scale = progress.interpolate({
            inputRange:  [0, 1],
            outputRange: [0.7, 1],
            extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
            inputRange:  [0, 0.5, 1],
            outputRange: [0, 0.6, 1],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={[s.deleteOuter, { opacity, transform: [{ scale }] }]}>
                <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => {
                        swipeableRefs.current[key]?.close();
                        removeBookmark(row);
                    }}
                    activeOpacity={0.75}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                    <Text style={s.deleteLabel}>Remove</Text>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderSurahRow = (row, key) => {
        const sur = surahMap[row.surah_number];
        return (
            <Swipeable
                ref={ref => {
                    if (ref) swipeableRefs.current[key] = ref;
                    else delete swipeableRefs.current[key];
                }}
                renderRightActions={(progress, dragX) =>
                    renderRightActions(progress, dragX, key, row)
                }
                onSwipeableOpen={() => setShowHint(false)}
                rightThreshold={60}
                friction={2}
                overshootRight={false}
                containerStyle={s.swipeContainer}
            >
                <TouchableOpacity
                    style={s.row}
                    activeOpacity={0.75}
                    onPress={() => router.push(`/quran/surah/${row.surah_number}`)}
                >
                    <View style={s.rowBadge}>
                        <Text style={s.rowBadgeText}>{row.surah_number}</Text>
                    </View>
                    <View style={s.rowBody}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                            {sur?.name_english ?? `Surah ${row.surah_number}`}
                        </Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                            {sur?.name_translation ?? 'Full surah bookmarked'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </TouchableOpacity>
            </Swipeable>
        );
    };

    const renderAyahRow = (row, key) => {
        const sur = surahMap[row.surah_number];
        return (
            <Swipeable
                ref={ref => {
                    if (ref) swipeableRefs.current[key] = ref;
                    else delete swipeableRefs.current[key];
                }}
                renderRightActions={(progress, dragX) =>
                    renderRightActions(progress, dragX, key, row)
                }
                onSwipeableOpen={() => setShowHint(false)}
                rightThreshold={60}
                friction={2}
                overshootRight={false}
                containerStyle={s.swipeContainer}
            >
                <TouchableOpacity
                    style={s.row}
                    activeOpacity={0.75}
                    onPress={() => router.push(`/quran/ayah/${row.surah_number}/${row.ayah_number}`)}
                >
                    <View style={s.rowBadge}>
                        <Text style={s.rowBadgeText}>{row.surah_number}:{row.ayah_number}</Text>
                    </View>
                    <View style={s.rowBody}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                            {sur?.name_english ?? `Surah ${row.surah_number}`}
                        </Text>
                        <Text style={s.rowSub}>Ayah {row.ayah_number}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </TouchableOpacity>
            </Swipeable>
        );
    };

    const isEmpty = !loading && surahs.length === 0 && ayahs.length === 0;

    const listData = [
        ...(surahs.length ? [{ type: 'header', key: 'h-surahs', label: `Surahs (${surahs.length})` }] : []),
        ...surahs.map(r => ({ type: 'surah', key: `s-${r.surah_number}`, row: r })),
        ...(ayahs.length ? [{ type: 'header', key: 'h-ayahs', label: `Ayahs (${ayahs.length})` }] : []),
        ...ayahs.map(r => ({ type: 'ayah', key: `a-${r.surah_number}-${r.ayah_number}`, row: r })),
    ];

    return (
        <GestureHandlerRootView style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            <View style={s.topBar}>
                <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={20} color={GOLD} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Saved Quran</Text>
                <View style={{ width: 36 }} />
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="large" color={GOLD} />
                </View>
            ) : isEmpty ? (
                <View style={s.center}>
                    <Ionicons name="bookmark-outline" size={40} color={MUTED} />
                    <Text style={s.emptyText}>No bookmarks yet</Text>
                    <Text style={s.emptySub}>Bookmark a surah or an ayah to see it here.</Text>
                </View>
            ) : (
                <>
                    {showHint && (
                        <View style={s.hint}>
                            <Ionicons name="arrow-back" size={11} color={MUTED} />
                            <Text style={s.hintText}>Swipe left to remove</Text>
                        </View>
                    )}
                    <FlatList
                        data={listData}
                        keyExtractor={(item) => item.key}
                        renderItem={({ item }) => {
                            if (item.type === 'header') return <Text style={s.sectionLabel}>{item.label}</Text>;
                            if (item.type === 'surah')  return renderSurahRow(item.row, item.key);
                            return renderAyahRow(item.row, item.key);
                        }}
                        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                        showsVerticalScrollIndicator={false}
                    />
                </>
            )}
        </GestureHandlerRootView>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: DARK },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },

    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    iconBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center',
    },
    topTitle: { color: TEXT, fontSize: 16, fontWeight: '700' },

    hint: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 16, paddingTop: 12, opacity: 0.5,
    },
    hintText: { fontSize: 11, color: MUTED, fontStyle: 'italic' },

    list: { paddingHorizontal: 16, paddingTop: 12 },
    sectionLabel: {
        color: MUTED, fontSize: 11, fontWeight: '700', letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8, marginTop: 14,
    },

    swipeContainer: {
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 8,
    },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: CARD, borderRadius: 14, padding: 13,
        borderWidth: 1, borderColor: BORDER,
    },
    rowBadge: {
        minWidth: 40, height: 32, borderRadius: 8, paddingHorizontal: 6,
        backgroundColor: GOLD_L, borderWidth: 1, borderColor: GOLD_M,
        alignItems: 'center', justifyContent: 'center',
    },
    rowBadgeText: { color: GOLD, fontWeight: '700', fontSize: 11 },
    rowBody:  { flex: 1 },
    rowTitle: { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 2 },
    rowSub:   { color: MUTED, fontSize: 11 },

    deleteOuter: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: RED,
        borderRadius: 14,
    },
    deleteBtn: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
    },
    deleteLabel: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    emptyText: { color: TEXT_D, fontSize: 15, fontWeight: '700' },
    emptySub:  { color: MUTED, fontSize: 12, textAlign: 'center' },
});