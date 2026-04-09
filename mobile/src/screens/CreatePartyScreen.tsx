import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ArrowLeft, Copy, Check, ArrowRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

const SUGGESTIONS = ['Weekend Warriors', 'Alumni Hangout', 'Study Group Reunion', 'Friday Night Crew'];

const ALUMNI_MOCK = [
    { id: 1, name: 'Alex Chen', school: "NJIT '26", avatar: 'https://i.pravatar.cc/150?img=1' },
    { id: 2, name: 'Jordan Lee', school: "NJIT '26", avatar: 'https://i.pravatar.cc/150?img=2' },
    { id: 3, name: 'Sam Parker', school: "NJIT '25", avatar: 'https://i.pravatar.cc/150?img=3' },
    { id: 4, name: 'Casey Morgan', school: "NJIT '26", avatar: 'https://i.pravatar.cc/150?img=4' },
    { id: 5, name: 'Riley Davis', school: "NJIT '27", avatar: 'https://i.pravatar.cc/150?img=5' },
    { id: 6, name: 'Taylor Kim', school: "NJIT '26", avatar: 'https://i.pravatar.cc/150?img=6' },
];

export default function CreatePartyScreen() {
    const nav = useNavigation<any>();
    const [step, setStep] = useState<'name' | 'invite'>('name');
    const [partyName, setPartyName] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [partyCode, setPartyCode] = useState<string | null>(null);
    const [partyId, setPartyId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    const selectedCount = selected.size;

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const handleNext = async () => {
        if (step === 'name') {
            if (!partyName) return;
            setLoading(true);
            try {
                // Create the party now so we have a real code to share
                const r = await api.createParty(partyName);
                setPartyCode(r.code);
                setPartyId(r.party_id);
                setStep('invite');
            } catch (e: any) {
                Alert.alert('Could not create party', e?.message ?? 'unknown');
            } finally {
                setLoading(false);
            }
        } else {
            // Jump to the lobby where the host waits for joiners
            if (partyId) nav.replace('PartyLobby', { partyId });
        }
    };

    const handleCopy = async () => {
        if (!partyCode) return;
        setCopied(true);
        await Share.share({ message: `Join my LinkdUp party! Code: ${partyCode}` });
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Create a Party</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Progress */}
                <View style={styles.progressRow}>
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.progressBar}
                    />
                    <View
                        style={[
                            styles.progressBar,
                            step === 'invite' ? { overflow: 'hidden' } : { backgroundColor: colors.glassStrong },
                        ]}
                    >
                        {step === 'invite' && (
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{ flex: 1 }}
                            />
                        )}
                    </View>
                </View>

                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
                    {step === 'name' ? (
                        <Animated.View entering={FadeInRight.duration(300)}>
                            <Text style={styles.stepTitle}>Name your party</Text>
                            <Text style={styles.stepSub}>Give your crew a memorable name</Text>

                            <TextInput
                                style={styles.nameInput}
                                placeholder="e.g. Weekend Brunch Crew"
                                placeholderTextColor={colors.text30}
                                value={partyName}
                                onChangeText={setPartyName}
                                autoFocus
                            />

                            <Text style={styles.suggestLabel}>Quick suggestions:</Text>
                            <View style={styles.suggestWrap}>
                                {SUGGESTIONS.map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => setPartyName(s)}
                                        style={styles.suggestPill}
                                    >
                                        <Text style={styles.suggestText}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeInRight.duration(300)}>
                            <Text style={styles.stepTitle}>Invite your crew</Text>
                            <Text style={styles.stepSub}>Share the code or pick from your alumni</Text>

                            {/* Code share card */}
                            <View style={styles.shareCard}>
                                <View style={styles.shareCardHeader}>
                                    <Text style={styles.shareLabel}>Share invite code</Text>
                                    <TouchableOpacity onPress={handleCopy} activeOpacity={0.85}>
                                        <LinearGradient
                                            colors={colors.gradient as any}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.copyBtn}
                                        >
                                            {copied ? (
                                                <Check size={16} color="white" />
                                            ) : (
                                                <Copy size={16} color="white" />
                                            )}
                                            <Text style={styles.copyText}>{copied ? 'Shared!' : 'Share'}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.codeBox}>
                                    <Text style={styles.codeText}>{partyCode ?? '------'}</Text>
                                </View>
                            </View>

                            <Text style={[styles.suggestLabel, { marginTop: 20 }]}>Selected: {selectedCount}</Text>
                            <View style={{ marginTop: 8 }}>
                                {ALUMNI_MOCK.map((friend, i) => {
                                    const isSelected = selected.has(friend.id);
                                    return (
                                        <Animated.View key={friend.id} entering={FadeInRight.delay(i * 50).duration(300)}>
                                            <TouchableOpacity
                                                onPress={() => toggle(friend.id)}
                                                activeOpacity={0.85}
                                                style={[
                                                    styles.friendRow,
                                                    isSelected && {
                                                        borderColor: colors.primary,
                                                        borderWidth: 2,
                                                        backgroundColor: 'rgba(108,62,244,0.12)',
                                                    },
                                                ]}
                                            >
                                                <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={styles.friendName}>{friend.name}</Text>
                                                    <Text style={styles.friendSchool}>{friend.school}</Text>
                                                </View>
                                                <View
                                                    style={[
                                                        styles.checkCircle,
                                                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}
                                                >
                                                    {isSelected && <Check size={14} color="white" />}
                                                </View>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })}
                            </View>
                        </Animated.View>
                    )}
                </ScrollView>
            </SafeAreaView>

            {/* Bottom CTA */}
            <LinearGradient
                colors={['transparent', colors.bg, colors.bg]}
                style={styles.bottomFade}
                pointerEvents="box-none"
            >
                <GradientButton
                    title={step === 'name' ? 'Continue' : 'Start Party'}
                    onPress={handleNext}
                    disabled={step === 'name' ? !partyName : false}
                    loading={loading}
                    rightIcon={<ArrowRight size={20} color="white" />}
                />
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
    headerTitle: { ...typography.h3, color: 'white' },

    progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginTop: 12, marginBottom: 8 },
    progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },

    stepTitle: { ...typography.h1, color: 'white', marginBottom: 6, fontSize: 28 },
    stepSub: { ...typography.body, color: colors.text60, marginBottom: 24 },

    nameInput: {
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.glassBorderStrong,
        borderRadius: radii.lg,
        paddingHorizontal: 20,
        paddingVertical: 20,
        color: 'white',
        fontSize: 18,
        marginBottom: 24,
        fontFamily: 'Inter_400Regular',
    },

    suggestLabel: { color: colors.text40, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 10 },
    suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radii.pill,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    suggestText: { color: 'white', fontSize: 13, fontFamily: 'Inter_500Medium' },

    shareCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    shareCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    shareLabel: { color: 'white', fontFamily: 'Inter_500Medium', fontSize: 14 },
    copyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radii.pill,
    },
    copyText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 13 },
    codeBox: {
        backgroundColor: colors.glassStrong,
        borderRadius: radii.md,
        paddingVertical: 14,
        alignItems: 'center',
    },
    codeText: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 28, letterSpacing: 6 },

    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: radii.lg,
        backgroundColor: colors.glass,
        borderWidth: 2,
        borderColor: 'transparent',
        marginBottom: 8,
    },
    friendAvatar: { width: 48, height: 48, borderRadius: 24 },
    friendName: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
    friendSchool: { color: colors.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.text30,
        alignItems: 'center',
        justifyContent: 'center',
    },

    bottomFade: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 32,
    },
});
