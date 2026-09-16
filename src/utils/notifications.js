// src/utils/notifications.js

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import supabase from '../services/supabase';
import { getDeviceId } from './device';
import { initializeLocation } from './location';

/* =========================================================
   CONFIG
========================================================= */

export const NOTIFICATION_TYPES = {
    PRAYER: 'prayer_reminder',
    JUMUAH: 'jumuah_reminder',
    QURAN: 'quran_reminder',
    HADITH: 'hadith_reminder',
    LESSON: 'lesson_reminder',
    DUA: 'dua_reminder',
};

export const NOTIFICATION_CHANNELS = {
    PRAYER: 'prayer-reminders',
    JUMUAH: 'jumuah-reminders',
    QURAN: 'quran-reminders',
    HADITH: 'hadith-reminders',
    LESSON: 'lesson-reminders',
    DUA: 'dua-reminders',
};

const NOTIFICATION_PREFS_KEY =
    'notification_preferences_v2';

/* =========================================================
   DEFAULT PREFERENCES
========================================================= */

export const DEFAULT_NOTIFICATION_PREFS = {
    prayer_enabled: true,
    prayer_offset: 0,

    jumuah_enabled: true,
    jumuah_offset: 30,

    quran_enabled: false,
    quran_hour: 20,
    quran_minute: 0,

    hadith_enabled: false,
    hadith_hour: 9,
    hadith_minute: 0,

    lesson_enabled: false,
    lesson_hour: 19,
    lesson_minute: 0,

    dua_enabled: false,
    dua_hour: 6,
    dua_minute: 30,
};

/* =========================================================
   PRAYER CONFIG
========================================================= */

const PRAYER_CONFIG = {
    fajr: {
        label: 'Fajr',
        arabic: 'الفجر',
        icon: '🌅',
        rakat: 2,
    },

    dhuhr: {
        label: 'Dhuhr',
        arabic: 'الظهر',
        icon: '☀️',
        rakat: 4,
    },

    asr: {
        label: 'Asr',
        arabic: 'العصر',
        icon: '🌤️',
        rakat: 4,
    },

    maghrib: {
        label: 'Maghrib',
        arabic: 'المغرب',
        icon: '🌇',
        rakat: 3,
    },

    isha: {
        label: 'Isha',
        arabic: 'العشاء',
        icon: '🌙',
        rakat: 4,
    },
};

/* =========================================================
   NOTIFICATION HANDLER
========================================================= */

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/* =========================================================
   CHANNELS
========================================================= */

export async function setupNotificationChannels() {
    if (Platform.OS !== 'android') {
        return;
    }

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.PRAYER,
        {
            name: 'Prayer Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
        }
    );

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.JUMUAH,
        {
            name: "Jumu'ah Reminders",
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        }
    );

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.QURAN,
        {
            name: 'Quran Reminders',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        }
    );

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.HADITH,
        {
            name: 'Hadith Reminders',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        }
    );

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.LESSON,
        {
            name: 'Learning Reminders',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        }
    );

    await Notifications.setNotificationChannelAsync(
        NOTIFICATION_CHANNELS.DUA,
        {
            name: 'Dua & Remembrance',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        }
    );
}

/* =========================================================
   PERMISSION
========================================================= */

export async function requestNotificationPermission() {
    try {
        await setupNotificationChannels();

        const current =
            await Notifications.getPermissionsAsync();

        if (current.granted) {
            return true;
        }

        if (
            current.status ===
            Notifications.PermissionStatus.DENIED
        ) {
            return false;
        }

        const requested =
            await Notifications.requestPermissionsAsync();

        return requested.granted === true;
    } catch (error) {
        console.error(
            '[Notifications] Permission error:',
            error
        );

        return false;
    }
}

/*
  Read-only permission check.

  Unlike requestNotificationPermission(), this never prompts the user -
  it just reports the current OS permission state. Settings screens
  should use this on focus/mount so opening Settings doesn't itself
  trigger an OS permission dialog.
*/
export async function getNotificationPermission() {
    try {
        const permissions =
            await Notifications.getPermissionsAsync();

        return permissions.granted === true;
    } catch (error) {
        console.error(
            '[Notifications] Failed to check permission:',
            error
        );

        return false;
    }
}

/* =========================================================
   PREFERENCES
========================================================= */

export async function getNotificationPreferences() {
    try {
        const raw =
            await AsyncStorage.getItem(
                NOTIFICATION_PREFS_KEY
            );

        if (!raw) {
            return {
                ...DEFAULT_NOTIFICATION_PREFS,
            };
        }

        const parsed = JSON.parse(raw);

        return {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...(parsed || {}),
        };
    } catch (error) {
        console.error(
            '[Notifications] Failed to load preferences:',
            error
        );

        return {
            ...DEFAULT_NOTIFICATION_PREFS,
        };
    }
}

