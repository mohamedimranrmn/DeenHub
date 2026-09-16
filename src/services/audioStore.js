/**
 * src/services/audioStore.js
 *
 * Quran playback engine - single native player, Quran Foundation chapter-recitation streams.
 *
 * Design goals:
 * - ONE long-lived expo-audio AudioPlayer.
 * - No per-ayah Audio.Sound creation/unload/swap.
 * - No fallback URL chain during normal playback.
 * - Ayah navigation is seek-based using timing metadata returned with the same Quran Foundation chapter audio response.
 * - Reciter changes use player.replace() and restore the same surah/ayah.
 * - All native-player mutations are serialized through one operation queue.
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    getReciters,
    getSurah,
    getSurahs,
    getQuranFoundationChapterAudio,
    normalizeChapterTiming,
} from './quranApi';

const DEFAULT_STATE = {
    surahId: null,
    surahName: '',
    surahArabic: '',
    surahNumber: null,
    totalSurahs: 114,
    ayahs: [],
    audioMap: {},
    timings: {},
    playingAyah: null,
    playingWord: null,
    isPlaying: false,
    isLoading: false,
    isBuffering: false,
    positionMs: 0,
    durationMs: 0,
    speed: 1.0,
    reciter: null,
    shuffleSurahs: false,
    repeat: 'none',
    isMuted: false,
    playMode: 'all',
};

let _state = { ...DEFAULT_STATE };
let _listeners = [];
let _player = null;
let _playerSubscription = null;
let _audioModeReady = false;
let _surahList = null;
let _operationQueue = Promise.resolve();
let _generation = 0;
let _navBusy = false;
let _destroyed = false;

// Cache chapter audio + timing metadata by exact chapter-reciter/chapter pair.
// The audio URL and timing metadata are always consumed from the same response.
const _chapterCache = new Map();

const AUDIO_OPTIONS = {
    updateInterval: 100,
    preferredForwardBufferDuration: 20,
    keepAudioSessionActive: true,
};

export const ayahNum = (item) =>
    item?.ayah ?? item?.number ?? item?.verse_number ?? item?.id;

const notify = () => {
    const snapshot = { ..._state };
    _listeners.forEach(fn => {
        try { fn(snapshot); } catch (_) {}
    });
};

const setState = (partial) => {
    _state = { ..._state, ...partial };
    notify();
};

const enqueue = (fn) => {
    _operationQueue = _operationQueue.catch(() => {}).then(fn);
    return _operationQueue;
};

const safeJson = async (key) => {
    try {
        const raw = await AsyncStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
};

const persistLastRead = (surahId, ayah) => {
    AsyncStorage.setItem('last_read_surah', JSON.stringify({
        number: surahId,
        name: _state.surahName || `Surah ${surahId}`,
        ayah: ayah ?? null,
    })).catch(() => {});
};

const configureAudio = async () => {
    if (_audioModeReady) return;
    try {
        await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
            shouldRouteThroughEarpiece: false,
        });
        _audioModeReady = true;
    } catch (e) {
        console.warn('[AudioStore] audio mode:', e?.message);
    }
};

const ensurePlayer = async () => {
    if (_player && !_destroyed) return _player;

    await configureAudio();

    _player = createAudioPlayer(null, AUDIO_OPTIONS);
    _destroyed = false;

    _playerSubscription = _player.addListener('playbackStatusUpdate', (status) => {
        handlePlayerStatus(status);
    });

    return _player;
};

const cleanupPlayer = () => {
    try { _playerSubscription?.remove?.(); } catch (_) {}
    _playerSubscription = null;

    if (_player) {
        try { _player.clearLockScreenControls?.(); } catch (_) {}
        try { _player.remove(); } catch (_) {}
    }

    _player = null;
    _destroyed = true;
};

const timingEntries = () => Object.entries(_state.timings ?? {})
    .map(([n, timing]) => ({
        ayah: Number(n),
        start: Number(timing?.startSec),
        end: Number(timing?.endSec),
    }))
    .filter(x => Number.isFinite(x.ayah) && Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start);

const ayahAtTime = (seconds) => {
    const entries = timingEntries();
    if (!entries.length) return _state.playingAyah;

    let current = entries[0].ayah;
    for (const entry of entries) {
        if (seconds + 0.05 >= entry.start) current = entry.ayah;
        else break;
    }
    return current;
};

const timingForAyah = (num) => {
    const timing = _state.timings?.[num];
    return timing && Number.isFinite(Number(timing.startSec)) ? timing : null;
};

const wordAtTime = (ayah, positionMs) => {
    const timing = timingForAyah(ayah);
    const segments = timing?.segments;
    if (!Array.isArray(segments) || !segments.length) return null;

    let current = null;
    for (const segment of segments) {
        if (positionMs + 20 >= segment.startMs) {
            current = segment.word;
        } else {
            break;
        }
    }
    return current;
};

const nextAyahNumber = (num) => {
    const idx = _state.ayahs.findIndex(a => ayahNum(a) === num);
    if (idx < 0 || idx >= _state.ayahs.length - 1) return null;
    return ayahNum(_state.ayahs[idx + 1]);
};

const previousAyahNumber = (num) => {
    const idx = _state.ayahs.findIndex(a => ayahNum(a) === num);
    if (idx <= 0) return null;
    return ayahNum(_state.ayahs[idx - 1]);
};

const updateLockScreen = () => {
    if (!_player || !_state.surahId) return;
    try {
        _player.setActiveForLockScreen(true, {
            title: _state.surahName || `Surah ${_state.surahId}`,
            artist: _state.reciter?.name || 'Quran',
            albumTitle: 'Deen Hub',
            artworkUrl:
                'https://jswxifehbnvdhjkahden.supabase.co/storage/v1/object/public/DeenHub%20Control%20Centre%20Image/islamic%20bg.jpg',
        }, {
            showSeekBackward: true,
            showSeekForward: true,
        });
    } catch (_) {}
};

const handlePlayerStatus = (status) => {
    if (!status) return;

    const positionSec = Number(status.currentTime ?? 0);
    const durationSec = Number(status.duration ?? 0);
    const nextAyah = ayahAtTime(positionSec);
    const positionMs = Math.max(0, positionSec * 1000);
    const nextWord = nextAyah != null ? wordAtTime(nextAyah, positionMs) : null;
    const currentTiming = nextAyah != null ? timingForAyah(nextAyah) : null;

    if (nextAyah != null && nextAyah !== _state.playingAyah) {
        persistLastRead(_state.surahId, nextAyah);
    }

    setState({
        positionMs,
        durationMs: Math.max(0, durationSec * 1000),
        isPlaying: !!status.playing,
        isBuffering: !!status.isBuffering,
        isLoading: !status.isLoaded && !status.didJustFinish,
        playingAyah: nextAyah ?? _state.playingAyah,
        playingWord: nextWord,
    });

    // Single-ayah mode stops exactly at the QF verse boundary. Repeat-Ayah
    // remains controlled by handleFinishedPlayback / repeat mode.
    if (
        _state.playMode === 'single' &&
        _state.repeat === 'none' &&
        status.playing &&
        currentTiming?.endSec != null &&
        positionSec >= Number(currentTiming.endSec) - 0.03
    ) {
        _player?.pause?.();
        setState({
            isPlaying: false,
            playingWord: null,
        });
        return;
    }

    if (status.didJustFinish) {
        enqueue(() => handleFinishedPlayback());
    }
};

const handleFinishedPlayback = async () => {
    if (!_player || !_state.surahId) return;

    const { repeat, playMode, surahId, ayahs } = _state;

    // ─────────────────────────────────────────────
    // Repeat Surah
    // ─────────────────────────────────────────────
    if (repeat === 'surah') {
        const firstAyah = ayahNum(ayahs?.[0]) ?? 1;

        _player.seekTo(0);

        setState({
            playingAyah: firstAyah,
            playingWord: null,
            positionMs: 0,
            isPlaying: false,
            isBuffering: false,
            isLoading: false,
        });

        persistLastRead(surahId, firstAyah);

        // Give the native player a moment to process seekTo(0)
        setTimeout(() => {
            if (_player && _state.repeat === 'surah') {
                _player.play();
                setState({ isPlaying: true });
            }
        }, 50);

        return;
    }

    // ─────────────────────────────────────────────
    // Single ayah with no repeat
    // ─────────────────────────────────────────────
    if (playMode === 'single' && repeat === 'none') {
        _player.pause();

        setState({
            isPlaying: false,
            playingWord: null,
        });

        return;
    }

    // ─────────────────────────────────────────────
    // Normal playback → next Surah
    // ─────────────────────────────────────────────
    const nextSurah = _state.shuffleSurahs
        ? 1 + Math.floor(Math.random() * 114)
        : surahId + 1;

    if (nextSurah <= 114) {
        await playSurahByIdInternal(nextSurah, null, true);
    } else {
        setState({
            isPlaying: false,
            isLoading: false,
            playingAyah: null,
            positionMs: 0,
        });
    }
};

const normalizeReciter = (reciter) => ({
    id: reciter?.id,
    name: reciter?.name ?? `Reciter ${reciter?.id ?? ''}`,
    style: reciter?.style ?? null,
    language: reciter?.language ?? null,
    qirat: reciter?.qirat ?? null,
    source: 'quran-foundation',
});

const resolveReciter = async (passed) => {
    if (passed?.id) return normalizeReciter(passed);

    const saved = await safeJson('selected_reciter');
    if (saved?.id) return normalizeReciter(saved);

    const json = await getReciters();
    const first = Array.isArray(json?.data)
        ? json.data[0]
        : json?.data?.reciters?.[0] ?? json?.reciters?.[0];
    if (!first) return null;

    const normalized = normalizeReciter(first);
    await AsyncStorage.setItem('selected_reciter', JSON.stringify(normalized));
    return normalized;
};

const getSurahList = async () => {
    if (_surahList?.length) return _surahList;

    try {
        const res = await getSurahs();
        const list = res?.data?.surahs ?? res?.data ?? res?.surahs ?? [];

        if (Array.isArray(list) && list.length > 0) {
            _surahList = list;
            setState({ totalSurahs: list.length });
            return list;
        }
    } catch (e) {
        console.warn('[AudioStore] getSurahList:', e?.message);
    }

    return [];
};

const getChapterSource = async (surahId, reciterId, generation) => {
    const key = `${reciterId}:${surahId}`;
    const cached = _chapterCache.get(key);
    if (cached) return cached;

    const payload = await getQuranFoundationChapterAudio(reciterId, surahId);
    if (generation !== _generation) return null;

    // Accept both the backend-normalized shape and the raw QF shape.
    const audioUrl =
        payload?.data?.audioUrl ??
        payload?.data?.audio_url ??
        payload?.data?.audio_file?.audio_url ??
        payload?.audioUrl ??
        payload?.audio_url ??
        payload?.audio_file?.audio_url;
    if (!audioUrl) throw new Error(`No Quran Foundation audio for ${reciterId}:${surahId}`);

    const timings = normalizeChapterTiming(payload);
    if (!Object.keys(timings).length) {
        throw new Error(`No timing metadata for Quran Foundation reciter ${reciterId}, Surah ${surahId}`);
    }

    const source = {
        audioUrl,
        timings,
        audioFileId:
            payload?.data?.audioFileId ??
            payload?.data?.audio_file?.id ??
            payload?.audio_file?.id ??
            null,
    };
    _chapterCache.set(key, source);
    return source;
};

const waitForPlayerLoaded = (generation, timeoutMs = 15000) => new Promise((resolve, reject) => {
    if (!_player) return reject(new Error('Audio player is unavailable'));
    if (generation !== _generation) return resolve(false);
    if (_player.isLoaded) return resolve(true);

    const started = Date.now();
    let sub;
    const finish = (ok, error) => {
        try { sub?.remove?.(); } catch (_) {}
        ok ? resolve(true) : reject(error ?? new Error('Audio player failed to load'));
    };

    sub = _player.addListener('playbackStatusUpdate', status => {
        if (generation !== _generation) return finish(false);
        if (status?.isLoaded) return finish(true);
        if (status?.error) return finish(false, new Error(status.error));
        if (Date.now() - started > timeoutMs) return finish(false, new Error('Audio load timeout'));
    });

    setTimeout(() => {
        if (Date.now() - started >= timeoutMs) finish(false, new Error('Audio load timeout'));
    }, timeoutMs + 20);
});

const replaceSource = async (url, generation, autoPlay) => {
    const player = await ensurePlayer();
    if (generation !== _generation) return false;

    setState({ isLoading: true, isPlaying: false, isBuffering: true });

    // replace() changes the source on the same native player. We never destroy
    // and recreate the native player during ordinary playback.
    player.replace(url);

    try {
        await waitForPlayerLoaded(generation);
    } catch (e) {
        if (generation === _generation) {
            setState({ isLoading: false, isPlaying: false, isBuffering: false });
        }
        throw e;
    }

    if (generation !== _generation) return false;

    try {
        player.playbackRate = _state.speed;
        player.shouldCorrectPitch = true;
        player.volume = _state.isMuted ? 0 : 1;
        player.muted = _state.isMuted;
    } catch (_) {}

    updateLockScreen();

    if (autoPlay) player.play();
    else player.pause();

    return true;
};

const seekAyahInternal = async (num, shouldPlay = true) => {
    if (!_player || !_state.surahId) return false;

    const timing = timingForAyah(num);

    if (!timing) {
        console.warn(
            `[AudioStore] No timing for ${_state.surahId}:${num}`
        );
        return false;
    }

    const start = Number(timing.startSec);

    if (!Number.isFinite(start)) {
        console.warn(
            `[AudioStore] Invalid start time for ${_state.surahId}:${num}`,
            timing
        );
        return false;
    }

    _player.seekTo(start);

    setState({
        playingAyah: num,
        playingWord: wordAtTime(num, start * 1000),
        positionMs: start * 1000,
        isLoading: false,
    });

    persistLastRead(_state.surahId, num);

    if (shouldPlay) {
        _player.play();
    }

    return true;
};

const playSurahInternal = async (surahId, ayahs, reciter, startAyahNum, surahMeta, autoPlay = true, generationOverride = null) => {
    // The caller owns generation when it already started an async navigation.
    // This prevents playSurahById from invalidating itself by incrementing twice.
    const generation = generationOverride ?? ++_generation;
    const resolvedReciter = await resolveReciter(reciter);
    if (generation !== _generation) return;

    if (!resolvedReciter?.id) {
        throw new Error('Selected reciter has no Quran Foundation chapter-reciter ID');
    }

    await ensurePlayer();

    // Audio URL and timing metadata come from the SAME Quran Foundation
    // chapter-recitation response. This removes cross-provider drift.
    const source = await getChapterSource(surahId, resolvedReciter.id, generation);
    if (generation !== _generation || !source) return;

    const startN = startAyahNum ?? ayahNum(ayahs?.[0]) ?? 1;

    setState({
        surahId,
        surahNumber: surahId,
        surahName: surahMeta?.name_english ?? surahMeta?.name ?? '',
        surahArabic: surahMeta?.name_arabic ?? '',
        ayahs: Array.isArray(ayahs) ? ayahs : [],
        audioMap: { surah: source.audioUrl },
        timings: source.timings,
        playingAyah: startN,
        playingWord: null,
        reciter: resolvedReciter,
        playMode: _state.playMode,
        isLoading: true,
        isPlaying: false,
        isBuffering: true,
        positionMs: 0,
        durationMs: 0,
    });

    persistLastRead(surahId, startN);

    await replaceSource(source.audioUrl, generation, false);
    if (generation !== _generation) return;

    const start = timingForAyah(startN)?.startSec;
    if (start != null) {
        _player.seekTo(Number(start));
        setState({
            positionMs: Number(start) * 1000,
            playingAyah: startN,
            playingWord: wordAtTime(startN, Number(start) * 1000),
            isLoading: false,
        });
    } else {
        throw new Error(`Missing timing for ${surahId}:${startN}`);
    }

    if (autoPlay) _player.play();
    else _player.pause();
    updateLockScreen();
};

const playSurahByIdInternal = async (surahId, startAyahNum = null, autoPlay = true) => {
    const generation = ++_generation;
    setState({ isLoading: true, isPlaying: false });

    try {
        const res = await getSurah(surahId);
        if (generation !== _generation) return;
        if (!res?.data) throw new Error('No surah data');

        const surahData = res.data.surah ?? res.data;
        const ayahs = res.data.verses ?? res.data.ayahs ?? surahData.verses ?? surahData.ayahs ?? [];

        // Reuse the generation already reserved above. Do NOT decrement or
        // increment the global generation here; that race was the old bug.
        await playSurahInternal(
            surahId,
            ayahs,
            _state.reciter,
            startAyahNum,
            surahData,
            autoPlay,
            generation,
        );
    } catch (e) {
        if (generation === _generation || generation + 1 === _generation) {
            console.error('[AudioStore] playSurahById:', e);
            setState({ isLoading: false, isPlaying: false, isBuffering: false });
        }
    }
};

const AudioStore = {
    subscribe(fn) {
        _listeners.push(fn);
        fn({ ..._state });
        return () => { _listeners = _listeners.filter(l => l !== fn); };
    },

    getState() { return { ..._state }; },

    async playSurah(surahId, ayahs, reciter, startAyahNum = null, surahMeta = {}) {
        return enqueue(() => playSurahInternal(surahId, ayahs, reciter, startAyahNum, surahMeta, true));
    },

    async playSurahById(surahId, startAyahNum = null) {
        return enqueue(() => playSurahByIdInternal(surahId, startAyahNum, true));
    },

    async playAyah(num, setMode = null) {
        return enqueue(async () => {
            if (!_state.surahId) return;
            if (setMode) setState({ playMode: setMode });

            const mode = setMode ?? _state.playMode;
            const ok = await seekAyahInternal(num, true);
            if (!ok) {
                console.warn('[AudioStore] Cannot seek ayah without timing metadata');
                return;
            }

            if (mode === 'single') {
                setState({ playMode: 'single' });
            }
        });
    },

    async pause() {
        return enqueue(async () => {
            if (!_player) return;
            _player.pause();
            setState({ isPlaying: false });
        });
    },

    async resume() {
        return enqueue(async () => {
            if (!_player) return;
            _player.play();
            setState({ isPlaying: true });
        });
    },

    async togglePlayPause() {
        return enqueue(async () => {
            if (!_player) {
                if (_state.surahId) await playSurahByIdInternal(_state.surahId, _state.playingAyah, true);
                return;
            }
            if (_player.playing) _player.pause();
            else _player.play();
            setState({ isPlaying: !_player.playing });
        });
    },

    async next() {
        return enqueue(async () => {
            if (_navBusy || !_state.surahId) return;
            _navBusy = true;
            try {
                const next = nextAyahNumber(_state.playingAyah);
                if (next != null) {
                    await seekAyahInternal(next, true);
                    return;
                }

                const nextSurah = (_state.surahId ?? 0) + 1;
                if (nextSurah <= 114) await playSurahByIdInternal(nextSurah, null, true);
            } finally {
                _navBusy = false;
            }
        });
    },

    async prev() {
        return enqueue(async () => {
            if (_navBusy || !_state.surahId) return;
            _navBusy = true;
            try {
                const prev = previousAyahNumber(_state.playingAyah);
                if (prev != null) {
                    await seekAyahInternal(prev, true);
                    return;
                }

                const prevSurah = (_state.surahId ?? 2) - 1;
                if (prevSurah >= 1) await playSurahByIdInternal(prevSurah, null, true);
            } finally {
                _navBusy = false;
            }
        });
    },

    async seekTo(positionMs) {
        return enqueue(async () => {
            if (!_player) return;
            const seconds = Math.max(0, Number(positionMs || 0) / 1000);
            _player.seekTo(seconds);
            const ayah = ayahAtTime(seconds);
            setState({ positionMs: seconds * 1000, playingAyah: ayah });
            if (_state.surahId && ayah != null) persistLastRead(_state.surahId, ayah);
        });
    },

    async setSpeed(rate) {
        return enqueue(async () => {
            const safe = Math.max(0.5, Math.min(2, Number(rate) || 1));
            setState({ speed: safe });
            if (_player) _player.setPlaybackRate(safe, 'high');
        });
    },

    setRepeat(mode) { setState({ repeat: mode }); },
    setShuffleSurahs(val) { setState({ shuffleSurahs: !!val }); },
    setPlayMode(mode) { setState({ playMode: mode }); },

    async setVolume(vol) {
        return enqueue(async () => {
            const safe = Math.max(0, Math.min(1, Number(vol) || 0));
            const muted = safe === 0;
            setState({ isMuted: muted });
            if (_player) {
                _player.volume = safe;
                _player.muted = muted;
            }
        });
    },

    async toggleMute() {
        return enqueue(async () => {
            const muted = !_state.isMuted;
            setState({ isMuted: muted });
            if (_player) {
                _player.muted = muted;
                _player.volume = muted ? 0 : 1;
            }
        });
    },

    /**
     * Change reciter without destroying the native player.
     * The same surah and ayah are restored after the new source is loaded.
     */
    async changeReciter(reciter) {
        return enqueue(async () => {
            const current = { ..._state };
            if (!current.surahId) {
                const normalized = normalizeReciter(reciter);
                await AsyncStorage.setItem('selected_reciter', JSON.stringify(normalized));
                setState({ reciter: normalized });
                return;
            }

            const wasPlaying = current.isPlaying;
            const currentAyah = current.playingAyah;
            const currentTime = current.positionMs;
            const oldReciter = current.reciter;
            const normalized = normalizeReciter(reciter);

            if (!normalized.id) throw new Error('Selected reciter has no Quran Foundation ID');
            await AsyncStorage.setItem('selected_reciter', JSON.stringify(normalized));

            const generation = ++_generation;
            setState({
                reciter: normalized,
                isLoading: true,
                isPlaying: false,
                isBuffering: true,
                playingWord: null,
            });

            try {
                const source = await getChapterSource(current.surahId, normalized.id, generation);
                if (generation !== _generation) return;

                await replaceSource(source.audioUrl, generation, false);
                if (generation !== _generation) return;

                setState({ timings: source.timings, isLoading: false });

                let restored = false;
                const restoredTiming = currentAyah != null ? source.timings?.[currentAyah] : null;
                if (restoredTiming) {
                    const start = Number(restoredTiming.startSec);
                    _player.seekTo(start);
                    setState({
                        playingAyah: currentAyah,
                        playingWord: wordAtTime(currentAyah, start * 1000),
                        positionMs: start * 1000,
                    });
                    restored = true;
                }

                if (!restored && Number.isFinite(currentTime) && currentTime > 0) {
                    const seconds = currentTime / 1000;
                    _player.seekTo(seconds);
                    const ayah = ayahAtTime(seconds);
                    setState({
                        positionMs: currentTime,
                        playingAyah: ayah,
                        playingWord: wordAtTime(ayah, currentTime),
                    });
                }

                if (wasPlaying) _player.play();
                else _player.pause();

                updateLockScreen();
                persistLastRead(current.surahId, currentAyah);
            } catch (e) {
                console.error('[AudioStore] changeReciter:', e);
                if (generation === _generation) {
                    setState({
                        reciter: oldReciter,
                        isLoading: false,
                        isPlaying: false,
                        isBuffering: false,
                    });
                }
            }
        });
    },

    async stop() {
        return enqueue(async () => {
            ++_generation;
            _navBusy = false;
            if (_player) {
                try { _player.pause(); } catch (_) {}
                try { _player.clearLockScreenControls?.(); } catch (_) {}
            }
            _state = { ...DEFAULT_STATE };
            notify();
        });
    },

    async prevSurah() {
        return enqueue(async () => {
            if (_navBusy || !_state.surahId || _state.surahId <= 1) return;
            _navBusy = true;
            try { await playSurahByIdInternal(_state.surahId - 1, null, true); }
            finally { _navBusy = false; }
        });
    },

    async nextSurah() {
        return enqueue(async () => {
            if (_navBusy || !_state.surahId || _state.surahId >= 114) return;
            _navBusy = true;
            try { await playSurahByIdInternal(_state.surahId + 1, null, true); }
            finally { _navBusy = false; }
        });
    },

    getSurahList,

    clearChapterCache() {
        _chapterCache.clear();
    },
};

// Configure the audio session once when this service is imported.
configureAudio().catch(() => {});

export default AudioStore;
