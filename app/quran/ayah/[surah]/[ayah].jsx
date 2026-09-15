/**
 * app/quran/ayah/[surah]/[ayah].jsx
 *
 * Deep-link screen for a specific ayah.
 * Audio is intentionally NOT played from this screen.
 * Playback is handled exclusively by the persistent Quran Player / AudioStore.
 */

import {
    View, Text, TouchableOpacity, ActivityIndicator,
    StyleSheet, StatusBar, Share, ScrollView,
    Platform, ToastAndroid, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAyahTafsir } from '../../../../src/services/quranApi';
import supabase from '../../../../src/services/supabase';
import { getDeviceId } from '../../../../src/utils/device';

// ── Design tokens ─────────────────────────────────────────────────────────────
const DARK       = '#0C1520';
const CARD       = '#111C26';
const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.20)';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';

// ── API configuration ──────────────────────────────────────────────────────────
// Used only for loading the ayah's text/translation. Audio playback is handled
// exclusively by the persistent Quran Player / AudioStore.
const BASE_URL = 'https://ummahapi.com/api/quran';
const API_KEY  = process.env.EXPO_PUBLIC_UMMAH_API_KEY;
const hdrs     = API_KEY ? { 'X-API-Key': API_KEY } : {};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AyahScreen() {
    const {
        surah, ayah,
        prefill_arabic, prefill_translation, prefill_transliteration, prefill_surah_name,
    } = useLocalSearchParams();
    const insets = useSafeAreaInsets();

    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [tafsir, setTafsir]   = useState(null);
    const [tafsirLoading, setTafsirLoading] = useState(false);
    const [showTafsir, setShowTafsir] = useState(false);
    const [bookmarked, setBookmarked]     = useState(false);
    const [bookmarkBusy, setBookmarkBusy] = useState(false);

    // The view captured as an image when sharing
    const shareCardRef = useRef(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        // `btoa`/`atob` (used previously) aren't reliably available on
        // React Native/Hermes, so plain encodeURIComponent/decodeURIComponent
        // is used instead — always available and URL-safe.
        const decodeParam = (s) => {
            try {
                if (!s || String(s).length === 0) return '';
                return decodeURIComponent(String(s));
            } catch (_) { return String(s ?? ''); }
        };

        const arabic = decodeParam(prefill_arabic);
        if (arabic.length > 0) {
            setData({
                arabic_text:     arabic,
                translation:     decodeParam(prefill_translation),
                transliteration: prefill_transliteration ? decodeParam(prefill_transliteration) : null,
                surah_name:      prefill_surah_name ? decodeParam(prefill_surah_name) : null,
                surah_number:    parseInt(surah, 10),
                ayah_number:     parseInt(ayah, 10),
                audio:           null,
            });
            setLoading(false);
        } else {
            fetchAyah();
        }

    }, [surah, ayah]);

    // ── Bookmark ──────────────────────────────────────────────────────────────

    useEffect(() => {
        checkBookmark();
    }, [surah, ayah]);

    const checkBookmark = async () => {
        try {
            const device_id = await getDeviceId();
            const { data: row } = await supabase
                .from('quran_bookmarks')
                .select('id')
                .eq('device_id', device_id)
                .eq('surah_number', parseInt(surah, 10))
                .eq('ayah_number', parseInt(ayah, 10))
                .maybeSingle();
            setBookmarked(!!row);
        } catch (_) {}
    };

    const toggleBookmark = async () => {
        if (bookmarkBusy) return;
        setBookmarkBusy(true);
        const wasBookmarked = bookmarked;
        try {
            const device_id = await getDeviceId();
            const surahNum  = parseInt(surah, 10);
            const ayahNum   = parseInt(ayah, 10);

            if (wasBookmarked) {
                await supabase.from('quran_bookmarks').delete()
                    .eq('device_id', device_id)
                    .eq('surah_number', surahNum)
                    .eq('ayah_number', ayahNum);
                setBookmarked(false);
            } else {
                await supabase.from('quran_bookmarks').insert({
                    device_id, surah_number: surahNum, ayah_number: ayahNum,
                });
                setBookmarked(true);
            }

            if (Platform.OS === 'android') {
                ToastAndroid.show(wasBookmarked ? 'Bookmark removed' : 'Ayah bookmarked', ToastAndroid.SHORT);
            }
        } catch (e) {
            console.error('[Bookmark]', e);
            Alert.alert('Error', 'Could not update bookmark.');
        } finally {
            setBookmarkBusy(false);
        }
    };

    // ── Fetch ayah data ───────────────────────────────────────────────────────

    const fetchAyah = async () => {
        try {
            setError(null);
            setLoading(true);

            // Try single-ayah endpoint
            let json = null;
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 10000);
                const res = await fetch(
                    `${BASE_URL}/surah/${surah}/ayah/${ayah}`,
                    { headers: hdrs, signal: ctrl.signal }
                );
                clearTimeout(t);
                if (res.ok) json = await res.json();
            } catch (_) {}

            if (json?.success && json?.data?.verse) {
                const verse = json.data.verse;
                const surahInfo = json.data.surah;

                setData({
                    arabic_text: verse.arabic ?? '',
                    translation:
                        verse.translations?.sahih_international ??
                        '',
                    transliteration: verse.transliteration ?? null,

                    surah_name:
                        surahInfo?.name_english ??
                        surahInfo?.name_translation ??
                        null,

                    surah_number:
                        Number(surahInfo?.number ?? surah),

                    ayah_number:
                        Number(verse.ayah ?? ayah),

                    audio: json.data.audio ?? null,
                });

                return;
            }

            // Fallback: fetch full surah and find the ayah
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 12000);
            const surahRes  = await fetch(`${BASE_URL}/surah/${surah}`, { headers: hdrs, signal: ctrl2.signal });
            clearTimeout(t2);
            const surahJson = await surahRes.json();
            if (surahJson?.success && surahJson.data) {
                const verses  = surahJson.data.verses ?? surahJson.data.ayahs ?? [];
                const ayahInt = parseInt(ayah, 10);
                const found   = verses.find(v =>
                    (v.verse_number ?? v.ayah_number ?? v.number ?? v.id) === ayahInt
                );
                if (found) {
                    setData({
                        arabic_text:     found.arabic ?? found.arabic_text ?? found.text_uthmani ?? '',
                        transliteration: found.transliteration ?? null,
                        translation:     found.translations?.sahih_international ?? found.translation ?? '',
                        surah_number:    parseInt(surah, 10),
                        ayah_number:     ayahInt,
                        audio:           found.audio ?? null,
                    });
                    return;
                }
            }
            setError('Could not load ayah.');
        } catch (e) {
            console.error('[AyahScreen]', e);
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    // ── Tafsir ────────────────────────────────────────────────────────────────

    const loadTafsir = async () => {
        if (tafsir !== null) { setShowTafsir(true); return; }
        setTafsirLoading(true);
        const surahId = parseInt(surah, 10);
        const ayahId  = parseInt(ayah,  10);
        const sources = ['muyassar', 'maarif-ul-quran'];
        let found = null;

        // Safely extract a displayable string from nested API objects.
        // Handles shapes like { text }, { text: { text } }, { tafsir },
        // { content }, { description } — recursing until a real string
        // is found, so `<Text>` never receives a raw object.
        const extractText = (value) => {
            if (value == null) return null;

            if (typeof value === 'string') {
                return value.trim().length > 0 ? value : null;
            }

            if (typeof value === 'object') {
                return (
                    extractText(value.text) ??
                    extractText(value.tafsir) ??
                    extractText(value.content) ??
                    extractText(value.description) ??
                    null
                );
            }

            return null;
        };

        for (const src of sources) {
            try {
                const json = await getAyahTafsir(surahId, ayahId, src);
                if (json?.success && json.data) {
                    const raw = json.data;
                    let text  = null;

                    if (Array.isArray(raw)) {
                        for (const entry of raw) {
                            text = extractText(entry);
                            if (text) break;
                        }
                    } else {
                        text = extractText(raw);
                    }

                    if (text) { found = text; break; }
                }
            } catch (e) {
                console.warn(`[Tafsir] ${src} failed`, e);
            }
        }

        setTafsir({ text: found ?? null });
        setTafsirLoading(false);
        setShowTafsir(true);
    };

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleCopy = async () => {
        if (!data) return;
        const text = `${data.arabic_text}\n\n"${data.translation}"\n— Quran ${surah}:${ayah}`;
        try {
            await Clipboard.setStringAsync(text);
            if (Platform.OS === 'android') ToastAndroid.show('Copied!', ToastAndroid.SHORT);
            else Alert.alert('Copied', 'Ayah copied to clipboard.');
        } catch (e) { console.error('[Copy]', e); }
    };

    const handleShare = async () => {
        if (!data || !shareCardRef.current || sharing) return;
        setSharing(true);
        try {
            const uri = await captureRef(shareCardRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
            });

            const available = await Sharing.isAvailableAsync();
            if (available) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: `Quran ${surah}:${ayah}`,
                });
            } else {
                // Rare fallback (expo-sharing unavailable on this device) — RN's
                // built-in Share only handles a local file this way on iOS.
                await Share.share({ url: uri, message: `Quran ${surah}:${ayah}` });
            }
        } catch (e) {
            console.error('[ShareImage]', e);
            Alert.alert('Could not share', 'Something went wrong creating the image. Please try again.');
        } finally {
            setSharing(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <View style={[s.root, s.center, { paddingTop: insets.top }]}>
                <StatusBar barStyle="light-content" backgroundColor={DARK} />
                <ActivityIndicator size="large" color={GOLD} />
                <Text style={s.loadingText}>Loading ayah…</Text>
            </View>
        );
    }

    if (error || !data) {
        return (
            <View style={[s.root, s.center, { paddingTop: insets.top }]}>
                <StatusBar barStyle="light-content" backgroundColor={DARK} />
                <Ionicons name="alert-circle-outline" size={44} color={MUTED} />
                <Text style={s.errorText}>{error || 'Ayah not found.'}</Text>
                <TouchableOpacity style={s.retryBtn} onPress={fetchAyah}>
                    <Text style={s.retryText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* Top bar */}
            <View style={s.topBar}>
                <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={22} color={GOLD} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Quran {surah}:{ayah}</Text>
                <View style={s.topBarRight}>
                    <TouchableOpacity style={s.iconBtn} onPress={toggleBookmark} disabled={bookmarkBusy}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        {bookmarkBusy
                            ? <ActivityIndicator size="small" color={GOLD} />
                            : <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={19} color={GOLD} />
                        }
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => router.push(`/quran/surah/${surah}`)}
                                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="list-outline" size={20} color={GOLD} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={s.scroll}
                contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Everything inside this wrapper is what gets captured for Share */}
                <View ref={shareCardRef} collapsable={false} style={s.shareCard}>
                    {/* Arabic */}
                    <View style={s.arabicCard}>
                        <Text style={s.arabicText}>{data.arabic_text}</Text>
                    </View>

                    {/* Transliteration */}
                    {data.transliteration ? <Text style={s.translitText}>{data.transliteration}</Text> : null}

                    {/* Translation */}
                    <View style={s.translationCard}>
                        <Text style={s.translationLabel}>Translation</Text>
                        <Text style={s.translationText}>{data.translation}</Text>
                    </View>

                    {/* Reference — keeps the image self-contained once shared outside the app */}
                    <Text style={s.shareRef}>Quran {surah}:{ayah}</Text>
                </View>

                {/* Action buttons */}
                <View style={s.actionsRow}>
                    <TouchableOpacity style={s.actionPill} onPress={handleCopy}>
                        <Ionicons name="copy-outline" size={16} color={GOLD} />
                        <Text style={s.actionPillText} numberOfLines={1}>Copy</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionPill} onPress={handleShare} disabled={sharing}>
                        {sharing
                            ? <ActivityIndicator size="small" color={GOLD} />
                            : <Ionicons name="share-outline" size={16} color={GOLD} />
                        }
                        <Text style={s.actionPillText} numberOfLines={1}>{sharing ? 'Preparing…' : 'Share'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionPill} onPress={loadTafsir}>
                        {tafsirLoading
                            ? <ActivityIndicator size="small" color={GOLD} />
                            : <Ionicons name="book-outline" size={16} color={GOLD} />
                        }
                        <Text style={s.actionPillText} numberOfLines={1}>Tafsir</Text>
                    </TouchableOpacity>
                </View>

                {/* Tafsir section */}
                {showTafsir && (
                    <View style={s.tafsirSection}>
                        <View style={s.tafsirHeader}>
                            <Text style={s.tafsirTitle}>Tafsir</Text>
                            <TouchableOpacity onPress={() => setShowTafsir(false)}>
                                <Ionicons name="chevron-up" size={18} color={MUTED} />
                            </TouchableOpacity>
                        </View>
                        {tafsir?.text
                            ? <Text style={s.tafsirText}>{String(tafsir.text)}</Text>
                            : <Text style={s.tafsirEmpty}>Tafsir currently unavailable.</Text>
                        }
                    </View>
                )}

                {/* Navigate to full surah */}
                <TouchableOpacity style={s.surahBtn} onPress={() => router.push(`/quran/surah/${surah}`)}>
                    <Text style={s.surahBtnText}>View Full Surah</Text>
                    <Ionicons name="arrow-forward" size={16} color={GOLD} />
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:    { flex: 1, backgroundColor: DARK },
    center:  { alignItems: 'center', justifyContent: 'center', gap: 12 },
    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    iconBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GOLD_LIGHT, alignItems: 'center', justifyContent: 'center',
    },
    topBarRight: { flexDirection: 'row', gap: 8 },
    topTitle:    { color: GOLD, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
    scroll:      { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },
    arabicCard: {
        backgroundColor: CARD, borderRadius: 20, padding: 24,
        borderWidth: 1, borderColor: BORDER,
    },
    arabicText: {
        fontFamily: 'Uthmanic', fontSize: 30, color: TEXT,
        textAlign: 'right', lineHeight: 58,
    },
    translitText: {
        color: MUTED, fontSize: 14, fontStyle: 'italic',
        textAlign: 'center', lineHeight: 22,
    },
    translationCard: {
        backgroundColor: CARD, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: BORDER,
    },
    translationLabel: {
        color: GOLD, fontSize: 11, fontWeight: '700',
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
    },
    translationText: { color: TEXT_DIM, fontSize: 16, lineHeight: 28 },
    // Wraps arabic/transliteration/translation — this exact View is what gets
    // captured to PNG for sharing, so it also needs its own internal spacing
    // now that these are no longer direct children of scrollContent's gap.
    shareCard: { gap: 16 },
    shareRef: {
        color: GOLD, fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
        textAlign: 'center', opacity: 0.55, marginTop: 2,
    },
    actionsRow: { flexDirection: 'row', gap: 8 },
    actionPill: {
        flex: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        backgroundColor: GOLD_LIGHT, borderRadius: 10,
        paddingHorizontal: 6, paddingVertical: 10,
        borderWidth: 1, borderColor: GOLD_MED,
    },
    actionPillText:   { color: GOLD, fontSize: 12, fontWeight: '600' },
    tafsirSection: {
        backgroundColor: CARD, borderRadius: 16, padding: 18,
        borderWidth: 1, borderColor: BORDER,
    },
    tafsirHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
    },
    tafsirTitle: { color: GOLD, fontSize: 14, fontWeight: '700' },
    tafsirText:  { color: TEXT_DIM, fontSize: 14, lineHeight: 24 },
    tafsirEmpty: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
    surahBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: GOLD_LIGHT, borderRadius: 14, paddingVertical: 14,
        borderWidth: 1, borderColor: GOLD_MED, marginTop: 4,
    },
    surahBtnText: { color: GOLD, fontSize: 15, fontWeight: '700' },
    loadingText:  { color: MUTED, fontSize: 13 },
    errorText:    { color: TEXT_DIM, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retryBtn: {
        backgroundColor: GOLD_LIGHT, borderRadius: 10,
        paddingHorizontal: 24, paddingVertical: 10,
        borderWidth: 1, borderColor: GOLD_MED,
    },
    retryText: { color: GOLD, fontWeight: '700', fontSize: 14 },
});