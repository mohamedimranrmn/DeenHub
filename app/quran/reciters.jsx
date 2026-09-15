/**
 * app/quran/reciters.jsx
 *
 * Clean, minimal reciter selection screen.
 * Saves { id, name, style, language } to AsyncStorage as 'selected_reciter'.
 * If audio is currently playing, stops it so next play uses the new reciter.
 */

import {
    View, Text, FlatList, TouchableOpacity,
    ActivityIndicator, StyleSheet, StatusBar, TextInput,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReciters } from '../../src/services/quranApi';
import AudioStore from '../../src/services/audioStore';

const DARK   = '#0C1520';
const CARD   = '#111C26';
const GOLD   = '#C9A84C';
const GOLD_L = 'rgba(201,168,76,0.10)';
const GOLD_M = 'rgba(201,168,76,0.20)';
const GREEN  = '#4CAF50';
const TEXT   = '#F0EAD6';
const TEXT_D = '#C8B99A';
const MUTED  = '#5A6A7A';
const BORDER = 'rgba(201,168,76,0.12)';

export default function RecitersScreen() {
    const insets = useSafeAreaInsets();
    const [reciters, setReciters] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(true);
    const [query, setQuery]       = useState('');

    useEffect(() => {
        loadSelected();
        fetchReciters();
    }, []);

    const loadSelected = async () => {
        try {
            const saved = await AsyncStorage.getItem('selected_reciter');
            if (saved) setSelected(JSON.parse(saved));
        } catch (_) {}
    };

    const fetchReciters = async () => {
        setLoading(true);
        try {
            const json  = await getReciters();
            const list  = json?.data?.reciters ?? json?.data ?? [];
            const clean = Array.isArray(list) ? list : [];
            setReciters(clean);
            setFiltered(clean);
        } catch (e) {
            console.error('[Reciters]', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = useCallback((text) => {
        setQuery(text);
        if (!text.trim()) {
            setFiltered(reciters);
        } else {
            const lq = text.trim().toLowerCase();
            setFiltered(reciters.filter(r =>
                r.name?.toLowerCase().includes(lq) ||
                r.style?.toLowerCase().includes(lq) ||
                r.language?.toLowerCase().includes(lq)
            ));
        }
    }, [reciters]);

    const selectReciter = async (reciter) => {
        try {
            const obj = {
                id: reciter.id,
                name: reciter.name,
                style: reciter.style ?? null,
                language: reciter.language ?? null,
                relativePath: reciter.relativePath ?? reciter.relative_path ?? null,
                quranComId: reciter.quranComId ?? null,
            };

            await AsyncStorage.setItem('selected_reciter', JSON.stringify(obj));
            setSelected(obj);

            // AudioStore owns the native player. Never stop/unload it from the UI.
            // changeReciter() replaces the source on the same native player and
            // restores the current surah/ayah/play state safely.
            if (AudioStore.getState().surahId) {
                await AudioStore.changeReciter(obj);
            }

            router.back();
        } catch (e) {
            console.error('[Reciters] change reciter:', e);
        }
    };

    const keyExtractor = (item, i) => item.id?.toString() ?? item.name ?? String(i);

    const renderItem = ({ item }) => {
        const isSelected = (selected?.id != null && item.id != null)
            ? selected.id === item.id
            : selected?.name === item.name;
        return (
            <TouchableOpacity
                style={[s.row, isSelected && s.rowActive]}
                onPress={() => selectReciter(item)}
                activeOpacity={0.75}
            >
                <View style={[s.avatarWrap, isSelected && s.avatarWrapActive]}>
                    <Ionicons
                        name={isSelected ? 'mic' : 'mic-outline'}
                        size={18}
                        color={isSelected ? DARK : GOLD}
                    />
                </View>

                <View style={s.rowInfo}>
                    <Text style={[s.rowName, isSelected && s.rowNameActive]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    {(item.style || item.language) ? (
                        <Text style={[s.rowMeta, isSelected && s.rowMetaActive]} numberOfLines={1}>
                            {[item.style, item.language].filter(Boolean).join('  ·  ')}
                        </Text>
                    ) : null}
                </View>

                {isSelected
                    ? <Ionicons name="checkmark-circle" size={22} color={DARK} />
                    : <Ionicons name="chevron-forward" size={14} color={MUTED} />
                }
            </TouchableOpacity>
        );
    };

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* Top bar */}
            <View style={s.topBar}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={20} color={GOLD} />
                </TouchableOpacity>
                <View style={s.titleWrap}>
                    <Text style={s.title}>Reciters</Text>
                    {selected?.name ? (
                        <Text style={s.titleSub} numberOfLines={1}>✓ {selected.name}</Text>
                    ) : null}
                </View>
                <View style={{ width: 36 }} />
            </View>

            {/* Search */}
            <View style={s.searchWrap}>
                <Ionicons name="search-outline" size={14} color={MUTED} />
                <TextInput
                    style={s.searchInput}
                    placeholder="Search reciters…"
                    placeholderTextColor={MUTED}
                    value={query}
                    onChangeText={handleSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => handleSearch('')}>
                        <Ionicons name="close-circle" size={14} color={MUTED} />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="large" color={GOLD} />
                </View>
            ) : reciters.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="mic-off-outline" size={40} color={MUTED} />
                    <Text style={s.emptyText}>No reciters found</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={fetchReciters}>
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
                    ListHeaderComponent={
                        <Text style={s.countLabel}>{filtered.length} reciters</Text>
                    }
                    ListEmptyComponent={
                        <View style={{ paddingTop: 40, alignItems: 'center' }}>
                            <Text style={s.emptyText}>No results for "{query}"</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root:  { flex: 1, backgroundColor: DARK },
    center:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },

    topBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center',
    },
    titleWrap: { flex: 1, alignItems: 'center' },
    title: { color: TEXT, fontSize: 16, fontWeight: '700' },
    titleSub: { color: GOLD, fontSize: 11, marginTop: 2, maxWidth: 220, textAlign: 'center' },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
        marginHorizontal: 16, marginTop: 12, marginBottom: 4,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    searchInput: { flex: 1, color: TEXT, fontSize: 14, padding: 0 },

    countLabel: {
        color: MUTED, fontSize: 11, paddingHorizontal: 4,
        paddingBottom: 8, paddingTop: 10, letterSpacing: 0.3,
    },
    list: { paddingHorizontal: 16, paddingTop: 4 },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: CARD, borderRadius: 14, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: BORDER,
    },
    rowActive: { backgroundColor: GOLD, borderColor: GOLD },

    avatarWrap: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: GOLD_L, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: GOLD_M, flexShrink: 0,
    },
    avatarWrapActive: { backgroundColor: 'rgba(12,21,32,0.25)', borderColor: 'rgba(12,21,32,0.3)' },

    rowInfo:       { flex: 1 },
    rowName:       { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 2 },
    rowNameActive: { color: DARK },
    rowMeta:       { color: MUTED, fontSize: 11 },
    rowMetaActive: { color: 'rgba(12,21,32,0.6)' },

    emptyText: { color: TEXT_D, fontSize: 14 },
    retryBtn:  {
        backgroundColor: GOLD_L, borderRadius: 10,
        paddingHorizontal: 20, paddingVertical: 8,
        borderWidth: 1, borderColor: GOLD_M,
    },
    retryText: { color: GOLD, fontWeight: '700', fontSize: 14 },
});