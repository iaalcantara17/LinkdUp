import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ArrowLeft, Copy, Check, ArrowRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, radii } from '../theme';

const SUGGESTIONS = ['Weekend Warriors', 'Alumni Hangout', 'Study Group Reunion', 'Friday Night Crew'];

export default function CreatePartyScreen() {
    const nav = useNavigation<any>();
    const [step, setStep] = useState<'name' | 'invite'>('name');
    const [partyName, setPartyName] = useState('');
    const [partyCode, setPartyCode] = useState<string | null>(null);
    const [partyId, setPartyId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleNext = async () => {
        if (step === 'name') {
            if (!partyName) return;
            setLoading(true);
            try {
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
            if (partyId) nav.replace('PartyLobby', { partyId });
        }
    };

    const handleCopy = async () => {
        if (!partyCode) return;
        setCopied(true);
        try {
            await Share.share({ message: `Join my LinkdUp party! Code: ${partyCode}` });
        } catch {}
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Create a Party</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.progressRow}>
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.progressBar}
                    />
                    <View style={styles.progressBar}>
                        {step === 'invite' && (
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={StyleSheet.absoluteFill}
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
                            <Text style={styles.stepSub}>Share this code so friends can join</Text>

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
                                            {copied ? <Check size={16} color="white" /> : <Copy size={16} color="white" />}
                                            <Text style={styles.copyText}>{copied ? 'Shared!' : 'Share'}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.codeBox}>
                                    <Text style={styles.codeText}>{partyCode ?? '------'}</Text>
                                </View>
                                <Text style={styles.hint}>
                                    Friends can enter this 6-character code on the Join Party screen.
                                </Text>
                            </View>

                            <View style={styles.nextStep}>
                                <Text style={styles.nextStepTitle}>What's next?</Text>
                                <Text style={styles.nextStepBody}>
                                    Head to the party lobby to see who's joined, then tap "Start swiping" when you're ready.
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </ScrollView>
            </SafeAreaView>

            <LinearGradient
                colors={['transparent', colors.bg, colors.bg]}
                style={styles.bottomFade}
                pointerEvents="box-none"
            >
                <GradientButton
                    title={step === 'name' ? 'Continue' : 'Go to Lobby'}
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
        marginBottom: 16,
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
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 12,
    },
    codeText: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32, letterSpacing: 8 },
    hint: { color: colors.text60, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' },

    nextStep: {
        padding: 16,
        borderRadius: radii.lg,
        backgroundColor: 'rgba(108,62,244,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.20)',
    },
    nextStepTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 4 },
    nextStepBody: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

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