export async function saveNotificationPreferences(
    preferences
) {
    try {
        const merged = {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...(preferences || {}),
        };

        await AsyncStorage.setItem(
            NOTIFICATION_PREFS_KEY,
            JSON.stringify(merged)
        );

        return merged;
    } catch (error) {
        console.error(
            '[Notifications] Failed to save preferences:',
            error
        );

        throw error;
    }
}

/* =========================================================
   CANCEL BY TYPE
========================================================= */

export async function cancelNotificationsByType(type) {
    try {
        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();

        const matching = scheduled.filter(
            notification =>
                notification?.content?.data?.type === type
        );

        await Promise.all(
            matching.map(notification =>
                Notifications.cancelScheduledNotificationAsync(
                    notification.identifier
                ).catch(() => {})
            )
        );

        console.log(
            `[Notifications] Cancelled ${matching.length} ${type} notifications`
        );

        return matching.length;
    } catch (error) {
        console.error(
            `[Notifications] Failed cancelling ${type}:`,
            error
        );

        return 0;
    }
}

/* =========================================================
   CANCEL ALL APP NOTIFICATIONS
========================================================= */

export async function cancelAllAppNotifications() {
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();

        console.log(
            '[Notifications] All scheduled notifications cancelled.'
        );
    } catch (error) {
        console.error(
            '[Notifications] Failed cancelling all:',
            error
        );
    }
}

/* =========================================================
   PRAYER SCHEDULING QUEUE
========================================================= */

let prayerScheduleQueue = Promise.resolve();

function enqueuePrayerSchedule(operation) {
    const next =
        prayerScheduleQueue.then(
            operation,
            operation
        );

    prayerScheduleQueue =
        next.catch(() => {});

    return next;
}

/* =========================================================
   VALIDATE PRAYER TIME
========================================================= */

function isValidTimeString(timeStr) {
    if (
        !timeStr ||
        typeof timeStr !== 'string'
    ) {
        return false;
    }

    const parts = timeStr
        .split(':')
        .map(Number);

    if (parts.length !== 2) {
        return false;
    }

    const [hour, minute] = parts;

    return (
        Number.isInteger(hour) &&
        Number.isInteger(minute) &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59
    );
}

/* =========================================================
   SCHEDULE PRAYER NOTIFICATIONS
========================================================= */

export async function schedulePrayerNotifications(
    prayerTimes,
    settings = {}
) {
    return enqueuePrayerSchedule(async () => {
        const enabled =
            settings?.reminder_enabled === true;

        if (!enabled) {
            await cancelNotificationsByType(
                NOTIFICATION_TYPES.PRAYER
            );

            console.log(
                '[Prayer Notifications] Disabled — all prayer reminders cancelled.'
            );

            return {
                scheduled: 0,
                cancelled: true,
            };
        }

        const granted =
            await requestNotificationPermission();

        if (!granted) {
            console.warn(
                '[Prayer Notifications] Permission not granted; existing reminders were left unchanged.'
            );

            return {
                scheduled: 0,
                permissionDenied: true,
            };
        }

        const requiredKeys =
            Object.keys(PRAYER_CONFIG);

        const invalidKeys =
            requiredKeys.filter(key => {
                return !isValidTimeString(
                    prayerTimes?.[key]
                );
            });

        if (invalidKeys.length > 0) {
            throw new Error(
                `Missing or invalid prayer times: ${invalidKeys.join(
                    ', '
                )}`
            );
        }

        const offset =
            Number(
                settings.notification_offset ?? 0
            );

        if (!Number.isFinite(offset)) {
            throw new Error(
                `Invalid prayer notification offset: ${settings.notification_offset}`
            );
        }

        await cancelNotificationsByType(
            NOTIFICATION_TYPES.PRAYER
        );

        const createdIds = [];

        try {
            for (const [
                key,
                prayer,
            ] of Object.entries(PRAYER_CONFIG)) {
                const [
                    hour,
                    minute,
                ] = prayerTimes[key]
                    .split(':')
                    .map(Number);

                const totalMinutes =
                    hour * 60 +
                    minute -
                    offset;

                const normalized =
                    ((totalMinutes % 1440) +
                        1440) %
                    1440;

                const adjustedHour =
                    Math.floor(
                        normalized / 60
                    );

                const adjustedMinute =
                    normalized % 60;

                const identifier =
                    await Notifications.scheduleNotificationAsync(
                        {
                            content: {
                                title: `${prayer.icon} ${prayer.label} · ${prayer.arabic}`,

                                body:
                                    offset > 0
                                        ? `${prayer.label} begins in ${offset} minutes.`
                                        : `It is time for ${prayer.label}. ${prayer.rakat} rak'at.`,

                                sound: 'default',

                                ...(Platform.OS ===
                                'android'
                                    ? {
                                        channelId:
                                        NOTIFICATION_CHANNELS.PRAYER,
                                    }
                                    : {}),

                                data: {
                                    type:
                                    NOTIFICATION_TYPES.PRAYER,

                                    prayer: key,

                                    route:
                                        '/prayer-tracker',
                                },
                            },

                            trigger: {
                                type: 'daily',
                                hour:
                                adjustedHour,
                                minute:
                                adjustedMinute,
                            },
                        }
                    );

                createdIds.push(identifier);
            }
        } catch (error) {
            await Promise.all(
                createdIds.map(id =>
                    Notifications.cancelScheduledNotificationAsync(
                        id
                    ).catch(() => {})
                )
            );

            throw error;
        }

        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();

        const prayerScheduled =
            scheduled.filter(
                notification =>
                    notification?.content?.data
                        ?.type ===
                    NOTIFICATION_TYPES.PRAYER
            );

        if (prayerScheduled.length !== 5) {
            throw new Error(
                `Prayer notification verification failed: expected 5, found ${prayerScheduled.length}`
            );
        }

        console.log(
            '[Prayer Notifications] Successfully scheduled 5 prayer reminders.'
        );

        return {
            scheduled: 5,
            cancelled: false,
        };
    });
}

