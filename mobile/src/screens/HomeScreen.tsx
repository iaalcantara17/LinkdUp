import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Plus } from 'lucide-react-native';
import BottomNav from '../components/BottomNav';
import { colors, typography, spacing, radii } from '../theme';

// Mock data matching the Figma - real data hooks up later via /api/user/parties
const onlineFriends = [
    { id: 1, name: 'Alex', avatar: 'https://i.pravatar.cc/150?img=1', online: true },
    { id: 2, name: 'Jordan', avatar: 'https://i.pravatar.cc/150?img=2', online: true },
    { id: 3, name: 'Sam', avatar: 'https://i.pravatar.cc/150?img=3', online: true },
    { id: 4, name: 'Casey', avatar: 'https://i.pravatar.cc/150?img=4', online: false },
    { id: 5, name: 'Riley', avatar: 'https://i.pravatar.cc/150?img=5', online: true },
];

interface PartyCard {
    id: string;
    name: string;
    members: number;
    swiped: number;
    total: number;
    avatars: string[];
    matched?: boolean;
}

const mockParties: PartyCard[] = [
    {
        id: 'party1',
        name: 'Weekend Brunch Crew',
        members: 5,
        swiped: 3,
        total: 5,
        avatars: ['https://i.pravatar.cc/150?img=1', 'https://i.pravatar.cc/150?img=2', 'https://i.pravatar.cc/150?img=3'],
    },
    {
        id: 'party2',
        name: 'Game Night Squad',
        members: 4,
        swiped: 4,
        total: 4,
        avatars: ['https://i.pravatar.cc/150?img=6', 'https://i.pravatar.cc/150?img=7'],
        matched: true,
    },
];

function GradientWordmark() {
    try {
        return (
            <MaskedView maskElement={<Text style={[styles.wordmark, { color: 'white' }]}>LINKDUP</Text>}>
                <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={[styles.wordmark, { opacity: 0 }]}>LINKDUP</Text>
                </LinearGradient>
            </MaskedView>
        );
    } catch {
        return <Text style={[styles.wordmark, { color: colors.primary }]}>LINKDUP</Text>;
    }
}

export default function HomeScreen() {
    const nav = useNavigation<any>();
    const [parties] = useState(mockParties);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // TODO: fetch real parties via api.getMyParties()
        setTimeout(() => setRefreshing(false), 600);
    }, []);

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 160 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
                >
                    {/* Header */}
                    <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                        <GradientWordmark />
                        <Text style={styles.greeting}>Hey there! 👋</Text>
                    </Animated.View>

                    {/* Online Alumni */}
                    <View style={{ marginTop: 24 }}>
                        <Text style={styles.sectionLabel}>Online Alumni</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
                        >
                            {onlineFriends.map((friend, i) => (
                                <Animated.View
                                    key={friend.id}
                                    entering={FadeInRight.delay(i * 50).duration(400)}
                                    style={{ alignItems: 'center' }}
                                >
                                    <View>
                                        <Image source={{ uri: friend.avatar }} style={styles.avatar} />
                                        {friend.online && <View style={styles.onlineDot} />}
                                    </View>
                                    <Text style={styles.avatarName}>{friend.name}</Text>
                                </Animated.View>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Active parties */}
                    <View style={{ marginTop: 32, paddingHorizontal: 24 }}>
                        <Text style={styles.sectionHeader}>Your Active Parties</Text>
                        {parties.map((party, i) => (
                            <Animated.View key={party.id} entering={FadeInDown.delay(i * 100).duration(400)}>
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={() => nav.navigate('PartyLobby', { partyId: party.id })}
                                    style={styles.partyCard}
                                >
                                    <View style={styles.partyHeader}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.partyName}>{party.name}</Text>
                                            <Text style={styles.partyMembers}>{party.members} members</Text>
                                        </View>
                                        {party.matched && (
                                            <LinearGradient
                                                colors={['#22C55E', '#10B981']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.matchedPill}
                                            >
                                                <Text style={styles.matchedText}>MATCHED! 🎉</Text>
                                            </LinearGradient>
                                        )}
                                    </View>

                                    {/* Avatar stack */}
                                    <View style={styles.avatarStack}>
                                        {party.avatars.map((a, j) => (
                                            <Image
                                                key={j}
                                                source={{ uri: a }}
                                                style={[styles.stackAvatar, { marginLeft: j === 0 ? 0 : -8 }]}
                                            />
                                        ))}
                                    </View>

                                    {!party.matched && (
                                        <View style={{ marginTop: 14 }}>
                                            <View style={styles.progressHeader}>
                                                <Text style={styles.progressLabel}>Voting Progress</Text>
                                                <Text style={styles.progressCount}>
                                                    {party.swiped}/{party.total} swiped
                                                </Text>
                                            </View>
                                            <View style={styles.progressTrack}>
                                                <LinearGradient
                                                    colors={colors.gradient as any}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 0 }}
                                                    style={[
                                                        styles.progressFill,
                                                        { width: `${(party.swiped / party.total) * 100}%` },
                                                    ]}
                                                />
                                            </View>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </Animated.View>
                        ))}

                        {/* Join-by-code entry point (backend feature, not in figma) */}
                        <TouchableOpacity
                            style={styles.joinRow}
                            onPress={() => nav.navigate('JoinParty')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.joinText}>Have a code? Join a party →</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.85}
                onPress={() => nav.navigate('CreateParty')}
            >
                <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
                    <Plus size={32} color="white" />
                </LinearGradient>
            </TouchableOpacity>

            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: 24, paddingTop: 8 },
    wordmark: { fontFamily: 'Inter_900Black', fontSize: 36, letterSpacing: -0.5 },
    greeting: { color: colors.text60, fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },

    sectionLabel: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 12, paddingHorizontal: 24 },
    sectionHeader: { ...typography.h2, color: 'white', marginBottom: 16, fontSize: 22 },

    avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.glassBorder },
    onlineDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.success,
        borderWidth: 2,
        borderColor: colors.bg,
    },
    avatarName: { color: colors.text60, fontSize: 12, marginTop: 6, fontFamily: 'Inter_400Regular' },

    partyCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 16,
    },
    partyHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
    partyName: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 4 },
    partyMembers: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },

    matchedPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
    matchedText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 11 },

    avatarStack: { flexDirection: 'row' },
    stackAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.bg },

    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },
    progressCount: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },
    progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.glassStrong, overflow: 'hidden' },
    progressFill: { height: '100%' },

    joinRow: { padding: 16, alignItems: 'center', marginTop: 8 },
    joinText: { color: colors.text60, fontSize: 14, fontFamily: 'Inter_500Medium' },

    fab: {
        position: 'absolute',
        bottom: 100,
        right: 24,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 12,
    },
    fabGradient: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
