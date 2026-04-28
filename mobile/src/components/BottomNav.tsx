import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Home as HomeIcon, Compass, Users, Calendar, User } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

export default function BottomNav() {
    const nav = useNavigation<any>();
    const route = useRoute();
    const { isDark, colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

    const items = [
        { key: 'Home', label: 'Home', Icon: HomeIcon, onPress: () => nav.navigate('Home') },
        { key: 'Discover', label: 'Discover', Icon: Compass, onPress: () => nav.navigate('Discover') },
        { key: 'CreateParty', label: 'Party', Icon: Users, onPress: () => nav.navigate('CreateParty') },
        { key: 'Hangouts', label: 'Calendar', Icon: Calendar, onPress: () => nav.navigate('Hangouts') },
        { key: 'Profile', label: 'Profile', Icon: User, onPress: () => nav.navigate('Profile') },
    ];

    return (
        <View style={styles.wrap} pointerEvents="box-none">
            <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
                <View style={styles.inner}>
                    {items.map((item) => {
                        const active = route.name === item.key;
                        const color = active ? colors.primary : colors.text40;
                        return (
                            <TouchableOpacity key={item.key} style={styles.item} onPress={item.onPress} activeOpacity={0.7}>
                                <item.Icon size={24} color={color} />
                                <Text style={[styles.label, { color }]}>{item.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </BlurView>
        </View>
    );
}

function makeStyles(c: ReturnType<typeof useTheme>['colors'], dark: boolean) {
    return StyleSheet.create({
        wrap: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
        },
        blur: {
            borderTopWidth: 1,
            borderTopColor: c.glassBorder,
            backgroundColor: dark ? 'rgba(10,10,15,0.80)' : 'rgba(250,250,251,0.85)',
        } as any,
        inner: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            paddingTop: 10,
            paddingBottom: 20,
        },
        item: {
            alignItems: 'center',
            gap: 4,
        },
        label: {
            fontSize: 11,
            fontFamily: 'Inter_500Medium',
        },
    });
}
