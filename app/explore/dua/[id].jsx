import { useEffect, useState, useRef } from "react";
import {
    View, Text, ScrollView, StyleSheet,
    StatusBar, ActivityIndicator, TouchableOpacity,
    Clipboard, Share,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import supabase from "../../../src/services/supabase";
import { isBookmarked, toggleBookmark } from "../../../src/services/bookmarks";

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.22)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';

export default function DuaDetail() {
    const insets               = useSafeAreaInsets();
    const { id }               = useLocalSearchParams();
    const [dua,     setDua]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [copied,  setCopied]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [sharing, setSharing] = useState(false);

    const shareCardRef = useRef(null);   // ← ViewShot ref

    useEffect(() => { if (id) load(); }, [id]);

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const numericId = Number(id);
            if (!numericId || isNaN(numericId)) throw new Error("Invalid ID");
            const { data, error: err } = await supabase
                .from("duas").select("*").eq("id", numericId).single();
            if (err) throw err;
            setDua(data);
            setSaved(await isBookmarked(data.id, 'dua'));
        } catch (e) {
            setError("Could not load this dua.");
        } finally {
            setLoading(false);
        }
    };

    const handleBookmark = async () => setSaved(await toggleBookmark(dua.id, 'dua'));

    const handleCopyTranslation = () => {
        if (!dua?.translation) return;
        const text = [
            dua.title   ? `${dua.title}\n`           : '',
            dua.arabic  ? `${dua.arabic}\n\n`        : '',
            dua.translation || '',
            dua.reference ? `\n— ${dua.reference}`  : '',
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
            // Capture the ViewShot as a PNG
            const uri = await shareCardRef.current.capture();
            // expo-sharing works on both iOS & Android
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: "image/png",
                    dialogTitle: dua?.title ?? "Share Dua",
                });
            }
        } catch (e) {
            console.warn("Share screenshot:", e.message);
        } finally {
            setSharing(false);
        }
    };

    if (loading) return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />
            <View style={s.center}>
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={s.loadingText}>Loading…</Text>
            </View>
        </View>
    );

    if (error || !dua) return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} translucent />
            <View style={s.center}>
                <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
                <Text style={s.notFound}>{error ?? "Dua not found"}</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: GOLD, marginTop: 8 }}>Go back</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

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
                    <Text style={s.arabicAccent}>دعاء</Text>
                    <Text style={s.navTitle} numberOfLines={1}>{dua.title ?? 'Dua'}</Text>
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
                    ViewShot wraps ONLY the content to screenshot
                ══════════════════════════════════════════════════ */}
                <ViewShot
                    ref={shareCardRef}
                    options={{ format: "png", quality: 1 }}
                    style={s.shareCard}
                >
                    {/* App watermark inside screenshot */}
                    <View style={s.watermarkRow}>
                        <Text style={s.watermarkArabic}>دعاء</Text>
                        <Text style={s.watermarkDot}>·</Text>
                        <Text style={s.watermarkTitle}>{dua.title ?? 'Dua'}</Text>
                    </View>

                    {/* Decorative rule */}
                    <View style={s.ruleRow}>
                        <View style={s.ruleLine} />
                        <Text style={s.ruleStar}>✦</Text>
                        <View style={s.ruleLine} />
                    </View>

                    {/* Arabic */}
                    {dua.arabic ? (
                        <View style={s.arabicBlock}>
                            <Text style={s.arabic}>{dua.arabic}</Text>
                        </View>
                    ) : null}

                    {dua.arabic ? <View style={s.sectionDivider} /> : null}

                    {/* Transliteration */}
                    {dua.transliteration ? (
                        <>
                            <View style={s.sectionLabelRow}>
                                <Text style={s.sectionLabel}>TRANSLITERATION</Text>
                            </View>
                            <Text style={s.transliteration}>{dua.transliteration}</Text>
                            <View style={s.sectionDivider} />
                        </>
                    ) : null}

                    {/* Translation */}
                    <Text style={s.openQuote}>❝</Text>
                    <Text style={s.translation}>{dua.translation ?? 'Translation not available'}</Text>
                    <Text style={s.closeQuote}>❞</Text>

                    {/* Benefit */}
                    {(dua.benefit || dua.note) ? (
                        <View style={s.benefitCard}>
                            <Ionicons name="sparkles-outline" size={14} color={GOLD} style={{ marginTop: 1 }} />
                            <Text style={s.benefitText}>{dua.benefit ?? dua.note}</Text>
                        </View>
                    ) : null}

                    {/* Reference */}
                    <View style={s.metaCard}>
                        <View style={s.metaHeaderRow}>
                            <Ionicons name="library-outline" size={13} color={GOLD}
                                      style={{ marginRight: 6, opacity: 0.7 }} />
                            <Text style={s.metaCardTitle}>REFERENCE</Text>
                        </View>
                        <View style={s.metaDividerLine} />
                        {dua.reference ? <Text style={s.metaItem}>{dua.reference}</Text> : null}
                        {dua.tags?.length > 0 ? (
                            <View style={s.tagsRow}>
                                {dua.tags.map((tag, i) => (
                                    <View key={i} style={s.tag}>
                                        <Text style={s.tagText}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                </ViewShot>
                {/* ══ end ViewShot ══ */}

                {/* ── Actions (outside screenshot) ── */}
                <View style={s.actions}>
                    <TouchableOpacity style={s.actionBtn} onPress={handleCopyTranslation} activeOpacity={0.75}>
                        <Ionicons name={copied ? 'checkmark' : 'copy-outline'}
                                  size={16} color={copied ? GOLD : MUTED} style={{ marginRight: 6 }} />
                        <Text style={[s.actionText, copied && s.actionTextActive]}>
                            {copied ? 'Copied' : 'Copy'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.75}>
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
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: DARK,
    },
    navBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    navBtnActive: { backgroundColor: GOLD_LIGHT },
    navCenter: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
    arabicAccent: { fontSize: 13, color: GOLD, opacity: 0.7, letterSpacing: 1, lineHeight: 16 },
    navTitle: { color: TEXT, fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },

    scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

    // ── ViewShot card — solid bg so screenshot looks clean ──
    shareCard: {
        backgroundColor: DARK,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 20,
        marginBottom: 16,
    },

    // Watermark row inside screenshot
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
    sectionLabelRow: { marginBottom: 8 },
    sectionLabel: { fontSize: 9, color: MUTED, letterSpacing: 2.5, fontWeight: '700' },

    transliteration: {
        fontSize: 15, color: TEXT_DIM, lineHeight: 26,
        fontStyle: 'italic', marginBottom: 4,
    },

    openQuote:  { fontSize: 48, color: GOLD, opacity: 0.25, lineHeight: 52, marginBottom: -4 },
    translation: {
        fontSize: 17, color: TEXT_DIM, lineHeight: 30,
        textAlign: 'left', letterSpacing: 0.2, marginBottom: 4,
    },
    closeQuote: {
        fontSize: 48, color: GOLD, opacity: 0.25,
        textAlign: 'right', lineHeight: 52, marginBottom: 28,
    },

    benefitCard: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: GOLD_LIGHT, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: GOLD_MED, marginBottom: 16,
    },
    benefitText: { flex: 1, fontSize: 13, color: TEXT_DIM, lineHeight: 20 },

    metaCard: {
        backgroundColor: CARD, borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, padding: 16,
    },
    metaHeaderRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    metaCardTitle:   { fontSize: 9, color: GOLD, letterSpacing: 2, opacity: 0.8 },
    metaDividerLine: { height: 1, backgroundColor: BORDER, marginBottom: 12 },
    metaItem:        { color: TEXT_DIM, fontSize: 13, marginBottom: 8, lineHeight: 20 },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    tag: {
        backgroundColor: GOLD_LIGHT, borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderColor: GOLD_MED,
    },
    tagText: { fontSize: 11, color: GOLD },

    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    actionBtn: {
        flex: 1, flexDirection: 'row', paddingVertical: 13,
        borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    },
    actionText: { color: MUTED, fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
    actionTextActive: { color: GOLD },
    shareBtn: {
        flex: 1, flexDirection: 'row', paddingVertical: 13,
        borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: GOLD,
    },
    shareText: { color: DARK, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: MUTED, fontSize: 13 },
    notFound: { color: TEXT, fontSize: 16 },
});