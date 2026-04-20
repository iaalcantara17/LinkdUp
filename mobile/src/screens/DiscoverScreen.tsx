import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import GlassCard from '../components/GlassCard';
import BottomNav from '../components/BottomNav';
import IconBadge from '../components/IconBadge';
import { colors, typography, spacing } from '../theme';

export default function DiscoverScreen() {
    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
                    <Text style={styles.title}>Discover</Text>
                    <Text style={styles.sub}>Trending spots from local creators</Text>

                    <GlassCard style={{ marginTop: 24, alignItems: 'center' }}>
                        <IconBadge size={72} radius={36}>
                            <Compass size={36} color="white" />
                        </IconBadge>
                        <Text style={styles.emptyTitle}>Phase 2 Feature</Text>
                        <Text style={styles.emptyBody}>
                            A TikTok-style vertical video feed of local spots is coming in the next phase.
                            For now, the swipe discovery inside an active party is where the magic happens.
                        </Text>
                    </GlassCard>
                </ScrollView>
            </SafeAreaView>
            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32 },
    sub: { color: colors.text60, fontSize: 14, marginTop: 4, fontFamily: 'Inter_400Regular' },
    emptyTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 16, marginBottom: 8 },
    emptyBody: { color: colors.text60, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: 'Inter_400Regular' },
});
