import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, ScrollView, StatusBar,
    Switch, Linking, Share, Modal,
    Animated, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '../../src/utils/device';
import Constants from 'expo-constants';
import {
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,
    getNotificationPermission,
    requestNotificationPermission,
    getNotificationPreferences,
    saveNotificationPreferences,
    refreshContentNotifications,
} from '../../src/utils/notifications';
import { refreshPrayerNotifications } from '../../src/utils/prayerTimes';
import { getReciters } from '../../src/services/quranApi';
import AudioStore from '../../src/services/audioStore';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// Smooth, native-driven expand/collapse (e.g. a Daily Deen row opening its
// time picker) instead of the content just popping in — purely visual,
// no effect on when/what state changes.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
const EASE = LayoutAnimation.create(
    220,
    LayoutAnimation.Types.easeInEaseOut,
    LayoutAnimation.Properties.opacity
);

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
    { value: 5,  label: '5 min before' },
    { value: 10, label: '10 min before' },
    { value: 15, label: '15 min before' },
];

const DEFAULT_SETTINGS = {
    reminder_enabled:    true,
    notification_offset: 0,
    calculation_method:  '3',
    madhab:              'Shafi',
    quran_reminder_enabled:  false,
    hadith_reminder_enabled: false,
    lesson_reminder_enabled: false,
    dua_reminder_enabled:    false,
};

const DEFAULT_NOTIFICATION_PREFS = {
    prayer_enabled: true,
    prayer_offset: 0,
    jumuah_enabled: true,
    jumuah_offset: 30,
    quran_enabled: false,
    quran_hour: 20,
    quran_minute: 0,
    hadith_enabled: false,
    hadith_hour: 9,
    hadith_minute: 0,
    lesson_enabled: false,
    lesson_hour: 19,
    lesson_minute: 0,
    dua_enabled: false,
    dua_hour: 6,
    dua_minute: 30,
};

const DEFAULT_RECITER_ID = 7;

const NOTIFICATION_CATEGORIES = [
    { key: 'prayer', icon: 'notifications-outline', color: C.gold, label: 'Prayer Reminders' },
    { key: 'jumuah', icon: 'moon-outline', color: C.gold, label: "Jumu'ah" },
    { key: 'quran', icon: 'reader-outline', color: C.purple, label: 'Quran' },
    { key: 'lesson', icon: 'school-outline', color: C.green, label: 'Learning' },
    { key: 'hadith', icon: 'book-outline', color: C.gold, label: 'Hadith' },
    { key: 'dua', icon: 'hand-right-outline', color: C.blue, label: 'Dua' },
];

const DAILY_DEEN_ITEMS = [
    { key: 'quran', prefix: 'quran', icon: 'reader-outline', color: C.purple, label: 'Quran', sub: 'Resume your listening or receive a daily Surah suggestion.' },
    { key: 'lesson', prefix: 'lesson', icon: 'school-outline', color: C.green, label: 'Learning', sub: 'Continue your next unfinished lesson.' },
    { key: 'hadith', prefix: 'hadith', icon: 'book-outline', color: C.gold, label: 'Hadith', sub: 'A daily reflection from your Hadith library.' },
    { key: 'dua', prefix: 'dua', icon: 'hand-right-outline', color: C.blue, label: 'Dua', sub: 'A daily moment of remembrance.' },
];

function formatTime(hour, minute) {
    const h = Number(hour) % 24;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h % 12 || 12;
    return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scrollable AM/PM + hour + minute time picker (wheel style)
// ─────────────────────────────────────────────────────────────────────────────
const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = Math.floor(WHEEL_VISIBLE / 2);

const WHEEL_HOURS = Array.from({ length: 12 }, (_, i) => i + 1);      // 1..12
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => i);        // 0..59
const WHEEL_PERIODS = ['AM', 'PM'];

function to12Hour(hour24) {
    const h = Number(hour24) % 12;
    return h === 0 ? 12 : h;
}
function isPMHour(hour24) {
    return Number(hour24) % 24 >= 12;
}
function to24Hour(hour12, period) {
    let h = Number(hour12) % 12;
    if (period === 'PM') h += 12;
    return h;
}

