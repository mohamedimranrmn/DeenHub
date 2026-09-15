/**
 * app/(tabs)/_layout.tsx   (or app/_layout.tsx depending on your structure)
 *
 * KEY CHANGE: MiniPlayerBar is mounted here so it persists across ALL tabs.
 * It appears above the tab bar and slides in/out when audio starts/stops.
 * The tab bar bottom padding accounts for the mini player height automatically.
 */

import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import TasbihIcon from '../../src/components/TasbihIcon';
import MiniPlayerBar from '../../src/components/MiniPlayerBar';

const GOLD     = '#C9A84C';
const GOLD_DIM = 'rgba(201,168,76,0.18)';
const CARD     = '#152030';
const MUTED    = '#5A6A7A';
const BORDER   = 'rgba(201,168,76,0.12)';

// @ts-ignore
function TabIcon({ label, focused, children }) {
    return (
        <View style={[tab.wrap]}>
            <View style={[tab.iconWrap, focused && tab.activeIconWrap]}>
                {children}
            </View>
            <Text style={[tab.label, focused && tab.activeLabel]}>
                {label}
            </Text>
        </View>
    );
}

const tab = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingTop: 4,
        minWidth: 52,
    },
    iconWrap: {
        width: 36,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
    },
    activeIconWrap: { backgroundColor: GOLD_DIM },
    label: {
        fontSize: 9,
        color: MUTED,
        fontWeight: '500',
        letterSpacing: 0.3,
    },
    activeLabel: { color: GOLD, fontWeight: '700' },
});

export default function TabLayout() {
    const insets = useSafeAreaInsets();
    const tabBarHeight = 56 + Math.max(insets.bottom, 8);

    return (
        // Outer View needed so MiniPlayerBar can sit absolutely on top of the tab bar
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor: CARD,
                        borderTopColor: BORDER,
                        borderTopWidth: 1,
                        height: tabBarHeight,
                        paddingBottom: Math.max(insets.bottom, 8),
                        paddingTop: 6,
                        paddingHorizontal: 4,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -4 },
                        shadowOpacity: 0.25,
                        shadowRadius: 12,
                        elevation: 16,
                    },
                    tabBarShowLabel: false,
                    tabBarActiveTintColor: GOLD,
                    tabBarInactiveTintColor: MUTED,
                }}
            >
                <Tabs.Screen
                    name="home"
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon label="Home" focused={focused}>
                                <Ionicons
                                    name={focused ? 'home' : 'home-outline'}
                                    size={20}
                                    color={focused ? GOLD : MUTED}
                                />
                            </TabIcon>
                        ),
                    }}
                />

                <Tabs.Screen
                    name="hadith"
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon label="Hadith" focused={focused}>
                                <Ionicons
                                    name={focused ? 'book' : 'book-outline'}
                                    size={20}
                                    color={focused ? GOLD : MUTED}
                                />
                            </TabIcon>
                        ),
                    }}
                />

                <Tabs.Screen
                    name="dhikr"
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon label="Dhikr" focused={focused}>
                                <TasbihIcon color={focused ? GOLD : MUTED} size={13} />
                            </TabIcon>
                        ),
                    }}
                />

                <Tabs.Screen
                    name="learn"
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon label="Learn" focused={focused}>
                                <Ionicons
                                    name={focused ? 'school' : 'school-outline'}
                                    size={20}
                                    color={focused ? GOLD : MUTED}
                                />
                            </TabIcon>
                        ),
                    }}
                />

                <Tabs.Screen
                    name="settings"
                    options={{
                        tabBarIcon: ({ focused }) => (
                            <TabIcon label="Settings" focused={focused}>
                                <Ionicons
                                    name={focused ? 'settings' : 'settings-outline'}
                                    size={22}
                                    color={focused ? GOLD : MUTED}
                                />
                            </TabIcon>
                        ),
                    }}
                />
            </Tabs>

            {/*
              MiniPlayerBar lives OUTSIDE Tabs so it persists across all screens.
              It uses position:absolute with bottom = tabBarHeight so it floats
              as a card above the tab bar without collapsing/resizing it.
              When audio is playing it springs in; when stopped it slides away.
            */}
            <MiniPlayerBar />
        </View>
    );
}