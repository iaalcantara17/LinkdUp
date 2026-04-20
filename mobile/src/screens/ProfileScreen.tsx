import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import GradientButton from '../components/GradientButton';
import GlassCard from '../components/GlassCard';
import AvatarBubble from '../components/AvatarBubble';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, typography, spacing } from '../theme';

export default function ProfileScreen() {
    const { signOut } = useAuth();
    const [me, setMe] = useState<any>(null);

    useEffect(() => {
        api.me().then(setMe).catch(() => {});
    }, []);

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <Text style={styles.title}>Profile</Text>

                        <View style={styles.avatarSection}>
                            <AvatarBubble name={me?.display_name ?? '?'} color={me?.avatar_color} size={96} />
                            <Text style={styles.name}>{me?.display_name ?? 'Loading...'}</Text>
                            <Text style={styles.email}>{me?.email}</Text>
                        </View>

                        <GlassCard>
                            <Text style={styles.label}>SCHOOL</Text>
                            <Text style={styles.value}>{me?.school_id ? 'On file' : 'Not set'}</Text>
                            <Text style={[styles.label, { marginTop: 16 }]}>GRAD YEAR</Text>
                            <Text style={styles.value}>{me?.graduation_year ?? 'Not set'}</Text>
                        </GlassCard>

                        <View style={{ height: 24 }} />
                        <GradientButton title="Sign out" variant="ghost" onPress={signOut} />
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 24 },
    avatarSection: { alignItems: 'center', marginBottom: 32 },
    name: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 24, marginTop: 12 },
    email: { color: colors.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },
    label: { color: colors.text60, fontSize: 11, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginBottom: 4 },
    value: { color: 'white', fontSize: 16, fontFamily: 'Inter_500Medium' },
});
