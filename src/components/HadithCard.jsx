import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD       = '#C9A84C';
const GOLD_LIGHT = 'rgba(201,168,76,0.10)';
const GOLD_MED   = 'rgba(201,168,76,0.22)';
const DARK       = '#0C1520';
const CARD       = '#152030';
const TEXT       = '#F0EAD6';
const TEXT_DIM   = '#C8B99A';
const MUTED      = '#5A6A7A';
const BORDER     = 'rgba(201,168,76,0.12)';

export default function HadithCard({ hadith, isSaved, onToggle, onPress }) {
    return (
        <TouchableOpacity
            style={s.card}
            activeOpacity={0.78}
            onPress={onPress}
        >
            {/* Gold top accent stripe */}
            <View style={s.cardAccent} />

            {/* ── Main text — uses short_text (new schema) ── */}
            <Text style={s.text} numberOfLines={3}>
                {hadith.short_text}
            </Text>

            <View style={s.divider} />

            {/* ── Footer: source info + bookmark ── */}
            <View style={s.footer}>
                <View style={s.footerLeft}>
                    <Text style={s.sourceLabel}>SOURCE</Text>
                    {/* ── uses book + hadith_number (new schema) ── */}
                    <Text style={s.sourceText}>
                        {hadith.book} • Hadith {hadith.hadith_number}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={onToggle}
                    style={[s.bookmarkBtn, isSaved && s.bookmarkBtnActive]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={18}
                        color={isSaved ? GOLD : MUTED}
                    />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: CARD,
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: BORDER,
    },
    cardAccent: {
        height: 2,
        backgroundColor: GOLD,
        opacity: 0.5,
    },
    text: {
        color: TEXT,
        fontSize: 14,
        lineHeight: 22,
        letterSpacing: 0.2,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
    },
    divider: {
        height: 1,
        backgroundColor: BORDER,
        marginHorizontal: 16,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    footerLeft: {
        flex: 1,
        marginRight: 8,
    },
    sourceLabel: {
        fontSize: 9,
        color: MUTED,
        letterSpacing: 1.5,
        marginBottom: 2,
    },
    sourceText: {
        color: TEXT_DIM,
        fontSize: 12,
        fontStyle: 'italic',
    },
    bookmarkBtn: {
        width: 34,
        height: 34,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    bookmarkBtnActive: {
        backgroundColor: GOLD_LIGHT,
    },
});