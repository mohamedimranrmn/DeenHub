import supabase from './supabase';
import { getDeviceId } from '../utils/device';

export const isBookmarked = async (contentId, contentType = 'hadith') => {
    const device_id = getDeviceId();

    const { data } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('device_id', device_id)
        .eq('content_id', contentId)
        .eq('content_type', contentType)
        .single();

    return !!data;
};

// Toggle bookmark
export const toggleBookmark = async (contentId, contentType = 'hadith') => {
    const device_id = getDeviceId();

    const { data: existing } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('device_id', device_id)
        .eq('content_id', contentId)
        .eq('content_type', contentType)
        .single();

    if (existing) {
        await supabase.from('bookmarks').delete().eq('id', existing.id);
        return false; // now unbookmarked
    } else {
        await supabase.from('bookmarks').insert({
            device_id,
            content_id: contentId,
            content_type: contentType,
        });
        return true; // now bookmarked
    }
};