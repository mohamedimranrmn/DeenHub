import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, ScrollView, StatusBar,
    Switch, Linking, Share, Platform, Modal,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '../../src/utils/device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,
    getNotificationPermission,
    requestNotificationPermission,
    scheduleQuranReminder,
    scheduleHadithReminder,
    scheduleLessonReminder,
    scheduleDuaReminder,
} from '../../src/utils/notifications';
import { refreshPrayerNotifications } from '../../src/utils/prayerTimes';
import { getReciters } from '../../src/services/quranApi';
import AudioStore from '../../src/services/audioStore';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
    bg:           '#080E17',
    surface:      '#0D1824',
    surfaceAlt:   '#111F2E',
    border:       'rgba(255,255,255,0.06)',
    borderGold:   'rgba(201,168,76,0.20)',
    borderRed:    'rgba(229,57,53,0.28)',
    gold:         '#C9A84C',
    goldDim:      'rgba(201,168,76,0.12)',
    goldMid:      'rgba(201,168,76,0.22)',
    goldText:     '#E8C96A',
    green:        '#48BB78',
    greenDim:     'rgba(72,187,120,0.10)',
    red:          '#E53935',
    redDim:       'rgba(229,57,53,0.07)',
    orange:       '#FFA040',
    orangeDim:    'rgba(255,160,64,0.08)',
    orangeBorder: 'rgba(255,160,64,0.25)',
    text:         '#EEE8D5',
    textDim:      '#B8A98A',
    muted:        '#4A6070',
    mutedMid:     '#6B8090',
    blue:         '#7EB8D4',
    purple:       '#B39DDB',
};

const CALC_METHODS = [
    { id: '3',  label: 'Muslim World League',     short: 'MWL'     },
    { id: '2',  label: 'Islamic Society of NA',   short: 'ISNA'    },
    { id: '5',  label: 'Egyptian Gen. Authority', short: 'Egypt'   },
    { id: '4',  label: 'Umm Al-Qura, Makkah',    short: 'Makkah'  },
    { id: '1',  label: 'University of Karachi',   short: 'Karachi' },
    { id: '13', label: 'Gulf Region',             short: 'Gulf'    },
];

const MADHABS = [
    { id: 'Shafi',  label: "Shafi'i", sub: 'Earlier Asr' },
    { id: 'Hanafi', label: 'Hanafi',  sub: 'Later Asr'   },
];

const NOTIF_OFFSETS = [
    { value: 0,  label: 'At prayer time' },
    { value: 5,  label: '5 min before'   },
    { value: 10, label: '10 min before'  },
    { value: 15, label: '15 min before'  },
];

const DEFAULT_SETTINGS = {
    reminder_enabled:    true,
    notification_offset: 0,
    calculation_method:  '3',
    madhab:              'Shafi',

    // Daily content reminders — fixed default times for v1. Each is
    // independently toggleable; times aren't user-configurable yet.
    quran_reminder_enabled:  false,
    hadith_reminder_enabled: false,
    lesson_reminder_enabled: false,
    dua_reminder_enabled:    false,
};

// Quran Foundation chapter-reciter default.
// QF chapter-reciter ID 7 is Mishary Rashid Alafasy (Murattal).
const DEFAULT_RECITER_ID = 7;