/* =========================================================
   TIME HELPERS
========================================================= */

function parseTimeToMinutes(timeStr) {
    if (!timeStr) {
        return null;
    }

    const normalized =
        String(timeStr)
            .trim()
            .toUpperCase();

    const match =
        normalized.match(
            /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/
        );

    if (!match) {
        return null;
    }

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3];

    if (meridiem) {
        if (
            hour < 1 ||
            hour > 12 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        if (meridiem === 'AM') {
            if (hour === 12) {
                hour = 0;
            }
        } else if (meridiem === 'PM') {
            if (hour !== 12) {
                hour += 12;
            }
        }
    }

    if (
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    return hour * 60 + minute;
}

function minutesToTime(minutes) {
    const normalized =
        ((minutes % 1440) + 1440) %
        1440;

    const hour =
        Math.floor(normalized / 60);

    const minute =
        normalized % 60;

    return {
        hour,
        minute,
    };
}

function subtractMinutes(
    timeStr,
    amount
) {
    const total =
        parseTimeToMinutes(timeStr);

    if (total === null) {
        return null;
    }

    return minutesToTime(
        total - Number(amount || 0)
    );
}

/* =========================================================
   FRIDAY / JUMUAH
========================================================= */

function getNextFriday(date = new Date()) {
    const result =
        new Date(date);

    const currentDay =
        result.getDay();

    const daysUntilFriday =
        (5 - currentDay + 7) % 7;

    result.setDate(
        result.getDate() +
        daysUntilFriday
    );

    return result;
}

/*
  Fetch Friday Dhuhr using the cached location.

  This intentionally uses the same Ummah API used by
  the existing prayer-time system.
*/

/*
 * UmmahAPI's `method` parameter takes names like
 * "MuslimWorldLeague", "Egyptian", "UmmAlQura" - not the numeric
 * IDs this app stores in settings.calculation_method.
 *
 * This map is keyed off this app's OWN CALC_METHODS ids
 * (see settings.jsx), not a generic Aladhan-style numbering -
 * note id '13' is Gulf Region in this app specifically, which
 * does not match other APIs' numbering.
 */
const UMMAH_API_METHOD_MAP = {
    '1': 'Karachi',
    '2': 'ISNA',
    '3': 'MuslimWorldLeague',
    '4': 'UmmAlQura',
    '5': 'Egyptian',
    '13': 'Gulf',
};

async function getFridayDhuhr(
    settings = {}
) {
    try {
        const location =
            await initializeLocation();

        if (
            !location?.latitude ||
            !location?.longitude
        ) {
            throw new Error(
                'Location unavailable for Jumu’ah reminder.'
            );
        }

        const friday =
            getNextFriday();

        const year =
            friday.getFullYear();

        const month =
            String(
                friday.getMonth() + 1
            ).padStart(2, '0');

        const day =
            String(
                friday.getDate()
            ).padStart(2, '0');

        const date =
            `${year}-${month}-${day}`;

        const rawMethod =
            String(
                settings?.calculation_method ??
                '3'
            );

        const method =
            UMMAH_API_METHOD_MAP[rawMethod] ??
            'MuslimWorldLeague';

        const madhab =
            settings?.madhab === 'Hanafi'
                ? 'Hanafi'
                : 'Shafi';

        const params =
            new URLSearchParams({
                lat:
                    String(
                        location.latitude
                    ),

                lng:
                    String(
                        location.longitude
                    ),

                date,

                method,

                madhab,
            });

        const url =
            `https://ummahapi.com/api/prayer-times?${params.toString()}`;

        console.log(
            '[Jumu’ah] Fetching Friday prayer times:',
            url
        );

        const response =
            await fetch(url);

        const json =
            await response.json();

        if (!response.ok) {
            console.error(
                '[Jumu’ah] Prayer API error:',
                {
                    status: response.status,
                    response: json,
                }
            );

            throw new Error(
                `Prayer API returned ${response.status}`
            );
        }

        /*
         * UmmahAPI's documented response shape is:
         *
         * {
         *   success: true,
         *   data: {
         *     prayer_times: { Fajr, Dhuhr, Asr, Maghrib, Isha },
         *     prayer_datetimes: { ... ISO timestamps ... },
         *     ...
         *   }
         * }
         *
         * We check the documented shape first, then fall back to a
         * couple of alternate shapes seen in the wild, rather than
         * assuming any single one and silently failing if it drifts.
         */
        const payload =
            json?.data ?? json ?? {};

        const timings =
            payload?.prayer_times ??
            payload?.timings ??
            payload;

        const dhuhr =
            timings?.Dhuhr ??
            timings?.dhuhr;

        if (!dhuhr) {
            console.error(
                '[Jumu’ah] Unexpected API response:',
                json
            );

            throw new Error(
                'Dhuhr time was not returned by prayer API.'
            );
        }

        console.log(
            '[Jumu’ah] Friday Dhuhr:',
            dhuhr
        );

        return dhuhr;
    } catch (error) {
        console.error(
            '[Jumu’ah] Failed to fetch Friday Dhuhr:',
            error
        );

        return null;
    }
}

/* =========================================================
   SCHEDULE JUMUAH
========================================================= */

export async function scheduleJumuahNotification(
    settings = {},
    prefs = {}
) {
    try {
        if (prefs?.jumuah_enabled !== true) {
            console.log(
                '[Jumu’ah] Reminder disabled.'
            );

            await cancelNotificationsByType(
                NOTIFICATION_TYPES.JUMUAH
            );

            return {
                scheduled: 0,
                disabled: true,
            };
        }

        const granted =
            await requestNotificationPermission();

        if (!granted) {
            console.warn(
                '[Jumu’ah] Notification permission denied.'
            );

            return {
                scheduled: 0,
                permissionDenied: true,
            };
        }

        const dhuhr =
            await getFridayDhuhr(settings);

        if (!dhuhr) {
            return {
                scheduled: 0,
                unavailable: true,
            };
        }

        const offset =
            Number(
                prefs?.jumuah_offset ?? 30
            );

        if (!Number.isFinite(offset)) {
            throw new Error(
                'Invalid Jumu’ah offset.'
            );
        }

        const adjusted =
            subtractMinutes(dhuhr, offset);

        if (!adjusted) {
            throw new Error(
                `Invalid Dhuhr time: ${dhuhr}`
            );
        }

        // cancel only after everything above is valid
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.JUMUAH
        );

        const identifier =
            await Notifications.scheduleNotificationAsync({
                content: {
                    title:
                        "🕌 Jumu'ah is approaching",

                    body:
                        offset > 0
                            ? `Prepare for the Friday prayer · ${offset} minutes before Dhuhr.`
                            : 'Prepare for the Friday prayer.',

                    sound: 'default',

                    ...(Platform.OS === 'android'
                        ? {
                            channelId:
                            NOTIFICATION_CHANNELS.JUMUAH,
                        }
                        : {}),

                    data: {
                        type:
                        NOTIFICATION_TYPES.JUMUAH,
                        route:
                            '/prayer-tracker',
                    },
                },

                trigger: {
                    type: 'weekly',
                    weekday: 6,
                    hour: adjusted.hour,
                    minute: adjusted.minute,
                },
            });

        console.log(
            '[Jumu’ah] Scheduled:',
            identifier
        );

        return {
            scheduled: 1,
            identifier,
        };
    } catch (error) {
        console.error(
            '[Jumu’ah] Scheduling failed:',
            error
        );

        return {
            scheduled: 0,
            error,
        };
    }
}

