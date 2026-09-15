// src/services/dhikr.js
//
// Central Dhikr data service. device_id is the only identity used
// anywhere in here — there is no user_id, no Supabase Auth session.
//
// Deletion model:
// - Preset dhikr (device_id IS NULL) are shared across every device, so a
//   preset can never be hard-deleted from `dhikr` — that would remove it
//   for everyone. Instead "deleting" a preset just hides it for THIS
//   device via the `dhikr_hidden` table.
// - Custom dhikr (device_id = own device) are owned by a single device,
//   so they can be hard-deleted along with their logged progress.
//
// Requires this table (run once in Supabase SQL editor if it doesn't
// already exist):
//
//   create table if not exists dhikr_hidden (
//     id         bigint generated always as identity primary key,
//     device_id  text not null,
//     dhikr_id   bigint not null references dhikr(id) on delete cascade,
//     created_at timestamptz not null default now(),
//     unique (device_id, dhikr_id)
//   );

import supabase from './supabase';
import { getDeviceId } from '../utils/device';

function getLocalDateString(date = new Date()) {
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Ids of preset dhikr this device has chosen to hide (soft-deleted, per device).
async function getHiddenPresetIds(device_id) {
    const { data, error } = await supabase
        .from('dhikr_hidden')
        .select('dhikr_id')
        .eq('device_id', device_id);

    if (error) {
        // Don't let a missing/unavailable hidden-list break the whole screen —
        // worst case, a hidden preset briefly reappears.
        console.warn('[Dhikr] Could not load hidden presets:', error.message);
        return [];
    }

    return (data ?? []).map(row => row.dhikr_id);
}

// Global preset catalogue — device_id IS NULL rows, shared across every device.
// Excludes any preset this device has hidden.
export async function getDhikrDefinitions() {
    const device_id = await getDeviceId();

    const [{ data, error }, hiddenIds] = await Promise.all([
        supabase
            .from('dhikr')
            .select('id, title, arabic, translation, target_count, category')
            .is('device_id', null)
            .order('id', { ascending: true }),
        getHiddenPresetIds(device_id),
    ]);

    if (error) throw error;

    if (hiddenIds.length === 0) return data ?? [];

    const hidden = new Set(hiddenIds);
    return (data ?? []).filter(d => !hidden.has(d.id));
}

// Device-owned custom dhikr — same `dhikr` table, device_id IS NOT NULL rows.
export async function getCustomDhikr() {
    const device_id = await getDeviceId();

    const { data, error } = await supabase
        .from('dhikr')
        .select('id, title, arabic, translation, target_count, category, created_at')
        .eq('device_id', device_id)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function createCustomDhikr({ title, arabic, translation, target_count }) {
    const device_id = await getDeviceId();

    const { data, error } = await supabase
        .from('dhikr')
        .insert({
            device_id,
            title: title.trim(),
            arabic: arabic.trim(),
            translation: translation.trim(),
            target_count,
            category: 'custom',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Hide a preset dhikr for this device only. The row itself is shared
// (device_id IS NULL) and is never touched — this just records that this
// device no longer wants to see it, via the `dhikr_hidden` table.
export async function hidePresetDhikr(dhikrId) {
    const device_id = await getDeviceId();

    const { error } = await supabase
        .from('dhikr_hidden')
        .upsert(
            { device_id, dhikr_id: dhikrId },
            { onConflict: 'device_id,dhikr_id' }
        );

    if (error) throw error;
}

// Undo hidePresetDhikr — not currently wired to any UI, but useful for a
// future "restore hidden presets" setting.
export async function unhidePresetDhikr(dhikrId) {
    const device_id = await getDeviceId();

    const { error } = await supabase
        .from('dhikr_hidden')
        .delete()
        .eq('device_id', device_id)
        .eq('dhikr_id', dhikrId);

    if (error) throw error;
}

// Hard-delete a custom dhikr this device created, plus any logged progress
// for it. `.eq('device_id', device_id)` in the delete guarantees a device
// can only ever delete its own custom dhikr, never another device's or a
// shared preset.
export async function deleteCustomDhikr(dhikrId) {
    const device_id = await getDeviceId();

    // Clean up today's (and any historical) progress logs for this dhikr
    // first so nothing orphaned is left behind.
    const { error: logsError } = await supabase
        .from('dhikr_logs')
        .delete()
        .eq('device_id', device_id)
        .eq('dhikr_id', dhikrId);

    if (logsError) throw logsError;

    const { error } = await supabase
        .from('dhikr')
        .delete()
        .eq('id', dhikrId)
        .eq('device_id', device_id);

    if (error) throw error;
}

// Unified entry point for the UI: figures out whether a dhikr is a custom
// entry (hard-delete) or a shared preset (hide for this device) and does
// the right thing. Pass the full dhikr object (needs `id` and `category`).
export async function deleteDhikr(dhikr) {
    if (!dhikr?.id) throw new Error('deleteDhikr: missing dhikr id');

    if (dhikr.category === 'custom') {
        return deleteCustomDhikr(dhikr.id);
    }
    return hidePresetDhikr(dhikr.id);
}

// Today's progress for every dhikr (preset + custom) this device has.
export async function getTodayDhikrLogs() {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { data, error } = await supabase
        .from('dhikr_logs')
        .select('id, dhikr_id, date, count, completed')
        .eq('device_id', device_id)
        .eq('date', date);

    if (error) throw error;
    return data ?? [];
}

// Upsert today's progress for one dhikr. Relies on the
// (device_id, dhikr_id, date) unique constraint from the migration.
export async function saveDhikrProgress({ dhikrId, count, completed }) {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { data, error } = await supabase
        .from('dhikr_logs')
        .upsert(
            {
                device_id,
                dhikr_id: dhikrId,
                date,
                count,
                completed,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'device_id,dhikr_id,date' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function resetDhikrProgress(dhikrIds) {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { error } = await supabase
        .from('dhikr_logs')
        .delete()
        .eq('device_id', device_id)
        .eq('date', date)
        .in('dhikr_id', dhikrIds);

    if (error) throw error;
}

// Every date (as 'YYYY-MM-DD') on which this device completed ALL dhikr
// assigned to it that day. Feed this straight into
// computeCurrentStreak / computeLongestStreak from utils/streaks.js.
//
// NOTE: because custom dhikr can be added at any time, "all dhikr
// completed" only makes sense evaluated per-day against whatever set
// of dhikr_ids has at least one log entry that day — it does NOT
// retroactively require today's full list on past days.

export async function getDhikrActiveDates() {
    const device_id = await getDeviceId();

    const [globalDhikr, customDhikr] = await Promise.all([
        getDhikrDefinitions(),
        getCustomDhikr(),
    ]);

    const { data, error } = await supabase
        .from('dhikr_logs')
        .select('date, dhikr_id, completed')
        .eq('device_id', device_id);

    if (error) throw error;

    const logsByDate = {};

    for (const row of data ?? []) {
        if (!logsByDate[row.date]) {
            logsByDate[row.date] = new Map();
        }

        logsByDate[row.date].set(
            row.dhikr_id,
            row.completed === true
        );
    }

    const activeDates = [];

    for (const [date, logs] of Object.entries(logsByDate)) {
        const expectedDhikr = [
            ...(globalDhikr ?? []),

            ...(customDhikr ?? []).filter(dhikr => {
                if (!dhikr.created_at) {
                    return true;
                }

                const createdAt = new Date(dhikr.created_at);

                if (Number.isNaN(createdAt.getTime())) {
                    return true;
                }

                const createdDate = getLocalDateString(createdAt);

                return createdDate <= date;
            }),
        ];

        if (expectedDhikr.length === 0) {
            continue;
        }

        const allCompleted = expectedDhikr.every(
            dhikr => logs.get(dhikr.id) === true
        );

        if (allCompleted) {
            activeDates.push(date);
        }
    }

    return activeDates;
}