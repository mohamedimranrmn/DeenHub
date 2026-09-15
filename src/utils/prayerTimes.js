/**
 * src/utils/prayerTimes.js
 *
 * Shared pipeline: cached location → prayer times (cached same-day/same-place)
 * → schedule/cancel local prayer notifications.
 *
 * Pulled out of prayer-tracker.jsx so Settings can trigger a reschedule
 * immediately when the user flips "Prayer Reminders" on, or changes the
 * notification offset — without needing the Prayer Tracker screen mounted.
 *
 * Location handling follows src/utils/location.js's cache-first contract:
 * initializeLocation() only touches GPS if there is no cache yet. Everyday
 * calls (including this one) never re-prompt for permission or re-fetch GPS.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeLocation, getCoordsFromCity, distanceM } from './location';
import { schedulePrayerNotifications, cancelNotificationsByType, NOTIFICATION_TYPES } from './notifications';

const UMMAH_BASE = 'https://ummahapi.com/api';
const UMMAH_HEADERS = {
    'Content-Type': 'application/json',
    ...(process.env.EXPO_PUBLIC_UMMAH_API_KEY
        ? { 'X-API-Key': process.env.EXPO_PUBLIC_UMMAH_API_KEY }
        : {}),
};

export const TIMES_CACHE_KEY  = 'cached_prayer_times_v2'; // { times, date, latitude, longitude }
const MOVE_THRESHOLD_M = 500;                              // treat as "same place" within 500m

function todayLocalStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Fetch prayer times from UmmahAPI. Cached by date+lat+lon so calling this
 * repeatedly the same day from the same place costs zero network.
 */
export async function fetchTimesFromAPI(latitude, longitude, methodId, madhabSetting) {
    const today = todayLocalStr();

    try {
        const cached = await AsyncStorage.getItem(TIMES_CACHE_KEY);
        if (cached) {
            const c = JSON.parse(cached);
            const dist = distanceM(latitude, longitude, c.latitude ?? latitude, c.longitude ?? longitude);
            if (c.date === today && dist < MOVE_THRESHOLD_M && c.times?.fajr) {
                return c.times; // cache hit — same day, same place
            }
        }
    } catch {}

    const METHOD_MAP = {
        MWL: 'MuslimWorldLeague', ISNA: 'NorthAmerica', Egypt: 'Egyptian',
        Makkah: 'UmmAlQura', Karachi: 'Karachi', Tehran: 'Tehran', Jafari: 'Tehran',
    };
    const method = METHOD_MAP[methodId] ?? 'MuslimWorldLeague';
    const madhab = madhabSetting === 'Hanafi' ? 'Hanafi' : 'Shafi';

    let timezone = 'UTC';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}

    const params = new URLSearchParams({
        lat: String(latitude), lng: String(longitude), date: today, method, madhab, timezone,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(`${UMMAH_BASE}/prayer-times?${params.toString()}`, {
            headers: UMMAH_HEADERS,
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`UmmahAPI HTTP ${res.status}`);
        const json = await res.json();

        const pt = json?.data?.prayer_times ?? json?.data;
        if (!pt?.fajr) throw new Error('Unexpected prayer times shape');

        const normalise = (t) => {
            if (!t) return null;
            if (/^\d{2}:\d{2}$/.test(t)) return t;
            const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (!m) return null;
            let h = parseInt(m[1], 10);
            const min = m[2].padStart(2, '0');
            if (m[3]) {
                if (m[3].toUpperCase() === 'PM' && h < 12) h += 12;
                if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
            }
            return `${String(h).padStart(2, '0')}:${min}`;
        };

        const times = {
            fajr: normalise(pt.fajr), dhuhr: normalise(pt.dhuhr), asr: normalise(pt.asr),
            maghrib: normalise(pt.maghrib), isha: normalise(pt.isha),
        };

        try {
            await AsyncStorage.setItem(TIMES_CACHE_KEY, JSON.stringify({ times, date: today, latitude, longitude }));
        } catch {}

        return times;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Resolve cached location (no GPS prompt if already cached) → prayer times
 * → (re)schedule or cancel the 5 daily prayer notifications, in one call.
 *
 * Call this from anywhere the reminder settings change: the Settings screen
 * toggle, the offset picker, or the Prayer Tracker screen's own refresh.
 */
export async function refreshPrayerNotifications(settings) {
    if (!settings?.reminder_enabled) {
        await cancelNotificationsByType(NOTIFICATION_TYPES.PRAYER);
        return;
    }

    try {
        const madhabSetting = settings?.madhab ?? 'Shafi';
        const methodId      = settings?.calculation_method ?? 'MWL';

        let location = null;
        if (settings?.manual_city) {
            const manual = await getCoordsFromCity(settings.manual_city);
            if (manual) location = { latitude: manual.latitude, longitude: manual.longitude };
        }
        if (!location) location = await initializeLocation(); // cache-first — no GPS prompt if cached

        const times = await fetchTimesFromAPI(location.latitude, location.longitude, methodId, madhabSetting);
        await schedulePrayerNotifications(times, settings);
    } catch (e) {
        // Don't block the settings save on this — the user can still fix
        // location/permission from the Prayer Tracker screen, which will
        // retry the same pipeline on its next focus.
        console.warn('[prayerTimes] refreshPrayerNotifications failed:', e?.message);
    }
}