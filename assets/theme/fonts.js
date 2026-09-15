/**
 * src/constants/fonts.js  (or wherever this lives)
 *
 * Single source of truth for font names and reusable Arabic text styles.
 * Import arabicStyle(fontSize) wherever you render Arabic text to ensure
 * the Uthmanic font is used and diacritics are never clipped.
 */

export const fonts = {
    arabic: 'Uthmanic',
    default: undefined, // system font
};

/**
 * Returns a style object for Arabic text with:
 *  - Uthmanic font (renders harakat / tashkeel correctly)
 *  - lineHeight = fontSize * 2.0  (prevents diacritic clipping)
 *  - RTL text alignment
 *
 * Usage:
 *   <Text style={[arabicStyle(20), { color: GOLD }]}>{arabic}</Text>
 */
export const arabicStyle = (fontSize = 18, overrides = {}) => ({
    fontFamily: 'Uthmanic',
    fontSize,
    lineHeight: Math.round(fontSize * 2.2),
    textAlign: 'right',
    writingDirection: 'rtl',
    ...overrides,
});

/**
 * Pre-built sizes for common use cases.
 * All include fontFamily:'Uthmanic' and adequate lineHeight.
 */
export const arabicStyles = {
    /** Large display — surah titles, bismillah hero */
    display: arabicStyle(32),
    /** Medium — ayah text, hadith arabic body */
    body:    arabicStyle(20),
    /** Small — labels, explore card subtitles, greeting */
    label:   arabicStyle(16),
    /** Extra small — badges, counters */
    caption: arabicStyle(13),
};