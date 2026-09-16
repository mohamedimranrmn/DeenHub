// src/services/quranApi.js
//
// Content:
//   UmmahAPI
//
// Audio + synchronization:
//   Quran Foundation through YOUR backend proxy.
//
// IMPORTANT:
//   Mobile never receives QF_CLIENT_SECRET or an OAuth token.
//
// Architecture:
//
//   Expo app
//      ↓
//   Your backend proxy
//      ↓
//   Quran Foundation
//
// The chapter-recitation endpoint returns BOTH:
//   1. The chapter audio URL
//   2. Ayah timestamps
//   3. Word-level segments
//
// This keeps audio and synchronization from different sources from
// becoming mismatched.
//

const BASE_URL = 'https://ummahapi.com/api/quran';
const TAFSIR_URL = 'https://ummahapi.com/api/tafsir';

const QF_PROXY_BASE = String(
    process.env.EXPO_PUBLIC_QURAN_AUDIO_API_URL || ''
).replace(/\/$/, '');

const API_KEY = process.env.EXPO_PUBLIC_UMMAH_API_KEY;

if (!API_KEY) {
    console.warn(
        '[quranApi] Missing EXPO_PUBLIC_UMMAH_API_KEY in .env'
    );
}

if (!QF_PROXY_BASE) {
    console.warn(
        '[quranApi] Missing EXPO_PUBLIC_QURAN_AUDIO_API_URL in .env'
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// Common helpers
// ─────────────────────────────────────────────────────────────────────────────

const getHeaders = () =>
    API_KEY
        ? {
            'X-API-Key': API_KEY,
        }
        : {};


const fetchWithTimeout = async (
    url,
    options = {},
    timeout = 12000
) => {
    const controller = new AbortController();

    const id = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });

        clearTimeout(id);

        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
};


const handleResponse = async (res, message) => {
    if (!res.ok) {
        throw new Error(
            `${message} (HTTP ${res.status})`
        );
    }

    return res.json();
};


// ─────────────────────────────────────────────────────────────────────────────
// UmmahAPI — Quran content
// ─────────────────────────────────────────────────────────────────────────────

export const getSurahs = async () => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/surahs`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Failed to fetch surahs'
    );
};


export const getSurah = async (id) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/surah/${id}`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Failed to fetch surah'
    );
};


export const searchQuran = async (query) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Search failed'
    );
};


export const getAyahWords = async (
    surahId,
    ayahNum
) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/words/${surahId}/${ayahNum}`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Failed to fetch words'
    );
};


export const getAyahTafsir = async (
    surahId,
    ayahNum,
    source = 'ibn-kathir'
) => {
    const res = await fetchWithTimeout(
        `${TAFSIR_URL}/${source}/surah/${surahId}/ayah/${ayahNum}`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Failed to fetch tafsir'
    );
};


export const getMutashabihat = async (
    surahId,
    ayahNum
) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/mutashabihat/${surahId}/${ayahNum}`,
        {
            headers: getHeaders(),
        }
    );

    return handleResponse(
        res,
        'Failed to fetch mutashabihat'
    );
};


// ─────────────────────────────────────────────────────────────────────────────
// Quran Foundation chapter audio
// ─────────────────────────────────────────────────────────────────────────────
//
// Backend proxy routes:
//
//   GET /reciters
//
//   GET /chapter/:reciterId/:chapterNumber
//
// Expected chapter response:
//
// {
//   audio_file: {
//      audio_url: "...",
//      timestamps: [
//        {
//          verse_key: "114:1",
//          timestamp_from: 0,
//          timestamp_to: 7990,
//          segments: [
//             [1, 0, 970],
//             [2, 970, 2490],
//             ...
//          ]
//        }
//      ]
//   }
// }
//
// Audio + timing metadata come from the SAME Quran Foundation response.
//

const requireQfProxy = () => {
    if (!QF_PROXY_BASE) {
        throw new Error(
            'Quran audio backend is not configured. ' +
            'Set EXPO_PUBLIC_QURAN_AUDIO_API_URL.'
        );
    }
};


export const getReciters = async () => {
    requireQfProxy();

    const res = await fetchWithTimeout(
        `${QF_PROXY_BASE}/reciters`,
        {},
        15000
    );

    return handleResponse(
        res,
        'Failed to fetch Quran Foundation reciters'
    );
};


// ─────────────────────────────────────────────────────────────────────────────
// Fetch complete chapter source
// ─────────────────────────────────────────────────────────────────────────────

const fetchChapterWithRetry = async (
    url,
    attempt = 1
) => {
    try {
        const res = await fetchWithTimeout(
            url,
            {},
            30000
        );

        return handleResponse(
            res,
            'Failed to fetch Quran Foundation chapter audio'
        );
    } catch (e) {
        const isTimeout = e?.name === 'AbortError';

        if (isTimeout && attempt < 2) {
            return fetchChapterWithRetry(url, attempt + 1);
        }

        if (isTimeout) {
            throw new Error(
                'Quran audio is taking longer than usual to load. Please check your connection and try again.'
            );
        }

        throw e;
    }
};


export const getQuranFoundationChapterAudio = async (
    reciterId,
    chapterNumber
) => {
    requireQfProxy();

    if (!reciterId) {
        throw new Error(
            'Quran Foundation reciter ID is required'
        );
    }

    if (!chapterNumber) {
        throw new Error(
            'Chapter number is required'
        );
    }

    const url =
        `${QF_PROXY_BASE}/chapter/` +
        `${encodeURIComponent(reciterId)}/` +
        `${encodeURIComponent(chapterNumber)}`;

    return fetchChapterWithRetry(url);
};


