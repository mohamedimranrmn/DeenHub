import {
    View, Text, StyleSheet, ActivityIndicator,
    TouchableOpacity, StatusBar, ScrollView,
    Clipboard,
} from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import supabase from '../../src/services/supabase';
import { isBookmarked, toggleBookmark } from '../../src/services/bookmarks';

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.22)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';

export default function HadithDetail() {
    const { id }   = useLocalSearchParams();
    const insets   = useSafeAreaInsets();
    const [hadith,  setHadith]  = useState(null);
    const [loading, setLoading] = useState(true);
    const [saved,   setSaved]   = useState(false);
    const [copied,  setCopied]  = useState(false);
    const [sharing, setSharing] = useState(false);

    const shareCardRef = useRef(null);  // ← ViewShot ref

    useEffect(() => { loadHadith(); }, []);

    const loadHadith = async () => {
        try {
            const { data, error } = await supabase
                .from('hadiths')
                .select('id, arabic, full_text, book, hadith_number, grade, reference')
                .eq('id', id)
                .single();
            if (error) { console.log('Fetch error:', error.message); return; }
            setHadith(data);
            setSaved(await isBookmarked(data.id));
        } catch (err) {
            console.log('Crash:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleBookmark = async () => {
        const result = await toggleBookmark(hadith.id);
        setSaved(result);
    };

    const handleCopy = () => {
        const text = [
            hadith.arabic   ? `${hadith.arabic}\n\n`    : '',
            hadith.translation || hadith.full_text || '',
            hadith.reference_full
                ? `\n\n— ${hadith.reference_full}`
                : `\n\n${hadith.book ?? ''} • Hadith ${hadith.hadith_number ?? ''}`,
        ].join('');
        Clipboard.setString(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Screenshot → Share ────────────────────────────────────────────────────
    const handleShare = async () => {
        if (!shareCardRef.current || sharing) return;
        try {
            setSharing(true);
            const uri = await shareCardRef.current.capture();
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: `Hadith ${hadith.hadith_number ?? ''}`,
                });
            }
        } catch (e) {
            console.warn('Share screenshot:', e.message);
        } finally {
            setSharing(false);
        }
    };

    if (loading) return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <View style={s.center}>
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={s.loadingText}>Loading...</Text>
            </View>
        </View>
    );

    if (!hadith) return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <View style={s.center}>
                <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
                <Text style={s.notFound}>Hadith not found</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: GOLD, marginTop: 8 }}>Go back</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const displayText = hadith.full_text;

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />

            {/* ── Navbar ── */}
            <View style={s.nav}>
                <TouchableOpacity onPress={() => router.back()} style={s.navBtn}
                                  hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
                    <Ionicons name="chevron-back" size={22} color={GOLD} />
                </TouchableOpacity>

                <View style={s.navCenter}>
                    <Text style={s.arabicAccent}>حديث</Text>
                    <Text style={s.navTitle}>Hadith</Text>
                </View>

                <TouchableOpacity onPress={handleBookmark}
                                  style={[s.navBtn, saved && s.navBtnActive]}
                                  hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
                    <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'}
                              size={20} color={saved ? GOLD : MUTED} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ══════════════════════════════════════════════════
                    ViewShot — captures Arabic → Reference as image
                ══════════════════════════════════════════════════ */}
                <ViewShot
                    ref={shareCardRef}
                    options={{ format: 'png', quality: 1 }}
                    style={s.shareCard}
                >
                    {/* Watermark inside screenshot */}
                    <View style={s.watermarkRow}>
                        <Text style={s.watermarkArabic}>حديث</Text>
                        <Text style={s.watermarkDot}>·</Text>
                        <Text style={s.watermarkTitle}>
                            {hadith.book ?? 'Hadith'}
                            {hadith.hadith_number ? `  #${hadith.hadith_number}` : ''}
                        </Text>
                    </View>

                    {/* Decorative rule */}
                    <View style={s.ruleRow}>
                        <View style={s.ruleLine} />
                        <Text style={s.ruleStar}>✦</Text>
                        <View style={s.ruleLine} />
                    </View>

                    {/* Arabic — no copy button inside screenshot */}
                    {hadith.arabic ? (
                        <View style={s.arabicBlock}>
                            <Text style={s.arabic}>{hadith.arabic}</Text>
                        </View>
                    ) : null}

                    {hadith.arabic ? <View style={s.sectionDivider} /> : null}

                    {/* Main text */}
                    <Text style={s.openQuote}>❝</Text>
                    <Text style={s.translation}>{displayText}</Text>
                    <Text style={s.closeQuote}>❞</Text>

                    {/* Reference meta card */}
                    <View style={s.metaCard}>
                        <View style={s.metaHeaderRow}>
                            <Ionicons name="library-outline" size={13} color={GOLD}
                                      style={{ marginRight: 6, opacity: 0.7 }} />
                            <Text style={s.metaCardTitle}>REFERENCE</Text>
                        </View>
                        <View style={s.metaDividerLine} />

                        {hadith.book ? (
                            <Text style={s.metaItem}>Book:      {hadith.book}</Text>
                        ) : null}
                        {hadith.chapter ? (
                            <Text style={s.metaItem}>Chapter:   {hadith.chapter}</Text>
                        ) : null}
                        {hadith.hadith_number ? (
                            <Text style={s.metaItem}>Hadith #:  {hadith.hadith_number}</Text>
                        ) : null}
                        {hadith.grade ? (
                            <View style={s.gradeRow}>
                                <Text style={s.metaItemLabel}>Grade:</Text>
                                <View style={s.gradePill}>
                                    <Text style={s.gradePillText}>{hadith.grade}</Text>
                                </View>
                            </View>
                        ) : null}
                        {hadith.reference_full ? (
                            <Text style={s.referenceFullText}>{hadith.reference_full}</Text>
                        ) : null}
                    </View>
                </ViewShot>
                {/* ══ end ViewShot ══ */}

                {/* ── Actions (outside screenshot) ── */}
                <View style={s.actions}>
                    {/* Copy replaces Bookmark */}
                    <TouchableOpacity
                        style={[s.actionBtn, copied && s.actionBtnActive]}
                        onPress={handleCopy}
                        activeOpacity={0.75}
                    >
                        <Ionicons
                            name={copied ? 'checkmark' : 'copy-outline'}
                            size={16}
                            color={copied ? GOLD : MUTED}
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[s.actionText, copied && s.actionTextActive]}>
                            {copied ? 'Copied' : 'Copy'}
                        </Text>
                    </TouchableOpacity>

                    {/* Share as screenshot */}
                    <TouchableOpacity
                        style={s.shareBtn}
                        onPress={handleShare}
                        activeOpacity={0.75}
                    >
                        {sharing
                            ? <ActivityIndicator size="small" color={DARK} style={{ marginRight: 6 }} />
                            : <Ionicons name="share-outline" size={16} color={DARK} style={{ marginRight: 6 }} />
                        }
                        <Text style={s.shareText}>{sharing ? 'Preparing…' : 'Share'}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: DARK },

    nav: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingHorizontal: 12,
        paddingVertical: 10, borderBottomWidth: 1,
        borderBottomColor: BORDER, backgroundColor: DARK,
    },
    navBtn: {
        width: 38, height: 38, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    navBtnActive: { backgroundColor: GOLD_LIGHT },
    navCenter: { alignItems: 'center' },
    arabicAccent: { fontSize: 13, color: GOLD, opacity: 0.7, letterSpacing: 1, lineHeight: 16 },
    navTitle: { color: TEXT, fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },

    scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

    // ── ViewShot card ──
    shareCard: {
        backgroundColor: DARK,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 20,
        marginBottom: 16,
    },

    // Watermark inside screenshot
    watermarkRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 6, marginBottom: 18,
    },
    watermarkArabic: { fontSize: 13, color: GOLD, opacity: 0.6 },
    watermarkDot:    { fontSize: 13, color: MUTED },
    watermarkTitle:  { fontSize: 12, color: MUTED, letterSpacing: 0.3 },

    ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 10 },
    ruleLine: { flex: 1, height: 1, backgroundColor: BORDER },
    ruleStar: { color: GOLD, fontSize: 10, opacity: 0.6 },

    arabicBlock: { alignItems: 'center', marginBottom: 4 },
    arabic: {
        fontSize: 24, color: TEXT, textAlign: 'center',
        lineHeight: 44, writingDirection: 'rtl', letterSpacing: 0.5,
        marginBottom: 12, paddingHorizontal: 8,
    },

    sectionDivider: { height: 1, backgroundColor: BORDER, marginVertical: 20 },

    openQuote:  { fontSize: 48, color: GOLD, opacity: 0.25, lineHeight: 52, marginBottom: -4 },
    translation: {
        fontSize: 17, color: TEXT_DIM, lineHeight: 30,
        textAlign: 'left', letterSpacing: 0.2, marginBottom: 4,
    },
    closeQuote: {
        fontSize: 48, color: GOLD, opacity: 0.25,
        textAlign: 'right', lineHeight: 52, marginBottom: 28,
    },

    metaCard: {
        backgroundColor: CARD, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 18,
    },
    metaHeaderRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    metaCardTitle:   { fontSize: 9, color: GOLD, letterSpacing: 2, opacity: 0.8 },
    metaDividerLine: { height: 1, backgroundColor: BORDER, marginBottom: 14 },
    metaItem:        { color: TEXT_DIM, fontSize: 13, marginBottom: 8, lineHeight: 20 },
    metaItemLabel:   { color: TEXT_DIM, fontSize: 13, marginRight: 8 },
    gradeRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    gradePill: {
        backgroundColor: GOLD_MED, borderRadius: 6,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)',
        paddingHorizontal: 10, paddingVertical: 2,
    },
    gradePillText:     { color: GOLD, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
    referenceFullText: { color: MUTED, fontSize: 11, marginTop: 6, fontStyle: 'italic', lineHeight: 17 },

    actions: { flexDirection: 'row', gap: 12 },
    actionBtn: {
        flex: 1, flexDirection: 'row', paddingVertical: 14,
        borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    },
    actionBtnActive: { backgroundColor: GOLD_LIGHT, borderColor: 'rgba(201,168,76,0.3)' },
    actionText:      { color: MUTED, fontSize: 14, fontWeight: '500', letterSpacing: 0.3 },
    actionTextActive:{ color: GOLD },
    shareBtn: {
        flex: 1, flexDirection: 'row', paddingVertical: 14,
        borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: GOLD,
    },
    shareText: { color: DARK, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

    center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: MUTED, fontSize: 13 },
    notFound:    { color: TEXT, fontSize: 16 },
});