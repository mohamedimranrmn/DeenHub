// src/utils/notifications.js

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* -------------------------------------------------------------------------- */
/* Notification Types                                                         */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_TYPES = {
    PRAYER: 'prayer_reminder',
    QURAN: 'daily_quran',
    HADITH: 'daily_hadith',
    LESSON: 'daily_lesson',
    DUA: 'daily_dua',
};

/* -------------------------------------------------------------------------- */
/* Notification Channels                                                     */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_CHANNELS = {
    PRAYER: 'prayer-reminders',
    QURAN: 'quran-reminders',
    HADITH: 'hadith-reminders',
    LESSON: 'lesson-reminders',
    DUA: 'dua-reminders',
};

/* -------------------------------------------------------------------------- */
/* Notification Handler                                                       */
/* -------------------------------------------------------------------------- */

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/* -------------------------------------------------------------------------- */
/* Android Channels                                                           */
/* -------------------------------------------------------------------------- */

async function setupAndroidChannels() {
    if (Platform.OS !== 'android') return;

    try {
        await Notifications.setNotificationChannelAsync(
            NOTIFICATION_CHANNELS.PRAYER,
            {
                name: 'Prayer Reminders',
                importance: Notifications.AndroidImportance.HIGH,
                sound: 'default',
                vibrationPattern: [0, 250, 250, 250],
                lockscreenVisibility:
                Notifications.AndroidNotificationVisibility.PUBLIC,
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
                name: 'Lesson Reminders',
                importance: Notifications.AndroidImportance.DEFAULT,
                sound: 'default',
            }
        );

        await Notifications.setNotificationChannelAsync(
            NOTIFICATION_CHANNELS.DUA,
            {
                name: 'Dua Reminders',
                importance: Notifications.AndroidImportance.DEFAULT,
                sound: 'default',
            }
        );
    } catch (error) {
        console.warn(
            '[Notifications] Failed to setup Android channels:',
            error
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Permission                                                                 */
/* -------------------------------------------------------------------------- */

export async function requestNotificationPermission() {
    try {
        const current =
            await Notifications.getPermissionsAsync();

        let status = current.status;

        if (status !== 'granted') {
            const requested =
                await Notifications.requestPermissionsAsync();

            status = requested.status;
        }

        if (status !== 'granted') {
            console.warn(
                '[Notifications] Notification permission not granted.'
            );

            return false;
        }

        await setupAndroidChannels();

        return true;
    } catch (error) {
        console.error(
            '[Notifications] Permission error:',
            error
        );

        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */

export async function initializeNotifications() {
    try {
        await setupAndroidChannels();

        const granted =
            await requestNotificationPermission();

        return granted;
    } catch (error) {
        console.error(
            '[Notifications] Initialization error:',
            error
        );

        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Handle Initial Notification                                                */
/*                                                                            */
/* Called when the app is opened by tapping a notification while the app was  */
/* completely closed/backgrounded.                                           */
/* -------------------------------------------------------------------------- */

export async function handleInitialNotification() {
    try {
        const response =
            await Notifications.getLastNotificationResponseAsync();

        if (!response) {
            return null;
        }

        const notification =
            response?.notification;

        const route =
            getNotificationRoute(notification);

        console.log(
            '[Notifications] Initial notification:',
            {
                type:
                notification?.request?.content?.data?.type,
                prayer:
                notification?.request?.content?.data?.prayer,
                route,
            }
        );

        if (!route) {
            return null;
        }

        /*
         * Give Expo Router a moment to finish mounting the root
         * navigation tree before navigating.
         */
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

        return route;
    } catch (error) {
        console.error(
            '[Notifications] Failed to handle initial notification:',
            error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Cancel Notifications By Type                                               */
/* -------------------------------------------------------------------------- */

export async function cancelNotificationsByType(type) {
    try {
        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();

        const matching = scheduled.filter(notification => {
            return (
                notification?.content?.data?.type === type
            );
        });

        if (matching.length === 0) {
            return 0;
        }

        await Promise.all(
            matching.map(notification =>
                Notifications.cancelScheduledNotificationAsync(
                    notification.identifier
                ).catch(error => {
                    console.warn(
                        '[Notifications] Failed to cancel:',
                        notification.identifier,
                        error
                    );
                })
            )
        );

        console.log(
            `[Notifications] Cancelled ${matching.length} notification(s) of type "${type}".`
        );

        return matching.length;
    } catch (error) {
        console.error(
            `[Notifications] Failed to cancel type "${type}":`,
            error
        );

        return 0;
    }
}

/* -------------------------------------------------------------------------- */
/* Cancel Everything                                                          */
/* -------------------------------------------------------------------------- */

export async function cancelAllAppNotifications() {
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();

        console.log(
            '[Notifications] All scheduled notifications cancelled.'
        );
    } catch (error) {
        console.error(
            '[Notifications] Failed to cancel all notifications:',
            error
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Prayer Configuration                                                       */
/* -------------------------------------------------------------------------- */

export const PRAYER_CONFIG = {
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

/* -------------------------------------------------------------------------- */
/* Prayer Scheduling Queue                                                    */
/*                                                                            */
/* IMPORTANT:                                                                */
/* Settings, Prayer Tracker, location refreshes, and app lifecycle events    */
/* can all request prayer rescheduling close together.                       */
/*                                                                            */
/* Without serialization:                                                    */
/*                                                                            */
/*   Request A -> cancel -> schedule                                          */
/*   Request B -> cancel -> schedule                                          */
/*                                                                            */
/* Request B can cancel notifications that Request A just created.            */
/*                                                                            */
/* This queue guarantees that prayer schedules are replaced sequentially.     */
/* -------------------------------------------------------------------------- */

let prayerScheduleQueue = Promise.resolve();

function enqueuePrayerSchedule(operation) {
    const next = prayerScheduleQueue.then(
        operation,
        operation
    );

    prayerScheduleQueue = next.catch(() => {});

    return next;
}

/* -------------------------------------------------------------------------- */
/* Schedule Prayer Notifications                                              */
/* -------------------------------------------------------------------------- */

export async function schedulePrayerNotifications(
    prayerTimes,
    settings = {}
) {
    return enqueuePrayerSchedule(async () => {
        const enabled =
            settings?.reminder_enabled === true;

        /* ------------------------------------------------------------------ */
        /* Disabled                                                            */
        /* ------------------------------------------------------------------ */

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

        /* ------------------------------------------------------------------ */
        /* Permission                                                          */
        /* ------------------------------------------------------------------ */

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

        /* ------------------------------------------------------------------ */
        /* Validate Prayer Times                                               */
        /* ------------------------------------------------------------------ */

        const requiredKeys =
            Object.keys(PRAYER_CONFIG);

        const invalidKeys =
            requiredKeys.filter(key => {
                const timeStr =
                    prayerTimes?.[key];

                if (
                    !timeStr ||
                    typeof timeStr !== 'string'
                ) {
                    return true;
                }

                const parts =
                    timeStr
                        .split(':')
                        .map(Number);

                return (
                    parts.length !== 2 ||
                    !Number.isInteger(parts[0]) ||
                    !Number.isInteger(parts[1]) ||
                    parts[0] < 0 ||
                    parts[0] > 23 ||
                    parts[1] < 0 ||
                    parts[1] > 59
                );
            });

        /*
         * VERY IMPORTANT:
         *
         * Do not cancel a known-good schedule if the new API response
         * is incomplete or malformed.
         */
        if (invalidKeys.length > 0) {
            throw new Error(
                `Missing or invalid prayer times: ${invalidKeys.join(', ')}`
            );
        }

        /* ------------------------------------------------------------------ */
        /* Validate Offset                                                     */
        /* ------------------------------------------------------------------ */

        const offset =
            Number(
                settings.notification_offset ?? 0
            );

        if (!Number.isFinite(offset)) {
            throw new Error(
                `Invalid prayer notification offset: ${settings.notification_offset}`
            );
        }

        /* ------------------------------------------------------------------ */
        /* Replace Existing Prayer Schedule                                    */
        /* ------------------------------------------------------------------ */

        /*
         * Only cancel the existing schedule AFTER:
         *
         * 1. Notifications are permitted
         * 2. All five prayer times are valid
         * 3. Offset is valid
         *
         * And this whole operation is serialized through the queue.
         */

        await cancelNotificationsByType(
            NOTIFICATION_TYPES.PRAYER
        );

        const createdIds = [];

        try {
            /* -------------------------------------------------------------- */
            /* Schedule All Five Prayers                                       */
            /* -------------------------------------------------------------- */

            for (
                const [key, prayer]
                of Object.entries(PRAYER_CONFIG)
                ) {
                const [
                    hour,
                    minute,
                ] =
                    prayerTimes[key]
                        .split(':')
                        .map(Number);

                /*
                 * notification_offset:
                 *
                 * 0  -> exact prayer time
                 * 5  -> 5 minutes before
                 * 10 -> 10 minutes before
                 *
                 * Normalize so values crossing midnight also work.
                 */

                const totalMinutes =
                    hour * 60 +
                    minute -
                    offset;

                const normalized =
                    (
                        (
                            totalMinutes % 1440
                        ) +
                        1440
                    ) %
                    1440;

                const adjustedHour =
                    Math.floor(
                        normalized / 60
                    );

                const adjustedMinute =
                    normalized % 60;

                /* ---------------------------------------------------------- */
                /* Schedule                                                     */
                /* ---------------------------------------------------------- */

                const identifier =
                    await Notifications.scheduleNotificationAsync(
                        {
                            content: {
                                title:
                                    `${prayer.icon} ${prayer.label} · ${prayer.arabic}`,

                                body:
                                    offset > 0
                                        ? `${prayer.label} begins in ${offset} minutes.`
                                        : `It is time for ${prayer.label}. ${prayer.rakat} rak'at.`,

                                sound: 'default',

                                ...(Platform.OS === 'android'
                                    ? {
                                        channelId:
                                        NOTIFICATION_CHANNELS.PRAYER,
                                    }
                                    : {}),

                                data: {
                                    type:
                                    NOTIFICATION_TYPES.PRAYER,

                                    prayer:
                                    key,

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

                console.log(
                    `[Prayer Notifications] ${prayer.label}: ${prayerTimes[key]} -> ${String(
                        adjustedHour
                    ).padStart(2, '0')}:${String(
                        adjustedMinute
                    ).padStart(2, '0')}`,
                    identifier
                );
            }
        } catch (error) {
            /*
             * If scheduling one of the five fails, remove whatever
             * notifications from this operation were already created.
             */

            await Promise.all(
                createdIds.map(id =>
                    Notifications
                        .cancelScheduledNotificationAsync(
                            id
                        )
                        .catch(() => {})
                )
            );

            throw error;
        }

        /* ------------------------------------------------------------------ */
        /* Verify Final Schedule                                               */
        /* ------------------------------------------------------------------ */

        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();

        const prayerScheduled =
            scheduled.filter(
                notification =>
                    notification?.content?.data?.type ===
                    NOTIFICATION_TYPES.PRAYER
            );

        console.log(
            `[Prayer Notifications] Successfully scheduled ${prayerScheduled.length}/5 prayer reminders.`
        );

        /*
         * We expect exactly five prayer notifications:
         *
         * Fajr
         * Dhuhr
         * Asr
         * Maghrib
         * Isha
         */

        if (prayerScheduled.length !== 5) {
            throw new Error(
                `Prayer notification verification failed: expected 5, found ${prayerScheduled.length}`
            );
        }

        return {
            scheduled: 5,
            cancelled: false,
        };
    });
}

/* -------------------------------------------------------------------------- */
/* Test Notification                                                          */
/* -------------------------------------------------------------------------- */

export async function scheduleTestNotification(
    seconds = 5
) {
    try {
        const granted =
            await requestNotificationPermission();

        if (!granted) {
            return null;
        }

        const safeSeconds =
            Math.max(
                1,
                Number(seconds) || 5
            );

        const identifier =
            await Notifications.scheduleNotificationAsync(
                {
                    content: {
                        title: 'Deen Hub Test',
                        body: 'Notifications are working correctly.',
                        sound: 'default',

                        ...(Platform.OS === 'android'
                            ? {
                                channelId:
                                NOTIFICATION_CHANNELS.PRAYER,
                            }
                            : {}),

                        data: {
                            type:
                                'test',
                        },
                    },

                    trigger: {
                        type: 'timeInterval',
                        seconds:
                        safeSeconds,
                        repeats: false,
                    },
                }
            );

        console.log(
            '[Notifications] Test notification scheduled:',
            identifier
        );

        return identifier;
    } catch (error) {
        console.error(
            '[Notifications] Test notification failed:',
            error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Daily Content Configuration                                                */
/* -------------------------------------------------------------------------- */

export const DAILY_NOTIFICATION_CONFIG = {
    quran: {
        type: NOTIFICATION_TYPES.QURAN,
        channel: NOTIFICATION_CHANNELS.QURAN,
        title: '📖 Daily Quran',
        route: '/quran',
    },

    hadith: {
        type: NOTIFICATION_TYPES.HADITH,
        channel: NOTIFICATION_CHANNELS.HADITH,
        title: '📜 Daily Hadith',
        route: '/hadith',
    },

    lesson: {
        type: NOTIFICATION_TYPES.LESSON,
        channel: NOTIFICATION_CHANNELS.LESSON,
        title: '📚 Daily Lesson',
        route: '/lessons',
    },

    dua: {
        type: NOTIFICATION_TYPES.DUA,
        channel: NOTIFICATION_CHANNELS.DUA,
        title: '🤲 Daily Dua',
        route: '/dua',
    },
};

/* -------------------------------------------------------------------------- */
/* Schedule Daily Content Notification                                        */
/* -------------------------------------------------------------------------- */

export async function scheduleDailyContentNotification({
                                                           type,
                                                           title,
                                                           body,
                                                           hour = 9,
                                                           minute = 0,
                                                           route,
                                                           channel,
                                                       }) {
    try {
        const granted =
            await requestNotificationPermission();

        if (!granted) {
            return null;
        }

        if (!type) {
            throw new Error(
                'Notification type is required.'
            );
        }

        await cancelNotificationsByType(type);

        const identifier =
            await Notifications.scheduleNotificationAsync(
                {
                    content: {
                        title:
                            title ?? 'Deen Hub',
                        body:
                            body ?? 'Open Deen Hub for today\'s content.',
                        sound: 'default',

                        ...(Platform.OS === 'android'
                            ? {
                                channelId:
                                channel,
                            }
                            : {}),

                        data: {
                            type,
                            route,
                        },
                    },

                    trigger: {
                        type: 'daily',
                        hour:
                            Number(hour),
                        minute:
                            Number(minute),
                    },
                }
            );

        console.log(
            `[Notifications] Daily ${type} scheduled:`,
            identifier
        );

        return identifier;
    } catch (error) {
        console.error(
            `[Notifications] Failed to schedule ${type}:`,
            error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Cancel Daily Content Notification                                          */
/* -------------------------------------------------------------------------- */

export async function cancelDailyContentNotification(
    type
) {
    return cancelNotificationsByType(type);
}

/* -------------------------------------------------------------------------- */
/* Quran Reminder                                                             */
/* -------------------------------------------------------------------------- */

export async function scheduleDailyQuranNotification(
    options = {}
) {
    return scheduleDailyContentNotification({
        type:
        NOTIFICATION_TYPES.QURAN,

        title:
            options.title ??
            '📖 Daily Quran',

        body:
            options.body ??
            'Take a few moments to read the Quran today.',

        hour:
            options.hour ?? 9,

        minute:
            options.minute ?? 0,

        route:
            options.route ??
            '/quran',

        channel:
        NOTIFICATION_CHANNELS.QURAN,
    });
}

/* -------------------------------------------------------------------------- */
/* Hadith Reminder                                                            */
/* -------------------------------------------------------------------------- */

export async function scheduleDailyHadithNotification(
    options = {}
) {
    return scheduleDailyContentNotification({
        type:
        NOTIFICATION_TYPES.HADITH,

        title:
            options.title ??
            '📜 Daily Hadith',

        body:
            options.body ??
            'Read a Hadith and reflect on its guidance.',

        hour:
            options.hour ?? 10,

        minute:
            options.minute ?? 0,

        route:
            options.route ??
            '/hadith',

        channel:
        NOTIFICATION_CHANNELS.HADITH,
    });
}

/* -------------------------------------------------------------------------- */
/* Lesson Reminder                                                            */
/* -------------------------------------------------------------------------- */

export async function scheduleDailyLessonNotification(
    options = {}
) {
    return scheduleDailyContentNotification({
        type:
        NOTIFICATION_TYPES.LESSON,

        title:
            options.title ??
            '📚 Daily Lesson',

        body:
            options.body ??
            'Continue learning something beneficial today.',

        hour:
            options.hour ?? 18,

        minute:
            options.minute ?? 0,

        route:
            options.route ??
            '/lessons',

        channel:
        NOTIFICATION_CHANNELS.LESSON,
    });
}

/* -------------------------------------------------------------------------- */
/* Dua Reminder                                                               */
/* -------------------------------------------------------------------------- */

export async function scheduleDailyDuaNotification(
    options = {}
) {
    return scheduleDailyContentNotification({
        type:
        NOTIFICATION_TYPES.DUA,

        title:
            options.title ??
            '🤲 Daily Dua',

        body:
            options.body ??
            'Take a moment to remember Allah.',

        hour:
            options.hour ?? 20,

        minute:
            options.minute ?? 0,

        route:
            options.route ??
            '/dua',

        channel:
        NOTIFICATION_CHANNELS.DUA,
    });
}

/* -------------------------------------------------------------------------- */
/* Notification Navigation                                                    */
/* -------------------------------------------------------------------------- */

export function getNotificationRoute(
    notification
) {
    const data =
        notification?.request?.content?.data ??
        notification?.content?.data ??
        {};

    if (data.route) {
        return data.route;
    }

    switch (data.type) {
        case NOTIFICATION_TYPES.PRAYER:
            return '/prayer-tracker';

        case NOTIFICATION_TYPES.QURAN:
            return '/quran';

        case NOTIFICATION_TYPES.HADITH:
            return '/hadith';

        case NOTIFICATION_TYPES.LESSON:
            return '/lessons';

        case NOTIFICATION_TYPES.DUA:
            return '/dua';

        default:
            return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Notification Response Listener                                             */
/* -------------------------------------------------------------------------- */

export function addNotificationResponseListener(
    callback
) {
    return Notifications.addNotificationResponseReceivedListener(
        response => {
            try {
                const route =
                    getNotificationRoute(
                        response?.notification
                    );

                callback?.({
                    response,
                    route,
                });
            } catch (error) {
                console.error(
                    '[Notifications] Response handling error:',
                    error
                );
            }
        }
    );
}

/* -------------------------------------------------------------------------- */
/* Last Notification Response                                                 */
/* -------------------------------------------------------------------------- */

export async function getLastNotificationResponse() {
    try {
        return await Notifications.getLastNotificationResponseAsync();
    } catch (error) {
        console.warn(
            '[Notifications] Failed to get last notification response:',
            error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Notification Listener                                                      */
/* -------------------------------------------------------------------------- */

export function addNotificationReceivedListener(
    callback
) {
    return Notifications.addNotificationReceivedListener(
        notification => {
            try {
                callback?.(notification);
            } catch (error) {
                console.error(
                    '[Notifications] Received listener error:',
                    error
                );
            }
        }
    );
}

/* -------------------------------------------------------------------------- */
/* Scheduled Notifications                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Notification Debug Helper                                                  */
/* -------------------------------------------------------------------------- */

export async function logScheduledNotifications() {
    try {
        const scheduled =
            await Notifications.getAllScheduledNotificationsAsync();

        console.log(
            '\n========== SCHEDULED NOTIFICATIONS =========='
        );

        console.log(
            `Total: ${scheduled.length}`
        );

        scheduled.forEach(
            (notification, index) => {
                console.log(
                    `\n[${index + 1}]`
                );

                console.log(
                    'ID:',
                    notification.identifier
                );

                console.log(
                    'Title:',
                    notification.content?.title
                );

                console.log(
                    'Body:',
                    notification.content?.body
                );

                console.log(
                    'Type:',
                    notification.content?.data?.type
                );

                console.log(
                    'Prayer:',
                    notification.content?.data?.prayer
                );

                console.log(
                    'Route:',
                    notification.content?.data?.route
                );

                console.log(
                    'Trigger:',
                    notification.trigger
                );
            }
        );

        console.log(
            '============================================\n'
        );

        return scheduled;
    } catch (error) {
        console.error(
            '[Notifications] Debug listing failed:',
            error
        );

        return [];
    }
}

/* -------------------------------------------------------------------------- */
/* Storage Helpers                                                            */
/* -------------------------------------------------------------------------- */

const NOTIFICATION_SETTINGS_KEY =
    'notification_settings_v1';

export async function saveNotificationSettings(
    settings
) {
    try {
        await AsyncStorage.setItem(
            NOTIFICATION_SETTINGS_KEY,
            JSON.stringify(settings)
        );

        return true;
    } catch (error) {
        console.warn(
            '[Notifications] Failed to save notification settings:',
            error
        );

        return false;
    }
}

export async function getNotificationSettings() {
    try {
        const value =
            await AsyncStorage.getItem(
                NOTIFICATION_SETTINGS_KEY
            );

        if (!value) {
            return null;
        }

        return JSON.parse(value);
    } catch (error) {
        console.warn(
            '[Notifications] Failed to read notification settings:',
            error
        );

        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Notification Navigation                                                    */
/* -------------------------------------------------------------------------- */

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
                            response?.notification?.request
                                ?.content?.data?.type,
                            route,
                        }
                    );

                    if (route) {
                        // Navigation is handled by the root layout.
                        // We only expose the response through the
                        // listener here.
                    }
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

/* -------------------------------------------------------------------------- */
/* Default Export                                                             */
/* -------------------------------------------------------------------------- */

export default {
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,
    PRAYER_CONFIG,

    requestNotificationPermission,
    initializeNotifications,

    cancelNotificationsByType,
    cancelAllAppNotifications,

    schedulePrayerNotifications,
    scheduleTestNotification,

    scheduleDailyContentNotification,
    cancelDailyContentNotification,

    scheduleDailyQuranNotification,
    scheduleDailyHadithNotification,
    scheduleDailyLessonNotification,
    scheduleDailyDuaNotification,

    getNotificationRoute,

    initializeNotificationNavigation,
    handleInitialNotification,
    addNotificationResponseListener,
    getLastNotificationResponse,
    addNotificationReceivedListener,

    getScheduledNotifications,
    logScheduledNotifications,

    saveNotificationSettings,
    getNotificationSettings,
};