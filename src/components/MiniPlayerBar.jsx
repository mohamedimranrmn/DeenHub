/**
 * src/components/MiniPlayerBar.jsx
 *
 * PREMIUM MINI PLAYER WITH PHYSICAL CONTROLS
 * ✅ Premium glassmorphism layout with top rim lighting
 * ✅ Dedicated Abort/Close button for quick modal dismissal
 * ✅ Tactile Previous & Next manual playback buttons
 * ✅ Removed swipe/pull gestures for deliberate, error-free button interactions
 * ✅ Micro-scale tactile feedback on press events
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Animated,
    Pressable,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioStore from '../services/audioStore';

// ── Design Tokens ───────────────────────────────────────────────────────────
const THEME = {
    SURFACE: '#0A0E14',          
    GLASS_BG: 'rgba(13, 22, 34, 0.94)', // Slightly more opaque for crisp button contrast
    ACCENT: '#1DB954',           
    TEXT_PRIMARY: '#FFFFFF',
    TEXT_SECONDARY: '#7A8B9E',
    BORDER_LIGHT: 'rgba(255, 255, 255, 0.08)', 
    TRACK_BG: 'rgba(255, 255, 255, 0.06)',
};

const TAB_BAR_BASE_HEIGHT = 60;

export default function MiniPlayerBar() {
    const insets = useSafeAreaInsets();
    const [audio, setAudio] = useState(AudioStore.getState());
    
    // Core Layout Animation
    const slideAnim = useRef(new Animated.Value(160)).current; 
    
    // Scale Animations for Touch Feedback
    const cardScale = useRef(new Animated.Value(1)).current;
    const playBtnScale = useRef(new Animated.Value(1)).current;
    const pulseScale = useRef(new Animated.Value(1)).current;
    const wasActive = useRef(false);

    useEffect(() => {
        const unsub = AudioStore.subscribe(setAudio);
        return unsub;
    }, []);

    const isActive = !!audio.surahId;
    const bottomOffset = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 12);

    // Smooth entry and exit transitions
    useEffect(() => {
        if (isActive && !wasActive.current) {
            Animated.spring(slideAnim, {
                toValue: 0,
                damping: 15,
                mass: 0.9,
                stiffness: 90,
                useNativeDriver: true,
            }).start();
        } else if (!isActive && wasActive.current) {
            Animated.timing(slideAnim, {
                toValue: 160,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
        wasActive.current = isActive;
    }, [isActive]);

    // Ambient artwork pulse when music flows
    useEffect(() => {
        let loop;
        if (audio.isPlaying) {
            loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseScale, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
                    Animated.timing(pulseScale, { toValue: 1.0, duration: 1200, useNativeDriver: true }),
                ])
            );
            loop.start();
        } else {
            pulseScale.setValue(1);
        }
        return () => loop?.stop();
    }, [audio.isPlaying]);

    // Micro-interaction scaling helpers
    const handlePressIn = (animInstance) => {
        Animated.spring(animInstance, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
    };

    const handlePressOut = (animInstance) => {
        Animated.spring(animInstance, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    };

    if (!isActive) return null;

    const { surahId, surahName, surahArabic, playingAyah, isPlaying, isLoading, positionMs, durationMs } = audio;
    const progressPct = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

    return (
        <Animated.View
            style={[
                styles.wrapper,
                {
                    bottom: bottomOffset,
                    transform: [
                        { translateY: slideAnim },
                        { scale: cardScale }
                    ],
                },
            ]}
        >
            <Pressable
                style={styles.containerInner}
                onPressIn={() => handlePressIn(cardScale)}
                onPressOut={() => handlePressOut(cardScale)}
                onPress={() => router.push('/quran/player')}
            >
                {/* Premium Monogram Artwork Frame */}
                <Animated.View style={[styles.avatarBox, { transform: [{ scale: pulseScale }] }]}>
                    <Text style={styles.avatarText}>{surahId}</Text>
                </Animated.View>

                {/* Meta details text core */}
                <View style={styles.metaCore}>
                    <Text style={styles.primaryTitle} numberOfLines={1}>
                        {surahArabic ?? `Surah ${surahId}`}
                    </Text>
                    <Text style={styles.secondaryText} numberOfLines={1}>
                        {surahName || 'Unknown'} {playingAyah ? ` • Ayah ${playingAyah}` : ''}
                    </Text>
                </View>

                {/* Tactile Playback Controls Layout */}
                <View style={styles.controlsLayout}>
                    {/* Previous Button */}
                    <Pressable
                        style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
                        onPress={(e) => { e.stopPropagation(); AudioStore.prev?.(); }}
                        hitSlop={8}
                    >
                        <Ionicons name="play-skip-back" size={18} color={THEME.TEXT_PRIMARY} />
                    </Pressable>

                    {/* Central Play Toggle Button */}
                    <Animated.View style={{ transform: [{ scale: playBtnScale }] }}>
                        <Pressable
                            style={styles.playbackCircle}
                            onPressIn={() => handlePressIn(playBtnScale)}
                            onPressOut={() => handlePressOut(playBtnScale)}
                            onPress={(e) => { e.stopPropagation(); AudioStore.togglePlayPause?.(); }}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color={THEME.TEXT_PRIMARY} />
                            ) : (
                                <Ionicons 
                                    name={isPlaying ? "pause" : "play"} 
                                    size={18} 
                                    color={THEME.TEXT_PRIMARY} 
                                    style={!isPlaying && { marginLeft: 2 }} 
                                />
                            )}
                        </Pressable>
                    </Animated.View>

                    {/* Next Button */}
                    <Pressable
                        style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
                        onPress={(e) => { e.stopPropagation(); AudioStore.next?.(); }}
                        hitSlop={8}
                    >
                        <Ionicons name="play-skip-forward" size={18} color={THEME.TEXT_PRIMARY} />
                    </Pressable>

                    {/* Elegant Divider Rim */}
                    <View style={styles.verticalDivider} />

                    {/* Dedicated Modal Abort Button */}
                    <Pressable
                        style={({ pressed }) => [styles.abortButton, pressed && styles.buttonPressed]}
                        onPress={(e) => { e.stopPropagation(); AudioStore.stop?.(); }}
                        hitSlop={10}
                    >
                        <Ionicons name="close" size={20} color={THEME.TEXT_SECONDARY} />
                    </Pressable>
                </View>
            </Pressable>

            {/* Premium Seamless Flush Progress Track */}
            <View style={styles.trackRail}>
                <View style={[styles.trackFill, { width: `${progressPct * 100}%` }]} />
            </View>
        </Animated.View>
    );
}

