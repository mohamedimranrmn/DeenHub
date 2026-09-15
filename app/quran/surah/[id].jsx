/**
 * app/quran/surah/[id].jsx
 *
 * Surah reader screen. Audio is driven entirely by AudioStore (singleton).
 * - Reads audio from UmmahAPI using the saved reciter ID
 * - Fixed word-by-word modal (safe null checks, correct field mapping)
 * - Fixed tafsir (correct endpoint, multiple source fallback, per-source cache)
 * - Mini player bar at bottom → tap to open full player screen
 * - No ayah-level shuffle (shuffle is surah-level, in index.jsx)
 * - Background audio: AudioStore keeps playing after navigation
 *
 * Fix vs previous version:
 * - scrollToIndex wrapped in try/catch (it returns void, not a Promise)
 * - reciter resolution delegated to AudioStore.playSurah (no duplicate
 *   AsyncStorage reads in this file)
 * - Tafsir crash fixed: loadTafsir now deep-normalizes nested API objects
 *   ({ text }, { text: { text } }, { tafsir }, etc.) into a plain string
 *   before it ever reaches <Text>.
 * - Ayah-level bookmarking added (Play → Word → Tafsir → Copy → Bookmark).
 *   Share removed from the Ayah card. Uses the same `quran_bookmarks`
 *   table as the Surah list (surah_number set, ayah_number set = ayah
 *   bookmark; ayah_number NULL = surah bookmark).
 */

import {
    View, Text, FlatList, TouchableOpacity, ActivityIndicator,
    StyleSheet, StatusBar, Modal, ScrollView,
    Platform, ToastAndroid, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSurah, getAyahWords, getAyahTafsir } from '../../../src/services/quranApi';
import AudioStore, { ayahNum } from '../../../src/services/audioStore';
import supabase from '../../../src/services/supabase';
import { getDeviceId } from '../../../src/utils/device';

// ── Design tokens ─────────────────────────────────────────────────────────────
const DARK        = '#0C1520';
const CARD        = '#111C26';
const CARD_ALT    = '#152030';
const GOLD        = '#C9A84C';
const GOLD_LIGHT  = 'rgba(201,168,76,0.10)';
const GOLD_MED    = 'rgba(201,168,76,0.20)';
const GOLD_BRIGHT = 'rgba(201,168,76,0.40)';
const GREEN       = '#4CAF50';
const TEXT        = '#F0EAD6';
const TEXT_DIM    = '#C8B99A';
const MUTED       = '#5A6A7A';
const BORDER      = 'rgba(201,168,76,0.12)';
const PLAYER_BG   = '#080F17';

// ── Helpers ───────────────────────────────────────────────────────────────────
const extractAyahs = (data) => {
    if (!data) return [];
    if (Array.isArray(data.verses)) return data.verses;
    if (Array.isArray(data.ayahs))  return data.ayahs;
    return [];
};

const fmt = (ms) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Word-by-Word Modal ────────────────────────────────────────────────────────
/**
 * WordModal
 * • Shows all words in a scrollable wrap-grid.
 * • Tapping any word card EXPANDS it into a full-screen overlay with blurred
 *   background, showing the complete arabic / transliteration / meaning.
 * • Tapping outside the expanded card collapses it.
 */
