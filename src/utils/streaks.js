// src/utils/streaks.js
//
// One consistent rule for every streak type in the app:
//   - A day "counts" if that day's qualifying activity was logged.
//   - If today hasn't been logged yet, that does NOT break the streak —
//     there's still time left in the day. We check yesterday instead.
//   - Any other fully-skipped day DOES break it. No multi-day grace period.
//
// This replaces ad-hoc per-screen streak math (and a separately-mutated
// "current" counter in the `streaks` table) with a value derived live
// from the actual logs, so it can never go stale or drift from reality.

export function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function todayLocalStr() {
    return toLocalDateStr(new Date());
}

/**
 * @param {string[] | Set<string>} activeDates - 'YYYY-MM-DD' strings where
 *   the activity was completed (duplicates fine, order doesn't matter).
 * @returns {number} the current streak length as of right now.
 */
export function computeCurrentStreak(activeDates) {
    const set = activeDates instanceof Set ? activeDates : new Set(activeDates);
    const cursor = new Date();

    if (!set.has(toLocalDateStr(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!set.has(toLocalDateStr(cursor))) return 0; // broken
    }

    let streak = 0;
    while (set.has(toLocalDateStr(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

/**
 * @param {string[] | Set<string>} activeDates
 * @returns {number} the longest run of consecutive days found in the data.
 *   Only as accurate as the date range you fetched — if you only query the
 *   last 400 days, a longer historical run won't be found.
 */
export function computeLongestStreak(activeDates) {
    const dates = Array.from(activeDates instanceof Set ? activeDates : new Set(activeDates)).sort();
    if (dates.length === 0) return 0;

    let longest = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + 'T12:00:00');
        const curr = new Date(dates[i] + 'T12:00:00');
        const diffDays = Math.round((curr - prev) / 86400000);
        if (diffDays === 1) run++;
        else if (diffDays > 1) run = 1;
        longest = Math.max(longest, run);
    }
    return longest;
}