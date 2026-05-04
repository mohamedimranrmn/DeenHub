import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDeviceId } from '../../../src/utils/device';

const GOLD   = '#C9A84C';
const DARK   = '#0F1923';
const CARD   = '#1A2535';
const TEXT   = '#F0EAD6';
const MUTED  = '#8A8A99';
const BORDER = 'rgba(201,168,76,0.15)';
const GREEN  = '#4CAF50';
const RED    = '#C62828';

export default function BookmarkedLessonsScreen() {
    const insets = useSafeAreaInsets();
    const [lessons, setLessons]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showHint, setShowHint] = useState(true);
    const swipeableRefs           = useRef({});

    useFocusEffect(useCallback(() => { load(); }, []));

    const load = async () => {
        setLoading(true);

        const device_id = getDeviceId();

        const { data: bookmarks } = await supabase
            .from('bookmarks')
            .select('content_id')
            .eq('device_id', device_id)
            .eq('content_type', 'lesson');

        const ids = bookmarks?.map(b => b.content_id) || [];
        if (!ids.length) {
            setLessons([]);
            setLoading(false);
            return;
        }

        const { data: lessonData } = await supabase
            .from('lessons')
            .select('id, title, summary, duration, topics ( name )')
            .in('id', ids);

        const { data: progressData } = await supabase
            .from('lesson_progress')
            .select('lesson_id, completed, completed_at')
            .eq('device_id', device_id)
            .in('lesson_id', ids);

        const progressMap = {};
        (progressData || []).forEach(p => {
            progressMap[p.lesson_id] = p;
        });

        const merged = (lessonData || []).map(lesson => ({
            ...lesson,
            completed: progressMap[lesson.id]?.completed || false,
            completed_at: progressMap[lesson.id]?.completed_at || null,
        }));

        setLessons(merged);
        setLoading(false);
    };

    const removeBookmark = useCallback(async (lessonId) => {
        setLessons(prev => prev.filter(l => l.id !== lessonId));

        const device_id = getDeviceId();

        const { error } = await supabase
            .from('bookmarks')
            .delete()
            .eq('device_id', device_id)
            .eq('content_type', 'lesson')
            .eq('content_id', lessonId);

        if (error) {
            console.warn('Bookmark delete failed:', error.message);
            load();
        }
    }, []);

    const renderRightActions = (progress, dragX, lessonId) => {
        const scale = progress.interpolate({
            inputRange:  [0, 1],
            outputRange: [0.7, 1],
            extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
            inputRange:  [0, 0.6, 1],
            outputRange: [0,  0.7, 1],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={[s.deleteOuter, { opacity, transform: [{ scale }] }]}>
                <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => {
                        swipeableRefs.current[lessonId]?.close();
                        removeBookmark(lessonId);
                    }}
                    activeOpacity={0.75}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="trash-outline" size={22} color="#fff" />
                    <Text style={s.deleteLabel}>Remove</Text>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }) => {
        const topicName = item?.topics?.name ?? '';
        const doneDate  = item.completed_at
            ? new Date(item.completed_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
            })
            : null;

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
                    activeOpacity={0.82}
                    onPress={() => router.push(`/learn/lesson/${item.id}`)}
                >
                    <View style={[s.accent, { backgroundColor: item.completed ? GREEN : GOLD }]} />

                    <View style={s.cardContent}>
                        <View style={s.cardHeader}>
                            <Text style={s.lessonTitle} numberOfLines={2}>{item.title}</Text>
                            {item.completed && (
                                <View style={s.completedBadge}>
                                    <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                                    <Text style={s.completedText}>Done</Text>
                                </View>
                            )}
                        </View>

                        {item.summary ? (
                            <Text style={s.summary} numberOfLines={1}>{item.summary}</Text>
                        ) : null}

                        <View style={s.metaRow}>
                            {!!topicName && (
                                <>
                                    <Text style={s.metaTopic}>{topicName}</Text>
                                    <Text style={s.metaDot}>·</Text>
                                </>
                            )}
                            <Ionicons name="time-outline" size={11} color={MUTED} />
                            <Text style={s.metaText}>{item.duration} min</Text>
                            {doneDate && (
                                <>
                                    <Text style={s.metaDot}>·</Text>
                                    <Text style={s.metaText}>{doneDate}</Text>
                                </>
                            )}
                        </View>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color={MUTED} style={s.chevron} />
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <GestureHandlerRootView style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={22} color={TEXT} />
                </TouchableOpacity>
                <View>
                    <Text style={s.title}>Saved Lessons</Text>
                    <Text style={s.subtitle}>
                        {lessons.length} saved · {lessons.filter(l => l.completed).length} completed
                    </Text>
                </View>
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={GOLD} size="large" />
                </View>
            ) : lessons.length === 0 ? (
                <View style={s.center}>
                    <Ionicons name="bookmark-outline" size={48} color={MUTED} style={{ opacity: 0.4 }} />
                    <Text style={s.emptyTitle}>No saved lessons</Text>
                    <Text style={s.emptyDesc}>Tap the bookmark icon on any lesson to save it here</Text>
                </View>
            ) : (
                <>
                    {/* Swipe hint — visible until user swipes for the first time */}
                    {showHint && (
                        <View style={s.hint}>
                            <Ionicons name="arrow-back" size={12} color={MUTED} />
                            <Text style={s.hintText}>Swipe left on any item to remove</Text>
                        </View>
                    )}

                    <FlatList
                        data={lessons}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderItem}
                        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
                        showsVerticalScrollIndicator={false}
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
        paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },
    title:    { fontSize: 22, fontWeight: '800', color: TEXT },
    subtitle: { fontSize: 12, color: MUTED, marginTop: 2 },

    hint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 20,
        paddingBottom: 10,
        opacity: 0.5,
    },
    hintText: {
        fontSize: 11,
        color: MUTED,
        fontStyle: 'italic',
    },

    list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

    swipeContainer: {
        borderRadius: 16,
        overflow: 'hidden',
    },

    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD,
        borderWidth: 1, borderColor: BORDER,
    },
    accent: { width: 4, alignSelf: 'stretch' },
    cardContent: { flex: 1, padding: 14, gap: 4 },
    cardHeader: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 8,
    },
    lessonTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT },
    summary: { fontSize: 12, color: MUTED, fontStyle: 'italic', lineHeight: 16 },

    completedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(76,175,80,0.1)',
        paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
        borderWidth: 1, borderColor: 'rgba(76,175,80,0.2)',
    },
    completedText: { fontSize: 11, color: GREEN, fontWeight: '600' },

    metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    metaTopic: { fontSize: 12, color: GOLD, fontWeight: '600' },
    metaDot:   { fontSize: 12, color: MUTED },
    metaText:  { fontSize: 12, color: MUTED },
    chevron:   { paddingRight: 12 },

    deleteOuter: {
        width: 86,
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
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    emptyTitle: { fontSize: 16, fontWeight: '600', color: TEXT },
    emptyDesc:  { fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },
});