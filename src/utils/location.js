/**
 * Shared location manager.
 *
 * The whole point of this module: GPS is only ever touched in two situations —
 *   1. There is no cached location yet (first run).
 *   2. The user explicitly asks for a refresh (Auto-detect / Refresh button).
 *
 * Every other read (screen focus, app foreground, tab switch, etc.) goes
 * through getCachedLocation() / initializeLocation() and never touches the
 * OS location APIs. This is what stops the "asks for location every time I
 * open the screen" behavior.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOC_CACHE_KEY = 'prayer_location_v2';

export function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getCityFromCoords(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'User-Agent': 'PrayerTrackerApp/1.0' } }
        );
        const json = await res.json();
        const addr = json.address || {};
        return addr.city || addr.town || addr.village || addr.county || null;
    } catch {
        return null;
    }
}

export async function getCoordsFromCity(city) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
            { headers: { 'User-Agent': 'PrayerTrackerApp/1.0' } }
        );
        const json = await res.json();
        if (json.length > 0) {
            return { latitude: parseFloat(json[0].lat), longitude: parseFloat(json[0].lon) };
        }
        return null;
    } catch {
        return null;
    }
}

/** Read the persisted location. Returns null if none saved or it's malformed. */
export async function getCachedLocation() {
    try {
        const raw = await AsyncStorage.getItem(LOC_CACHE_KEY);
        if (!raw) return null;

        const location = JSON.parse(raw);
        if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) {
            return null;
        }
        return location;
    } catch (e) {
        console.error('[Location] Cache read failed:', e);
        return null;
    }
}

export async function saveLocation(location) {
    try {
        await AsyncStorage.setItem(
            LOC_CACHE_KEY,
            JSON.stringify({ ...location, updatedAt: Date.now() })
        );
    } catch (e) {
        console.error('[Location] Cache write failed:', e);
    }
}

/**
 * Explicitly triggers the OS permission prompt (if needed) and takes a fresh
 * GPS fix. Only call this from:
 *   - initializeLocation(), when there is no cache at all, or
 *   - a user-initiated "Auto-detect" / "Refresh location" button.
 *
 * Throws:
 *   LOCATION_PERMISSION_DENIED  — user declined the OS prompt
 *   LOCATION_SERVICES_DISABLED  — device location services are off
 *   LOCATION_UNAVAILABLE        — GPS fix could not be obtained
 */
export async function detectLocation() {
    const permission = await Location.getForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        if (requested.status !== 'granted') {
            throw new Error('LOCATION_PERMISSION_DENIED');
        }
    }

    let servicesEnabled = await Location.hasServicesEnabledAsync();

    if (!servicesEnabled && Platform.OS === 'android') {
        // Ask Android's native "Turn on location?" dialog to enable it —
        // this can resolve without the user ever leaving the app. iOS has
        // no equivalent API; a disabled Location Services toggle there can
        // only be fixed from the Settings app (see openLocationSettings).
        try {
            await Location.enableNetworkProviderAsync();
        } catch (e) {
            // User dismissed the dialog, or the device has no location
            // provider to enable — fall through and report disabled below.
            console.log('[Location] enableNetworkProviderAsync declined:', e?.message);
        }
        servicesEnabled = await Location.hasServicesEnabledAsync();
    }

    if (!servicesEnabled) {
        throw new Error('LOCATION_SERVICES_DISABLED');
    }

    let position = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 1000,
    });

    if (!position) {
        position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
    }

    if (!position?.coords) {
        throw new Error('LOCATION_UNAVAILABLE');
    }

    const { latitude, longitude } = position.coords;

    let city = null;
    try {
        city = await getCityFromCoords(latitude, longitude);
    } catch {
        // Non-fatal — prayer times/Qibla only need coordinates.
    }

    const location = { latitude, longitude, city, source: 'gps' };
    await saveLocation(location);
    return location;
}

/**
 * Cache-first entry point. Use this everywhere except the explicit
 * "Auto-detect" / "Refresh location" action.
 *   - Cache exists  → returns it immediately, no GPS call.
 *   - No cache      → falls through to detectLocation(), which is the ONE
 *                      place the OS permission prompt appears for a new user.
 */
export async function initializeLocation() {
    const cached = await getCachedLocation();
    if (cached) return cached;
    return await detectLocation();
}

/** Opens the OS settings screen for this app (used for "location services are off"). */
export async function openLocationSettings() {
    if (Platform.OS === 'android') {
        try {
            await Location.enableNetworkProviderAsync();
            // If the user enabled it from the native dialog, no need to
            // send them to Settings at all.
            const nowEnabled = await Location.hasServicesEnabledAsync();
            if (nowEnabled) return;
        } catch {
            // User declined the system dialog — fall through to Settings.
        }
    }
    const { Linking } = require('react-native');
    Linking.openSettings();
}