/* =========================================================
   QURAN RECOMMENDATIONS
========================================================= */

const QURAN_RECOMMENDATIONS = [
    {
        number: 67,
        name: 'Al-Mulk',
    },

    {
        number: 55,
        name: 'Ar-Rahman',
    },

    {
        number: 36,
        name: 'Ya-Sin',
    },

    {
        number: 18,
        name: 'Al-Kahf',
    },

    {
        number: 56,
        name: "Al-Waqi'ah",
    },

    {
        number: 32,
        name: 'As-Sajdah',
    },

    {
        number: 78,
        name: "An-Naba'",
    },
];

/*
 * Expo weekly weekday:
 *
 * 1 = Sunday
 * 2 = Monday
 * 3 = Tuesday
 * 4 = Wednesday
 * 5 = Thursday
 * 6 = Friday
 * 7 = Saturday
 *
 * We intentionally alternate:
 *
 * Sunday    → recommendation
 * Monday    → continue
 * Tuesday   → recommendation
 * Wednesday → continue
 * Thursday  → recommendation
 * Friday    → continue
 * Saturday  → recommendation
 *
 * If there is no saved Quran position, a recommendation is used instead.
 */
const QURAN_CONTINUE_DAYS = new Set([
    1, // Monday
    3, // Wednesday
    5, // Friday
]);

