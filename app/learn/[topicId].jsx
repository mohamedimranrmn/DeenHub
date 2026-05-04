import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, StatusBar, ActivityIndicator,
    RefreshControl
} from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getDeviceId } from '@/src/utils/device';

const GOLD   = '#C9A84C';
const DARK   = '#0F1923';
const CARD   = '#1A2535';
const TEXT   = '#F0EAD6';
const MUTED  = '#8A8A99';
const BORDER = 'rgba(201,168,76,0.15)';
const GREEN  = '#4CAF50';

export default function LessonListScreen() {
    const { topicId } = useLocalSearchParams();
    const router      = useRouter();
    const insets      = useSafeAreaInsets();

    const [lessons,    setLessons]    = useState([]);
    const [topicName,  setTopicName]  = useState('');
    const [loading,    setLoading]    = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadLessons();
        }, [topicId])
    );

    const loadLessons = async (isRefresh = false) => {
        let device_id;

        try {
            // 🔒 Safe device ID access
            try {
                device_id = getDeviceId();
            } catch {
                console.warn('Device ID not ready yet');
                return;
            }

            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            // 📌 Get topic name
            const { data: topic, error: topicError } = await supabase
                .from('topics')
                .select('name')
                .eq('id', topicId)
                .single();

            if (topicError) throw topicError;
            setTopicName(topic?.name || 'Lessons');

            // 📌 Get lessons
            const { data: lessonsData, error: lessonsError } = await supabase
                .from('lessons')
                .select('id, title, summary, duration, order_index, topic_id')
                .eq('topic_id', topicId)
                .order('order_index', { ascending: true });

            if (lessonsError) throw lessonsError;

            let progressMap = {};

            if (lessonsData?.length) {
                const lessonIds = lessonsData.map(l => l.id);

                const { data: progressData, error: progressError } = await supabase
                    .from('lesson_progress')
                    .select('lesson_id, completed')
                    .eq('device_id', device_id)
                    .in('lesson_id', lessonIds);

                if (progressError) throw progressError;

                progressData?.forEach(p => {
                    progressMap[p.lesson_id] = p.completed;
                });
            }

            // 🔄 Merge lessons + progress
            const enriched = (lessonsData || []).map(lesson => ({
                ...lesson,
                completed: progressMap[lesson.id] === true,
                locked: false,
            }));

            setLessons(enriched);

        } catch (err) {
            console.error('Load lessons error:', err);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    };

    const completedCount = lessons.filter(l => l.completed).length;
    const totalCount     = lessons.length;
    const progress       = totalCount ? completedCount / totalCount : 0;
    const pct            = Math.round(progress * 100);
    const allDone        = totalCount > 0 && completedCount === totalCount;

    const renderItem = ({ item, index }) => (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.82}
            onPress={() => router.push(`/learn/lesson/${item.id}`)}
        >
            <View style={[styles.numBadge, item.completed && styles.numBadgeDone]}>
                {item.completed
                    ? <Ionicons name="checkmark" size={16} color={DARK} />
                    : <Text style={styles.numText}>{index + 1}</Text>
                }
            </View>

            <View style={styles.cardContent}>
                <Text style={styles.lessonTitle} numberOfLines={2}>
                    {item.title}
                </Text>

                {item.summary ? (
                    <Text style={styles.lessonSummary} numberOfLines={1}>
                        {item.summary}
                    </Text>
                ) : null}

                <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={12} color={MUTED} />
                    <Text style={styles.metaText}>{item.duration} min</Text>
                    <View style={styles.metaDivider} />
                    <View style={[styles.statusPill, item.completed && styles.statusPillDone]}>
                        <Text style={[styles.statusText, item.completed && styles.statusTextDone]}>
                            {item.completed ? 'Completed' : 'Not started'}
                        </Text>
                    </View>
                </View>
            </View>

            <Ionicons
                name="chevron-forward"
                size={18}
                color={item.completed ? GREEN : MUTED}
            />
        </TouchableOpacity>
    );

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={22} color={TEXT} />
                </TouchableOpacity>

                <View style={styles.headerText}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{topicName}</Text>
                    <Text style={styles.headerSub}>
                        {loading ? 'Loading…' : `${completedCount} of ${totalCount} completed`}
                    </Text>
                </View>

                {allDone && (
                    <View style={styles.allDoneBadge}>
                        <Ionicons name="trophy" size={14} color={GOLD} />
                        <Text style={styles.allDoneText}>Done</Text>
                    </View>
                )}
            </View>

            {!loading && totalCount > 0 && (
                <View style={styles.progressSection}>
                    <View style={styles.progressTrack}>
                        <View style={[
                            styles.progressFill,
                            allDone && styles.progressFillDone,
                            { width: `${pct}%` },
                        ]} />
                    </View>
                    <View style={styles.progressLabels}>
                        <Text style={styles.progressPct}>
                            {pct > 0 ? `${pct}% complete` : 'Not started yet'}
                        </Text>
                        <Text style={styles.progressFraction}>
                            {completedCount}/{totalCount} lessons
                        </Text>
                    </View>
                </View>
            )}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={GOLD} size="large" />
                </View>
            ) : lessons.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="book-outline" size={48} color={MUTED} style={{ opacity: 0.4 }} />
                    <Text style={styles.emptyTitle}>No lessons yet</Text>
                    <Text style={styles.emptyDesc}>Check back soon</Text>
                </View>
            ) : (
                <FlatList
                    data={lessons}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => loadLessons(true)}
                            tintColor={GOLD}
                            colors={[GOLD]}
                            progressBackgroundColor={CARD}
                        />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: DARK },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 10,
        gap: 12, backgroundColor: DARK,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: TEXT },
    headerSub: { fontSize: 12, color: MUTED, marginTop: 2 },

    allDoneBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(201,168,76,0.1)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 8, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    },
    allDoneText: { fontSize: 12, color: GOLD, fontWeight: '700' },

    progressSection: { paddingHorizontal: 16, marginBottom: 14, gap: 6 },
    progressTrack: {
        height: 6, backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 4, overflow: 'hidden',
    },
    progressFill: { height: 6, backgroundColor: GOLD, borderRadius: 4 },
    progressFillDone: { backgroundColor: GREEN },

    progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    progressPct: { fontSize: 12, color: GOLD, fontWeight: '600' },
    progressFraction: { fontSize: 12, color: MUTED },

    list: { paddingHorizontal: 16, paddingTop: 2, gap: 10 },

    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: CARD, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: BORDER, gap: 12,
    },

    numBadge: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: 'rgba(201,168,76,0.1)',
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    numBadgeDone: { backgroundColor: GREEN, borderColor: GREEN },
    numText: { fontSize: 14, fontWeight: '700', color: GOLD },

    cardContent: { flex: 1, gap: 3 },
    lessonTitle: { fontSize: 15, fontWeight: '600', color: TEXT },
    lessonSummary: { fontSize: 12, color: MUTED },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 12, color: MUTED },

    statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    statusPillDone: { backgroundColor: 'rgba(76,175,80,0.1)' },
    statusText: { fontSize: 11, color: MUTED },
    statusTextDone: { color: GREEN },

    emptyTitle: { fontSize: 16, color: TEXT },
    emptyDesc: { fontSize: 13, color: MUTED },
});

