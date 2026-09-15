// src/services/prayerLogs.js
//
// device_id is the identity. Relies on the prayer_logs_device_date_unique
// constraint added in migration.sql for the upsert to work correctly.

import supabase from './supabase';
import { getDeviceId } from '../utils/device';

function getLocalDateString(date = new Date()) {
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export async function getTodayPrayerLog() {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { data, error } = await supabase
        .from('prayer_logs')
        .select('id, date, fajr, dhuhr, asr, maghrib, isha')
        .eq('device_id', device_id)
        .eq('date', date)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function setPrayerCompleted(prayer, completed) {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { data, error } = await supabase
        .from('prayer_logs')
        .upsert(
            { device_id, date, [prayer]: completed },
            { onConflict: 'device_id,date' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Every date this device has at least one prayer marked completed.
// Swap the .filter() rule below if "prayer day" should mean all five
// prayers rather than any one of them.
export async function getPrayerActiveDates() {
    const device_id = await getDeviceId();

    const { data, error } = await supabase
        .from('prayer_logs')
        .select('date, fajr, dhuhr, asr, maghrib, isha')
        .eq('device_id', device_id);

    if (error) throw error;

    return (data ?? [])
        .filter(row => row.fajr && row.dhuhr && row.asr && row.maghrib && row.isha)
        .map(row => row.date);
}