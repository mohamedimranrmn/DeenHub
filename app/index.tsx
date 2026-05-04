import { useEffect } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
    useEffect(() => {
        const check = async () => {
            try {
                // const seen = null;
                const seen = await AsyncStorage.getItem("onboarding_seen");
                setTimeout(() => {
                    if (seen === "true") {
                        router.replace("/(tabs)/home");
                    } else {
                        router.replace("/onboarding");
                    }
                }, 0);
            } catch (e) {
                console.warn("Onboarding check failed:", e);

                setTimeout(() => {
                    router.replace("/(tabs)/home");
                }, 0);
            }
        };

        check();
    }, []);

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: "#0F1923",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <ActivityIndicator size="large" color="#C9A84C" />
        </View>
    );
}