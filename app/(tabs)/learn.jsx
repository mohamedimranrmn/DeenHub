import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, Image, ActivityIndicator, StatusBar, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import supabase from '../../src/services/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '../../src/utils/device';

const GOLD   = '#C9A84C';
const DARK   = '#0F1923';
const CARD   = '#1A2535';
const TEXT   = '#F0EAD6';
const MUTED  = '#8A8A99';
const BORDER = 'rgba(201,168,76,0.15)';
const GREEN  = '#4CAF50';

const TOPIC_CONFIG = {
    'Aqeedah':  { icon: require('../../assets/icons/aqeedah.png'),  color: '#C9A84C', bg: 'rgba(201,168,76,0.12)' },
    'Fiqh':     { icon: require('../../assets/icons/fiqh.png'),     color: '#64B5F6', bg: 'rgba(100,181,246,0.12)' },
    'Seerah':   { icon: require('../../assets/icons/seerah.png'),   color: '#80CBC4', bg: 'rgba(128,203,196,0.12)' },
    'Tazkiyah': { icon: require('../../assets/icons/tazkiyah.png'), color: '#A5D6A7', bg: 'rgba(165,214,167,0.12)' },
};
const DEFAULT_CONFIG = { icon: null, color: GOLD, bg: 'rgba(201,168,76,0.12)' };

function TopicIcon({ name, size = 22 }) {
    const cfg = TOPIC_CONFIG[name] ?? DEFAULT_CONFIG;
    return (
        <View style={[styles.iconBadge, { backgroundColor: cfg.bg }]}>
            {cfg.icon ? (
                <Image
                    source={cfg.icon}
                    style={{ width: size, height: size, tintColor: cfg.color }}
                    resizeMode="contain"
                />
            ) : (
                <Ionicons name="library" size={size} color={cfg.color} />
            )}
        </View>
    );
}