// Fixed schedule for the v1 daily content reminders (see notifications.js
// scheduleQuranReminder/scheduleHadithReminder/scheduleLessonReminder/scheduleDuaReminder).
const DAILY_REMINDERS = [
    {
        key:      'quran_reminder_enabled',
        type:     NOTIFICATION_TYPES.QURAN,
        schedule: scheduleQuranReminder,
        icon:     'reader-outline',
        color:    C.purple,
        label:    'Quran',
        hour: 20, minute: 0, timeLabel: '8:00 PM',
    },
    {
        key:      'hadith_reminder_enabled',
        type:     NOTIFICATION_TYPES.HADITH,
        schedule: scheduleHadithReminder,
        icon:     'book-outline',
        color:    C.gold,
        label:    'Hadith',
        hour: 9, minute: 0, timeLabel: '9:00 AM',
    },
    {
        key:      'lesson_reminder_enabled',
        type:     NOTIFICATION_TYPES.LESSON,
        schedule: scheduleLessonReminder,
        icon:     'school-outline',
        color:    C.green,
        label:    'Lesson',
        hour: 19, minute: 0, timeLabel: '7:00 PM',
    },
    {
        key:      'dua_reminder_enabled',
        type:     NOTIFICATION_TYPES.DUA,
        schedule: scheduleDuaReminder,
        icon:     'hand-right-outline',
        color:    C.blue,
        label:    'Dua',
        hour: 6, minute: 30, timeLabel: '6:30 AM',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEMP — dev-only test notifications. Fires each notification type on demand
// with the same title/body/data shape as the real scheduled ones, so tapping
// a test notification also exercises deep-link routing. Remove this block
// (and the "TEST NOTIFICATIONS" section below) before shipping.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_NOTIFICATIONS = [
    {
        key: 'prayer', label: 'Prayer (Fajr)', icon: 'moon-outline', color: C.gold,
        title: '🌅 Fajr · الفَجْر',
        body: "It is time for Fajr. 2 rak'at.",
        channel: NOTIFICATION_CHANNELS.PRAYER,
        data: { type: NOTIFICATION_TYPES.PRAYER, prayer: 'fajr', route: '/prayer-tracker' },
    },
    {
        key: 'quran', label: 'Quran', icon: 'reader-outline', color: C.purple,
        title: '📖 Daily Quran',
        body: 'Take a few moments today to listen to the Quran.',
        channel: NOTIFICATION_CHANNELS.QURAN,
        data: { type: NOTIFICATION_TYPES.QURAN, route: '/quran' },
    },
    {
        key: 'hadith', label: 'Hadith', icon: 'book-outline', color: C.gold,
        title: '📜 Daily Hadith',
        body: 'Take a moment to read today’s Hadith.',
        channel: NOTIFICATION_CHANNELS.HADITH,
        data: { type: NOTIFICATION_TYPES.HADITH, route: '/(tabs)/hadith' },
    },
    {
        key: 'lesson', label: 'Lesson', icon: 'school-outline', color: C.green,
        title: '🎓 Daily Lesson',
        body: 'Continue learning about your deen today.',
        channel: NOTIFICATION_CHANNELS.LESSON,
        data: { type: NOTIFICATION_TYPES.LESSON, route: '/(tabs)/learn' },
    },
    {
        key: 'dua', label: 'Dua', icon: 'hand-right-outline', color: C.blue,
        title: '🤲 Daily Dua',
        body: 'Take a moment to remember Allah with today’s dua.',
        channel: NOTIFICATION_CHANNELS.DUA,
        data: { type: NOTIFICATION_TYPES.DUA, route: '/explore' },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ label, color }) {
    return (
        <View style={st.sectionHeader}>
            <View style={[st.sectionDot, color && { backgroundColor: color }]} />
            <Text style={[st.sectionTitle, color && { color }]}>{label}</Text>
        </View>
    );
}

function Sep() { return <View style={st.sep} />; }

function Card({ children, style }) {
    return <View style={[st.card, style]}>{children}</View>;
}

function Row({ icon, iconColor, iconBg, label, sub, badge, danger, onPress, rightEl, showChevron = true }) {
    const ic = danger ? C.red : (iconColor ?? C.gold);
    const bg = danger ? 'rgba(229,57,53,0.09)' : (iconBg ?? C.goldDim);
    return (
        <TouchableOpacity
            style={st.row}
            onPress={onPress}
            activeOpacity={onPress ? 0.72 : 1}
            disabled={!onPress && !rightEl}
        >
            <View style={[st.rowIcon, { backgroundColor: bg }]}>
                <Ionicons name={icon} size={17} color={ic} />
            </View>
            <View style={st.rowBody}>
                <Text style={[st.rowLabel, danger && { color: C.red }]}>{label}</Text>
                {sub ? <Text style={st.rowSub}>{sub}</Text> : null}
            </View>
            {rightEl ?? (
                <View style={st.rowRight}>
                    {badge !== undefined && (
                        <View style={st.badge}><Text style={st.badgeText}>{badge}</Text></View>
                    )}
                    {showChevron && (
                        <Ionicons name="chevron-forward" size={14}
                                  color={danger ? C.red : C.muted} style={{ opacity: 0.55 }} />
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}

function Chip({ label, sub, active, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.75}
                          style={[st.chip, active && st.chipActive]}>
            <Text style={[st.chipLabel, active && st.chipLabelActive]}>{label}</Text>
            {sub ? <Text style={[st.chipSub, active && st.chipSubActive]}>{sub}</Text> : null}
        </TouchableOpacity>
    );
}

function BookmarkGroup({ icon, label, count, color, onPress }) {
    const has = count > 0;
    return (
        <TouchableOpacity style={[st.bkRow, !has && { opacity: 0.45 }]}
                          onPress={has ? onPress : undefined} activeOpacity={0.75}>
            <View style={[st.bkIcon, { backgroundColor: `${color}18` }]}>
                <Ionicons name={icon} size={19} color={color} />
            </View>
            <View style={st.bkBody}>
                <Text style={st.bkLabel}>{label}</Text>
                <Text style={[st.bkSub, { color: has ? color : C.muted }]}>
                    {has ? `${count} saved` : 'Nothing saved yet'}
                </Text>
            </View>
            {has && (
                <>
                    <View style={[st.bkBadge, { backgroundColor: `${color}18`, borderColor: `${color}38` }]}>
                        <Text style={[st.bkBadgeNum, { color }]}>{count}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={13} color={C.muted} style={{ opacity: 0.45, marginLeft: 4 }} />
                </>
            )}
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quran reciter selector
// ─────────────────────────────────────────────────────────────────────────────
function ReciterModal({ visible, reciters, selected, loading, onSelect, onClose }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={reciterModal.overlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                <View style={reciterModal.sheet}>
                    <View style={reciterModal.handle} />

                    <View style={reciterModal.header}>
                        <View>
                            <Text style={reciterModal.title}>Default Reciter</Text>
                            <Text style={reciterModal.subtitle}>
                                Used whenever Quran audio starts
                            </Text>
                        </View>
                        <TouchableOpacity style={reciterModal.close} onPress={onClose}>
                            <Ionicons name="close" size={20} color={C.textDim} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={reciterModal.center}>
                            <ActivityIndicator color={C.gold} size="small" />
                            <Text style={reciterModal.loadingText}>Loading reciters…</Text>
                        </View>
                    ) : reciters.length === 0 ? (
                        <View style={reciterModal.center}>
                            <Ionicons name="cloud-offline-outline" size={25} color={C.mutedMid} />
                            <Text style={reciterModal.emptyTitle}>Unable to load reciters</Text>
                            <Text style={reciterModal.emptyText}>
                                Check your connection and try again.
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 12 }}
                        >
                            {reciters.map((r, i) => {
                                const isSelected =
                                    Number(selected?.id) === Number(r?.id);

                                const styleName =
                                    r?.style?.name ??
                                    r?.style?.translated_name?.name ??
                                    (typeof r?.style === 'string' ? r.style : null);

                                const qiratName =
                                    r?.qirat?.name ??
                                    (typeof r?.qirat === 'string' ? r.qirat : null);

                                return (
                                    <TouchableOpacity
                                        key={r?.id ?? i}
                                        style={[
                                            reciterModal.row,
                                            isSelected && reciterModal.rowActive,
                                        ]}
                                        onPress={() => onSelect(r)}
                                        activeOpacity={0.75}
                                    >
                                        <View
                                            style={[
                                                reciterModal.iconWrap,
                                                isSelected && reciterModal.iconWrapActive,
                                            ]}
                                        >
                                            <Ionicons
                                                name={isSelected ? 'mic' : 'mic-outline'}
                                                size={17}
                                                color={isSelected ? C.bg : C.gold}
                                            />
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={[
                                                    reciterModal.rowName,
                                                    isSelected && reciterModal.rowNameActive,
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {r?.name ??
                                                    r?.translated_name?.name ??
                                                    `Reciter ${r?.id}`}
                                            </Text>

                                            {(styleName || qiratName) ? (
                                                <Text
                                                    style={[
                                                        reciterModal.rowMeta,
                                                        isSelected && reciterModal.rowMetaActive,
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {[styleName, qiratName]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {isSelected && (
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={21}
                                                color={C.bg}
                                            />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
    const insets = useSafeAreaInsets();

    const [dataLoading,      setDataLoading]      = useState(true);
    const [resetting,        setResetting]        = useState(false);
    const [saving,           setSaving]           = useState(false);
    const [savedPulse,       setSavedPulse]       = useState(false);
    const [notifPermGranted, setNotifPermGranted] = useState(true);

    const [defaultReciter, setDefaultReciter] = useState(null);
    const [reciters, setReciters] = useState([]);
    const [recitersLoading, setRecitersLoading] = useState(false);
    const [showReciterModal, setShowReciterModal] = useState(false);

    const [savedQuran,   setSavedQuran]   = useState(0);
    const [savedHadiths, setSavedHadiths] = useState(0);
    const [savedDuas,    setSavedDuas]    = useState(0);
    const [savedLessons, setSavedLessons] = useState(0);
    const [doneLessons,  setDoneLessons]  = useState(0);

    // Settings now save immediately on selection — no draft/commit step.
    const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
    const pulseTimer = useRef(null);

    useFocusEffect(useCallback(() => {
        loadAll();
        loadDefaultReciter();
        checkNotifPerm();
    }, []));

    const checkNotifPerm = async () => {
        const granted = await getNotificationPermission();
        setNotifPermGranted(granted);
    };

    const loadDefaultReciter = async () => {
        try {
            const saved = await AsyncStorage.getItem('selected_reciter');

            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.id) {
                    setDefaultReciter(parsed);
                    return;
                }
            }

            // First install: use the known QF default (Mishary Alafasy)
            // and persist the full chapter-reciter object once the API list loads.
            setDefaultReciter({
                id: DEFAULT_RECITER_ID,
                name: 'Mishary Rashid Alafasy',
                style: null,
                language: null,
                qirat: null,
                source: 'quran-foundation',
            });
        } catch (e) {
            console.warn('[Settings] Default reciter load:', e?.message);
        }
    };

    const fetchReciters = async () => {
        setRecitersLoading(true);

        try {
            const json = await getReciters();

            const list =
                json?.reciters ??
                json?.data?.reciters ??
                (Array.isArray(json?.data) ? json.data : []);

            const clean = Array.isArray(list) ? list : [];
            setReciters(clean);

            // If there is no saved selection, resolve the default from the
            // actual QF response instead of relying on a hand-built object.
            const saved = await AsyncStorage.getItem('selected_reciter');

            if (!saved && clean.length > 0) {
                const preferred =
                    clean.find(r => Number(r?.id) === DEFAULT_RECITER_ID) ??
                    clean[0];

                if (preferred?.id) {
                    const normalized = {
                        id: Number(preferred.id),
                        name:
                            preferred.name ??
                            preferred.translated_name?.name ??
                            `Reciter ${preferred.id}`,
                        style: preferred.style ?? null,
                        language: preferred.language ?? null,
                        qirat: preferred.qirat ?? null,
                        source: 'quran-foundation',
                    };

                    await AsyncStorage.setItem(
                        'selected_reciter',
                        JSON.stringify(normalized)
                    );

                    setDefaultReciter(normalized);
                }
            }
        } catch (e) {
            console.error('[Settings] Failed to load reciters:', e);
        } finally {
            setRecitersLoading(false);
        }
    };

    const openReciterModal = async () => {
        setShowReciterModal(true);

        if (reciters.length === 0) {
            await fetchReciters();
        }
    };

    const selectDefaultReciter = async (r) => {
        if (!r?.id) return;

        const normalized = {
            id: Number(r.id),
            name:
                r.name ??
                r.translated_name?.name ??
                `Reciter ${r.id}`,
            style: r.style ?? null,
            language: r.language ?? null,
            qirat: r.qirat ?? null,
            source: 'quran-foundation',
        };

        const previous = defaultReciter;
        setDefaultReciter(normalized);

        try {
            await AsyncStorage.setItem(
                'selected_reciter',
                JSON.stringify(normalized)
            );

            // If audio is already active, switch the source immediately
            // while preserving the current Surah/Ayah/play state.
            if (AudioStore.getState().surahId) {
                await AudioStore.changeReciter(normalized);
            }

            setShowReciterModal(false);
            setSavedPulse(true);
            clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(
                () => setSavedPulse(false),
                1800
            );
        } catch (e) {
            console.error('[Settings] Default reciter save:', e);

            try {
                if (previous) {
                    await AsyncStorage.setItem(
                        'selected_reciter',
                        JSON.stringify(previous)
                    );
                }
            } catch (_) {}

            setDefaultReciter(previous);
            Alert.alert(
                'Error',
                e?.message || 'Failed to save default reciter'
            );
        }
    };

    const loadAll = async () => {
        setDataLoading(true);
        let device_id;
        try { device_id = await getDeviceId(); }
        catch { setDataLoading(false); return; }
        try {
            const [
                { count: qc }, { count: hc }, { count: duac }, { count: lc },
                { count: dc }, { data: sd },
            ] = await Promise.all([
                supabase.from('quran_bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id),
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'hadith'),
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'dua'),
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'lesson'),
                supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('completed', true),
                supabase.from('user_settings').select('*').eq('device_id', device_id).maybeSingle(),
            ]);
            setSavedQuran(qc     ?? 0);
            setSavedHadiths(hc   ?? 0);
            setSavedDuas(duac    ?? 0);
            setSavedLessons(lc   ?? 0);
            setDoneLessons(dc    ?? 0);
            if (sd) {
                setSettings({
                    reminder_enabled:    sd.reminder_enabled    ?? DEFAULT_SETTINGS.reminder_enabled,
                    notification_offset: sd.notification_offset ?? DEFAULT_SETTINGS.notification_offset,
                    calculation_method:  sd.calculation_method  ?? DEFAULT_SETTINGS.calculation_method,
                    madhab:              sd.madhab              ?? DEFAULT_SETTINGS.madhab,

                    quran_reminder_enabled:  sd.quran_reminder_enabled  ?? DEFAULT_SETTINGS.quran_reminder_enabled,
                    hadith_reminder_enabled: sd.hadith_reminder_enabled ?? DEFAULT_SETTINGS.hadith_reminder_enabled,
                    lesson_reminder_enabled: sd.lesson_reminder_enabled ?? DEFAULT_SETTINGS.lesson_reminder_enabled,
                    dua_reminder_enabled:    sd.dua_reminder_enabled    ?? DEFAULT_SETTINGS.dua_reminder_enabled,
                });
            }
        } catch (err) { console.warn('Settings load:', err.message); }
        finally { setDataLoading(false); }
    };

    // Saves a single changed preference immediately — no separate "Save" step.
    const patch = async (key, val) => {
        const previous = settings;
        const updated  = { ...settings, [key]: val };
        setSettings(updated);

        const daily = DAILY_REMINDERS.find(d => d.key === key);
        const needsPermission = val && (key === 'reminder_enabled' || daily);

        if (needsPermission && !notifPermGranted) {
            const granted = await requestNotificationPermission();
            if (!granted) {
                Alert.alert('Permission Required', 'Enable notifications in your device Settings.');
                setSettings(previous);
                return;
            }
            setNotifPermGranted(true);
        }

        setSaving(true);
        try {
            const device_id = await getDeviceId();
            const { error } = await supabase
                .from('user_settings')
                .upsert({ device_id, ...updated }, { onConflict: 'device_id' })
                .select().single();
            if (error) throw error;

            if (['reminder_enabled', 'notification_offset', 'calculation_method', 'madhab'].includes(key)) {
                // Reschedules from current location + prayer times when
                // reminder_enabled is true; cancels outright when false.
                // This is what actually turns reminders on — the old code
                // only ever cancelled them here and relied on a cross-screen
                // refresh signal that never reached prayer-tracker.jsx.
                await refreshPrayerNotifications(updated);
            }

            if (daily) {
                // schedule(hour, minute, enabled) — cancels + reschedules on
                // ON, just cancels on OFF. Doesn't block save on failure.
                await daily.schedule(daily.hour, daily.minute, val);
            }

            setSavedPulse(true);
            clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(() => setSavedPulse(false), 1800);
            router.setParams({ settingsRefresh: String(Date.now()) });
        } catch (err) {
            setSettings(previous); // revert on failure
            Alert.alert('Error', err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        Alert.alert(
            'Clear All Data',
            'This permanently deletes all bookmarks, lesson progress, and prayer logs. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Everything', style: 'destructive',
                    onPress: async () => {
                        let device_id;
                        try { device_id = await getDeviceId(); }
                        catch { Alert.alert('Error', 'Device ID unavailable'); return; }
                        setResetting(true);
                        try {
                            await Promise.all([
                                supabase.from('bookmarks').delete().eq('device_id', device_id),
                                supabase.from('quran_bookmarks').delete().eq('device_id', device_id),
                                supabase.from('lesson_progress').delete().eq('device_id', device_id),
                                supabase.from('prayer_logs').delete().eq('device_id', device_id),
                            ]);
                            Alert.alert('Cleared', 'All your data has been removed.');
                            loadAll();
                        } catch (err) {
                            Alert.alert('Error', err.message || 'Failed to clear data');
                        } finally { setResetting(false); }
                    },
                },
            ]
        );
    };

    // TEMP — dev-only. Fires one notification of the given test type ~1s
    // from now (immediate triggers are unreliable on some Android builds).
    const fireTestNotification = async (item) => {
        try {
            const granted = await requestNotificationPermission();
            if (!granted) {
                Alert.alert('Permission Required', 'Enable notifications in your device Settings.');
                return;
            }
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: item.title,
                    body: item.body,
                    sound: 'default',
                    ...(Platform.OS === 'android' ? { channelId: item.channel } : {}),
                    data: item.data,
                },
                trigger: { type: 'timeInterval', seconds: 1, repeats: false },
            });
        } catch (e) {
            console.error('[Test Notification]', e);
            Alert.alert('Error', e.message || 'Failed to send test notification');
        }
    };

    const handleShare = async () => {
        try {
            await Share.share({ message: 'I\'ve been using this app for daily Islamic guidance — check it out!' +
                    '\n Download here: https://drive.google.com/drive/folders/1BqxHInvsO23pBbqMaaqINaKGvjEnT-iq?usp=sharing' });
        } catch { /* dismissed */ }
    };

    const totalSaved = savedQuran + savedHadiths + savedDuas + savedLessons;
    const completionPct = savedLessons > 0
        ? Math.min(Math.round((doneLessons / savedLessons) * 100), 100)
        : 0;

    return (
        <View style={st.root}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[st.scroll, {
                    paddingTop: insets.top + 20,
                    paddingBottom: insets.bottom + 64,
                }]}
            >
                {/* ══ HEADER ══ */}
                <View style={st.pageHeader}>
                    <Text style={st.pageArabic}>الإعدادات</Text>
                    <Text style={st.pageTitle}>Settings</Text>
                </View>

                {/* ══ SNAPSHOT ══ */}
                <Card style={st.snapshotCard}>
                    <View style={st.snapshotRow}>
                        {[
                            { num: totalSaved,   lbl: 'Total\nSaved',    col: C.text  },
                            { num: doneLessons,  lbl: 'Lessons\nDone',   col: C.green },
                            { num: savedLessons, lbl: 'Lessons\nSaved',  col: C.gold  },
                        ].map((item, i) => (
                            <View key={i} style={[st.snapshotCell, i > 0 && st.snapshotCellBorder]}>
                                <Text style={[st.snapshotNum, { color: item.col }]}>{item.num}</Text>
                                <Text style={st.snapshotLbl}>{item.lbl}</Text>
                            </View>
                        ))}
                    </View>
                    {savedLessons > 0 && (
                        <View style={st.progressWrap}>
                            <View style={st.progressTrack}>
                                <View style={[st.progressFill, { width: `${completionPct}%` }]} />
                            </View>
                            <Text style={st.progressLbl}>{completionPct}% of saved lessons completed</Text>
                        </View>
                    )}
                </Card>

                {/* ══ SAVED LIBRARY ══ */}
                <SectionLabel label="SAVED LIBRARY" />
                <Card style={st.mb28}>
                    <BookmarkGroup
                        icon="reader-outline"  label="Quran"
                        count={savedQuran}     color={C.purple}
                        onPress={() => router.push('/quran/saved')}
                    />
                    <Sep />
                    <BookmarkGroup
                        icon="book-outline"    label="Hadiths"
                        count={savedHadiths}   color={C.gold}
                        onPress={() => router.push('/hadith/saved-hadiths')}
                    />
                    <Sep />
                    <BookmarkGroup
                        icon="hand-right-outline" label="Duas"
                        count={savedDuas}          color={C.blue}
                        onPress={() => router.push('/explore/dua/saved-duas')}
                    />
                    <Sep />
                    <BookmarkGroup
                        icon="school-outline"  label="Lessons"
                        count={savedLessons}   color={C.green}
                        onPress={() => router.push('/learn/lesson/bookmarked-lessons')}
                    />
                </Card>

                {/* ══ PRAYER REMINDERS ══ */}
                <SectionLabel label="PRAYER REMINDERS" />

                {!notifPermGranted && (
                    <TouchableOpacity style={st.warnBanner} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
                        <Ionicons name="notifications-off-outline" size={14} color={C.orange} />
                        <Text style={st.warnText}>Notifications disabled — tap to open Settings</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.orange} style={{ opacity: 0.55 }} />
                    </TouchableOpacity>
                )}

                <Card style={st.mb28}>
                    <Row
                        icon={settings.reminder_enabled ? 'notifications' : 'notifications-off-outline'}
                        iconColor={settings.reminder_enabled ? C.gold : C.muted}
                        iconBg={settings.reminder_enabled ? C.goldDim : 'rgba(255,255,255,0.04)'}
                        label="Prayer Reminders"
                        sub={settings.reminder_enabled ? 'Active for all 5 prayers' : 'All notifications off'}
                        showChevron={false}
                        rightEl={
                            <Switch
                                value={settings.reminder_enabled}
                                onValueChange={v => patch('reminder_enabled', v)}
                                trackColor={{ false: 'rgba(255,255,255,0.08)', true: C.goldMid }}
                                thumbColor={settings.reminder_enabled ? C.gold : C.mutedMid}
                                ios_backgroundColor="rgba(255,255,255,0.08)"
                            />
                        }
                    />
                    <Row
                        icon="flash-outline"
                        label="Send test notification (5s)"
                        onPress={async () => {
                            try {
                                await Notifications.scheduleNotificationAsync({
                                    content: {
                                        title: 'Test',
                                        body: 'If you see this, local notifications work.',
                                        sound: 'default',
                                    },
                                    trigger: {
                                        type: 'timeInterval',
                                        seconds: 5,
                                        repeats: false,
                                    },
                                });
                            } catch (e) {
                                console.error('[Test Notification]', e);
                            }
                        }}
                    />
                    {settings.reminder_enabled && (
                        <>
                            <Sep />
                            <View style={st.offsetWrap}>
                                <Text style={st.offsetTitle}>NOTIFY ME</Text>
                                <View style={st.chipGrid}>
                                    {NOTIF_OFFSETS.map(o => (
                                        <Chip key={o.value} label={o.label}
                                              active={settings.notification_offset === o.value}
                                              onPress={() => patch('notification_offset', o.value)} />
                                    ))}
                                </View>
                            </View>
                        </>
                    )}
                </Card>

                {/* ══ TEMP: TEST NOTIFICATIONS — remove before release ══ */}
                <SectionLabel label="TEST NOTIFICATIONS (DEV)" color={C.orange} />
                <Card style={st.mb28}>
                    {TEST_NOTIFICATIONS.map((item, i) => (
                        <View key={item.key}>
                            {i > 0 && <Sep />}
                            <Row
                                icon={item.icon}
                                iconColor={item.color}
                                iconBg={`${item.color}22`}
                                label={`Test: ${item.label}`}
                                sub="Fires in ~1s, same content as the real one"
                                showChevron={false}
                                onPress={() => fireTestNotification(item)}
                                rightEl={
                                    <Ionicons name="flash-outline" size={16} color={item.color} style={{ opacity: 0.75 }} />
                                }
                            />
                        </View>
                    ))}
                </Card>

                {/* ══ DAILY ISLAMIC REMINDERS ══ */}
                <SectionLabel label="DAILY ISLAMIC REMINDERS" />
                <Card style={st.mb28}>
                    {DAILY_REMINDERS.map((d, i) => (
                        <View key={d.key}>
                            {i > 0 && <Sep />}
                            <Row
                                icon={d.icon}
                                iconColor={settings[d.key] ? d.color : C.muted}
                                iconBg={settings[d.key] ? `${d.color}26` : 'rgba(255,255,255,0.04)'}
                                label={d.label}
                                sub={settings[d.key] ? `Every day · ${d.timeLabel}` : 'Off'}
                                showChevron={false}
                                rightEl={
                                    <Switch
                                        value={settings[d.key]}
                                        onValueChange={v => patch(d.key, v)}
                                        trackColor={{ false: 'rgba(255,255,255,0.08)', true: `${d.color}55` }}
                                        thumbColor={settings[d.key] ? d.color : C.mutedMid}
                                        ios_backgroundColor="rgba(255,255,255,0.08)"
                                    />
                                }
                            />
                        </View>
                    ))}
                </Card>

                {/* ══ QURAN AUDIO ══ */}
                <SectionLabel label="QURAN AUDIO" />
                <Card style={st.mb28}>
                    <Row
                        icon="mic-outline"
                        iconColor={C.gold}
                        iconBg={C.goldDim}
                        label="Default Reciter"
                        sub={
                            defaultReciter?.name ??
                            'Mishary Rashid Alafasy'
                        }
                        onPress={openReciterModal}
                        rightEl={
                            <View style={st.defaultReciterRight}>
                                <Ionicons
                                    name="chevron-forward"
                                    size={14}
                                    color={C.muted}
                                    style={{ opacity: 0.65 }}
                                />
                            </View>
                        }
                    />
                </Card>

                {/* ══ PRAYER CALCULATION ══ */}
                <SectionLabel label="PRAYER TIME CALCULATION" />
                <Card style={st.mb28}>
                    {/* Summary */}
                    <View style={st.calcSummary}>
                        <View style={[st.rowIcon, { backgroundColor: C.goldDim }]}>
                            <Ionicons name="compass-outline" size={17} color={C.gold} />
                        </View>
                        <View style={st.calcSummaryBody}>
                            <Text style={st.rowLabel}>Calculation Method</Text>
                            <Text style={st.rowSub}>{CALC_METHODS.find(m => m.id === settings.calculation_method)?.label}</Text>
                        </View>
                        <View style={st.calcPill}>
                            <Text style={st.calcPillText}>
                                {CALC_METHODS.find(m => m.id === settings.calculation_method)?.short}
                            </Text>
                        </View>
                    </View>
                    <Sep />
                    <View style={st.calcBody}>
                        <Text style={st.calcLbl}>SELECT METHOD</Text>
                        <View style={st.chipGrid}>
                            {CALC_METHODS.map(m => (
                                <Chip key={m.id} label={m.short}
                                      active={settings.calculation_method === m.id}
                                      onPress={() => patch('calculation_method', m.id)} />
                            ))}
                        </View>
                        <View style={st.calcSep} />
                        <Text style={st.calcLbl}>MADHAB <Text style={st.calcLblSub}>(AFFECTS ASR TIME)</Text></Text>
                        <View style={st.chipGrid}>
                            {MADHABS.map(m => (
                                <Chip key={m.id} label={m.label} sub={m.sub}
                                      active={settings.madhab === m.id}
                                      onPress={() => patch('madhab', m.id)} />
                            ))}
                        </View>
                    </View>
                </Card>

                {/* ── Save confirmation — appears briefly after each change ── */}
                {(saving || savedPulse) && (
                    <View style={st.savedPulse}>
                        {saving
                            ? <ActivityIndicator color={C.green} size="small" />
                            : <Ionicons name="checkmark-circle" size={13} color={C.green} />
                        }
                        <Text style={st.savedPulseText}>{saving ? 'Saving…' : 'Preference saved'}</Text>
                    </View>
                )}

                {/* ══ APP ══ */}
                <SectionLabel label="APP" />
                <Card style={st.mb28}>
                    <Row icon="share-social-outline" label="Share App"
                         sub="Recommend to friends & family" onPress={handleShare} />
                    <Sep />
                    <Row icon="star-outline" label="Rate the App"
                         sub="Leave a review on the store"
                         onPress={() => Linking.openURL('https://apps.apple.com')} />
                    <Sep />
                    <Row icon="chatbubble-ellipses-outline" label="Send Feedback"
                         sub="Report bugs or suggest features"
                         onPress={() => Linking.openURL('mailto:mohamed2512imran@gmail.com?subject=App Feedback')} />
                    <Sep />
                    <Row icon="globe-outline" label="Visit Website"
                         sub="Learn more about this project"
                         onPress={() => Linking.openURL('https://drive.google.com/drive/folders/1BqxHInvsO23pBbqMaaqINaKGvjEnT-iq?usp=sharing')} />
                </Card>
                {/* ══ FOOTER ══ */}
                <View style={st.footer}>
                    <Text style={st.footerSub}>Made with love for the Islamic World</Text>
                    <Text style={st.footerSub}>Mohamed's Studio</Text>
                    <Text style={st.footerVer}>v{APP_VERSION}</Text>
                </View>
            </ScrollView>

            <ReciterModal
                visible={showReciterModal}
                reciters={reciters}
                selected={defaultReciter}
                loading={recitersLoading}
                onSelect={selectDefaultReciter}
                onClose={() => setShowReciterModal(false)}
            />

            {dataLoading && (
                <View style={st.overlay}>
                    <ActivityIndicator color={C.gold} size="large" />
                </View>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 18 },
    mb28:   { marginBottom: 28 },

    // Header
    pageHeader: { marginBottom: 28 },
    pageArabic: { fontSize: 13, color: C.gold, opacity: 0.5, marginBottom: 4, letterSpacing: 1 },
    pageTitle:  { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.5 },

    // Section label
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    sectionDot:    { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold },
    sectionTitle:  { fontSize: 9, color: C.gold, letterSpacing: 2.8, fontWeight: '800', opacity: 0.7 },

    // Card
    card:    { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    sep:     { height: 1, backgroundColor: C.border },

    // Snapshot
    snapshotCard: {
        backgroundColor: C.surface, borderRadius: 18,
        borderWidth: 1, borderColor: C.border,
        overflow: 'hidden', marginBottom: 28,
    },
    snapshotRow:        { flexDirection: 'row' },
    snapshotCell:       { flex: 1, paddingVertical: 20, alignItems: 'center' },
    snapshotCellBorder: { borderLeftWidth: 1, borderLeftColor: C.border },
    snapshotNum:        { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 3 },
    snapshotLbl:        { fontSize: 9, color: C.muted, textAlign: 'center', letterSpacing: 0.3, lineHeight: 13 },
    progressWrap:       { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 18, paddingVertical: 14 },
    progressTrack:      { height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
    progressFill:       { height: 3, backgroundColor: C.green, borderRadius: 2 },
    progressLbl:        { fontSize: 11, color: C.mutedMid },

    // Bookmark groups
    bkRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    bkIcon:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    bkBody:     { flex: 1 },
    bkLabel:    { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
    bkSub:      { fontSize: 12 },
    bkBadge:    { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    bkBadgeNum: { fontSize: 12, fontWeight: '800' },

    // Row
    row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 14 },
    rowIcon:  { width: 34, height: 34, borderRadius: 9, backgroundColor: C.goldDim, alignItems: 'center', justifyContent: 'center' },
    rowBody:  { flex: 1 },
    rowLabel: { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 1 },
    rowSub:   { fontSize: 11, color: C.muted, lineHeight: 15 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge:     { backgroundColor: C.gold, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { color: C.bg, fontWeight: '800', fontSize: 11 },

    // Notif offset
    offsetWrap:  { paddingHorizontal: 16, paddingVertical: 14 },
    offsetTitle: { fontSize: 9, color: C.muted, letterSpacing: 2.2, fontWeight: '700', marginBottom: 12 },

    // Chips
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center' },
    chipActive:    { backgroundColor: C.goldDim, borderColor: C.gold },
    chipLabel:     { fontSize: 12, color: C.muted, fontWeight: '600' },
    chipLabelActive:{ fontSize: 12, color: C.goldText, fontWeight: '700' },
    chipSub:       { fontSize: 9, color: C.muted, marginTop: 2, letterSpacing: 0.2 },
    chipSubActive: { color: C.gold, opacity: 0.8 },

    // Calc
    calcSummary:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    calcSummaryBody: { flex: 1 },
    calcPill:        { backgroundColor: C.goldDim, borderRadius: 8, borderWidth: 1, borderColor: C.goldMid, paddingHorizontal: 10, paddingVertical: 4 },
    calcPillText:    { color: C.goldText, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    calcBody:        { paddingHorizontal: 16, paddingBottom: 16 },
    calcLbl:         { fontSize: 9, color: C.muted, letterSpacing: 2.2, fontWeight: '700', marginBottom: 10 },
    calcLblSub:      { fontSize: 8, opacity: 0.6, letterSpacing: 1 },
    calcSep:         { height: 1, backgroundColor: C.border, marginVertical: 16 },

    // Save confirmation (auto-save pulse)
    savedPulse:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
    savedPulseText:{ fontSize: 12, color: C.green, fontWeight: '600' },

    // Default reciter
    defaultReciterRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    // Warn
    warnBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 9,
        backgroundColor: C.orangeDim, borderRadius: 12,
        borderWidth: 1, borderColor: C.orangeBorder,
        padding: 12, marginBottom: 12,
    },
    warnText: { color: C.orange, fontSize: 12, flex: 1, lineHeight: 17 },

    // Danger
    dangerCard: {
        backgroundColor: 'rgba(229,57,53,0.05)',
        borderRadius: 18, borderWidth: 1, borderColor: 'rgba(229,57,53,0.25)',
        overflow: 'hidden', marginBottom: 28,
    },
    dangerInfo:    { flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 16, paddingBottom: 14 },
    dangerIconWrap:{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.redDim, borderWidth: 1, borderColor: 'rgba(229,57,53,0.28)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    dangerTitle:   { fontSize: 14, fontWeight: '700', color: C.red, marginBottom: 4 },
    dangerDesc:    { fontSize: 12, color: C.muted, lineHeight: 17 },
    dangerBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 12, marginHorizontal: 16, marginBottom: 16,
        borderRadius: 12, borderWidth: 1,
        borderColor: 'rgba(229,57,53,0.30)',
        backgroundColor: C.redDim,
    },
    dangerBtnText: { color: C.red, fontWeight: '700', fontSize: 14 },

    // Footer
    footer:      { alignItems: 'center', gap: 6, paddingTop: 10 },
    footerArabic:{ fontSize: 14, color: C.gold, opacity: 0.3, letterSpacing: 0.5 },
    footerSub:   { fontSize: 11, color: C.muted },
    footerVer:   { fontSize: 10, color: C.muted, opacity: 0.45 },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Default reciter modal styles
// ─────────────────────────────────────────────────────────────────────────────
const reciterModal = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.62)',
    },
    sheet: {
        maxHeight: '82%',
        backgroundColor: C.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 18,
        borderTopWidth: 1,
        borderColor: C.borderGold,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.muted,
        alignSelf: 'center',
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingHorizontal: 2,
    },
    title: {
        color: C.text,
        fontSize: 18,
        fontWeight: '800',
    },
    subtitle: {
        color: C.mutedMid,
        fontSize: 11,
        marginTop: 4,
    },
    close: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: C.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: C.border,
    },
    center: {
        minHeight: 150,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    loadingText: {
        color: C.mutedMid,
        fontSize: 12,
        marginTop: 10,
    },
    emptyTitle: {
        color: C.textDim,
        fontSize: 13,
        fontWeight: '700',
        marginTop: 10,
    },
    emptyText: {
        color: C.muted,
        fontSize: 11,
        marginTop: 5,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: C.surfaceAlt,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 8,
    },
    rowActive: {
        backgroundColor: C.gold,
        borderColor: C.gold,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 11,
        backgroundColor: C.goldDim,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrapActive: {
        backgroundColor: 'rgba(8,14,23,0.12)',
    },
    rowName: {
        color: C.text,
        fontSize: 13,
        fontWeight: '700',
    },
    rowNameActive: {
        color: C.bg,
    },
    rowMeta: {
        color: C.mutedMid,
        fontSize: 10,
        marginTop: 3,
    },
    rowMetaActive: {
        color: 'rgba(8,14,23,0.58)',
    },
});