// ── Premium Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        left: 12,
        right: 12,
        backgroundColor: THEME.GLASS_BG,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: THEME.BORDER_LIGHT,
        ...Platform.select({
            ios: {
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
            },
            android: {
                elevation: 14,
            },
        }),
        zIndex: 99999,
        overflow: 'hidden',
    },
    containerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    avatarBox: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: THEME.TEXT_PRIMARY,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    metaCore: {
        flex: 1,
        marginLeft: 12,
        marginRight: 6,
        justifyContent: 'center',
    },
    primaryTitle: {
        color: THEME.TEXT_PRIMARY,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: -0.1,
        marginBottom: 1,
    },
    secondaryText: {
        color: THEME.TEXT_SECONDARY,
        fontSize: 12,
        fontWeight: '400',
    },
    controlsLayout: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionButton: {
        width: 32,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.85,
    },
    playbackCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    verticalDivider: {
        width: 1,
        height: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        marginHorizontal: 8,
    },
    abortButton: {
        width: 32,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPressed: {
        opacity: 0.5,
    },
    trackRail: {
        height: 2.5,
        width: '100%',
        backgroundColor: THEME.TRACK_BG,
        position: 'absolute',
        bottom: 0,
    },
    trackFill: {
        height: '100%',
        backgroundColor: THEME.TEXT_PRIMARY, 
        borderRadius: 1,
    },
});