import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, ActivityIndicator, StatusBar,
    PanResponder, Animated,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '@/src/utils/device';

const GOLD   = '#C9A84C';
const DARK   = '#0F1923';
const CARD   = '#1A2535';
const TEXT   = '#F0EAD6';
const MUTED  = '#8A8A99';
const BORDER = 'rgba(201,168,76,0.15)';
const GREEN  = '#4CAF50';

const SWIPE_THRESHOLD = 60;

export default function LessonDetailScreen() {
    const { id }   = useLocalSearchParams();
    const router   = useRouter();
    const insets   = useSafeAreaInsets();

    const [allLessons, setAllLessons]     = useState([]);
    const [currentIdx, setCurrentIdx]     = useState(0);
    const [loading, setLoading]           = useState(true);

    const [completedMap, setCompletedMap] = useState({});
    const [savedMap, setSavedMap]         = useState({});
    const [marking, setMarking]           = useState(false);
    const [saving, setSaving]             = useState(false);

    const translateX = useRef(new Animated.Value(0)).current;
    const scrollRef  = useRef(null);

    const lesson    = allLessons[currentIdx] ?? null;
    const completed = lesson ? (completedMap[lesson.id] ?? false) : false;
    const saved     = lesson ? (savedMap[lesson.id]     ?? false) : false;

    useEffect(() => {
        loadAll();
    }, []);

    // ── Initial load — uses device_id instead of auth ─────────────────────────
    const loadAll = async () => {
        try {
            setLoading(true);
            const device_id = getDeviceId();

            // 1. Fetch the anchor lesson to get its topic_id
            const { data: anchor } = await supabase
                .from('lessons')
                .select('id, title, summary, content, key_points, reflection, duration, order_index, topic_id')
                .eq('id', id)
                .maybeSingle();

            if (!anchor) { setLoading(false); return; }

            // 2. Fetch all lessons in the same topic, ordered
            const { data: lessons = [] } = await supabase
                .from('lessons')
                .select('id, title, summary, content, key_points, reflection, duration, order_index, topic_id')
                .eq('topic_id', anchor.topic_id)
                .order('order_index');

            setAllLessons(lessons);

            const idx = lessons.findIndex(l => String(l.id) === String(id));
            setCurrentIdx(idx >= 0 ? idx : 0);

            // 3. Fetch progress + bookmarks for all lessons using device_id
            if (lessons.length > 0) {
                const lessonIds = lessons.map(l => l.id);

                const [{ data: progressRows }, { data: bookmarkRows }] = await Promise.all([
                    supabase
                        .from('lesson_progress')
                        .select('lesson_id, completed')
                        .eq('device_id', device_id)
                        .in('lesson_id', lessonIds),

                    supabase
                        .from('bookmarks')
                        .select('content_id')
                        .eq('device_id', device_id)
                        .eq('content_type', 'lesson')
                        .in('content_id', lessonIds),
                ]);

                const cMap = {};
                (progressRows || []).forEach(r => { cMap[r.lesson_id] = r.completed === true; });

                const sMap = {};
                (bookmarkRows || []).forEach(r => { sMap[r.content_id] = true; });

                setCompletedMap(cMap);
                setSavedMap(sMap);
            }
        } catch (e) {
            console.log('Load error:', e.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Navigate between lessons with slide animation ─────────────────────────
    const navigateTo = useCallback((newIdx, direction) => {
        if (newIdx < 0 || newIdx >= allLessons.length) return;

        const toValue = direction === 'next' ? -400 : 400;

        Animated.timing(translateX, {
            toValue,
            duration: 220,
            useNativeDriver: true,
        }).start(() => {
            setCurrentIdx(newIdx);
            scrollRef.current?.scrollTo({ y: 0, animated: false });
            translateX.setValue(-toValue);
            Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                tension: 80,
                friction: 12,
            }).start();
        });
    }, [allLessons.length, translateX]);

    // ── PanResponder for swipe gestures ───────────────────────────────────────
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gs) =>
                Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy * 1.5),
            onPanResponderMove: (_, gs) => {
                translateX.setValue(gs.dx);
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dx < -SWIPE_THRESHOLD) {
                    const next = currentIdxRef.current + 1;
                    if (next < allLessonsRef.current.length) {
                        navigateToRef.current(next, 'next');
                    } else {
                        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
                    }
                } else if (gs.dx > SWIPE_THRESHOLD) {
                    const prev = currentIdxRef.current - 1;
                    if (prev >= 0) {
                        navigateToRef.current(prev, 'prev');
                    } else {
                        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
                    }
                } else {
                    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            },
        })
    ).current;

    // Refs so panResponder closure always has fresh state
    const currentIdxRef  = useRef(currentIdx);
    const allLessonsRef  = useRef(allLessons);
    const navigateToRef  = useRef(navigateTo);

    useEffect(() => { currentIdxRef.current = currentIdx; },  [currentIdx]);
    useEffect(() => { allLessonsRef.current  = allLessons; },  [allLessons]);
    useEffect(() => { navigateToRef.current  = navigateTo; },  [navigateTo]);

    // ── Toggle bookmark — uses device_id ──────────────────────────────────────
    const toggleSave = async () => {
        if (saving || !lesson) return;
        setSaving(true);
        const device_id = getDeviceId();

        try {
            if (saved) {
                await supabase
                    .from('bookmarks')
                    .delete()
                    .eq('device_id', device_id)
                    .eq('content_id', lesson.id)
                    .eq('content_type', 'lesson');
                setSavedMap(m => ({ ...m, [lesson.id]: false }));
            } else {
                await supabase.from('bookmarks').insert({
                    device_id,
                    content_id: lesson.id,
                    content_type: 'lesson',
                });
                setSavedMap(m => ({ ...m, [lesson.id]: true }));
            }
        } catch (e) {
            console.log('Bookmark error:', e.message);
        }

        setSaving(false);
    };

    // ── Mark complete — uses device_id ────────────────────────────────────────
    const markComplete = async () => {
        if (completed || marking || !lesson) return;
        setMarking(true);
        setCompletedMap(m => ({ ...m, [lesson.id]: true }));

        const device_id = getDeviceId();

        try {
            await supabase.from('lesson_progress').upsert({
                device_id,
                lesson_id:    lesson.id,
                completed:    true,
                completed_at: new Date().toISOString(),
            });
        } catch (e) {
            console.log('Progress error:', e.message);
        }

        setMarking(false);

        const nextIdx = currentIdx + 1;
        if (nextIdx < allLessons.length) {
            setTimeout(() => navigateTo(nextIdx, 'next'), 600);
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const keyPoints = Array.isArray(lesson?.key_points)
        ? lesson.key_points
        : (() => { try { return JSON.parse(lesson?.key_points || '[]'); } catch { return []; } })();

    const footerPadding = insets.bottom + 16;

    // ── Render: loading ───────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[styles.root, styles.center]}>
                <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
                <ActivityIndicator color={GOLD} size="large" />
            </View>
        );
    }

    // ── Render: not found ─────────────────────────────────────────────────────
    if (!lesson) {
        return (
            <View style={[styles.root, styles.center]}>
                <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
                <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
                <Text style={styles.errorText}>Lesson not found</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
                    <Text style={styles.backLinkText}>Go back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Render: main ──────────────────────────────────────────────────────────
    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            {/* ── Header ── */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => router.back()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Ionicons name="arrow-back" size={22} color={TEXT} />
                </TouchableOpacity>

                <View style={styles.headerMeta}>
                    <Text style={styles.headerCategory}>LESSON</Text>
                </View>
            </View>

            {/* ── Swipeable content area ── */}
            <Animated.View
                style={[styles.swipeContainer, { transform: [{ translateX }] }]}
                {...panResponder.panHandlers}
            >
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={[styles.content, { paddingBottom: footerPadding + 80 }]}
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={16}
                >
                    {/* ── Title + meta ── */}
                    <View style={styles.titleBlock}>
                        <View style={styles.titleRow}>
                            <Text style={styles.title}>{lesson.title}</Text>
                            <TouchableOpacity
                                style={[styles.bookmarkBtn, saved && styles.bookmarkBtnActive]}
                                onPress={toggleSave}
                                disabled={saving}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                activeOpacity={0.7}
                            >
                                {saving ? (
                                    <ActivityIndicator color={GOLD} size="small" />
                                ) : (
                                    <Ionicons
                                        name={saved ? 'bookmark' : 'bookmark-outline'}
                                        size={22}
                                        color={saved ? GOLD : MUTED}
                                    />
                                )}
                            </TouchableOpacity>
                        </View>

                        {lesson.summary ? (
                            <Text style={styles.summary}>{lesson.summary}</Text>
                        ) : null}

                        <View style={styles.metaRow}>
                            <View style={styles.metaChip}>
                                <Ionicons name="time-outline" size={13} color={MUTED} />
                                <Text style={styles.metaText}>{lesson.duration} min</Text>
                            </View>
                            {allLessons.length > 1 && (
                                <View style={styles.metaChip}>
                                    <Ionicons name="layers-outline" size={13} color={MUTED} />
                                    <Text style={styles.metaText}>
                                        {currentIdx + 1} / {allLessons.length}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* ── Introduction / Content card ── */}
                    <View style={styles.card}>
                        <View style={styles.cardTitleRow}>
                            <View style={styles.cardAccent} />
                            <Text style={styles.cardTitle}>Lesson</Text>
                        </View>
                        <Text style={styles.bodyText}>{lesson.content}</Text>
                    </View>

                    {/* ── Key Points card ── */}
                    {keyPoints.length > 0 && (
                        <View style={styles.card}>
                            <View style={styles.cardTitleRow}>
                                <View style={styles.cardAccent} />
                                <Text style={styles.cardTitle}>Key Points</Text>
                            </View>
                            {keyPoints.map((pt, i) => (
                                <View key={i} style={styles.keyPoint}>
                                    <View style={styles.dot} />
                                    <Text style={styles.keyPointText}>{pt}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* ── Reflection card ── */}
                    {lesson.reflection ? (
                        <View style={[styles.card, styles.reflectionCard]}>
                            <View style={styles.cardTitleRow}>
                                <View style={[styles.cardAccent, { backgroundColor: GREEN }]} />
                                <Text style={styles.cardTitle}>Reflection</Text>
                            </View>
                            <View style={styles.reflectionBody}>
                                <Ionicons name="chatbubble-ellipses-outline" size={18} color={GREEN} style={{ marginTop: 2 }} />
                                <Text style={styles.reflectionText}>{lesson.reflection}</Text>
                            </View>
                        </View>
                    ) : null}
                </ScrollView>
            </Animated.View>

            {/* ── Fixed footer ── */}
            <View style={[styles.footer, { paddingBottom: footerPadding }]}>
                <TouchableOpacity
                    style={[
                        styles.completeBtn,
                        completed && styles.completeBtnDone,
                        marking   && styles.completeBtnMarking,
                    ]}
                    onPress={markComplete}
                    disabled={completed || marking}
                    activeOpacity={0.85}
                >
                    {marking ? (
                        <ActivityIndicator color={DARK} size="small" />
                    ) : (
                        <>
                            <Ionicons
                                name={completed ? 'checkmark-circle' : 'checkmark-circle-outline'}
                                size={20}
                                color={completed ? GREEN : DARK}
                            />
                            <Text style={[styles.completeBtnText, completed && styles.completeBtnTextDone]}>
                                {completed ? 'Completed' : 'Mark as Complete'}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: DARK },
    center: { justifyContent: 'center', alignItems: 'center', gap: 12 },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 12,
        gap: 10, backgroundColor: DARK,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },
    headerMeta:     { flex: 1 },
    headerCategory: { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 1.5 },

    bookmarkBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },
    bookmarkBtnActive: {
        borderColor: GOLD,
        backgroundColor: 'rgba(201,168,76,0.08)',
    },

    swipeContainer: { flex: 1 },

    content:    { paddingHorizontal: 16, paddingTop: 4 },
    titleBlock: { marginBottom: 16 },
    title: {
        fontSize: 24, fontWeight: '800',
        color: TEXT, lineHeight: 32, marginBottom: 6,
        flex: 1,
    },
    summary: {
        fontSize: 14, color: MUTED, lineHeight: 20,
        marginBottom: 10, fontStyle: 'italic',
    },
    metaRow:  { flexDirection: 'row', gap: 8 },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    },
    metaText: { fontSize: 12, color: MUTED, fontWeight: '500' },

    card: {
        backgroundColor: CARD, borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: BORDER, marginBottom: 14,
    },
    reflectionCard: {
        borderColor: 'rgba(76,175,80,0.2)',
        backgroundColor: 'rgba(76,175,80,0.04)',
    },
    cardTitleRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: 8, marginBottom: 12,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 6,
    },
    cardAccent: { width: 3, height: 18, backgroundColor: GOLD, borderRadius: 2 },
    cardTitle:  { fontSize: 15, fontWeight: '700', color: TEXT },
    bodyText:   { fontSize: 15, lineHeight: 26, color: '#C5BFAD' },

    keyPoint:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    dot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginTop: 8 },
    keyPointText: { flex: 1, fontSize: 14, color: MUTED, lineHeight: 22 },

    reflectionBody: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    reflectionText: {
        flex: 1, fontSize: 15, lineHeight: 24,
        color: '#A8D5B5', fontStyle: 'italic',
    },

    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingTop: 12,
        backgroundColor: DARK, borderTopWidth: 1, borderTopColor: BORDER,
    },

    completeBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: GOLD,
    },
    completeBtnDone: {
        backgroundColor: 'rgba(76,175,80,0.12)',
        borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)',
    },
    completeBtnMarking: { opacity: 0.7 },
    completeBtnText:    { fontSize: 16, fontWeight: '700', color: DARK },
    completeBtnTextDone:{ color: GREEN },

    errorText:    { color: MUTED, fontSize: 16 },
    backLink:     { marginTop: 8 },
    backLinkText: { color: GOLD, fontSize: 14, fontWeight: '600' },
});