export default function LearnScreen() {
    const [topics,     setTopics]     = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();

    useFocusEffect(
        useCallback(() => {
            loadTopics();
        }, [])
    );

    let device_id;

    try {
        device_id = getDeviceId();
    } catch {
        console.warn("Device ID not ready");
        return;
    }

    const loadTopics = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const { data: topicsData, error: tErr } = await supabase
                .from('topics')
                .select('id, name, description')
                .order('order_index', { ascending: true });
            if (tErr) throw tErr;
            if (!topicsData?.length) { setTopics([]); return; }

            const { data: lessonsData, error: lErr } = await supabase
                .from('lessons')
                .select('id, topic_id, duration');
            if (lErr) throw lErr;

            const device_id = getDeviceId();

            let progressMap = {};
            if (lessonsData?.length) {
                const lessonIds = lessonsData.map(l => l.id);
                const { data: progressData } = await supabase
                    .from('lesson_progress')
                    .select('lesson_id, completed')
                    .eq('device_id', device_id)   // ← was .eq('user_id', userId)
                    .in('lesson_id', lessonIds);
                progressData?.forEach(p => { progressMap[p.lesson_id] = p.completed; });
            }

            const enriched = topicsData.map(topic => {
                const lessons        = lessonsData?.filter(l => l.topic_id === topic.id) || [];
                const totalLessons   = lessons.length;
                const totalMins      = lessons.reduce((s, l) => s + (l.duration || 0), 0);
                const completedCount = lessons.filter(l => progressMap[l.id] === true).length;
                const progress       = totalLessons === 0 ? 0 : completedCount / totalLessons;
                return { ...topic, totalLessons, totalMins, completedCount, progress };
            });

            setTopics(enriched);
        } catch (err) {
            console.error('loadTopics:', err.message);
            setError(err.message);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    };

    const renderItem = ({ item }) => {
        const pct  = Math.round(item.progress * 100);
        const hrs  = item.totalMins >= 60
            ? `${(item.totalMins / 60).toFixed(1)}h`
            : `${item.totalMins}m`;
        const allDone = pct === 100 && item.totalLessons > 0;

        return (
            <TouchableOpacity
                style={styles.card}
                activeOpacity={0.82}
                onPress={() => router.push(`/learn/${item.id}`)}
            >
                <View style={styles.cardHeader}>
                    <TopicIcon name={item.name} />
                    <View style={styles.cardTitles}>
                        <Text style={styles.cardName}>{item.name}</Text>
                        {item.description ? (
                            <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
                        ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={GOLD} />
                </View>

                <View style={styles.statsRow}>
                    <View style={styles.statChip}>
                        <Ionicons name="library-outline" size={11} color={MUTED} />
                        <Text style={styles.statText}>{item.totalLessons} lessons</Text>
                    </View>
                    <View style={styles.statChip}>
                        <Ionicons name="time-outline" size={11} color={MUTED} />
                        <Text style={styles.statText}>{hrs}</Text>
                    </View>
                    {item.completedCount > 0 && (
                        <View style={[styles.statChip, styles.statChipGold]}>
                            <Ionicons name="checkmark-circle" size={11} color={GOLD} />
                            <Text style={[styles.statText, { color: GOLD }]}>
                                {item.completedCount}/{item.totalLessons}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.barTrack}>
                    <View style={[
                        styles.barFill,
                        allDone && styles.barFillDone,
                        { width: `${pct}%` },
                    ]} />
                </View>
                <View style={styles.barLabels}>
                    <Text style={styles.pctText}>
                        {pct > 0 ? `${pct}% complete` : 'Not started'}
                    </Text>
                    {allDone && (
                        <View style={styles.completedBadge}>
                            <Ionicons name="trophy" size={12} color={GOLD} />
                            <Text style={styles.completedText}>Done</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <View>
                    <Text style={styles.title}>Learn</Text>
                    <Text style={styles.subtitle}>Islamic knowledge courses</Text>
                </View>
                <View style={styles.headerBadge}>
                    <Ionicons name="school" size={20} color={GOLD} />
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={styles.loadingText}>Loading topics…</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Ionicons name="warning" size={32} color="#E53935" />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadTopics}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : topics.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="book-outline" size={48} color={MUTED} />
                    <Text style={styles.emptyText}>No topics found</Text>
                    <Text style={styles.emptySubText}>Add topics in Supabase to get started.</Text>
                </View>
            ) : (
                <FlatList
                    data={topics}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => loadTopics(true)}
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
    root:   { flex: 1, backgroundColor: DARK },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'flex-end', paddingHorizontal: 20,
        paddingBottom: 14, backgroundColor: DARK,
    },
    title:    { fontSize: 30, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },
    headerBadge: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
        alignItems: 'center', justifyContent: 'center',
    },

    list: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },

    card: {
        backgroundColor: CARD, borderRadius: 18,
        padding: 16, borderWidth: 1, borderColor: BORDER,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    iconBadge:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardTitles: { flex: 1 },
    cardName:   { fontSize: 17, fontWeight: '700', color: TEXT },
    cardDesc:   { fontSize: 12, color: MUTED, marginTop: 2 },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    statChipGold: { borderColor: 'rgba(201,168,76,0.2)', backgroundColor: 'rgba(201,168,76,0.06)' },
    statText:     { fontSize: 11, color: MUTED, fontWeight: '500' },

    barTrack: {
        height: 5, backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 4, overflow: 'hidden', marginBottom: 6,
    },
    barFill:     { height: 5, backgroundColor: GOLD, borderRadius: 4 },
    barFillDone: { backgroundColor: GREEN },
    barLabels:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pctText:     { fontSize: 11, color: MUTED },
    completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    completedText:  { fontSize: 11, color: GOLD, fontWeight: '600' },

    loadingText:  { color: MUTED, fontSize: 13, marginTop: 8 },
    errorText:    { color: '#E53935', fontSize: 14, textAlign: 'center' },
    retryBtn:     { backgroundColor: GOLD, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 12, marginTop: 4 },
    retryText:    { color: DARK, fontWeight: '700', fontSize: 15 },
    emptyText:    { color: TEXT, fontSize: 17, fontWeight: '700' },
    emptySubText: { color: MUTED, fontSize: 13, textAlign: 'center' },
});