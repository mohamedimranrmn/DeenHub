import Svg, { Circle, Path } from 'react-native-svg';

type Props = { color: string; size?: number };

export default function DhikrIcon({ color, size = 28 }: Props) {
    const cx = size;
    const cy = size;
    const r = size * 0.65;

    const dotR = size * 0.06;

    // smoother spacing (not rigid like tasbih)
    const dots = Array.from({ length: 12 }, (_, i) => {
        const angle = (i * 30 - 90) * (Math.PI / 180);
        return {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
        };
    });

    return (
        <Svg width={size * 2} height={size * 2} viewBox={`0 0 ${size * 2} ${size * 2}`}>

            {/* Soft circular guide (subtle loop) */}
            <Path
                d={`M ${cx} ${cy - r}
                    A ${r} ${r} 0 1 1 ${cx - 0.1} ${cy - r}`}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="2,3"
                fill="none"
                opacity={0.4}
            />

            {/* Flow dots (remembrance repetition) */}
            {dots.map((d, i) => (
                <Circle
                    key={i}
                    cx={d.x}
                    cy={d.y}
                    r={dotR}
                    fill={color}
                    opacity={0.85}
                />
            ))}

            {/* Center focus (intention / heart) */}
            <Circle
                cx={cx}
                cy={cy}
                r={dotR * 1.8}
                fill={color}
            />
        </Svg>
    );
}