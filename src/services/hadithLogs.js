// src/services/hadithLogs.js

import supabase from './supabase';
import { getDeviceId } from '../utils/device';

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export async function logHadithRead(hadithId) {
    const device_id = await getDeviceId();
    const date = getLocalDateString();

    const { error } = await supabase
        .from('hadith_logs')
        .upsert(
            {
                device_id,
                hadith_id: hadithId,
                date,
                read: true,
            },
            {
                onConflict: 'device_id,hadith_id,date',
            }
        );

    if (error) {
        throw error;
    }
}