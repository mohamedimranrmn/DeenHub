import { TouchableOpacity, Text, StyleSheet } from "react-native";

const CustomButton = ({ title, onPress, disabled = false }) => {
    return (
        <TouchableOpacity
            style={[styles.button, disabled && styles.disabled]}
            onPress={onPress}
            activeOpacity={0.8}
            disabled={disabled}
        >
            <Text style={styles.text}>{title}</Text>
        </TouchableOpacity>
    );
};

export default CustomButton;

const styles = StyleSheet.create({
    button: {
        backgroundColor: "#C9A84C",
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    text: {
        color: "#0F1923",
        fontSize: 16,
        fontWeight: "700",
    },
    disabled: {
        opacity: 0.6,
    },
});