import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Home as HomeIcon, Compass, Users, Calendar, User } from 'lucide-react-native';
import { colors } from '../theme';

/**
 * Fixed bottom navigation component matching the Figma Home screen nav bar.
 * Rendered inline inside screens (not via React Navigation's tab navigator)
 * so it matches the Figma source 1:1.
 */
export default function BottomNav() {
    const nav = useNavigation<any>();
    const route = useRoute();

    const items = [
        { key: 'Home', label: 'Home', Icon: HomeIcon, onPress: () => nav.navigate('Home') },
        { key: 'Discover', label: 'Discover', Icon: Compass, onPress: () => nav.navigate('Discover') },
        { key: 'CreateParty', label: 'Party', Icon: Users, onPress: () => nav.navigate('CreateParty') },
        { key: 'Calendar', label: 'Calendar', Icon: Calendar, onPress: () => {} },
        { key: 'Profile', label: 'Profile', Icon: User, onPress: () => nav.navigate('Profile') },
    ];

    return (
        <View style={styles.wrap} pointerEvents="box-none">
            <BlurView intensity={40} tint="dark" style={styles.blur}>
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

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    blur: {
        borderTopWidth: 1,
        borderTopColor: colors.glassBorder,
        backgroundColor: 'rgba(10,10,15,0.80)',
    },
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
