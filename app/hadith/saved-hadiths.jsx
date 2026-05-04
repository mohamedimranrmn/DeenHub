import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDeviceId } from '../../src/utils/device';

const GOLD   = '#C9A84C';
const DARK   = '#0C1520';
const CARD   = '#111D2B';
const TEXT   = '#F0EAD6';
const MUTED  = '#4A5A6A';
const MUTED_MID = '#7A8A9A';
const BORDER = 'rgba(255,255,255,0.06)';
const RED    = '#B71C1C';

export default function SavedHadithsScreen() {
    const insets = useSafeAreaInsets();
    const [hadiths, setHadiths]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const swipeableRefs           = useRef({});
    const [showHint, setShowHint] = useState(true);

    useFocusEffect(useCallback(() => { load(); }, []));

    const load = async () => {
        setLoading(true);

        const device_id = getDeviceId();

        const { data: bookmarks } = await supabase
            .from('bookmarks')
            .select('content_id')
            .eq('device_id', device_id)
            .eq('content_type', 'hadith');

        const ids = bookmarks?.map(b => b.content_id) || [];
        if (!ids.length) {
            setHadiths([]);
            setLoading(false);
            return;
        }

        const { data } = await supabase
            .from('hadiths')
            .select('id, full_text, book, hadith_number, source')
            .in('id', ids);

        setHadiths(data || []);
        setLoading(false);
    };

    const removeBookmark = useCallback(async (hadithId) => {
        setHadiths(prev => prev.filter(h => h.id !== hadithId));

        const device_id = getDeviceId();

        const { error } = await supabase
            .from('bookmarks')
            .delete()
            .eq('device_id', device_id)
            .eq('content_type', 'hadith')
            .eq('content_id', hadithId);

        if (error) {
            console.warn('Bookmark delete failed:', error.message);
            load();
        }
    }, []);

    const renderRightActions = (progress, dragX, hadithId) => {
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
                        swipeableRefs.current[hadithId]?.close();
                        removeBookmark(hadithId);
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

    const renderItem = ({ item }) => {
        const preview = item.full_text ? item.full_text.slice(0, 140) : '—';

        return (
            <Swipeable
                ref={ref => {
                    if (ref) swipeableRefs.current[item.id] = ref;
                    else delete swipeableRefs.current[item.id];
                }}
                renderRightActions={(progress, dragX) =>
                    renderRightActions(progress, dragX, item.id)
                }
                onSwipeableOpen={() => setShowHint(false)}
                rightThreshold={60}
                friction={2}
                overshootRight={false}
                containerStyle={s.swipeContainer}
            >
                <TouchableOpacity
                    style={s.card}
                    activeOpacity={0.8}
                    onPress={() =>
                        router.push({
                            pathname: '/hadith/[id]',
                            params: { id: item.id },
                        })
                    }
                >
                    <View style={s.cardBody}>
                        <Text style={s.hadithText} numberOfLines={3}>{preview}</Text>
                        <View style={s.cardFooter}>
                            <Text style={s.source} numberOfLines={1}>
                                {item.book ?? item.source}
                                {item.hadith_number ? `  ·  Hadith ${item.hadith_number}` : ''}
                            </Text>
                            <Ionicons name="chevron-forward" size={14} color={MUTED} />
                        </View>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <GestureHandlerRootView style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={20} color={TEXT} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Saved Hadiths</Text>
                    {!loading ? (
                        <Text style={s.subtitle}>{hadiths.length} saved</Text>
                    ) : null}
                </View>
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={GOLD} size="large" />
                </View>
            ) : hadiths.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="bookmark-outline" size={44} color={MUTED} style={{ opacity: 0.35 }} />
                    <Text style={s.emptyTitle}>No saved hadiths</Text>
                    <Text style={s.emptyDesc}>Bookmark hadiths to access them here</Text>
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
                        data={hadiths}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderItem}
                        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
                        showsVerticalScrollIndicator={false}
                        ItemSeparatorComponent={() => (
                            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />
                        )}
                    />
                </>
            )}
        </GestureHandlerRootView>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: DARK },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

    header: {
        flexDirection: 'row', alignItems: 'center',
        gap: 12, paddingHorizontal: 16, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: CARD, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
    },
    title:    { fontSize: 20, fontWeight: '800', color: TEXT },
    subtitle: { fontSize: 12, color: MUTED_MID, marginTop: 2 },

    list: { paddingHorizontal: 0, paddingTop: 0 },

    swipeContainer: {},

    hint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 20,
        paddingVertical: 10,
        opacity: 0.45,
    },
    hintText: {
        fontSize: 11,
        color: MUTED,
        fontStyle: 'italic',
    },

    // Full-bleed card — no left bar, clean list style
    card: {
        backgroundColor: CARD,
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    cardBody: { flex: 1 },
    hadithText: {
        fontSize: 14, lineHeight: 22, color: '#C8B99A',
        marginBottom: 10,
    },
    cardFooter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    source:   { fontSize: 11, color: MUTED_MID, flex: 1 },

    deleteOuter: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: RED,
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

    emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT },
    emptyDesc:  { fontSize: 13, color: MUTED, textAlign: 'center', maxWidth: 220 },
});