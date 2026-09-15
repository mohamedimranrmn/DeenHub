import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, StatusBar,
    Dimensions, Animated,
} from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';

import { createCustomDhikr } from '../src/services/dhikr';

// ── Design tokens (matches DhikrCounter palette) ─────────────────────────────
const GOLD       = '#C9A84C';
const GOLD_MED   = 'rgba(201,168,76,0.28)';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const CARD2      = '#1A2A3A';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.15)';
const GREEN      = '#4CAF7D';
const GREEN_BG   = 'rgba(76,175,125,0.12)';
const ERROR      = '#E05C5C';
const ERROR_BG   = 'rgba(224,92,92,0.10)';

const { width } = Dimensions.get('window');

// ── Preset dhikr phrases (Option B) ──────────────────────────────────────────
// Common dhikr with authentic Arabic text — user taps one to autofill,
// or scrolls past to type their own.
const PRESETS = [
    {
        title:       'SubhanAllah',
        arabic:      'سُبْحَانَ ٱللَّٰهِ',
        translation: 'Glory be to Allah',
        target:      33,
    },
    {
        title:       'Alhamdulillah',
        arabic:      'ٱلْحَمْدُ لِلَّٰهِ',
        translation: 'Praise be to Allah',
        target:      33,
    },
    {
        title:       'Allahu Akbar',
        arabic:      'ٱللَّٰهُ أَكْبَرُ',
        translation: 'Allah is the Greatest',
        target:      33,
    },
    {
        title:       'Astaghfirullah',
        arabic:      'أَسْتَغْفِرُ ٱللَّٰهَ',
        translation: 'I seek forgiveness from Allah',
        target:      100,
    },
    {
        title:       'La ilaha ill Allah',
        arabic:      'لَا إِلَٰهَ إِلَّا ٱللَّٰهُ',
        translation: 'There is no god but Allah',
        target:      100,
    },
    {
        title:       'SubhanAllahi wa bihamdihi',
        arabic:      'سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ',
        translation: 'Glory and praise be to Allah',
        target:      100,
    },
    {
        title:       'SubhanAllahi al-Azim',
        arabic:      'سُبْحَانَ ٱللَّٰهِ ٱلْعَظِيمِ',
        translation: 'Glory be to Allah, the Magnificent',
        target:      100,
    },
    {
        title:       'Hasbunallahu wa ni\'mal wakeel',
        arabic:      'حَسْبُنَا ٱللَّٰهُ وَنِعْمَ ٱلْوَكِيلُ',
        translation: 'Allah is sufficient for us and He is the best Disposer of affairs',
        target:      40,
    },
    {
        title:       'La hawla wala quwwata',
        arabic:      'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ',
        translation: 'There is no power except with Allah',
        target:      100,
    },
    {
        title:       'Salawat',
        arabic:      'ٱللَّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ',
        translation: 'O Allah, send blessings upon Muhammad',
        target:      100,
    },
];

const TARGET_OPTIONS = [11, 33, 99, 100, 200, 500, 1000];

