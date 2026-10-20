import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import { palette, radii } from '../theme';

export default function JoinQr({ value, label, size = 160 }: { value: string; label: string; size?: number }) {
    const { d, n } = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        const count = qr.getModuleCount();
        let path = '';
        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
        }
        return { d: path, n: count + 4 };
    }, [value]);

    return (
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ borderRadius: radii.md, overflow: 'hidden' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
                <Rect width={n} height={n} fill={palette.white} />
                <Path d={d} fill={palette.ink} />
            </Svg>
        </View>
    );
}
