/**
 * app/quran/_layout.jsx
 *
 * FIX: Added ayah/[surah]/[ayah] screen so search → ayah navigation works.
 * ADDED: saved screen for bookmarked surahs/ayahs, linked from Settings.
 */

import { Stack } from 'expo-router';

export default function QuranLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="reciters" />
            <Stack.Screen name="search" />
            <Stack.Screen name="saved" />
            <Stack.Screen name="surah/[id]" />
            <Stack.Screen name="ayah/[surah]/[ayah]" />
            <Stack.Screen
                name="player"
                options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                }}
            />
        </Stack>
    );
}