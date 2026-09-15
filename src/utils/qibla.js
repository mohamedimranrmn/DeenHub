/**
 * Qibla utilities
 *
 * Calculates the initial great-circle bearing from the user's location
 * to the Kaaba.
 *
 * No API/network request is required.
 */

// Kaaba coordinates (Masjid al-Haram)
export const KAABA_LATITUDE = 21.422487;
export const KAABA_LONGITUDE = 39.826206;

/**
 * Normalize an angle into the range 0–359.999...
 */
export function normAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

// Alias for readability in other files
export const normalizeAngle = normAngle;

/**
 * Calculate the Qibla bearing from a given latitude/longitude.
 *
 * The returned bearing is measured clockwise from TRUE NORTH:
 *
 *   0°   = North
 *   90°  = East
 *   180° = South
 *   270° = West
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number} Qibla bearing in degrees
 */
export function calculateQiblaBearing(latitude, longitude) {
    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        throw new Error('Invalid latitude or longitude');
    }

    const lat1 = latitude * Math.PI / 180;
    const lat2 = KAABA_LATITUDE * Math.PI / 180;

    const deltaLongitude =
        (KAABA_LONGITUDE - longitude) * Math.PI / 180;

    const y =
        Math.sin(deltaLongitude) * Math.cos(lat2);

    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(deltaLongitude);

    const bearing =
        Math.atan2(y, x) * 180 / Math.PI;

    return normalizeAngle(bearing);
}

/**
 * Calculate the shortest angular difference between two headings.
 *
 * Example:
 *   angleDifference(2, 358) === 4
 *   angleDifference(358, 2) === -4
 *
 * Positive = clockwise/right
 * Negative = counter-clockwise/left
 */
export function angleDifference(target, current) {
    let difference =
        normalizeAngle(target) -
        normalizeAngle(current);

    if (difference > 180) difference -= 360;
    if (difference < -180) difference += 360;

    return difference;
}

/**
 * Return a human-readable compass direction.
 *
 * Examples:
 *   0   → N
 *   45  → NE
 *   90  → E
 *   180 → S
 *   270 → W
 */
export function getCompassDirection(bearing) {
    const directions = [
        'N',
        'NE',
        'E',
        'SE',
        'S',
        'SW',
        'W',
        'NW',
    ];

    return directions[
    Math.round(normalizeAngle(bearing) / 45) % 8
        ];
}

/**
 * Calculate the great-circle distance from the user's location
 * to the Kaaba.
 *
 * Returns distance in kilometres.
 */
export function calculateDistanceToKaaba(latitude, longitude) {
    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        throw new Error('Invalid latitude or longitude');
    }

    const R = 6371; // Earth's mean radius in km

    const lat1 = latitude * Math.PI / 180;
    const lat2 = KAABA_LATITUDE * Math.PI / 180;

    const deltaLat =
        (KAABA_LATITUDE - latitude) * Math.PI / 180;

    const deltaLongitude =
        (KAABA_LONGITUDE - longitude) * Math.PI / 180;

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLongitude / 2) ** 2;

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

// Alias — qibla.jsx imports calculateDistanceKm; keep both names exported
// so either call site works.
export const calculateDistanceKm = calculateDistanceToKaaba;

/**
 * Convenience helper that returns all Qibla information
 * needed by the UI.
 */
export function getQiblaInfo(latitude, longitude) {
    const bearing = calculateQiblaBearing(
        latitude,
        longitude
    );

    const distanceKm = calculateDistanceToKaaba(
        latitude,
        longitude
    );

    return {
        bearing,
        direction: getCompassDirection(bearing),
        distanceKm,
    };
}