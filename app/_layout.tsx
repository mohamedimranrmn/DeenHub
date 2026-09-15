import 'react-native-get-random-values';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { initDeviceId } from '@/src/utils/device';
import { useFonts } from 'expo-font';
import {
    initializeNotificationNavigation,
    handleInitialNotification,
} from '@/src/utils/notifications';

export default function RootLayout() {
    const [ready, setReady] = useState(false);

    const [fontsLoaded] = useFonts({
        Uthmanic: require('@/assets/fonts/UthmanicHafs.otf'),
    });

    useEffect(() => {
        const unsubscribe = initializeNotificationNavigation();
        handleInitialNotification();
        return unsubscribe;
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                await initDeviceId();
            } catch (err) {
                console.warn('Device init failed:', err);
            } finally {
                setReady(true);
            }
        };

        init();
    }, []);

    if (!fontsLoaded || !ready) {
        return (
            <View style={{
                flex: 1,
                backgroundColor: '#0F1923',
                justifyContent: 'center',
                alignItems: 'center',
            }}>
                <ActivityIndicator size="large" color="#C9A84C" />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
            </Stack>
        </GestureHandlerRootView>
    );
}