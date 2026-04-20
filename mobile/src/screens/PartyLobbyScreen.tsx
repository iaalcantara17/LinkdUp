import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import GlassCard from '../components/GlassCard';
import AvatarBubble from '../components/AvatarBubble';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { colors, typography, spacing, radii } from '../theme';

export default function PartyLobbyScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params.partyId;
    const [party, setParty] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [me, setMe] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const [p, ms, sess] = await Promise.all([
                api.getParty(partyId).catch(() => null),
                api.getMembers(partyId).catch(() => []),
                supabase.auth.getUser(),
            ]);
            if (p?.party) setParty(p.party);
            setMembers(ms);
            setMe(sess.data.user?.id ?? null);
            if (p?.party?.status === 'swiping') {
                nav.replace('Swipe', { partyId });
            }
        } catch {}
    }, [partyId, nav]);

    useFocusEffect(
        useCallback(() => {
            refresh();
            const t = setInterval(refresh, 3000);
            return () => clearInterval(t);
        }, [refresh])
    );

    const isHost = party?.host_user_id === me;

    const handleStart = async () => {
        setLoading(true);
        try {
            nav.navigate('LocationPermission');
            await new Promise((r) => setTimeout(r, 500));
            await api.startParty(partyId);
            nav.replace('Swipe', { partyId });
        } catch (e: any) {
            Alert.alert('Could not start', e?.message ?? 'unknown');
            nav.replace('Swipe', { partyId }); // fall through to demo mode
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!party?.code) return;
        await Share.share({ message: `Join my LinkdUp party! Code: ${party.code}` });
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Party Lobby</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <Text style={styles.title}>{party?.name ?? 'Loading...'}</Text>
                        <Text style={styles.sub}>Status: {party?.status ?? '...'}</Text>

                        <GlassCard style={{ marginVertical: 24, alignItems: 'center' }}>
                            <Text style={styles.codeLabel}>JOIN CODE</Text>
                            <TouchableOpacity onPress={handleShare} activeOpacity={0.8}>
                                <Text style={styles.code}>{party?.code ?? '------'}</Text>
                            </TouchableOpacity>
                            <Text style={styles.tapHint}>tap to share</Text>
                        </GlassCard>

                        <Text style={styles.crewLabel}>Crew ({members.length})</Text>
                        <View style={styles.crew}>
                            {members.map((m: any) => (
                                <View key={m.user_id} style={{ alignItems: 'center', marginRight: 16, marginBottom: 16 }}>
                                    <AvatarBubble
                                        name={m.users?.display_name ?? '?'}
                                        color={m.users?.avatar_color}
                                    />
                                    <Text style={styles.crewName}>{m.users?.display_name ?? '?'}</Text>
                                </View>
                            ))}
                        </View>

                        {isHost ? (
                            <GradientButton title="Start swiping" onPress={handleStart} loading={loading} />
                        ) : (
                            <Text style={styles.waiting}>Waiting for the host to start...</Text>
                        )}
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
    headerTitle: { ...typography.h3, color: 'white' },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32 },
    sub: { color: colors.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },
    codeLabel: { color: colors.text60, fontSize: 11, letterSpacing: 1, marginBottom: 8, fontFamily: 'Inter_700Bold' },
    code: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 48, letterSpacing: 8 },
    tapHint: { color: colors.text40, fontSize: 11, marginTop: 8, fontFamily: 'Inter_400Regular' },
    crewLabel: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 16 },
    crew: { flexDirection: 'row', flexWrap: 'wrap' },
    crewName: { color: 'white', fontSize: 12, marginTop: 4, fontFamily: 'Inter_500Medium' },
    waiting: { color: colors.text60, textAlign: 'center', marginTop: 32, fontFamily: 'Inter_500Medium' },
});