// ─────────────────────────────────────────────────────────────────────────────
// Normalize chapter timing
// ─────────────────────────────────────────────────────────────────────────────
//
// Converts:
//
// timestamp_from / timestamp_to
//
// from milliseconds into:
//
// {
//    [ayahNumber]: {
//       startMs,
//       endMs,
//       startSec,
//       endSec,
//       segments: [
//          {
//             word,
//             startMs,
//             endMs
//          }
//       ]
//    }
// }
//
// Word indexes from Quran Foundation are kept as supplied.
//

export const normalizeChapterTiming = (
    payload
) => {
    const rows =
        payload?.data?.timestamps ??
        payload?.data?.audio_file?.timestamps ??
        payload?.timestamps ??
        payload?.audio_file?.timestamps ??
        [];

    const timings = {};

    if (!Array.isArray(rows)) {
        return timings;
    }

    for (const row of rows) {
        const verseKey = String(
            row?.verse_key ?? ''
        );

        const parts = verseKey.split(':');

        const ayah = Number(parts[1]);

        if (!Number.isInteger(ayah)) {
            continue;
        }

        const startMs = Number(
            row?.timestamp_from
        );

        const endMs = Number(
            row?.timestamp_to
        );

        if (
            !Number.isFinite(startMs) ||
            !Number.isFinite(endMs)
        ) {
            continue;
        }

        const segments = Array.isArray(
            row?.segments
        )
            ? row.segments
                .map((segment) => {
                    if (
                        !Array.isArray(segment) ||
                        segment.length < 3
                    ) {
                        return null;
                    }

                    const [
                        wordIndex,
                        from,
                        to,
                    ] = segment.map(Number);

                    if (
                        !Number.isFinite(wordIndex) ||
                        !Number.isFinite(from) ||
                        !Number.isFinite(to)
                    ) {
                        return null;
                    }

                    return {
                        word: wordIndex,
                        startMs: from,
                        endMs: to,
                    };
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


// ─────────────────────────────────────────────────────────────────────────────
// Extract chapter audio URL
// ─────────────────────────────────────────────────────────────────────────────
//
// Handles the response shapes used by the backend.
//
// ─────────────────────────────────────────────────────────────────────────────

export const getChapterAudioUrl = (
    payload
) => {
    const url =
        payload?.data?.audio_file?.audio_url ??
        payload?.data?.audio_file?.audioUrl ??
        payload?.data?.audio_url ??
        payload?.data?.audioUrl ??
        payload?.audio_file?.audio_url ??
        payload?.audio_file?.audioUrl ??
        payload?.audio_url ??
        payload?.audioUrl ??
        null;

    if (
        typeof url !== 'string' ||
        !url.trim()
    ) {
        return null;
    }

    return url.trim();
};


// ─────────────────────────────────────────────────────────────────────────────
// Extract complete chapter source
// ─────────────────────────────────────────────────────────────────────────────
//
// Convenient helper used by AudioStore.
//
// Returns:
//
// {
//    audioUrl: "...",
//    timings: {
//       1: {...},
//       2: {...}
//    }
// }
//
// ─────────────────────────────────────────────────────────────────────────────

export const getQuranFoundationChapterSource =
    async (
        reciterId,
        chapterNumber
    ) => {
        const payload =
            await getQuranFoundationChapterAudio(
                reciterId,
                chapterNumber
            );

        const audioUrl =
            getChapterAudioUrl(payload);

        if (!audioUrl) {
            throw new Error(
                `Quran Foundation returned no audio URL ` +
                `for reciter ${reciterId}, chapter ${chapterNumber}`
            );
        }

        const timings =
            normalizeChapterTiming(payload);

        return {
            audioUrl,
            timings,
            raw: payload,
        };
    };


// ─────────────────────────────────────────────────────────────────────────────
// Get a single Ayah's timing from chapter data
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE:
//
// The Ayah does NOT have to be a separate MP3.
//
// Quran Foundation gives one chapter MP3 with timestamps.
//
// Therefore the correct way to play an individual Ayah is:
//
//      chapter audio
//          +
//      seekTo(ayah.startSec)
//
// This preserves exact synchronization.
//

export const getAyahTiming = (
    chapterPayload,
    ayahNumber
) => {
    const timings =
        normalizeChapterTiming(
            chapterPayload
        );

    return (
        timings?.[Number(ayahNumber)] ??
        null
    );
};


// ─────────────────────────────────────────────────────────────────────────────
// Compatibility exports
// ─────────────────────────────────────────────────────────────────────────────
//
// These are intentionally kept so older imports do not crash.
//
// DO NOT use these for normal Quran playback.
//
// Normal playback MUST use:
//
// getQuranFoundationChapterSource()
//
// because chapter audio and timestamps come from the same source.
//

export const getQuranComRecitationIdForQari =
    async () => null;


export const getSurahTimings =
    async () => ({});


export const getQuranicAudioSurahUrl =
    () => null;


// Legacy per-Ayah API.
// Disabled intentionally because mixing ayah-level recitation IDs with
// Quran Foundation chapter-reciter IDs can cause incorrect audio mapping.

export const getSurahAudio =
    async () => ({
        data: {
            ayahs: [],
        },
    });


export const getAyahAudio =
    async () => ({
        data: {
            audio_url: null,
        },
    });


// Legacy fallback helpers.
// We intentionally do NOT return random CDN URLs here.
//
// If the app needs individual Ayah playback, it should use the SAME
// Quran Foundation chapter source and seek to the Ayah timestamp.

export const buildFallbackUrl =
    () => null;


export const buildFallbackUrlChain =
    () => [];


export const resolveAudioUrl =
    (url) => url || null;