export default function AddDhikrScreen() {
    const navigation = useNavigation();
    const insets     = useSafeAreaInsets();

    const [selectedPreset, setSelectedPreset] = useState(null); // index or null = custom
    const [title,          setTitle]          = useState('');
    const [arabic,         setArabic]         = useState('');
    const [translation,    setTranslation]    = useState('');
    const [target,         setTarget]         = useState(33);
    const [customTarget,   setCustomTarget]   = useState('');
    const [useCustomTarget,setUseCustomTarget]= useState(false);
    const [saving,         setSaving]         = useState(false);
    const [errors,         setErrors]         = useState({});

    const saveAnim   = useRef(new Animated.Value(1)).current;
    const errorAnim  = useRef(new Animated.Value(0)).current;

    // ── Select a preset ───────────────────────────────────────────────────
    const handlePresetSelect = useCallback((i) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (selectedPreset === i) {
            // Deselect → go custom
            setSelectedPreset(null);
        } else {
            const p = PRESETS[i];
            setSelectedPreset(i);
            setTitle(p.title);
            setArabic(p.arabic);
            setTranslation(p.translation);
            setTarget(p.target);
            setUseCustomTarget(false);
            setErrors({});
        }
    }, [selectedPreset]);

    // ── Target selector ───────────────────────────────────────────────────
    const handleTargetSelect = useCallback((t) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTarget(t);
        setUseCustomTarget(false);
        setCustomTarget('');
    }, []);

    // ── Validate ──────────────────────────────────────────────────────────
    const validate = () => {
        const e = {};
        if (!title.trim())       e.title       = 'Name is required';
        if (!arabic.trim())      e.arabic      = 'Arabic text is required';
        if (!translation.trim()) e.translation = 'Translation is required';

        const finalTarget = useCustomTarget ? parseInt(customTarget, 10) : target;
        if (useCustomTarget && (!customTarget || isNaN(finalTarget) || finalTarget < 1)) {
            e.customTarget = 'Enter a valid number';
        }

        setErrors(e);
        if (Object.keys(e).length > 0) {
            Animated.sequence([
                Animated.timing(errorAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
            ]).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return false;
        }
        return true;
    };

    // ── Save ──────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        setErrors(prev => ({ ...prev, save: null }));
        if (!validate()) return;
        setSaving(true);

        Animated.sequence([
            Animated.timing(saveAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
            Animated.spring(saveAnim, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
        ]).start();

        try {
            const finalTarget = useCustomTarget
                ? parseInt(customTarget, 10)
                : target;

            await createCustomDhikr({
                title:       title.trim(),
                arabic:      arabic.trim(),
                translation: translation.trim(),
                target_count: finalTarget,
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.goBack();
        } catch (e) {
            console.error('AddDhikr save:', e);
            setErrors(prev => ({ ...prev, save: 'Could not save. Check your connection and try again.' }));
            Animated.sequence([
                Animated.timing(errorAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                Animated.timing(errorAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
            ]).start();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setSaving(false);
        }
    }, [title, arabic, translation, target, customTarget, useCustomTarget, navigation]);

    return (
        <KeyboardAvoidingView
            style={[styles.root, { paddingTop: insets.top }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
        >
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* ── Top bar ── */}
            <View style={styles.topBar}>
                <View style={styles.topSide}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.backBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="chevron-back" size={22} color={TEXT_DIM} />
                    </TouchableOpacity>
                </View>
                <View style={styles.topCenter}>
                    <Text style={styles.topLabel}>ADD DHIKR</Text>
                    <Text style={styles.topSub}>أضف ذكرًا</Text>
                </View>
                <View style={[styles.topSide, styles.topSideRight]}>
                    <Animated.View style={{ transform: [{ scale: saveAnim }] }}>
                        <TouchableOpacity
                            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                            onPress={handleSave}
                            disabled={saving}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.saveBtnText}>
                                {saving ? 'Saving…' : 'Save'}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </View>

            {errors.save ? (
                <View style={styles.saveErrorBanner}>
                    <Ionicons name="alert-circle-outline" size={14} color={ERROR} />
                    <Text style={styles.saveErrorText}>{errors.save}</Text>
                </View>
            ) : null}

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 32 },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >

                {/* ── Section: Preset picker ── */}
                <Text style={styles.sectionLabel}>CHOOSE A PRESET</Text>
                <Text style={styles.sectionSub}>
                    Tap a phrase to autofill, or fill in the form below with your own.
                </Text>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.presetsRow}
                    style={styles.presetsScroll}
                >
                    {PRESETS.map((p, i) => {
                        const isSelected = selectedPreset === i;
                        return (
                            <TouchableOpacity
                                key={i}
                                style={[
                                    styles.presetCard,
                                    isSelected && styles.presetCardSelected,
                                ]}
                                onPress={() => handlePresetSelect(i)}
                                activeOpacity={0.8}
                            >
                                <Text style={[
                                    styles.presetArabic,
                                    isSelected && styles.presetArabicSelected,
                                ]}>
                                    {p.arabic}
                                </Text>
                                <Text style={[
                                    styles.presetTitle,
                                    isSelected && styles.presetTitleSelected,
                                ]}>
                                    {p.title}
                                </Text>
                                <View style={[
                                    styles.presetCountBadge,
                                    isSelected && styles.presetCountBadgeSelected,
                                ]}>
                                    <Text style={[
                                        styles.presetCount,
                                        isSelected && styles.presetCountSelected,
                                    ]}>
                                        ×{p.target}
                                    </Text>
                                </View>
                                {isSelected && (
                                    <View style={styles.presetCheck}>
                                        <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* ── Divider ── */}
                <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>OR CUSTOMISE</Text>
                    <View style={styles.orLine} />
                </View>

                {/* ── Form: Name ── */}
                <Field label="NAME" error={errors.title}>
                    <TextInput
                        style={[styles.input, errors.title && styles.inputError]}
                        placeholder="e.g. SubhanAllah"
                        placeholderTextColor={MUTED}
                        value={title}
                        onChangeText={t => { setTitle(t); setErrors(e => ({ ...e, title: null })); }}
                        returnKeyType="next"
                        autoCapitalize="words"
                    />
                </Field>

                {/* ── Form: Arabic ── */}
                <Field
                    label="ARABIC TEXT"
                    error={errors.arabic}
                    hint="Switch your keyboard to Arabic, or select a preset above."
                >
                    <TextInput
                        style={[styles.input, styles.arabicInput, errors.arabic && styles.inputError]}
                        placeholder="اكتب هنا"
                        placeholderTextColor={MUTED}
                        value={arabic}
                        onChangeText={t => { setArabic(t); setErrors(e => ({ ...e, arabic: null })); }}
                        textAlign="right"
                        writingDirection="rtl"
                        multiline
                        numberOfLines={2}
                        returnKeyType="next"
                    />
                </Field>

                {/* ── Form: Translation ── */}
                <Field label="TRANSLATION / MEANING" error={errors.translation}>
                    <TextInput
                        style={[styles.input, errors.translation && styles.inputError]}
                        placeholder="e.g. Glory be to Allah"
                        placeholderTextColor={MUTED}
                        value={translation}
                        onChangeText={t => { setTranslation(t); setErrors(e => ({ ...e, translation: null })); }}
                        returnKeyType="done"
                    />
                </Field>

                {/* ── Form: Target count ── */}
                <Text style={styles.fieldLabel}>TARGET COUNT</Text>
                <View style={styles.targetRow}>
                    {TARGET_OPTIONS.map(t => {
                        const isActive = !useCustomTarget && target === t;
                        return (
                            <TouchableOpacity
                                key={t}
                                style={[styles.targetChip, isActive && styles.targetChipActive]}
                                onPress={() => handleTargetSelect(t)}
                                activeOpacity={0.75}
                            >
                                <Text style={[styles.targetChipText, isActive && styles.targetChipTextActive]}>
                                    {t}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                    <TouchableOpacity
                        style={[styles.targetChip, useCustomTarget && styles.targetChipActive]}
                        onPress={() => {
                            setUseCustomTarget(true);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        activeOpacity={0.75}
                    >
                        <Text style={[styles.targetChipText, useCustomTarget && styles.targetChipTextActive]}>
                            Custom
                        </Text>
                    </TouchableOpacity>
                </View>
                {useCustomTarget && (
                    <Field error={errors.customTarget}>
                        <TextInput
                            style={[styles.input, errors.customTarget && styles.inputError]}
                            placeholder="Enter a number"
                            placeholderTextColor={MUTED}
                            value={customTarget}
                            onChangeText={t => { setCustomTarget(t); setErrors(e => ({ ...e, customTarget: null })); }}
                            keyboardType="number-pad"
                            returnKeyType="done"
                            autoFocus
                        />
                    </Field>
                )}

                {/* ── Preview ── */}
                {(arabic.trim() || title.trim()) && (
                    <View style={styles.preview}>
                        <Text style={styles.previewLabel}>PREVIEW</Text>
                        <View style={styles.previewCard}>
                            {arabic.trim() ? (
                                <Text style={styles.previewArabic}>{arabic}</Text>
                            ) : null}
                            {title.trim() ? (
                                <Text style={styles.previewTitle}>{title}</Text>
                            ) : null}
                            {translation.trim() ? (
                                <Text style={styles.previewTranslation}>{translation}</Text>
                            ) : null}
                            <View style={styles.previewTarget}>
                                <Text style={styles.previewTargetText}>
                                    ×{useCustomTarget ? (customTarget || '?') : target}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ── Reusable field wrapper ────────────────────────────────────────────────────
function Field({ label, hint, error, children }) {
    return (
        <View style={styles.fieldWrap}>
            {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
            {hint  ? <Text style={styles.fieldHint}>{hint}</Text>   : null}
            {children}
            {error ? (
                <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={12} color={ERROR} />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: DARK,
    },

    // ── Top bar ──
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },
    backBtn: { padding: 4 },
    topSide: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
    topSideRight: { alignItems: 'flex-end' },
    topCenter: { alignItems: 'center' },
    topLabel: {
        fontSize: 11,
        color: GOLD,
        letterSpacing: 3,
        fontWeight: '600',
    },
    topSub: {
        fontSize: 13,
        color: TEXT_DIM,
        marginTop: 2,
    },
    saveBtn: {
        backgroundColor: GOLD,
        paddingHorizontal: 20,
        paddingVertical: 9,
        borderRadius: 20,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: {
        color: DARK,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    saveErrorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 20,
        marginTop: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: ERROR,
        backgroundColor: ERROR_BG,
    },
    saveErrorText: {
        flex: 1,
        fontSize: 12,
        color: ERROR,
        letterSpacing: 0.2,
    },

    // ── Scroll ──
    scroll: { flex: 1 },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 24,
    },

    sectionLabel: {
        fontSize: 11,
        color: GOLD,
        letterSpacing: 2.5,
        marginBottom: 6,
        fontWeight: '600',
    },
    sectionSub: {
        fontSize: 13,
        color: TEXT_DIM,
        marginBottom: 16,
        lineHeight: 20,
    },

    // ── Presets horizontal scroll ──
    presetsScroll: { marginHorizontal: -20, marginBottom: 4 },
    presetsRow: {
        paddingHorizontal: 20,
        gap: 12,
        paddingBottom: 4,
    },
    presetCard: {
        width: 130,
        backgroundColor: CARD,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: BORDER,
        gap: 6,
        position: 'relative',
    },
    presetCardSelected: {
        borderColor: GREEN,
        backgroundColor: GREEN_BG,
    },
    presetArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 17,
        color: TEXT_DIM,
        textAlign: 'right',
        writingDirection: 'rtl',
        lineHeight: 32,
    },
    presetArabicSelected: { color: TEXT },
    presetTitle: {
        fontSize: 11,
        color: MUTED,
        letterSpacing: 0.3,
    },
    presetTitleSelected: { color: TEXT_DIM },
    presetCountBadge: {
        alignSelf: 'flex-start',
        backgroundColor: GOLD_LIGHT,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: BORDER,
        marginTop: 2,
    },
    presetCountBadgeSelected: {
        backgroundColor: 'rgba(76,175,125,0.15)',
        borderColor: 'rgba(76,175,125,0.3)',
    },
    presetCount: {
        fontSize: 11,
        color: TEXT_DIM,
        fontWeight: '600',
    },
    presetCountSelected: { color: GREEN },
    presetCheck: {
        position: 'absolute',
        top: 10,
        left: 10,
    },

    // ── Divider ──
    orRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 28,
        gap: 12,
    },
    orLine: {
        flex: 1,
        height: 1,
        backgroundColor: BORDER,
    },
    orText: {
        fontSize: 11,
        color: MUTED,
        letterSpacing: 2,
        fontWeight: '600',
    },

    // ── Form fields ──
    fieldWrap: { marginBottom: 20 },
    fieldLabel: {
        fontSize: 11,
        color: GOLD,
        letterSpacing: 2,
        marginBottom: 8,
        fontWeight: '600',
    },
    fieldHint: {
        fontSize: 12,
        color: MUTED,
        marginBottom: 8,
        lineHeight: 18,
    },
    input: {
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: TEXT,
        fontSize: 15,
        letterSpacing: 0.3,
    },
    inputError: {
        borderColor: ERROR,
        backgroundColor: ERROR_BG,
    },
    arabicInput: {
        fontFamily: 'Uthmanic',
        fontSize: 22,
        lineHeight: 40,
        textAlignVertical: 'top',
        minHeight: 76,
    },
    errorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 6,
    },
    errorText: {
        fontSize: 12,
        color: ERROR,
        letterSpacing: 0.2,
    },

    // ── Target chips ──
    targetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
    },
    targetChip: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD,
    },
    targetChipActive: {
        borderColor: GOLD,
        backgroundColor: GOLD_LIGHT,
    },
    targetChipText: {
        fontSize: 13,
        color: TEXT_DIM,
        fontWeight: '500',
    },
    targetChipTextActive: {
        color: GOLD,
        fontWeight: '700',
    },

    // ── Preview ──
    preview: {
        marginTop: 8,
    },
    previewLabel: {
        fontSize: 11,
        color: MUTED,
        letterSpacing: 2,
        marginBottom: 10,
        fontWeight: '600',
    },
    previewCard: {
        backgroundColor: CARD2,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: GOLD_MED,
        gap: 8,
    },
    previewArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 24,
        color: TEXT,
        textAlign: 'center',
        writingDirection: 'rtl',
        lineHeight: 44,
    },
    previewTitle: {
        fontSize: 13,
        color: GOLD,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    previewTranslation: {
        fontSize: 13,
        color: TEXT_DIM,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    previewTarget: {
        marginTop: 6,
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: GOLD_LIGHT,
        borderWidth: 1,
        borderColor: BORDER,
    },
    previewTargetText: {
        fontSize: 12,
        color: GOLD,
        fontWeight: '700',
        letterSpacing: 1,
    },
});