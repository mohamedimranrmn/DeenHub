import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');

const COLORS = [
    '#C9A84C', '#F0EAD6', '#4CAF7D',
    '#e8c97a', '#ffffff', '#a8d8a8', '#f5d78e',
];
const PARTICLE_COUNT = 80;

function randomBetween(a, b) {
    return a + Math.random() * (b - a);
}

function Particle({ color, delay }) {
    const startX = randomBetween(width * 0.1, width * 0.9);
    const x        = useRef(new Animated.Value(startX)).current;
    const y        = useRef(new Animated.Value(-20)).current;
    const rotate   = useRef(new Animated.Value(0)).current;
    const opacity  = useRef(new Animated.Value(0)).current;
    const scale    = useRef(new Animated.Value(randomBetween(0.6, 1.2))).current;

    const isRect    = useRef(Math.random() > 0.5).current;
    const size      = useRef(randomBetween(6, 12)).current;
    const duration  = useRef(randomBetween(1800, 2800)).current;
    const swayX     = useRef(randomBetween(-80, 80)).current;
    const rotations = useRef(
        randomBetween(2, 6) * (Math.random() > 0.5 ? 1 : -1)
    ).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(opacity, {
                        toValue: 1, duration: 120, useNativeDriver: true,
                    }),
                    Animated.delay(duration - 500),
                    Animated.timing(opacity, {
                        toValue: 0, duration: 400, useNativeDriver: true,
                    }),
                ]),
                Animated.timing(y, {
                    toValue: height + 40,
                    duration,
                    useNativeDriver: true,
                }),
                Animated.timing(x, {
                    toValue: startX + swayX,
                    duration,
                    useNativeDriver: true,
                }),
                Animated.timing(rotate, {
                    toValue: rotations,
                    duration,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }, []);

    const spin = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width:  isRect ? size * 0.6 : size,
                height: isRect ? size * 1.4 : size,
                borderRadius: isRect ? 2 : size / 2,
                backgroundColor: color,
                opacity,
                transform: [
                    { translateX: x },
                    { translateY: y },
                    { rotate: spin },
                    { scale },
                ],
            }}
        />
    );
}

export default function ConfettiLayer({ trigger }) {
    const [bursts, setBursts] = useState([]);

    useEffect(() => {
        if (!trigger) return;

        const id = Date.now();
        const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
            id: `${id}-${i}`,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            delay: randomBetween(0, 600),
        }));

        setBursts(prev => [...prev, { id, particles }]);

        setTimeout(() => {
            setBursts(prev => prev.filter(b => b.id !== id));
        }, 4200);
    }, [trigger]);

    if (bursts.length === 0) return null;

    return (
        <View
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
        >
            {bursts.map(burst =>
                burst.particles.map(p => (
                    <Particle
                        key={p.id}
                        color={p.color}
                        delay={p.delay}
                    />
                ))
            )}
        </View>
    );
}