/* =========================================================
   QURAN REMINDER CONTENT
========================================================= */

async function getQuranReminderContent(
    weekdayIndex
) {
    const shouldContinue =
        QURAN_CONTINUE_DAYS.has(
            Number(weekdayIndex)
        );

    if (shouldContinue) {
        try {
            const raw =
                await AsyncStorage.getItem(
                    'last_read_surah'
                );

            if (raw) {
                const lastRead =
                    JSON.parse(raw);

                const surahId =
                    Number(
                        lastRead?.number ??
                        lastRead?.surahId
                    );

                const ayah =
                    Number(
                        lastRead?.ayah ??
                        lastRead?.ayahNumber ??
                        lastRead?.verse
                    ) || null;

                if (
                    Number.isInteger(surahId) &&
                    surahId >= 1 &&
                    surahId <= 114
                ) {
                    const surahName =
                        lastRead?.name ??
                        lastRead?.surahName ??
                        `Surah ${surahId}`;

                    return {
                        title:
                            '📖 Continue your Quran',

                        body:
                            ayah
                                ? `You left off at ${surahName} · Ayah ${ayah}. Continue your listening journey.`
                                : `You left off at ${surahName}. Continue your listening journey.`,

                        route:
                            `/quran/surah/${surahId}`,

                        data: {
                            surahId,
                            ayah,
                            autoPlay: true,
                        },
                    };
                }
            }
        } catch (error) {
            console.warn(
                '[Quran Reminder] Failed reading last position:',
                error?.message
            );
        }
    }

    const recommendationIndex =
        Math.abs(
            Number(weekdayIndex) || 0
        ) %
        QURAN_RECOMMENDATIONS.length;

    const recommendation =
        QURAN_RECOMMENDATIONS[
            recommendationIndex
            ];

    return {
        title:
            '📖 A Surah for today',

        body:
            `Take a few peaceful minutes with Surah ${recommendation.name}. Listen, reflect, and reconnect with the Quran.`,

        route:
            `/quran/surah/${recommendation.number}`,

        data: {
            surahId:
            recommendation.number,

            ayah: null,

            autoPlay: true,
        },
    };
}

/* =========================================================
   LESSON CONTINUATION
========================================================= */

async function getLessonReminderContent() {
    try {
        const device_id =
            await getDeviceId();

        if (!device_id) {
            return {
                title:
                    '📚 Continue learning',

                body:
                    'Continue your next lesson and keep building your knowledge.',

                data: {},

                route:
                    '/learn',
            };
        }

        const {
            data: lessons,
            error: lessonsError,
        } = await supabase
            .from('lessons')
            .select(
                'id, title, order_index'
            )
            .order(
                'order_index',
                {
                    ascending: true,
                }
            );

        if (lessonsError) {
            throw lessonsError;
        }

        if (
            !lessons ||
            lessons.length === 0
        ) {
            return {
                title:
                    '📚 Continue learning',

                body:
                    'Take a few minutes today to continue your Islamic learning journey.',

                data: {},

                route:
                    '/learn',
            };
        }

        const {
            data: progress,
            error: progressError,
        } = await supabase
            .from('lesson_progress')
            .select(
                'lesson_id, completed'
            )
            .eq(
                'device_id',
                device_id
            );

        if (progressError) {
            throw progressError;
        }

        const completedIds =
            new Set(
                (progress || [])
                    .filter(
                        item =>
                            item.completed ===
                            true
                    )
                    .map(
                        item =>
                            item.lesson_id
                    )
            );

        const nextLesson =
            lessons.find(
                lesson =>
                    !completedIds.has(
                        lesson.id
                    )
            );

        if (!nextLesson) {
            return {
                title:
                    '📚 Keep learning',

                body:
                    'You have completed your current lessons. Revisit a lesson or explore something new today.',

                data: {},

                route:
                    '/learn',
            };
        }

        return {
            title:
                '📚 Continue learning',

            body:
                `Your next lesson is “${nextLesson.title}”. Pick up where you left off.`,

            data: {
                lessonId:
                nextLesson.id,
            },

            route:
                `/learn/lesson/${nextLesson.id}`,
        };
    } catch (error) {
        console.error(
            '[Lesson Reminder] Failed:',
            error
        );

        return {
            title:
                '📚 Continue learning',

            body:
                'Take a few minutes today to continue your Islamic learning journey.',

            data: {},

            route:
                '/learn',
        };
    }
}

