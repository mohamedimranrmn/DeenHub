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

const GOLD      = '#C9A84C';
const GOLD_LIGHT= 'rgba(201,168,76,0.08)';
const GOLD_MED  = 'rgba(201,168,76,0.18)';
const DARK      = '#0C1520';
const CARD      = '#111D2B';
const TEXT      = '#F0EAD6';
const MUTED     = '#4A5A6A';
const MUTED_MID = '#7A8A9A';
const BORDER    = 'rgba(255,255,255,0.06)';

export default function Explore() {
    const insets = useSafeAreaInsets();
    const [query,          setQuery]          = useState('');
    const [categoryCounts, setCategoryCounts] = useState({});
    const [countsLoading,  setCountsLoading]  = useState(true);
    const searchAnim = useRef(new Animated.Value(0)).current;
    const headerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        fetchCounts();
    }, []);

    const fetchCounts = async () => {
        setCountsLoading(true);
        try {
            const { data, error } = await supabase
                .from('dua_category_counts')
                .select('category, total');

            if (error) throw error;

            const counts = {};
            data?.forEach(row => { counts[row.category] = row.total; });
            setCategoryCounts(counts);
        } catch (e) {
            try {
                const { data } = await supabase
                    .from('duas')
                    .select('category')
                    .not('category', 'is', null);
                const counts = {};
                data?.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1; });
                setCategoryCounts(counts);
            } catch {}
        } finally {
            setCountsLoading(false);
        }
    };

    const visibleCategories = DUA_CATEGORIES.filter(
        cat => (categoryCounts[cat.key] ?? 0) > 0
    );

    const totalDuas = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

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

    const renderCategory = ({ item }) => (
        <TouchableOpacity
            style={s.row}
            onPress={() => router.push(`/explore/category/${encodeURIComponent(item.key)}`)}
            activeOpacity={0.72}
        >
            <View style={[s.dot, { backgroundColor: item.color ?? GOLD }]} />
            <View style={s.rowText}>
                <Text style={s.rowArabic}>{item.arabic}</Text>
                <Text style={s.rowTitle}>{item.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={MUTED} />
        </TouchableOpacity>
    );

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
                    <Text style={s.headerSuper}>الأدعية والأذكار</Text>
                    <Text style={s.headerTitle}>Duas & Dhikr</Text>
                    <Text style={s.headerSub}>
                        {countsLoading
                            ? '—'
                            : `${totalDuas.toLocaleString()} duas · ${visibleCategories.length} categories`
                        }
                    </Text>
                </View>
                <TouchableOpacity
                    style={s.headerBtn}
                    onPress={() => router.push('/explore/dua/saved-duas')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="bookmark-outline" size={18} color={GOLD} />
                </TouchableOpacity>
            </Animated.View>

            {/* ── Search bar ── */}
            <Animated.View style={[s.searchWrap, { borderColor: searchBorderColor }]}>
                <Ionicons name="search-outline" size={15} color={MUTED} style={s.searchIcon} />
                <TextInput
                    placeholder="Search across all duas…"
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
                    <TouchableOpacity
                        onPress={() => setQuery('')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close-circle" size={16} color={MUTED} />
                    </TouchableOpacity>
                ) : null}
            </Animated.View>

            {/* ── Section label ── */}
            <Text style={s.sectionLabel}>Categories</Text>

            {/* ── List ── */}
            {countsLoading ? (
                <View style={s.loader}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loaderText}>Loading categories…</Text>
                </View>
            ) : visibleCategories.length === 0 ? (
                <View style={s.loader}>
                    <Text style={s.emptyArabic}>لا توجد بيانات</Text>
                    <Text style={s.loaderText}>No categories available yet.</Text>
                </View>
            ) : (
                <FlatList
                    data={visibleCategories}
                    keyExtractor={item => item.key}
                    renderItem={renderCategory}
                    contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => (
                        <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 52 }} />
                    )}
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
    headerSuper: { fontSize: 11, color: GOLD, opacity: 0.55, marginBottom: 3, letterSpacing: 1 },
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

    listContent: { paddingHorizontal: 0 },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 18,
        backgroundColor: CARD,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 16,
    },
    rowText: { flex: 1 },
    rowArabic: {
        fontSize: 16,
        color: TEXT,
        lineHeight: 22,
        marginBottom: 2,
    },
    rowTitle: {
        fontSize: 12,
        color: MUTED_MID,
        letterSpacing: 0.2,
    },

    loader:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { color: MUTED_MID, fontSize: 13 },
    emptyArabic:{ fontSize: 26, color: GOLD, opacity: 0.3 },
});