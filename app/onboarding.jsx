import { router } from "expo-router";
import { useRef, useState } from "react";
import {
    Image, Text, TouchableOpacity, View,
    StyleSheet, Dimensions, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swiper from "react-native-swiper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import { onboarding } from "../src/constants/onboarding";

const { width, height } = Dimensions.get("window");

const GOLD       = "#C9A84C";
const GOLD_LIGHT = "rgba(201,168,76,0.10)";
const GOLD_MED   = "rgba(201,168,76,0.22)";
const DARK       = "#0C1520";
const CARD       = "#152030";
const TEXT       = "#F0EAD6";
const TEXT_DIM   = "#C8B99A";
const MUTED      = "#4A5A6A";
const BORDER     = "rgba(201,168,76,0.14)";

export default function Onboarding() {
    const swiperRef = useRef(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const isLastSlide = activeIndex === onboarding.length - 1;

    const handleFinish = async () => {
        try {
            await AsyncStorage.setItem("onboarding_seen", "true");
        } catch (e) {
            console.warn("Failed to save onboarding state", e);
        }
        router.replace("/(tabs)/home");
    };

    return (
        <SafeAreaView style={s.root} edges={["top", "bottom"]}>
            <StatusBar barStyle="light-content" backgroundColor={DARK} />

            {/* ── CONSISTENT TOP — same on every slide ── */}
            <View style={s.topBar}>
                {/* Bismillah centered — visible on ALL slides */}
                <Text style={s.bismillah}>
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </Text>
            </View>

            {/* ── SWIPER ── */}
            <Swiper
                ref={swiperRef}
                loop={false}
                onIndexChanged={(index) => setActiveIndex(index)}
                showsPagination={false}   // we render our own dots in footer
                scrollEnabled
                horizontal
                bounces={false}
            >
                {onboarding.map((item, index) => (
                    <View key={String(item.id)} style={s.slide}>

                        {/* Image — full width, tall, same height every slide */}
                        <View style={s.imageWrap}>
                            <Image
                                source={item.image}
                                style={s.image}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Text — consistent position every slide */}
                        <View style={s.textWrap}>
                            <Text style={s.title}>{item.title}</Text>
                            <Text style={s.description}>{item.description}</Text>
                        </View>

                    </View>
                ))}
            </Swiper>

            {/* ── FOOTER — Skip · dots · Next/Start ── */}
            <View style={s.footer}>

                {/* Skip — hidden on last slide */}
                <TouchableOpacity
                    style={s.footerSide}
                    onPress={handleFinish}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    disabled={isLastSlide}
                >
                    <Text style={[s.skipText, isLastSlide && s.invisible]}>
                        SKIP
                    </Text>
                </TouchableOpacity>

                {/* Dots */}
                <View style={s.dotsRow}>
                    {onboarding.map((_, i) => (
                        <View
                            key={i}
                            style={[s.dot, i === activeIndex && s.dotActive]}
                        />
                    ))}
                </View>

                {/* Next / Start */}
                <TouchableOpacity
                    style={s.footerSide}
                    onPress={() =>
                        isLastSlide ? handleFinish() : swiperRef.current?.scrollBy(1)
                    }
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={s.nextText}>
                        {isLastSlide ? "START" : "NEXT"}
                    </Text>
                    <Ionicons
                        name="chevron-forward"
                        size={13}
                        color={GOLD}
                    />
                </TouchableOpacity>

            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: DARK,
    },

    // ── Top bar — identical on every slide ───────────────────
    topBar: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },
    bismillah: {
        fontFamily: 'Uthmanic',
        fontSize: 15,
        color: GOLD,
        letterSpacing: 1,
        textAlign: "center",
        writingDirection: "rtl",
        opacity: 0.85,
    },

    // ── Slide ────────────────────────────────────────────────
    slide: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
    },

    // ── Image area — fixed height, same every slide ──────────
    imageWrap: {
        width: "100%",
        height: height * 0.40,
        backgroundColor: CARD,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 36,
        overflow: "hidden",
    },
    image: {
        width: "78%",
        height: "78%",
    },

    // ── Text — centered, consistent across all slides ────────
    textWrap: {
        width: "100%",
        alignItems: "center",
        paddingHorizontal: 4,
    },
    title: {
        fontSize: 26,
        fontWeight: "800",
        color: TEXT,
        textAlign: "center",
        lineHeight: 34,
        letterSpacing: 0.2,
        marginBottom: 12,
    },
    description: {
        fontSize: 15,
        color: TEXT_DIM,
        textAlign: "center",
        lineHeight: 25,
        letterSpacing: 0.15,
    },

    // ── Footer — SKIP · ••• · NEXT ───────────────────────────
    footer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 32,
        paddingTop: 14,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: BORDER,
    },
    footerSide: {
        flexDirection: "row",
        alignItems: "center",
        minWidth: 60,
    },
    skipText: {
        fontSize: 13,
        color: MUTED,
        fontWeight: "600",
        letterSpacing: 1.2,
    },
    invisible: {
        opacity: 0,   // keeps layout stable — SKIP hidden but space preserved
    },
    nextText: {
        fontSize: 13,
        color: GOLD,
        fontWeight: "700",
        letterSpacing: 1.2,
        marginRight: 2,
    },

    // ── Dots ─────────────────────────────────────────────────
    dotsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
    },
    dotActive: {
        width: 24,
        height: 8,
        borderRadius: 4,
        backgroundColor: GOLD,
        borderColor: GOLD,
    },
});