/* =========================================================
   HADITH CONTENT
========================================================= */

function getLocalDateKey(date = new Date()) {
    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, '0');

    const day =
        String(
            date.getDate()
        ).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

async function getHadithReminderContent() {
    try {
        const dateKey =
            getLocalDateKey();

        const {
            count,
            error: countError,
        } = await supabase
            .from('hadiths')
            .select(
                'id',
                {
                    count: 'exact',
                    head: true,
                }
            );

        if (countError) {
            throw countError;
        }

        if (!count || count <= 0) {
            throw new Error(
                'No Hadith records found.'
            );
        }

        const [
            year,
            month,
            day,
        ] =
            dateKey
                .split('-')
                .map(Number);

        const dayNumber =
            Math.floor(
                Date.UTC(
                    year,
                    month - 1,
                    day
                ) / 86400000
            );

        const index =
            ((dayNumber % count) +
                count) %
            count;

        const {
            data,
            error,
        } = await supabase
            .from('hadiths')
            .select(
                `
                id,
                translation,
                arabic,
                book,
                hadith_number,
                grade
                `
            )
            .order(
                'id',
                {
                    ascending: true,
                }
            )
            .range(
                index,
                index
            )
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(
                'Could not select today’s Hadith.'
            );
        }

        const translation =
            String(
                data.translation ??
                ''
            ).trim();

        const body =
            translation.length > 180
                ? `${translation.slice(0, 177)}…`
                : translation ||
                'Take a moment to read and reflect on today’s Hadith.';

        return {
            title:
                '📜 Hadith of the Day',

            body,

            route:
                `/hadith/${data.id}`,

            data: {
                hadithId:
                data.id,
            },
        };
    } catch (error) {
        console.error(
            '[Hadith Reminder] Failed:',
            error
        );

        return {
            title:
                '📜 Hadith of the Day',

            body:
                'Take a moment today to read and reflect on a Hadith.',

            route:
                '/hadith',

            data: {},
        };
    }
}

/* =========================================================
   DUA CONTENT
========================================================= */

function getDuaReminderContent() {
    return {
        title:
            '🤲 A moment for remembrance',

        body:
            'Take a quiet moment to make dua and remember Allah.',

        /*
         * /dua is not the reliable entry point in the current routing.
         * The Dua library is available from Explore.
         */
        route:
            '/explore',

        data: {},
    };
}

/* =========================================================
   GENERIC WEEKLY CONTENT SCHEDULER
========================================================= */

async function scheduleWeeklyContent({
                                         type,
                                         channelId,
                                         hour,
                                         minute,
                                         getContent,
                                     }) {
    await cancelNotificationsByType(
        type
    );

    const created = [];

    try {
        /*
          Expo weekday:
          1 = Sunday
          2 = Monday
          3 = Tuesday
          4 = Wednesday
          5 = Thursday
          6 = Friday
          7 = Saturday
        */

        for (
            let weekday = 1;
            weekday <= 7;
            weekday++
        ) {
            const weekdayIndex =
                weekday - 1;

            const content =
                await getContent(
                    weekdayIndex
                );

            const identifier =
                await Notifications.scheduleNotificationAsync(
                    {
                        content: {
                            title:
                            content.title,

                            body:
                            content.body,

                            sound: 'default',

                            ...(Platform.OS ===
                            'android'
                                ? {
                                    channelId,
                                }
                                : {}),

                            data: {
                                type,

                                route:
                                content.route,

                                ...(content.data ||
                                    {}),
                            },
                        },

                        trigger: {
                            type: 'weekly',

                            weekday,

                            hour,

                            minute,
                        },
                    }
                );

            created.push(
                identifier
            );
        }

        console.log(
            `[Notifications] Scheduled ${created.length} weekly ${type} notifications.`
        );

        return {
            scheduled:
            created.length,
        };
    } catch (error) {
        await Promise.all(
            created.map(id =>
                Notifications.cancelScheduledNotificationAsync(
                    id
                ).catch(() => {})
            )
        );

        console.error(
            `[Notifications] Failed scheduling weekly ${type}:`,
            error
        );

        throw error;
    }
}

/* =========================================================
   REFRESH CONTENT NOTIFICATIONS
========================================================= */