// One scrollable column (hour, minute, or AM/PM). Snaps to the nearest row
// and reports the settled index — this is what makes it "scroll to set"
// instead of tapping a fixed preset.
function WheelColumn({ data, index, onSettle, renderLabel, width }) {
    const scrollRef = useRef(null);
    const settled = useRef(index);
    const didMount = useRef(false);
    // Drives per-row scale/opacity as the list scrolls, so rows visibly grow
    // and brighten as they approach the center line in real time — instead
    // of the old behaviour where nothing looked "live" until the scroll
    // fully stopped and the settled index came back from the parent.
    const scrollY = useRef(new Animated.Value(index * WHEEL_ITEM_H)).current;

    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        // Only force-scroll when the value changed from OUTSIDE this column
        // (e.g. modal reopened with a different saved time). Once the user
        // is scrolling this column itself, we never fight their gesture.
        if (index !== settled.current) {
            settled.current = index;
            scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: false });
        }
    }, [index]);

    const commit = (rawIndex) => {
        const clamped = Math.max(0, Math.min(data.length - 1, rawIndex));
        settled.current = clamped;
        scrollRef.current?.scrollTo({ y: clamped * WHEEL_ITEM_H, animated: true });
        if (clamped !== index) onSettle(clamped);
    };

    const handleEnd = (e) => {
        const y = e.nativeEvent.contentOffset.y;
        commit(Math.round(y / WHEEL_ITEM_H));
    };

    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true }
    );

    return (
        <View style={[wheel.column, { width }]}>
            <Animated.ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={WHEEL_ITEM_H}
                decelerationRate="fast"
                bounces={false}
                overScrollMode="never"
                nestedScrollEnabled
                scrollEventThrottle={16}
                onScroll={handleScroll}
                contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * WHEEL_PAD }}
                contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
                onMomentumScrollEnd={handleEnd}
                onScrollEndDrag={(e) => {
                    // Some Android devices don't always fire momentum end on a
                    // slow, deliberate drag — this keeps the snap feeling
                    // instant rather than occasionally "stuck" mid-scroll.
                    if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.02) {
                        handleEnd(e);
                    }
                }}
            >
                {data.map((item, i) => {
                    const active = i === index;
                    const center = i * WHEEL_ITEM_H;
                    const inputRange = [
                        center - WHEEL_ITEM_H * 2,
                        center - WHEEL_ITEM_H,
                        center,
                        center + WHEEL_ITEM_H,
                        center + WHEEL_ITEM_H * 2,
                    ];
                    const scale = scrollY.interpolate({
                        inputRange,
                        outputRange: [0.78, 0.92, 1.22, 0.92, 0.78],
                        extrapolate: 'clamp',
                    });
                    const opacity = scrollY.interpolate({
                        inputRange,
                        outputRange: [0.32, 0.55, 1, 0.55, 0.32],
                        extrapolate: 'clamp',
                    });
                    return (
                        <TouchableOpacity
                            key={i}
                            activeOpacity={0.6}
                            style={wheel.item}
                            onPress={() => commit(i)}
                        >
                            <Animated.Text
                                style={[
                                    wheel.itemText,
                                    active && wheel.itemTextActive,
                                    { transform: [{ scale }], opacity },
                                ]}
                            >
                                {renderLabel ? renderLabel(item) : item}
                            </Animated.Text>
                        </TouchableOpacity>
                    );
                })}
            </Animated.ScrollView>
        </View>
    );
}

// Full picker: hour wheel · minute wheel · AM/PM wheel, all scrollable,
// with a live "8:05 PM"-style summary above and a fixed center highlight bar.
function TimeWheelPicker({ hour24, minute, color, onChange }) {
    const hourIndex = to12Hour(hour24) - 1;
    const minuteIndex = Math.min(59, Math.max(0, Number(minute) || 0));
    const periodIndex = isPMHour(hour24) ? 1 : 0;

    const commitHour = (i) => onChange(to24Hour(WHEEL_HOURS[i], WHEEL_PERIODS[periodIndex]), minute);
    const commitMinute = (i) => onChange(hour24, WHEEL_MINUTES[i]);
    const commitPeriod = (i) => onChange(to24Hour(to12Hour(hour24), WHEEL_PERIODS[i]), minute);

    // Crossfade the "8:05 PM"-style summary on change instead of a hard cut —
    // purely cosmetic, the underlying value/logic is untouched.
    const summaryOpacity = useRef(new Animated.Value(1)).current;
    const timeLabel = formatTime(hour24, minute);
    useEffect(() => {
        summaryOpacity.setValue(0.35);
        Animated.timing(summaryOpacity, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
        }).start();
    }, [timeLabel]);

    return (
        <View>
            <Animated.Text style={[wheel.summary, { color, opacity: summaryOpacity }]}>
                {timeLabel}
            </Animated.Text>
            <View style={wheel.wrap}>
                <View pointerEvents="none" style={wheel.highlight} />
                <WheelColumn data={WHEEL_HOURS} index={hourIndex} onSettle={commitHour} width={52} />
                <Text style={wheel.colon}>:</Text>
                <WheelColumn
                    data={WHEEL_MINUTES}
                    index={minuteIndex}
                    onSettle={commitMinute}
                    width={52}
                    renderLabel={(m) => String(m).padStart(2, '0')}
                />
                <View style={wheel.periodGap} />
                <WheelColumn data={WHEEL_PERIODS} index={periodIndex} onSettle={commitPeriod} width={58} />
            </View>
        </View>
    );
}

