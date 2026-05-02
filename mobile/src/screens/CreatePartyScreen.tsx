import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ArrowLeft, Copy, Check, ArrowRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import AppSwitch from '../components/AppSwitch';
import GlassCard from '../components/GlassCard';
import { api } from '../services/api';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useLocationGuard } from '../hooks/useLocationGuard';

const SUGGESTIONS = ['Weekend Warriors', 'Alumni Hangout', 'Study Group Reunion', 'Friday Night Crew'];
const MAX_NAME = 40;
const MIN_NAME = 2;

export default function CreatePartyScreen() {
    const nav = useNavigation<any>();
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const { checkLocation, GuardBubble } = useLocationGuard();

    const [step, setStep] = useState<'name' | 'invite'>('name');
    const [partyName, setPartyName] = useState('');
    const [partyCode, setPartyCode] = useState<string | null>(null);
    const [partyId, setPartyId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [nameTouched, setNameTouched] = useState(false);
    const [isPublic, setIsPublic] = useState<boolean>(() => {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('linkdup_default_party_public') === 'true';
        }
        return false;
    });

    const trimmedName = partyName.trim();
    const nameValid = trimmedName.length >= MIN_NAME && partyName.length <= MAX_NAME;
    const nameError = nameTouched && !nameValid
        ? trimmedName.length < MIN_NAME
            ? `Name must be at least ${MIN_NAME} characters`
            : `Name must be ${MAX_NAME} characters or fewer`
        : null;

    const doCreate = async () => {
        if (!nameValid) return;
        setLoading(true);
        try {
            const r = await api.createParty(partyName.trim(), isPublic);
            setPartyCode(r.code);
            setPartyId(r.party_id);
            setStep('invite');
        } catch (e: any) {
            Alert.alert('Could not create party', e?.message ?? 'unknown');
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        if (step === 'name') {
            setNameTouched(true);
            if (!nameValid) return;
            checkLocation(doCreate);
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

    const continueDisabled = step === 'name' ? !nameValid : false;

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color={colors.textPrimary} />
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

                            <View>
                                <TextInput
                                    style={[styles.nameInput, nameError ? styles.nameInputError : null]}
                                    placeholder="e.g. Weekend Brunch Crew"
                                    placeholderTextColor={colors.text30}
                                    value={partyName}
                                    onChangeText={setPartyName}
                                    onBlur={() => setNameTouched(true)}
                                    autoFocus
                                    maxLength={MAX_NAME}
                                />
                                <View style={styles.nameFooterRow}>
                                    {nameError ? (
                                        <Text style={styles.nameError}>{nameError}</Text>
                                    ) : (
                                        <View />
                                    )}
                                    <Text style={[
                                        styles.charCounter,
                                        partyName.length > MAX_NAME - 5 ? { color: colors.danger } : null,
                                    ]}>
                                        {partyName.length}/{MAX_NAME}
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.suggestLabel}>Quick suggestions:</Text>
                            <View style={styles.suggestWrap}>
                                {SUGGESTIONS.map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => { setPartyName(s); setNameTouched(false); }}
                                        style={styles.suggestPill}
                                    >
                                        <Text style={styles.suggestText}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <GlassCard style={{ marginTop: 20 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.visibilityTitle}>Make party public</Text>
                                        <Text style={styles.visibilitySub}>Appear in the Discover tab for anyone nearby</Text>
                                    </View>
                                    <AppSwitch
                                        value={isPublic}
                                        onValueChange={setIsPublic}
                                        trackOnColor={colors.primary}
                                        trackOffColor={colors.glassStrong}
                                        thumbColor={isDark ? '#FFFFFF' : '#E8E8E8'}
                                    />
                                </View>
                                {isPublic && (
                                    <View style={styles.disclaimerBanner}>
                                        <Text style={styles.disclaimerText}>
                                            Anyone nearby can find and join your party from the Discover tab. Share your invite code only with people you trust.
                                        </Text>
                                    </View>
                                )}
                            </GlassCard>
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
                    disabled={continueDisabled}
                    loading={loading}
                    rightIcon={<ArrowRight size={20} color="white" />}
                />
            </LinearGradient>

            {GuardBubble}
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
        headerTitle: { ...typography.h3, color: c.textPrimary },

        progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginTop: 12, marginBottom: 8 },
        progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.glassStrong, overflow: 'hidden' },

        stepTitle: { ...typography.h1, color: c.textPrimary, marginBottom: 6, fontSize: 28 },
        stepSub: { ...typography.body, color: c.text60, marginBottom: 24 },

        nameInput: {
            backgroundColor: c.glassStrong,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            borderRadius: radii.lg,
            paddingHorizontal: 20,
            paddingVertical: 20,
            color: c.textPrimary,
            fontSize: 18,
            fontFamily: 'Inter_400Regular',
        },
        nameInputError: {
            borderColor: '#EF4444',
        },
        nameFooterRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
            marginBottom: 16,
            minHeight: 18,
        },
        nameError: {
            color: '#EF4444',
            fontSize: 12,
            fontFamily: 'Inter_400Regular',
            flex: 1,
        },
        charCounter: {
            color: c.text40,
            fontSize: 12,
            fontFamily: 'Inter_400Regular',
            marginLeft: 8,
        },

        suggestLabel: { color: c.text40, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 10 },
        suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        suggestPill: {
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        suggestText: { color: c.textPrimary, fontSize: 13, fontFamily: 'Inter_500Medium' },

        shareCard: {
            backgroundColor: c.glass,
            borderRadius: radii.lg,
            padding: 20,
            borderWidth: 1,
            borderColor: c.glassBorder,
            marginBottom: 16,
        },
        shareCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
        shareLabel: { color: c.textPrimary, fontFamily: 'Inter_500Medium', fontSize: 14 },
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
            backgroundColor: c.glassStrong,
            borderRadius: radii.md,
            paddingVertical: 18,
            alignItems: 'center',
            marginBottom: 12,
        },
        codeText: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32, letterSpacing: 8 },
        hint: { color: c.text60, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' },

        visibilityTitle: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        visibilitySub: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
        disclaimerBanner: {
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            backgroundColor: 'rgba(245,158,11,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(245,158,11,0.25)',
        },
        disclaimerText: { color: c.text80, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },

        nextStep: {
            padding: 16,
            borderRadius: radii.lg,
            backgroundColor: 'rgba(108,62,244,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(108,62,244,0.20)',
        },
        nextStepTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 4 },
        nextStepBody: { color: c.text60, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

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
}