export async function refreshContentNotifications(
    prefs = {},
    settings = {}
) {
    const merged = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(prefs || {}),
    };

    const anyEnabled =
        merged.quran_enabled ||
        merged.hadith_enabled ||
        merged.lesson_enabled ||
        merged.dua_enabled ||
        merged.jumuah_enabled;

    if (!anyEnabled) {
        await Promise.all([
            cancelNotificationsByType(
                NOTIFICATION_TYPES.QURAN
            ),

            cancelNotificationsByType(
                NOTIFICATION_TYPES.HADITH
            ),

            cancelNotificationsByType(
                NOTIFICATION_TYPES.LESSON
            ),

            cancelNotificationsByType(
                NOTIFICATION_TYPES.DUA
            ),

            cancelNotificationsByType(
                NOTIFICATION_TYPES.JUMUAH
            ),
        ]);

        console.log(
            '[Content Notifications] All optional reminders disabled.'
        );

        return {
            scheduled: 0,
        };
    }

    const granted =
        await requestNotificationPermission();

    if (!granted) {
        console.warn(
            '[Content Notifications] Permission denied; existing reminders were left unchanged.'
        );

        return {
            scheduled: 0,
            permissionDenied: true,
        };
    }

    const results = {};

    /* -----------------------------------------
       JUMUAH
    ----------------------------------------- */

    if (
        merged.jumuah_enabled ===
        true
    ) {
        results.jumuah =
            await scheduleJumuahNotification(
                settings,
                merged
            );
    } else {
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.JUMUAH
        );
    }

    /* -----------------------------------------
       QURAN
    ----------------------------------------- */

    if (
        merged.quran_enabled ===
        true
    ) {
        results.quran =
            await scheduleWeeklyContent({
                type:
                NOTIFICATION_TYPES.QURAN,

                channelId:
                NOTIFICATION_CHANNELS.QURAN,

                hour:
                    Number(
                        merged.quran_hour ??
                        20
                    ),

                minute:
                    Number(
                        merged.quran_minute ??
                        0
                    ),

                getContent:
                getQuranReminderContent,
            });
    } else {
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.QURAN
        );
    }

    /* -----------------------------------------
       LESSON
    ----------------------------------------- */

    if (
        merged.lesson_enabled ===
        true
    ) {
        results.lesson =
            await scheduleWeeklyContent({
                type:
                NOTIFICATION_TYPES.LESSON,

                channelId:
                NOTIFICATION_CHANNELS.LESSON,

                hour:
                    Number(
                        merged.lesson_hour ??
                        19
                    ),

                minute:
                    Number(
                        merged.lesson_minute ??
                        0
                    ),

                getContent:
                    async () =>
                        getLessonReminderContent(),
            });
    } else {
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.LESSON
        );
    }

    /* -----------------------------------------
       HADITH
    ----------------------------------------- */

    if (
        merged.hadith_enabled ===
        true
    ) {
        results.hadith =
            await scheduleWeeklyContent({
                type:
                NOTIFICATION_TYPES.HADITH,

                channelId:
                NOTIFICATION_CHANNELS.HADITH,

                hour:
                    Number(
                        merged.hadith_hour ??
                        9
                    ),

                minute:
                    Number(
                        merged.hadith_minute ??
                        0
                    ),

                getContent:
                getHadithReminderContent,
            });
    } else {
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.HADITH
        );
    }

    /* -----------------------------------------
       DUA
    ----------------------------------------- */

    if (
        merged.dua_enabled ===
        true
    ) {
        results.dua =
            await scheduleWeeklyContent({
                type:
                NOTIFICATION_TYPES.DUA,

                channelId:
                NOTIFICATION_CHANNELS.DUA,

                hour:
                    Number(
                        merged.dua_hour ??
                        6
                    ),

                minute:
                    Number(
                        merged.dua_minute ??
                        30
                    ),

                getContent:
                getDuaReminderContent,
            });
    } else {
        await cancelNotificationsByType(
            NOTIFICATION_TYPES.DUA
        );
    }

    console.log(
        '[Content Notifications] Refresh complete:',
        results
    );

    return results;
}

/* =========================================================
   NOTIFICATION ROUTING
========================================================= */

export function getNotificationRoute(
    notification
) {
    const data =
        notification?.request?.content
            ?.data ??
        notification?.content
            ?.data ??
        {};

    switch (data.type) {
        case NOTIFICATION_TYPES.PRAYER:
            return '/prayer-tracker';

        case NOTIFICATION_TYPES.JUMUAH:
            return '/prayer-tracker';

        case NOTIFICATION_TYPES.QURAN: {
            const surahId =
                Number(data.surahId);

            if (
                Number.isInteger(surahId) &&
                surahId >= 1 &&
                surahId <= 114
            ) {
                const ayah =
                    Number(data.ayah) || null;

                const query =
                    ayah
                        ? `?notificationAyah=${ayah}&autoPlay=1`
                        : '?autoPlay=1';

                return `/quran/surah/${surahId}${query}`;
            }

            return '/quran';
        }

        case NOTIFICATION_TYPES.HADITH: {
            if (data.hadithId) {
                return `/hadith/${data.hadithId}`;
            }

            return '/hadith';
        }

        case NOTIFICATION_TYPES.LESSON: {
            if (data.lessonId) {
                return `/learn/lesson/${data.lessonId}`;
            }

            return '/learn';
        }

        case NOTIFICATION_TYPES.DUA: {
            if (data.duaId) {
                return `/explore/dua/${data.duaId}`;
            }

            return '/explore';
        }

        default:
            /*
             * Preserve custom routes only for notifications that do not
             * belong to one of the known app notification types.
             */
            return data.route ?? null;
    }
}