// Save button with an instant press-in "give" — the tap registers visually
// right away, rather than the UI feeling inert until the async save resolves.
function SavePreferencesButton({ saving, onPress }) {
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
                style={[notifModal.saveButton, saving && notifModal.saveButtonDisabled]}
                onPress={onPress}
                onPressIn={pressIn}
                onPressOut={pressOut}
                disabled={saving}
                activeOpacity={0.82}
            >
                {saving ? (
                    <>
                        <ActivityIndicator size="small" color={C.bg} />
                        <Text style={notifModal.saveText}>Saving…</Text>
                    </>
                ) : (
                    <>
                        <Ionicons name="checkmark" size={18} color={C.bg} />
                        <Text style={notifModal.saveText}>Save preferences</Text>
                    </>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

function NotificationSettingsModal({
                                       visible,
                                       mode,
                                       prefs,
                                       settings,
                                       saving,
                                       onClose,
                                       onSave,
                                   }) {
    const [draft, setDraft] = useState({ ...DEFAULT_NOTIFICATION_PREFS, ...prefs });
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    useFocusEffect(useCallback(() => {
        if (visible) {
            setDraft({ ...DEFAULT_NOTIFICATION_PREFS, ...prefs });
        }
    }, [visible, prefs]));

    useEffect(() => {
        Animated.timing(backdropOpacity, {
            toValue: visible ? 1 : 0,
            duration: visible ? 220 : 160,
            useNativeDriver: true,
        }).start();
    }, [visible]);

    const isPrayer = mode === 'prayer';

    // Toggling a switch reveals/hides a card's inner content (offset chips or
    // the time picker) — animate that reveal instead of letting it pop in.
    const set = (key, value) => {
        LayoutAnimation.configureNext(EASE);
        setDraft(prev => ({ ...prev, [key]: value }));
    };
    const setTime = (prefix, hour, minute) => setDraft(prev => ({
        ...prev,
        [`${prefix}_hour`]: hour,
        [`${prefix}_minute`]: minute,
    }));

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={notifModal.overlay}>
                <Animated.View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.68)', opacity: backdropOpacity }]}
                />
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                <View style={notifModal.sheet}>
                    <View style={notifModal.handle} />
                    <View style={notifModal.header}>
                        <View>
                            <Text style={notifModal.title}>{isPrayer ? 'Prayer Reminders' : 'Daily Deen'}</Text>
                            <Text style={notifModal.subtitle}>
                                {isPrayer
                                    ? "Daily prayers and Jumu'ah."
                                    : 'Quran, Hadith, Learning and Dua.'}
                            </Text>
                        </View>
                        <TouchableOpacity style={notifModal.close} onPress={onClose}>
                            <Ionicons name="close" size={20} color={C.textDim} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
                        {isPrayer ? (
                            <>
                                <View style={notifModal.card}>
                                    <View style={notifModal.row}>
                                        <View style={[notifModal.icon, { backgroundColor: C.goldDim }]}><Ionicons name="notifications-outline" size={17} color={C.gold} /></View>
                                        <View style={notifModal.body}><Text style={notifModal.rowTitle}>Daily prayers</Text><Text style={notifModal.rowSub}>All five prayer times</Text></View>
                                        <Switch value={draft.prayer_enabled} onValueChange={v => set('prayer_enabled', v)} trackColor={{ false: C.border, true: C.goldMid }} thumbColor={draft.prayer_enabled ? C.gold : C.mutedMid} />
                                    </View>
                                    {draft.prayer_enabled && (
                                        <View style={notifModal.inner}>
                                            <Text style={notifModal.smallLabel}>REMIND ME</Text>
                                            <View style={notifModal.chips}>{NOTIF_OFFSETS.map(o => <Chip key={o.value} label={o.label} active={draft.prayer_offset === o.value} onPress={() => set('prayer_offset', o.value)} />)}</View>
                                        </View>
                                    )}
                                </View>

                                <View style={notifModal.card}>
                                    <View style={notifModal.row}>
                                        <View style={[notifModal.icon, { backgroundColor: C.goldDim }]}><Ionicons name="moon-outline" size={17} color={C.gold} /></View>
                                        <View style={notifModal.body}><Text style={notifModal.rowTitle}>Jumu'ah</Text><Text style={notifModal.rowSub}>Friday · before Dhuhr</Text></View>
                                        <Switch value={draft.jumuah_enabled} onValueChange={v => set('jumuah_enabled', v)} trackColor={{ false: C.border, true: C.goldMid }} thumbColor={draft.jumuah_enabled ? C.gold : C.mutedMid} />
                                    </View>
                                    {draft.jumuah_enabled && <View style={notifModal.inner}>
                                        <Text style={notifModal.smallLabel}>REMIND ME</Text>
                                        <View style={notifModal.chips}>{[15,30,60].map(v => <Chip key={v} label={`${v} min before`} active={draft.jumuah_offset === v} onPress={() => set('jumuah_offset', v)} />)}</View>
                                    </View>}
                                </View>
                            </>
                        ) : (
                            <>
                                {DAILY_DEEN_ITEMS.map((item) => {
                                    const enabled = draft[`${item.prefix}_enabled`];
                                    return (
                                        <View style={notifModal.card} key={item.key}>
                                            <View style={notifModal.row}>
                                                <View style={[notifModal.icon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={17} color={enabled ? item.color : C.muted} /></View>
                                                <View style={notifModal.body}><Text style={notifModal.rowTitle}>{item.label}</Text><Text style={notifModal.rowSub}>{item.sub}</Text></View>
                                                <Switch value={enabled} onValueChange={v => set(`${item.prefix}_enabled`, v)} trackColor={{ false: C.border, true: `${item.color}55` }} thumbColor={enabled ? item.color : C.mutedMid} />
                                            </View>
                                            {enabled && (
                                                <View style={notifModal.inner}>
                                                    <Text style={notifModal.smallLabel}>DELIVERY TIME</Text>
                                                    <TimeWheelPicker
                                                        hour24={draft[`${item.prefix}_hour`]}
                                                        minute={draft[`${item.prefix}_minute`]}
                                                        color={item.color}
                                                        onChange={(h, m) => setTime(item.prefix, h, m)}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </ScrollView>

                    <SavePreferencesButton saving={saving} onPress={() => onSave(draft)} />
                </View>
            </View>
        </Modal>
    );
}

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
    const [notificationPrefs, setNotificationPrefs] = useState({ ...DEFAULT_NOTIFICATION_PREFS });
    // null → closed, 'prayer' → Prayer + Jumu'ah, 'daily' → Quran + Hadith + Learning + Dua
    const [notificationModal, setNotificationModal] = useState(null);

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
        loadNotificationPrefs();
    }, []));

    const loadNotificationPrefs = async () => {
        try {
            const saved = await getNotificationPreferences();
            setNotificationPrefs({
                ...DEFAULT_NOTIFICATION_PREFS,
                ...(saved || {}),
            });
        } catch (e) {
            console.warn('[Settings] Notification preferences load:', e?.message);
        }
    };

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

    const savePrayerPreference = async (enabled, offset = settings.notification_offset) => {
        const previous = settings;
        const updated = { ...settings, reminder_enabled: enabled, notification_offset: offset };
        setSettings(updated);
        setSaving(true);
        try {
            const device_id = await getDeviceId();
            const { error } = await supabase
                .from('user_settings')
                .upsert({ device_id, ...updated }, { onConflict: 'device_id' })
                .select().single();
            if (error) throw error;
            await refreshPrayerNotifications(updated);
            setSavedPulse(true);
            clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(() => setSavedPulse(false), 1800);
        } catch (err) {
            setSettings(previous);
            Alert.alert('Error', err.message || 'Failed to save prayer preferences');
        } finally {
            setSaving(false);
        }
    };

    const patch = async (key, val) => {
        if (key === 'reminder_enabled' || key === 'notification_offset') {
            if ((key === 'reminder_enabled' && val) && !notifPermGranted) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                    Alert.alert('Permission Required', 'Enable notifications in your device Settings.');
                    return;
                }
                setNotifPermGranted(true);
            }
            await savePrayerPreference(
                key === 'reminder_enabled' ? val : settings.reminder_enabled,
                key === 'notification_offset' ? val : settings.notification_offset
            );
            return;
        }

        const previous = settings;
        const updated = { ...settings, [key]: val };
        setSettings(updated);
        if (val && !notifPermGranted) {
            const granted = await requestNotificationPermission();
            if (!granted) { setSettings(previous); return; }
            setNotifPermGranted(true);
        }
        setSaving(true);
        try {
            const device_id = await getDeviceId();
            const { error } = await supabase.from('user_settings').upsert({ device_id, ...updated }, { onConflict: 'device_id' }).select().single();
            if (error) throw error;
            setSavedPulse(true);
            clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(() => setSavedPulse(false), 1800);
        } catch (err) {
            setSettings(previous);
            Alert.alert('Error', err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const openNotifications = async (mode = 'prayer') => {
        try {
            const saved = await getNotificationPreferences();

            const merged = {
                ...DEFAULT_NOTIFICATION_PREFS,
                prayer_enabled: settings.reminder_enabled,
                prayer_offset: settings.notification_offset,
                quran_enabled: settings.quran_reminder_enabled,
                hadith_enabled: settings.hadith_reminder_enabled,
                lesson_enabled: settings.lesson_reminder_enabled,
                dua_enabled: settings.dua_reminder_enabled,
                ...(saved || {}),
            };

            setNotificationPrefs(merged);
            setNotificationModal(mode);
        } catch (e) {
            console.warn('[Settings] Failed opening notifications:', e?.message);
            setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS });
            setNotificationModal(mode);
        }
    };

    const saveNotificationPrefs = async (draft) => {
        if (saving) return;

        const anyEnabled =
            draft.prayer_enabled ||
            draft.jumuah_enabled ||
            draft.quran_enabled ||
            draft.hadith_enabled ||
            draft.lesson_enabled ||
            draft.dua_enabled;

        setSaving(true);

        try {
            if (!notifPermGranted && anyEnabled) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                    Alert.alert('Permission Required', 'Enable notifications in your device Settings.');
                    return;
                }
                setNotifPermGranted(true);
            }

            const previous = settings;
            const updated = {
                ...settings,
                reminder_enabled: draft.prayer_enabled,
                notification_offset: draft.prayer_offset,
                quran_reminder_enabled: draft.quran_enabled,
                hadith_reminder_enabled: draft.hadith_enabled,
                lesson_reminder_enabled: draft.lesson_enabled,
                dua_reminder_enabled: draft.dua_enabled,
            };

            const device_id = await getDeviceId();
            const { error } = await supabase.from('user_settings').upsert({ device_id, ...updated }, { onConflict: 'device_id' }).select().single();
            if (error) throw error;

            await saveNotificationPreferences(draft);

            setSettings(updated);
            setNotificationPrefs(draft);

            // Prayer scheduling remains centralized/serialized in prayerTimes + notifications.
            await refreshPrayerNotifications(updated);
            await refreshContentNotifications(draft, updated);

            setNotificationModal(null);
            setSavedPulse(true);
            clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(() => setSavedPulse(false), 1800);
        } catch (err) {
            console.error('[Settings] Notification save failed:', err);
            Alert.alert('Error', err?.message ?? 'Failed to save notification preferences.');
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

                {/* ══ NOTIFICATIONS ══ */}
                <SectionLabel label="NOTIFICATIONS" />
                {!notifPermGranted && (
                    <TouchableOpacity style={st.warnBanner} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
                        <Ionicons name="notifications-off-outline" size={14} color={C.orange} />
                        <Text style={st.warnText}>Notifications are disabled — tap to enable them</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.orange} style={{ opacity: 0.55 }} />
                    </TouchableOpacity>
                )}
                <Card style={st.mb28}>
                    <Row
                        icon="notifications-outline"
                        iconColor={C.gold}
                        iconBg={C.goldDim}
                        label="Prayer Reminders"
                        sub="Five daily prayers and Jumu'ah"
                        onPress={() => openNotifications('prayer')}
                    />
                    <Sep />
                    <Row
                        icon="sparkles-outline"
                        iconColor={C.purple}
                        iconBg="rgba(179,157,219,0.12)"
                        label="Daily Deen"
                        sub="Quran, Hadith, Learning and Dua"
                        onPress={() => openNotifications('daily')}
                    />
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
                         onPress={() => Linking.openURL('https://claude.ai/artifact/1TkGcPTFwNa7t1LYxg3HzY')} />
                </Card>
                {/* ══ FOOTER ══ */}
                <View style={st.footer}>
                    <Text style={st.footerSub}>Made with love for the Islamic World</Text>
                    <Text style={st.footerSub}>Mohamed's Studio</Text>
                    <Text style={st.footerVer}>v{APP_VERSION}</Text>
                </View>
            </ScrollView>

            <NotificationSettingsModal
                visible={notificationModal === 'prayer'}
                mode="prayer"
                prefs={notificationPrefs}
                settings={settings}
                saving={saving}
                onSave={saveNotificationPrefs}
                onClose={() => {
                    if (!saving) setNotificationModal(null);
                }}
            />

            <NotificationSettingsModal
                visible={notificationModal === 'daily'}
                mode="daily"
                prefs={notificationPrefs}
                settings={settings}
                saving={saving}
                onSave={saveNotificationPrefs}
                onClose={() => {
                    if (!saving) setNotificationModal(null);
                }}
            />

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

    notifSummary: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
    notifSummaryIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.goldDim, alignItems: 'center', justifyContent: 'center' },
    notifSummaryTitle: { color: C.text, fontSize: 12, fontWeight: '700', marginBottom: 2 },
    notifSummaryText: { color: C.mutedMid, fontSize: 10.5 },

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
// Notification settings modal styles
// ─────────────────────────────────────────────────────────────────────────────
const notifModal = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    sheet: { maxHeight: '88%', backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: C.borderGold },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.muted, alignSelf: 'center', marginBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    title: { color: C.text, fontSize: 20, fontWeight: '800' },
    subtitle: { color: C.mutedMid, fontSize: 11, marginTop: 4, maxWidth: 280 },
    close: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    permissionNote: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.greenDim, borderRadius: 12, padding: 11, marginBottom: 12 },
    permissionText: { flex: 1, color: C.mutedMid, fontSize: 11, lineHeight: 16 },

    // Tab bar — separates Prayer from Dua/Hadith/Quran/Lessons as two distinct control centres
    tabBar: { flexDirection: 'row', gap: 8, backgroundColor: C.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 4, marginBottom: 14 },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11 },
    tabBtnActive: { backgroundColor: C.gold },
    tabText: { color: C.mutedMid, fontSize: 11, fontWeight: '700', textAlign: 'center' },
    tabTextActive: { color: C.bg },

    groupLabel: { fontSize: 9, color: C.gold, letterSpacing: 2.5, fontWeight: '800', opacity: 0.72, marginBottom: 9, marginTop: 8 },
    card: { backgroundColor: C.surfaceAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
    icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1 },
    rowTitle: { color: C.text, fontSize: 13, fontWeight: '650', marginBottom: 2 },
    rowSub: { color: C.mutedMid, fontSize: 10.5, lineHeight: 15 },
    inner: { borderTopWidth: 1, borderTopColor: C.border, padding: 13 },
    smallLabel: { fontSize: 8.5, color: C.muted, letterSpacing: 2, fontWeight: '800', marginBottom: 9 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, borderRadius: 14, paddingVertical: 13, marginTop: 8 },
    saveButtonDisabled: { opacity: 0.62 },
    saveText: { color: C.bg, fontSize: 13, fontWeight: '800' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Wheel time picker styles
// ─────────────────────────────────────────────────────────────────────────────
const wheel = StyleSheet.create({
    summary: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: 0.3 },
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: WHEEL_ITEM_H * WHEEL_VISIBLE,
    },
    highlight: {
        position: 'absolute',
        left: 8,
        right: 8,
        top: WHEEL_ITEM_H * WHEEL_PAD,
        height: WHEEL_ITEM_H,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.045)',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: C.borderGold,
    },
    column: { height: WHEEL_ITEM_H * WHEEL_VISIBLE },
    item: { height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
    itemText: { fontSize: 15, fontWeight: '500', color: C.mutedMid },
    itemTextActive: { fontSize: 19, fontWeight: '800', color: C.text },
    colon: { fontSize: 18, fontWeight: '800', color: C.mutedMid, marginHorizontal: 2 },
    periodGap: { width: 10 },
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