// src/services/quranApi.js
// Content: existing UmmahAPI endpoints.
// Audio + synchronization: Quran Foundation through YOUR backend proxy.
//
// Mobile never receives QF_CLIENT_SECRET or an OAuth token.

const BASE_URL    = 'https://ummahapi.com/api/quran';
const TAFSIR_URL  = 'https://ummahapi.com/api/tafsir';

const QF_PROXY_BASE = String(process.env.EXPO_PUBLIC_QURAN_AUDIO_API_URL || '').replace(/\/$/, '');

const API_KEY = process.env.EXPO_PUBLIC_UMMAH_API_KEY;

if (!API_KEY) console.warn('[quranApi] Missing EXPO_PUBLIC_UMMAH_API_KEY in .env');
if (!QF_PROXY_BASE) console.warn('[quranApi] Missing EXPO_PUBLIC_QURAN_AUDIO_API_URL in .env');

const getHeaders = () => API_KEY ? { 'X-API-Key': API_KEY } : {};

const fetchWithTimeout = async (url, options = {}, timeout = 12000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
};

const handleResponse = async (res, message) => {
    if (!res.ok) throw new Error(`${message} (HTTP ${res.status})`);
    return res.json();
};

// ── Existing UmmahAPI content ────────────────────────────────────────────────

export const getSurahs = async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/surahs`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch surahs');
};

export const getSurah = async (id) => {
    const res = await fetchWithTimeout(`${BASE_URL}/surah/${id}`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch surah');
};

export const searchQuran = async (query) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
        { headers: getHeaders() },
    );
    return handleResponse(res, 'Search failed');
};

export const getAyahWords = async (surahId, ayahNum) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/words/${surahId}/${ayahNum}`,
        { headers: getHeaders() },
    );
    return handleResponse(res, 'Failed to fetch words');
};

export const getAyahTafsir = async (surahId, ayahNum, source = 'ibn-kathir') => {
    const res = await fetchWithTimeout(
        `${TAFSIR_URL}/${source}/surah/${surahId}/ayah/${ayahNum}`,
        { headers: getHeaders() },
    );
    return handleResponse(res, 'Failed to fetch tafsir');
};

export const getMutashabihat = async (surahId, ayahNum) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/mutashabihat/${surahId}/${ayahNum}`,
        { headers: getHeaders() },
    );
    return handleResponse(res, 'Failed to fetch mutashabihat');
};

// ── Quran Foundation chapter audio ───────────────────────────────────────────
// Backend proxy routes:
//   GET /api/quran/audio/reciters
//   GET /api/quran/audio/chapter/:reciterId/:chapterNumber

const requireQfProxy = () => {
    if (!QF_PROXY_BASE) {
        throw new Error(
            'Quran audio backend is not configured. Set EXPO_PUBLIC_QURAN_AUDIO_API_URL.',
        );
    }
};

export const getReciters = async () => {
    requireQfProxy();
    const res = await fetchWithTimeout(`${QF_PROXY_BASE}/reciters`, {}, 15000);
    return handleResponse(res, 'Failed to fetch Quran Foundation reciters');
};

/**
 * Returns the COMPLETE chapter source used for playback:
 *
 * {
 *   audioUrl,
 *   timestamps: [
 *     {
 *       verse_key,
 *       timestamp_from,
 *       timestamp_to,
 *       segments: [[wordIndex, startMs, endMs], ...]
 *     }
 *   ]
 * }
 */
export const getQuranFoundationChapterAudio = async (reciterId, chapterNumber) => {
    requireQfProxy();
    const res = await fetchWithTimeout(
        `${QF_PROXY_BASE}/chapter/${encodeURIComponent(reciterId)}/${encodeURIComponent(chapterNumber)}`,
        {},
        20000,
    );
    return handleResponse(res, 'Failed to fetch Quran Foundation chapter audio');
};

/**
 * Normalize Quran Foundation timestamps into a structure convenient for the
 * AudioStore. No name matching or external reciter-ID translation occurs.
 */
export const normalizeChapterTiming = (payload) => {
    const rows =
        payload?.data?.timestamps ??
        payload?.data?.audio_file?.timestamps ??
        payload?.timestamps ??
        payload?.audio_file?.timestamps ??
        [];
    const timings = {};

    for (const row of rows) {
        const verseKey = String(row?.verse_key ?? '');
        const parts = verseKey.split(':');
        const ayah = Number(parts[1]);
        if (!Number.isInteger(ayah)) continue;

        const startMs = Number(row?.timestamp_from);
        const endMs = Number(row?.timestamp_to);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

        const segments = Array.isArray(row?.segments)
            ? row.segments
                .map((segment) => {
                    if (!Array.isArray(segment) || segment.length < 3) return null;
                    const [wordIndex, from, to] = segment.map(Number);
                    if (!Number.isFinite(wordIndex) || !Number.isFinite(from) || !Number.isFinite(to)) return null;
                    return { word: wordIndex, startMs: from, endMs: to };
                })
                .filter(Boolean)
            : [];

        timings[ayah] = {
            startMs,
            endMs,
            startSec: startMs / 1000,
            endSec: endMs / 1000,
            segments,
        };
    }

    return timings;
};

// Compatibility exports for old callers. These are intentionally disabled for
// playback so the app cannot accidentally mix ayah-recitation IDs with chapter
// reciter IDs.
export const getQuranComRecitationIdForQari = async () => null;
export const getSurahTimings = async () => ({});
export const getQuranicAudioSurahUrl = () => null;
export const getSurahAudio = async () => ({ data: { ayahs: [] } });
export const getAyahAudio = async () => ({ data: { audio_url: null } });
export const buildFallbackUrl = () => null;
export const buildFallbackUrlChain = () => [];
export const resolveAudioUrl = (url) => url || null;