const WordModal = ({ visible, surahId, ayah, onClose }) => {
    const [words, setWords]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(null);
    const [expanded, setExpanded]   = useState(null); // index of expanded word
    const insets = useSafeAreaInsets();
    const num = ayah ? ayahNum(ayah) : null;

    useEffect(() => {
        if (visible && ayah && num) {
            fetchWords();
        } else {
            setWords([]);
            setError(null);
            setExpanded(null);
        }
    }, [visible, ayah]);

    const fetchWords = async () => {
        setLoading(true);
        setWords([]);
        setError(null);
        setExpanded(null);
        try {
            const json = await getAyahWords(surahId, num);
            const raw  = json?.data?.words ?? json?.data ?? [];
            const list = Array.isArray(raw) ? raw : [];
            if (list.length === 0) setError('No word data available for this ayah.');
            else setWords(list);
        } catch (e) {
            console.error('[WordModal]', e);
            setError('Could not load word data. Check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const toStr = (v) =>
        v == null ? '' :
            typeof v === 'object' ? (v.text ?? v.name ?? JSON.stringify(v)) :
                String(v);

    const expandedWord = expanded !== null ? words[expanded] : null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={() => {
                if (expanded !== null) setExpanded(null);
                else onClose();
            }}
            statusBarTranslucent
        >
            <View style={ms.overlay}>
                {/* Dim backdrop — tap closes the sheet (or collapsed expanded card) */}
                <TouchableOpacity
                    style={ms.backdrop}
                    activeOpacity={1}
                    onPress={() => {
                        if (expanded !== null) setExpanded(null);
                        else onClose();
                    }}
                />

                {/* ── Bottom sheet ── */}
                <View style={[ms.sheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={ms.handle} />
                    <View style={ms.header}>
                        <Text style={ms.title}>Word by Word — {surahId}:{num}</Text>
                        <TouchableOpacity
                            onPress={() => {
                                if (expanded !== null) setExpanded(null);
                                else onClose();
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons
                                name={expanded !== null ? 'arrow-back-circle' : 'close-circle'}
                                size={24}
                                color={MUTED}
                            />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={ms.center}>
                            <ActivityIndicator color={GOLD} size="large" />
                            <Text style={ms.hint}>Loading word data…</Text>
                        </View>
                    ) : error ? (
                        <View style={ms.center}>
                            <Ionicons name="alert-circle-outline" size={32} color={MUTED} />
                            <Text style={ms.emptyText}>{error}</Text>
                            <TouchableOpacity style={ms.retryBtn} onPress={fetchWords}>
                                <Text style={ms.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={ms.wordGrid}>
                                {words.map((w, i) => {
                                    const arabic   = toStr(w.arabic ?? w.text_arabic ?? w.char_type_name ?? w.text);
                                    const translit = toStr(w.transliteration ?? w.translit ?? w.char_type);
                                    const meaning  = toStr(w.translation ?? w.meaning ?? w.english ?? w.text_translation);

                                    return (
                                        <TouchableOpacity
                                            key={i}
                                            style={ms.wordCell}
                                            onPress={() => setExpanded(i)}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={ms.wordArabic}>{arabic}</Text>
                                            {translit.length > 0 && (
                                                <Text style={ms.wordTranslit}>{translit}</Text>
                                            )}
                                            {meaning.length > 0 && (
                                                <Text style={ms.wordMeaning} numberOfLines={2}>{meaning}</Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    )}
                </View>

                {/* ── Expanded word overlay (rendered INSIDE the Modal so it covers the sheet) ── */}
                {expandedWord !== null && (
                    <>
                        {/* Blurred / dimmed overlay — tap anywhere outside the card to collapse */}
                        <TouchableOpacity
                            style={ms.expandBackdrop}
                            activeOpacity={1}
                            onPress={() => setExpanded(null)}
                        />

                        <View style={ms.expandCard} pointerEvents="box-none">
                            {/* Dismiss button */}
                            <TouchableOpacity
                                style={ms.expandClose}
                                onPress={() => setExpanded(null)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons name="close-circle" size={28} color={MUTED} />
                            </TouchableOpacity>

                            {/* Word number badge */}
                            <View style={ms.expandBadge}>
                                <Text style={ms.expandBadgeText}>
                                    Word {expanded + 1} of {words.length}
                                </Text>
                            </View>

                            {/* Arabic */}
                            <Text style={ms.expandArabic}>
                                {toStr(expandedWord.arabic ?? expandedWord.text_arabic ?? expandedWord.char_type_name ?? expandedWord.text)}
                            </Text>

                            {/* Transliteration */}
                            {(() => {
                                const t = toStr(expandedWord.transliteration ?? expandedWord.translit ?? expandedWord.char_type);
                                return t.length > 0 ? (
                                    <Text style={ms.expandTranslit}>{t}</Text>
                                ) : null;
                            })()}

                            {/* Meaning — full, no numberOfLines cap */}
                            {(() => {
                                const m = toStr(expandedWord.translation ?? expandedWord.meaning ?? expandedWord.english ?? expandedWord.text_translation);
                                return m.length > 0 ? (
                                    <Text style={ms.expandMeaning}>{m}</Text>
                                ) : null;
                            })()}

                            {/* Prev / Next navigation inside expanded view */}
                            <View style={ms.expandNav}>
                                <TouchableOpacity
                                    style={[ms.expandNavBtn, expanded === 0 && ms.expandNavBtnDisabled]}
                                    onPress={() => setExpanded(Math.max(0, expanded - 1))}
                                    disabled={expanded === 0}
                                >
                                    <Ionicons name="chevron-back" size={20} color={expanded === 0 ? MUTED : GOLD} />
                                    <Text style={[ms.expandNavText, expanded === 0 && { color: MUTED }]}>Prev</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[ms.expandNavBtn, expanded === words.length - 1 && ms.expandNavBtnDisabled]}
                                    onPress={() => setExpanded(Math.min(words.length - 1, expanded + 1))}
                                    disabled={expanded === words.length - 1}
                                >
                                    <Text style={[ms.expandNavText, expanded === words.length - 1 && { color: MUTED }]}>Next</Text>
                                    <Ionicons name="chevron-forward" size={20} color={expanded === words.length - 1 ? MUTED : GOLD} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                )}
            </View>
        </Modal>
    );
};

const ms = StyleSheet.create({
    overlay:     { flex: 1, justifyContent: 'flex-end' },
    backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
    sheet: {
        backgroundColor: CARD, borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingHorizontal: 16, paddingTop: 12, maxHeight: '88%',
        borderTopWidth: 1, borderColor: BORDER,
    },
    handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: MUTED, alignSelf: 'center', marginBottom: 16 },
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title:       { color: GOLD, fontSize: 15, fontWeight: '700' },
    center:      { paddingVertical: 48, alignItems: 'center', gap: 12 },
    hint:        { color: MUTED, fontSize: 12, marginTop: 8 },
    emptyText:   { color: TEXT_DIM, fontSize: 13, textAlign: 'center' },
    retryBtn:    { backgroundColor: GOLD_LIGHT, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1, borderColor: GOLD_MED, marginTop: 4 },
    retryText:   { color: GOLD, fontWeight: '700', fontSize: 13 },
    wordGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
    wordCell: {
        backgroundColor: DARK, borderRadius: 14, padding: 12,
        alignItems: 'center', minWidth: 80, maxWidth: 120,
        borderWidth: 1, borderColor: BORDER, flex: 1,
    },
    wordArabic:  { fontFamily: 'Uthmanic', fontSize: 22, color: TEXT, marginBottom: 6, textAlign: 'center', lineHeight: 44 },
    wordTranslit:{ color: MUTED, fontSize: 11, fontStyle: 'italic', marginBottom: 4, textAlign: 'center' },
    wordMeaning: { color: TEXT_DIM, fontSize: 11, textAlign: 'center', lineHeight: 16 },

    // ── Expanded word overlay ──────────────────────────────────────────────────
    expandBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(8,12,20,0.82)',
    },
    expandCard: {
        position: 'absolute',
        left: 24, right: 24,
        top: '18%',
        backgroundColor: '#111C26',
        borderRadius: 28,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.35)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.7,
        shadowRadius: 32,
        elevation: 24,
    },
    expandClose: {
        position: 'absolute', top: 14, right: 14,
    },
    expandBadge: {
        backgroundColor: 'rgba(201,168,76,0.12)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.25)',
        marginBottom: 20,
    },
    expandBadgeText: { color: GOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    expandArabic: {
        fontFamily: 'Uthmanic',
        fontSize: 48,
        color: '#F0EAD6',
        textAlign: 'center',
        lineHeight: 88,
        marginBottom: 8,
    },
    expandTranslit: {
        color: MUTED,
        fontSize: 15,
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 12,
        lineHeight: 22,
    },
    expandMeaning: {
        color: '#C8B99A',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 26,
        marginBottom: 20,
        paddingHorizontal: 4,
    },
    expandNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 4,
    },
    expandNavBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(201,168,76,0.10)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(201,168,76,0.20)',
    },
    expandNavBtnDisabled: { opacity: 0.35 },
    expandNavText: { color: GOLD, fontWeight: '700', fontSize: 13 },
});

// ── Tafsir Modal ──────────────────────────────────────────────────────────────
// Single tafsir source — muyassar is more reliable than ibn-kathir on this API
const TAFSIR_SOURCE = 'muyassar';

const TafsirModal = ({ visible, ayah, surahId, onClose }) => {
    const [tafsirText, setTafsirText] = useState(null);   // string | null
    const [loading, setLoading]       = useState(false);
    const [loaded, setLoaded]         = useState(false);  // true once fetched (even if null)
    const insets = useSafeAreaInsets();
    const num    = ayah ? ayahNum(ayah) : null;

    const arabicText  = ayah?.arabic ?? ayah?.arabic_text ?? ayah?.text_uthmani ?? '';
    // translations may be an object — extract the string value safely
    const _trans = ayah?.translations?.sahih_international
        ?? ayah?.translations?.yusuf_ali
        ?? ayah?.translation
        ?? '';
    const translation = typeof _trans === 'string' ? _trans
        : (_trans && typeof _trans === 'object') ? (_trans.text ?? _trans.name ?? '') : '';

    useEffect(() => {
        if (visible && ayah && num) {
            if (!loaded) loadTafsir();
        } else {
            setTafsirText(null);
            setLoaded(false);
        }
    }, [visible, ayah]);

    const loadTafsir = async () => {
        setLoading(true);

        const sources = [TAFSIR_SOURCE, 'maarif-ul-quran'];
        let found = null;

        // Safely extract a displayable string from nested API objects.
        const extractText = (value) => {
            if (value == null) return null;

            if (typeof value === 'string') {
                return value.trim().length > 0 ? value : null;
            }

            if (typeof value === 'object') {
                // Common API shapes:
                // { text: "..." }
                // { text: { text: "..." } }
                // { tafsir: "..." }
                // { name: "...", text: "..." }
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
                const json = await getAyahTafsir(surahId, num, src);
                const raw = json?.data;

                let text = null;

                if (Array.isArray(raw)) {
                    for (const entry of raw) {
                        text = extractText(entry);
                        if (text) break;
                    }
                } else {
                    text = extractText(raw);
                }

                if (text) {
                    found = text;
                    break;
                }
            } catch (e) {
                console.warn(`[Tafsir] ${src} failed`, e);
            }
        }

        setTafsirText(found);
        setLoaded(true);
        setLoading(false);
    };

    const renderTafsir = () => {
        if (loading) {
            return (
                <View style={tm.center}>
                    <ActivityIndicator color={GOLD} />
                </View>
            );
        }

        if (!tafsirText) {
            return (
                <Text style={tm.empty}>
                    Tafsir currently unavailable for this ayah.
                </Text>
            );
        }

        return (
            <Text style={tm.bodyText}>
                {String(tafsirText)}
            </Text>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
            <View style={tm.overlay}>
                <TouchableOpacity style={tm.backdrop} activeOpacity={1} onPress={onClose} />
                <View style={[tm.sheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={tm.handle} />
                    <View style={tm.header}>
                        <Text style={tm.title}>Ayah {surahId}:{num}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle" size={24} color={MUTED} />
                        </TouchableOpacity>
                    </View>

                    {!!arabicText  && <Text style={tm.arabic}>{arabicText}</Text>}
                    {!!translation && <Text style={tm.translation} numberOfLines={3}>{translation}</Text>}
                    <View style={tm.divider} />

                    <Text style={tm.tafsirLabel}>Tafsir</Text>

                    <ScrollView style={tm.scroll} showsVerticalScrollIndicator={false}>
                        {renderTafsir()}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const tm = StyleSheet.create({
    overlay:     { flex: 1, justifyContent: 'flex-end' },
    backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
    sheet: {
        backgroundColor: CARD, borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingHorizontal: 16, paddingTop: 12, maxHeight: '92%',
        borderTopWidth: 1, borderColor: BORDER,
    },
    handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: MUTED, alignSelf: 'center', marginBottom: 14 },
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title:       { color: GOLD, fontSize: 15, fontWeight: '700' },
    arabic:      { fontFamily: 'Uthmanic', fontSize: 22, color: TEXT, textAlign: 'right', lineHeight: 44, marginBottom: 8 },
    translation: { color: TEXT_DIM, fontSize: 13, lineHeight: 20, marginBottom: 12 },
    divider:     { height: 1, backgroundColor: BORDER, marginBottom: 14 },
    tafsirLabel: { color: GOLD, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
    scroll:      { flexGrow: 0 },
    center:      { paddingVertical: 36, alignItems: 'center' },
    empty:       { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
    block:       { marginBottom: 16 },
    bodyText:    { color: TEXT_DIM, fontSize: 14, lineHeight: 25 },
});

// ── Ayah Card ─────────────────────────────────────────────────────────────────
const AyahCard = ({
                      item,
                      surahId,
                      isPlaying,
                      isBookmarked,
                      onPlayAudio,
                      onWordByWord,
                      onTafsir,
                      onToggleBookmark,
                      onOpenAyah,
                  }) => {
    const num = ayahNum(item);

    const arabic =
        item.arabic ??
        item.arabic_text ??
        item.text_uthmani ??
        item.text ??
        '';

    const trans =
        item.translations?.sahih_international ??
        item.translations?.yusuf_ali ??
        item.translation ??
        item.text_translation ??
        '';

    const translit = item.transliteration ?? null;

    const handleCopy = async () => {
        const txt = `${arabic}\n\n${trans}\n\n— Quran ${surahId}:${num}`;

        try {
            await Clipboard.setStringAsync(txt);

            if (Platform.OS === 'android') {
                ToastAndroid.show('Copied!', ToastAndroid.SHORT);
            } else {
                Alert.alert('Copied', 'Ayah copied to clipboard.');
            }
        } catch (e) {
            console.error('[Copy]', e);
        }
    };

    return (
        <View style={[s.ayahCard, isPlaying && s.ayahCardActive]}>
            <View style={s.ayahHeader}>

                {/* Ayah number — tap to open the full ayah screen */}
                <TouchableOpacity
                    style={[s.ayahBadge, isPlaying && s.ayahBadgeActive]}
                    onPress={() => onOpenAyah(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Text
                        style={[
                            s.ayahBadgeText,
                            isPlaying && s.ayahBadgeTextActive,
                        ]}
                    >
                        {num}
                    </Text>
                </TouchableOpacity>

                {/* Actions */}
                <View style={s.ayahActions}>

                    {/* Play */}
                    <TouchableOpacity
                        style={[
                            s.actionBtn,
                            isPlaying && s.actionBtnPlaying,
                        ]}
                        onPress={() => onPlayAudio(num)}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name={isPlaying ? 'pause' : 'play'}
                            size={13}
                            color={isPlaying ? DARK : GOLD}
                        />
                    </TouchableOpacity>

                    {/* Word by Word */}
                    <TouchableOpacity
                        style={s.actionBtn}
                        onPress={() => onWordByWord(item)}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name="text-outline"
                            size={13}
                            color={GOLD}
                        />
                    </TouchableOpacity>

                    {/* Tafsir */}
                    <TouchableOpacity
                        style={s.actionBtn}
                        onPress={() => onTafsir(item)}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name="book-outline"
                            size={13}
                            color={GOLD}
                        />
                    </TouchableOpacity>

                    {/* Copy */}
                    <TouchableOpacity
                        style={s.actionBtn}
                        onPress={handleCopy}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name="copy-outline"
                            size={13}
                            color={GOLD}
                        />
                    </TouchableOpacity>

                    {/* Bookmark */}
                    <TouchableOpacity
                        style={[
                            s.actionBtn,
                            isBookmarked && s.actionBtnBookmarked,
                        ]}
                        onPress={() => onToggleBookmark(item)}
                        hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                        }}
                    >
                        <Ionicons
                            name={
                                isBookmarked
                                    ? 'bookmark'
                                    : 'bookmark-outline'
                            }
                            size={13}
                            color={isBookmarked ? GOLD : MUTED}
                        />
                    </TouchableOpacity>

                </View>
            </View>

            <TouchableOpacity activeOpacity={0.7} onPress={() => onOpenAyah(item)}>
                <Text style={s.arabicText}>
                    {arabic}
                </Text>

                {translit ? (
                    <Text style={s.translitText}>
                        {translit}
                    </Text>
                ) : null}

                <Text style={s.translationText}>
                    {trans}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

// ── Mini Player Bar ───────────────────────────────────────────────────────────
const MiniPlayerBar = ({ audio, insetBottom, onOpenPlayer }) => {
    const { surahName, playingAyah, isPlaying, isLoading, positionMs, durationMs, reciter } = audio;
    if (!audio.surahId) return null;

    const pct   = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
    const label = playingAyah ? `Ayah ${playingAyah}` : 'Ready';

    return (
        <TouchableOpacity
            style={[ps.bar, { paddingBottom: insetBottom + 8 }]}
            activeOpacity={0.92}
            onPress={onOpenPlayer}
        >
            <View style={ps.progressTrack}>
                <View style={[ps.progressFill, { width: `${pct}%` }]} />
            </View>

            <View style={ps.row}>
                <View style={ps.info}>
                    <Text style={ps.surahName} numberOfLines={1}>{surahName}</Text>
                    <Text style={ps.ayahLabel} numberOfLines={1}>
                        {label}
                        {!!reciter?.name && ` · ${reciter.name}`}
                    </Text>
                    <Text style={ps.timeLabel}>{fmt(positionMs)} / {fmt(durationMs)}</Text>
                </View>

                <View style={ps.controls}>
                    <TouchableOpacity
                        style={ps.ctrlBtn}
                        onPress={(e) => { e.stopPropagation?.(); AudioStore.prev(); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="play-skip-back" size={18} color={TEXT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={ps.playBtn}
                        onPress={(e) => { e.stopPropagation?.(); AudioStore.togglePlayPause(); }}
                        disabled={isLoading}
                    >
                        {isLoading
                            ? <ActivityIndicator size="small" color={DARK} />
                            : <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={DARK} />
                        }
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={ps.ctrlBtn}
                        onPress={(e) => { e.stopPropagation?.(); AudioStore.next(); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="play-skip-forward" size={18} color={TEXT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={ps.ctrlBtn}
                        onPress={onOpenPlayer}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="chevron-up" size={18} color={GOLD} />
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );
};

const ps = StyleSheet.create({
    bar: {
        backgroundColor: PLAYER_BG,
        borderTopWidth: 1, borderTopColor: BORDER,
        paddingTop: 4, paddingHorizontal: 14,
    },
    progressTrack: { height: 2, backgroundColor: GOLD_LIGHT, borderRadius: 1, marginBottom: 8 },
    progressFill:  { height: 2, backgroundColor: GREEN, borderRadius: 1 },
    row:           { flexDirection: 'row', alignItems: 'center', gap: 10 },
    info:          { flex: 1 },
    surahName:     { color: TEXT, fontSize: 13, fontWeight: '700' },
    ayahLabel:     { color: MUTED, fontSize: 11, marginTop: 1 },
    timeLabel:     { color: MUTED, fontSize: 10, marginTop: 1 },
    controls:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ctrlBtn:       { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    playBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
        marginHorizontal: 2,
    },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SurahScreen() {
    const { id }   = useLocalSearchParams();
    const insets   = useSafeAreaInsets();

    const [surah, setSurah]     = useState(null);
    const [ayahs, setAyahs]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [reciter, setReciter] = useState(null);
    const [audio, setAudio]     = useState(AudioStore.getState());

    const [tafsirAyah, setTafsirAyah]         = useState(null);
    const [tafsirVisible, setTafsirVisible]   = useState(false);
    const [wordAyah, setWordAyah]             = useState(null);
    const [wordVisible, setWordVisible]       = useState(false);
    const [bookmarkedAyahs, setBookmarkedAyahs] = useState(new Set());

    const listRef = useRef(null);

    // Subscribe to AudioStore
    useEffect(() => {
        const unsub = AudioStore.subscribe(setAudio);
        return unsub;
    }, []);

    useEffect(() => {
        loadSurah();
        loadReciter();
        loadAyahBookmarks();
    }, [id]);

    // Reload reciter whenever this screen gains focus so reciter changes
    // made on the reciters screen are immediately reflected here.
    useFocusEffect(
        useCallback(() => {
            loadReciter();
        }, [])
    );

    // ── FIX: scrollToIndex returns void, not a Promise ────────────────────────
    useEffect(() => {
        if (audio.playingAyah && audio.surahId == id && ayahs.length) {
            const idx = ayahs.findIndex(a => ayahNum(a) === audio.playingAyah);
            if (idx >= 0) {
                try {
                    listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 100 });
                } catch (_) {}
            }
        }
    }, [audio.playingAyah]);

    const loadReciter = async () => {
        try {
            const saved = await AsyncStorage.getItem('selected_reciter');
            if (saved) setReciter(JSON.parse(saved));
        } catch (_) {}
    };

    const loadAyahBookmarks = async () => {
        try {
            const device_id = await getDeviceId();

            const { data, error } = await supabase
                .from('quran_bookmarks')
                .select('ayah_number')
                .eq('device_id', device_id)
                .eq('surah_number', Number(id))
                .not('ayah_number', 'is', null);

            if (error) {
                console.error('[AyahBookmarks] Load error:', error);
                return;
            }

            if (Array.isArray(data)) {
                setBookmarkedAyahs(
                    new Set(
                        data.map(row => Number(row.ayah_number))
                    )
                );
            }
        } catch (e) {
            console.error('[AyahBookmarks] Load error:', e);
        }
    };

    const toggleAyahBookmark = useCallback(async (item) => {
        const num = ayahNum(item);

        if (!num) return;

        const wasBookmarked = bookmarkedAyahs.has(num);

        // Optimistic UI update
        setBookmarkedAyahs(prev => {
            const next = new Set(prev);

            if (wasBookmarked) {
                next.delete(num);
            } else {
                next.add(num);
            }

            return next;
        });

        try {
            const device_id = await getDeviceId();

            if (wasBookmarked) {
                const { error } = await supabase
                    .from('quran_bookmarks')
                    .delete()
                    .eq('device_id', device_id)
                    .eq('surah_number', Number(id))
                    .eq('ayah_number', num);

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('quran_bookmarks')
                    .insert({
                        device_id,
                        surah_number: Number(id),
                        ayah_number: num,
                    });

                if (error) throw error;
            }
        } catch (e) {
            console.error('[AyahBookmark]', e);

            // Revert optimistic update
            setBookmarkedAyahs(prev => {
                const next = new Set(prev);

                if (wasBookmarked) {
                    next.add(num);
                } else {
                    next.delete(num);
                }

                return next;
            });
        }
    }, [id, bookmarkedAyahs]);

    const loadSurah = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getSurah(id);
            if (res?.success && res.data) {
                const surahData = res.data.surah ?? res.data;
                setSurah(surahData);
                const list = extractAyahs(res.data);
                setAyahs(list);
            } else {
                setError('Could not load surah.');
            }
        } catch (e) {
            setError('Network error. Check your connection.');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Play a specific ayah.
     * Passes reciter as null so AudioStore.playSurah will resolve it
     * from AsyncStorage (or auto-fetch from API if nothing saved).
     * No duplicate AsyncStorage reads needed here.
     */
    const handlePlayAyah = useCallback(async (num) => {
        const state = AudioStore.getState();

        if (state.surahId == id) {
            if (state.playingAyah === num) {
                // Same ayah — toggle play/pause
                AudioStore.togglePlayPause();
            } else {
                // Different ayah on same surah — play it in single mode
                AudioStore.playAyah(num, 'single');
            }
            return;
        }

        // New surah — switch playMode to single BEFORE calling playSurah
        // so the enqueued pipeline picks it up rather than being overwritten.
        AudioStore.setPlayMode('single');
        await AudioStore.playSurah(
            parseInt(id),
            ayahs,
            null,
            num,
            surah ?? {}
        );
    }, [id, ayahs, surah]);

    const handlePlayAll = useCallback(async () => {
        const state = AudioStore.getState();
        // If this surah is already active in 'all' mode — toggle pause/resume
        if (state.surahId == id && state.playMode === 'all') {
            AudioStore.togglePlayPause();
            return;
        }
        // Start from beginning in 'all' mode (playSurah sets playMode: 'all')
        await AudioStore.playSurah(parseInt(id), ayahs, null, null, surah ?? {});
    }, [id, ayahs, surah]);

    const isThisSurahActive = audio.surahId == id;
    const playingAyahNum    = isThisSurahActive ? audio.playingAyah : null;

    const handleOpenAyah = useCallback((item) => {
        const num = ayahNum(item);
        const arabic =
            item.arabic ?? item.arabic_text ?? item.text_uthmani ?? item.text ?? '';
        const trans =
            item.translations?.sahih_international ??
            item.translations?.yusuf_ali ??
            item.translation ??
            item.text_translation ??
            '';
        const translit = item.transliteration ?? '';

        // Same URL-safe encoding used by quran/search.jsx when opening an ayah —
        // keep these two navigation call sites in sync.
        const encodeParam = (str) => encodeURIComponent(str ?? '');

        router.push({
            pathname: `/quran/ayah/${id}/${num}`,
            params: {
                prefill_arabic:          encodeParam(arabic),
                prefill_translation:     encodeParam(trans),
                prefill_transliteration: encodeParam(translit),
                prefill_surah_name:      encodeParam(surah?.name_english ?? ''),
            },
        });
    }, [id, surah]);

    const renderItem = useCallback(({ item }) => (
        <AyahCard
            item={item}
            surahId={id}
            isPlaying={playingAyahNum === ayahNum(item)}
            isBookmarked={bookmarkedAyahs.has(ayahNum(item))}
            onPlayAudio={handlePlayAyah}
            onWordByWord={(a) => {
                setWordAyah(a);
                setWordVisible(true);
            }}
            onTafsir={(a) => {
                setTafsirAyah(a);
                setTafsirVisible(true);
            }}
            onToggleBookmark={toggleAyahBookmark}
            onOpenAyah={handleOpenAyah}
        />
    ), [
        playingAyahNum,
        handlePlayAyah,
        id,
        bookmarkedAyahs,
        toggleAyahBookmark,
        handleOpenAyah,
    ]);

    const keyExtractor = useCallback((item, i) => (ayahNum(item) ?? i).toString(), []);

    const isPlayAllActive = isThisSurahActive && audio.playMode === 'all';

    const ListHeader = useCallback(() => surah ? (
        <View style={s.bismillahWrap}>
            <Text style={s.surahTitleAr}>{surah.name_arabic}</Text>
            <Text style={s.surahTitleEn}>{surah.name_english}</Text>
            <Text style={s.surahMeta}>
                {surah.revelation_place
                    ? surah.revelation_place.charAt(0).toUpperCase() + surah.revelation_place.slice(1)
                    : ''}
                {' • '}{surah.verses_count ?? ayahs.length} Ayahs
            </Text>
            <TouchableOpacity style={s.playAllBtn} onPress={handlePlayAll}>
                <Ionicons
                    name={isPlayAllActive && audio.isPlaying ? 'pause-circle' : 'play-circle'}
                    size={22}
                    color={DARK}
                />
                <Text style={s.playAllText}>
                    {isPlayAllActive && audio.isPlaying ? 'Pause' : 'Play All'}
                </Text>
            </TouchableOpacity>
            {surah.number !== 9 && (
                <Text style={s.bismillah}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</Text>
            )}
        </View>
    ) : null, [surah, ayahs, isPlayAllActive, audio.isPlaying, isThisSurahActive, handlePlayAll]);

    if (loading) return (
        <View style={[s.root, s.center, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={s.loadingText}>Loading surah…</Text>
        </View>
    );

    if (error) return (
        <View style={[s.root, s.center, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />
            <Ionicons name="wifi-outline" size={44} color={MUTED} />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={loadSurah}>
                <Text style={s.retryText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* Top bar */}
            <View style={s.topBar}>
                <TouchableOpacity
                    style={s.iconBtn}
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="chevron-back" size={22} color={GOLD} />
                </TouchableOpacity>
                <View style={s.titleWrap}>
                    <Text style={s.titleEn}>{surah?.name_english}</Text>
                    <Text style={s.titleSub}>Surah {surah?.number}</Text>
                </View>
                <TouchableOpacity
                    style={s.iconBtn}
                    onPress={() => router.push('/quran/reciters')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="mic-outline" size={20} color={GOLD} />
                </TouchableOpacity>
            </View>

            {/* Reciter strip */}
            {reciter?.name ? (
                <TouchableOpacity style={s.reciterStrip} onPress={() => router.push('/quran/reciters')}>
                    <Ionicons name="mic" size={12} color={GOLD} />
                    <Text style={s.reciterStripText}>{reciter.name}</Text>
                    <Ionicons name="chevron-forward" size={12} color={MUTED} />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity style={s.reciterStrip} onPress={() => router.push('/quran/reciters')}>
                    <Ionicons name="mic-outline" size={12} color={MUTED} />
                    <Text style={[s.reciterStripText, { color: MUTED }]}>No reciter selected — tap to choose</Text>
                    <Ionicons name="chevron-forward" size={12} color={MUTED} />
                </TouchableOpacity>
            )}

            <FlatList
                ref={listRef}
                data={ayahs}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ListHeaderComponent={ListHeader}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[s.listContent, { paddingBottom: 8 }]}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={8}
                onScrollToIndexFailed={() => {}}
            />

            <MiniPlayerBar
                audio={audio}
                insetBottom={insets.bottom}
                onOpenPlayer={() => router.push('/quran/player')}
            />

            <TafsirModal
                visible={tafsirVisible}
                ayah={tafsirAyah}
                surahId={id}
                onClose={() => { setTafsirVisible(false); setTafsirAyah(null); }}
            />
            <WordModal
                visible={wordVisible}
                surahId={id}
                ayah={wordAyah}
                onClose={() => { setWordVisible(false); setWordAyah(null); }}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root:    { flex: 1, backgroundColor: DARK },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    iconBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: GOLD_LIGHT, alignItems: 'center', justifyContent: 'center',
    },
    titleWrap:  { alignItems: 'center' },
    titleEn:    { color: TEXT, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    titleSub:   { color: MUTED, fontSize: 11, marginTop: 2 },
    reciterStrip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 7,
        backgroundColor: GOLD_LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    reciterStripText: { flex: 1, color: GOLD, fontSize: 11, fontWeight: '600' },
    listContent:      { paddingHorizontal: 16, paddingTop: 8 },

    bismillahWrap: {
        alignItems: 'center', paddingVertical: 24,
        marginBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    surahTitleAr: { fontFamily: 'Uthmanic', fontSize: 32, color: GOLD, marginBottom: 6, lineHeight: 64, textAlign: 'center' },
    surahTitleEn: { color: TEXT, fontSize: 20, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
    surahMeta:    { color: MUTED, fontSize: 12, marginBottom: 16, letterSpacing: 0.4 },
    playAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
        marginBottom: 20,
    },
    playAllText:  { color: DARK, fontWeight: '700', fontSize: 14 },
    bismillah: {
        fontFamily: 'Uthmanic', fontSize: 24, color: TEXT_DIM,
        textAlign: 'center', lineHeight: 44, paddingHorizontal: 20,
    },

    ayahCard: {
        backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 12,
        borderWidth: 1, borderColor: BORDER,
    },
    ayahCardActive:      { borderColor: GOLD_BRIGHT, backgroundColor: CARD_ALT },
    ayahHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    ayahBadge: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: GOLD_LIGHT, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: GOLD_MED,
    },
    ayahBadgeActive:     { backgroundColor: GOLD },
    ayahBadgeText:       { color: GOLD, fontWeight: '700', fontSize: 12 },
    ayahBadgeTextActive: { color: DARK },
    ayahActions:         { flexDirection: 'row', gap: 7 },
    actionBtn: {
        width: 28, height: 28, borderRadius: 7,
        backgroundColor: GOLD_LIGHT, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: BORDER,
    },
    actionBtnPlaying:    { backgroundColor: GOLD, borderColor: GOLD },
    actionBtnBookmarked: { backgroundColor: GOLD_LIGHT, borderColor: GOLD_MED },
    arabicText: {
        fontFamily: 'Uthmanic', fontSize: 26, color: TEXT,
        textAlign: 'right', lineHeight: 50, marginBottom: 10,
    },
    translitText:    { color: MUTED, fontSize: 13, fontStyle: 'italic', marginBottom: 8, lineHeight: 20 },
    translationText: { color: TEXT_DIM, fontSize: 14, lineHeight: 22 },

    loadingText: { color: MUTED, fontSize: 13, marginTop: 8 },
    errorText:   { color: TEXT_DIM, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    retryBtn:    { backgroundColor: GOLD_LIGHT, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1, borderColor: GOLD_MED },
    retryText:   { color: GOLD, fontWeight: '700', fontSize: 14 },
});