/* =========================================================
   HANDLE NOTIFICATION TAP
========================================================= */

export function initializeNotificationNavigation() {
    const subscription =
        Notifications.addNotificationResponseReceivedListener(
            response => {
                try {
                    const route =
                        getNotificationRoute(
                            response?.notification
                        );

                    console.log(
                        '[Notifications] Notification tapped:',
                        {
                            type:
                            response?.notification
                                ?.request
                                ?.content
                                ?.data
                                ?.type,

                            prayer:
                            response?.notification
                                ?.request
                                ?.content
                                ?.data
                                ?.prayer,

                            route,
                        }
                    );

                    if (!route) {
                        return;
                    }

                    setTimeout(() => {
                        try {
                            router.push(
                                route
                            );
                        } catch (error) {
                            console.error(
                                '[Notifications] Navigation failed:',
                                error
                            );
                        }
                    }, 100);
                } catch (error) {
                    console.error(
                        '[Notifications] Navigation listener error:',
                        error
                    );
                }
            }
        );

    return () => {
        subscription.remove();
    };
}

/* =========================================================
   HANDLE INITIAL NOTIFICATION
========================================================= */

export async function handleInitialNotification() {
    try {
        const response =
            await Notifications.getLastNotificationResponseAsync();

        if (!response) {
            return;
        }

        const route =
            getNotificationRoute(
                response.notification
            );

        if (!route) {
            return;
        }

        console.log(
            '[Notifications] App opened from notification:',
            route
        );

        setTimeout(() => {
            try {
                router.push(route);
            } catch (error) {
                console.error(
                    '[Notifications] Initial navigation failed:',
                    error
                );
            }
        }, 300);
    } catch (error) {
        console.error(
            '[Notifications] Initial notification handling failed:',
            error
        );
    }
}

/* =========================================================
   GET SCHEDULED NOTIFICATIONS
========================================================= */

export async function getScheduledNotifications() {
    try {
        return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
        console.error(
            '[Notifications] Failed to get scheduled notifications:',
            error
        );

        return [];
    }
}

/* =========================================================
   DEBUG / SUMMARY
========================================================= */

export async function getNotificationSummary() {
    try {
        const scheduled =
            await getScheduledNotifications();

        const summary = {
            prayer: 0,
            jumuah: 0,
            quran: 0,
            hadith: 0,
            lesson: 0,
            dua: 0,
            total: scheduled.length,
        };

        for (const notification of scheduled) {
            const type =
                notification?.content
                    ?.data?.type;

            if (
                type ===
                NOTIFICATION_TYPES.PRAYER
            ) {
                summary.prayer++;
            } else if (
                type ===
                NOTIFICATION_TYPES.JUMUAH
            ) {
                summary.jumuah++;
            } else if (
                type ===
                NOTIFICATION_TYPES.QURAN
            ) {
                summary.quran++;
            } else if (
                type ===
                NOTIFICATION_TYPES.HADITH
            ) {
                summary.hadith++;
            } else if (
                type ===
                NOTIFICATION_TYPES.LESSON
            ) {
                summary.lesson++;
            } else if (
                type ===
                NOTIFICATION_TYPES.DUA
            ) {
                summary.dua++;
            }
        }

        return summary;
    } catch (error) {
        console.error(
            '[Notifications] Failed to create summary:',
            error
        );

        return {
            prayer: 0,
            jumuah: 0,
            quran: 0,
            hadith: 0,
            lesson: 0,
            dua: 0,
            total: 0,
        };
    }
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,

    DEFAULT_NOTIFICATION_PREFS,

    requestNotificationPermission,
    getNotificationPermission,

    setupNotificationChannels,

    getNotificationPreferences,
    saveNotificationPreferences,

    schedulePrayerNotifications,
    scheduleJumuahNotification,

    refreshContentNotifications,

    cancelNotificationsByType,
    cancelAllAppNotifications,

    getScheduledNotifications,
    getNotificationSummary,

    getNotificationRoute,

    initializeNotificationNavigation,
    handleInitialNotification,
};