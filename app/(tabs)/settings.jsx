import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, ScrollView, StatusBar,
    Switch, Linking, Share,
} from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceId } from '../../src/utils/device';
import Constants from 'expo-constants';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

let Notifications = null;
if (!IS_EXPO_GO) {
    Notifications = require('expo-notifications');
}

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
};

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
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
    const insets = useSafeAreaInsets();

    const [dataLoading,      setDataLoading]      = useState(true);
    const [resetting,        setResetting]        = useState(false);
    const [saving,           setSaving]           = useState(false);
    const [savedPulse,       setSavedPulse]       = useState(false);
    const [notifPermGranted, setNotifPermGranted] = useState(true);

    const [savedHadiths, setSavedHadiths] = useState(0);
    const [savedDuas,    setSavedDuas]    = useState(0);
    const [savedLessons, setSavedLessons] = useState(0);
    const [doneLessons,  setDoneLessons]  = useState(0);

    const [committed, setCommitted] = useState({ ...DEFAULT_SETTINGS });
    const [draft,     setDraft]     = useState({ ...DEFAULT_SETTINGS });

    const isDirty = JSON.stringify(draft) !== JSON.stringify(committed);

    useFocusEffect(useCallback(() => {
        loadAll();
        checkNotifPerm();
    }, []));

    const checkNotifPerm = async () => {
        if (IS_EXPO_GO || !Notifications) { setNotifPermGranted(false); return; }
        const { status } = await Notifications.getPermissionsAsync();
        setNotifPermGranted(status === 'granted');
    };

    const loadAll = async () => {
        setDataLoading(true);
        let device_id;
        try { device_id = await getDeviceId(); }
        catch { setDataLoading(false); return; }
        try {
            const [
                { count: hc }, { count: duac }, { count: lc },
                { count: dc }, { data: sd },
            ] = await Promise.all([
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'hadith'),
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'dua'),
                supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('content_type', 'lesson'),
                supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('device_id', device_id).eq('completed', true),
                supabase.from('user_settings').select('*').eq('device_id', device_id).maybeSingle(),
            ]);
            setSavedHadiths(hc   ?? 0);
            setSavedDuas(duac    ?? 0);
            setSavedLessons(lc   ?? 0);
            setDoneLessons(dc    ?? 0);
            if (sd) {
                const loaded = {
                    reminder_enabled:    sd.reminder_enabled    ?? DEFAULT_SETTINGS.reminder_enabled,
                    notification_offset: sd.notification_offset ?? DEFAULT_SETTINGS.notification_offset,
                    calculation_method:  sd.calculation_method  ?? DEFAULT_SETTINGS.calculation_method,
                    madhab:              sd.madhab              ?? DEFAULT_SETTINGS.madhab,
                };
                setCommitted(loaded);
                setDraft(loaded);
            }
        } catch (err) { console.warn('Settings load:', err.message); }
        finally { setDataLoading(false); }
    };

    const patch = (key, val) => setDraft(prev => ({ ...prev, [key]: val }));

    const saveSettings = async () => {
        setSaving(true);
        try {
            const device_id = await getDeviceId();
            if (!IS_EXPO_GO && Notifications && draft.reminder_enabled && !notifPermGranted) {
                const { status } = await Notifications.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Required', 'Enable notifications in your device Settings.');
                    patch('reminder_enabled', false);
                    setSaving(false);
                    return;
                }
                setNotifPermGranted(true);
            }
            const { error } = await supabase
                .from('user_settings')
                .upsert({ device_id, ...draft }, { onConflict: 'device_id' })
                .select().single();
            if (error) throw error;
            if (!IS_EXPO_GO && Notifications && !draft.reminder_enabled) {
                const all = await Notifications.getAllScheduledNotificationsAsync();
                await Promise.all(
                    all.filter(n => n.content.data?.type === 'prayer_reminder')
                        .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
                );
            }
            setCommitted({ ...draft });
            setSavedPulse(true);
            setTimeout(() => setSavedPulse(false), 2400);
            router.setParams({ settingsRefresh: String(Date.now()) });
        } catch (err) {
            Alert.alert('Error', err.message || 'Failed to save');
        } finally { setSaving(false); }
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

    const totalSaved = savedHadiths + savedDuas + savedLessons;
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

                {!notifPermGranted && !IS_EXPO_GO && (
                    <TouchableOpacity style={st.warnBanner} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
                        <Ionicons name="notifications-off-outline" size={14} color={C.orange} />
                        <Text style={st.warnText}>Notifications disabled — tap to open Settings</Text>
                        <Ionicons name="chevron-forward" size={12} color={C.orange} style={{ opacity: 0.55 }} />
                    </TouchableOpacity>
                )}

                <Card style={st.mb28}>
                    <Row
                        icon={draft.reminder_enabled ? 'notifications' : 'notifications-off-outline'}
                        iconColor={draft.reminder_enabled ? C.gold : C.muted}
                        iconBg={draft.reminder_enabled ? C.goldDim : 'rgba(255,255,255,0.04)'}
                        label="Prayer Reminders"
                        sub={draft.reminder_enabled ? 'Active for all 5 prayers' : 'All notifications off'}
                        showChevron={false}
                        rightEl={
                            <Switch
                                value={draft.reminder_enabled}
                                onValueChange={v => patch('reminder_enabled', v)}
                                trackColor={{ false: 'rgba(255,255,255,0.08)', true: C.goldMid }}
                                thumbColor={draft.reminder_enabled ? C.gold : C.mutedMid}
                                ios_backgroundColor="rgba(255,255,255,0.08)"
                            />
                        }
                    />
                    {draft.reminder_enabled && (
                        <>
                            <Sep />
                            <View style={st.offsetWrap}>
                                <Text style={st.offsetTitle}>NOTIFY ME</Text>
                                <View style={st.chipGrid}>
                                    {NOTIF_OFFSETS.map(o => (
                                        <Chip key={o.value} label={o.label}
                                              active={draft.notification_offset === o.value}
                                              onPress={() => patch('notification_offset', o.value)} />
                                    ))}
                                </View>
                            </View>
                        </>
                    )}
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
                            <Text style={st.rowSub}>{CALC_METHODS.find(m => m.id === draft.calculation_method)?.label}</Text>
                        </View>
                        <View style={st.calcPill}>
                            <Text style={st.calcPillText}>
                                {CALC_METHODS.find(m => m.id === draft.calculation_method)?.short}
                            </Text>
                        </View>
                    </View>
                    <Sep />
                    <View style={st.calcBody}>
                        <Text style={st.calcLbl}>SELECT METHOD</Text>
                        <View style={st.chipGrid}>
                            {CALC_METHODS.map(m => (
                                <Chip key={m.id} label={m.short}
                                      active={draft.calculation_method === m.id}
                                      onPress={() => patch('calculation_method', m.id)} />
                            ))}
                        </View>
                        <View style={st.calcSep} />
                        <Text style={st.calcLbl}>MADHAB <Text style={st.calcLblSub}>(AFFECTS ASR TIME)</Text></Text>
                        <View style={st.chipGrid}>
                            {MADHABS.map(m => (
                                <Chip key={m.id} label={m.label} sub={m.sub}
                                      active={draft.madhab === m.id}
                                      onPress={() => patch('madhab', m.id)} />
                            ))}
                        </View>
                    </View>
                </Card>

                {/* ── Save row (only when dirty) ── */}
                {isDirty && (
                    <View style={st.saveRow}>
                        <TouchableOpacity
                            style={[st.saveBtn, saving && { opacity: 0.6 }]}
                            onPress={saveSettings} disabled={saving} activeOpacity={0.85}
                        >
                            {saving
                                ? <ActivityIndicator color={C.bg} size="small" />
                                : <>
                                    <Ionicons name="checkmark-circle-outline" size={17} color={C.bg} />
                                    <Text style={st.saveBtnText}>Save Changes</Text>
                                </>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity style={st.discardBtn} onPress={() => setDraft({ ...committed })}>
                            <Text style={st.discardText}>Discard</Text>
                        </TouchableOpacity>
                    </View>
                )}
                {savedPulse && !isDirty && (
                    <View style={st.savedPulse}>
                        <Ionicons name="checkmark-circle" size={13} color={C.green} />
                        <Text style={st.savedPulseText}>Settings saved</Text>
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

    // Save
    saveRow:       { flexDirection: 'row', gap: 10, marginBottom: 16 },
    saveBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, paddingVertical: 14, borderRadius: 14 },
    saveBtnText:   { color: C.bg, fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },
    discardBtn:    { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    discardText:   { fontSize: 13, color: C.muted, fontWeight: '600' },
    savedPulse:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
    savedPulseText:{ fontSize: 12, color: C.green, fontWeight: '600' },

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