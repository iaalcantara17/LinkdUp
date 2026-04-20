import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Image, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Mail, ArrowRight } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import GradientButton from '../components/GradientButton';
import { colors, typography, spacing, radii } from '../theme';

const CAMPUS_BG = 'https://images.unsplash.com/photo-1631599143424-5bc234fbebf1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';

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

function GoogleIcon() {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <Path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <Path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <Path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </Svg>
    );
}

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [gradYear, setGradYear] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [mode, setMode] = useState<'signup' | 'login'>('signup');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!email || !password) {
            Alert.alert('Missing fields', 'Email and password are required.');
            return;
        }
        setLoading(true);
        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                if (!displayName) {
                    Alert.alert('Missing fields', 'Please enter your display name.');
                    setLoading(false);
                    return;
                }
                const result = await api.signup({
                    email,
                    password,
                    display_name: displayName,
                    graduation_year: gradYear ? parseInt(gradYear, 10) : undefined,
                });
                await supabase.auth.setSession({
                    access_token: result.session.access_token,
                    refresh_token: result.session.refresh_token,
                });
            }
        } catch (e: any) {
            Alert.alert(mode === 'login' ? 'Login failed' : 'Signup failed', e?.message ?? 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <Image source={{ uri: CAMPUS_BG }} style={styles.campusBg} />
            <View style={styles.campusOverlay} />

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 40 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View entering={FadeInDown.duration(500)} style={{ marginBottom: 24 }}>
                            <GradientWordmark />
                            <Text style={styles.tagline}>Find your people. Find your place.</Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.card}>
                            <Text style={styles.cardTitle}>
                                {mode === 'login' ? 'Welcome back' : 'Join the crew'}
                            </Text>
                            <Text style={styles.cardSub}>
                                {mode === 'login'
                                    ? 'Sign in to reconnect with your crew'
                                    : 'Sign up to link up with your alumni'}
                            </Text>

                            {mode === 'signup' && (
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.label}>Display Name</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="your name"
                                        placeholderTextColor={colors.text30}
                                        value={displayName}
                                        onChangeText={setDisplayName}
                                    />
                                </View>
                            )}

                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Alumni Email</Text>
                                <View style={styles.inputIconWrap}>
                                    <Mail size={18} color={colors.text40} style={styles.inputIcon} />
                                    <TextInput
                                        style={[styles.input, { paddingLeft: 44 }]}
                                        placeholder="your.email@alumni.edu"
                                        placeholderTextColor={colors.text30}
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />
                                </View>
                            </View>

                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Password</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    placeholderTextColor={colors.text30}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                />
                            </View>

                            {mode === 'signup' && (
                                <>
                                    <View style={styles.fieldGroup}>
                                        <Text style={styles.label}>School Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="University of..."
                                            placeholderTextColor={colors.text30}
                                            value={schoolName}
                                            onChangeText={setSchoolName}
                                        />
                                    </View>
                                    <View style={styles.fieldGroup}>
                                        <Text style={styles.label}>Graduation Year</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="2026"
                                            placeholderTextColor={colors.text30}
                                            value={gradYear}
                                            onChangeText={setGradYear}
                                            keyboardType="number-pad"
                                        />
                                    </View>
                                </>
                            )}

                            <GradientButton
                                title={mode === 'login' ? 'Log In' : 'Continue'}
                                onPress={handleSubmit}
                                loading={loading}
                                rightIcon={<ArrowRight size={20} color="white" />}
                            />

                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>or</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            <GradientButton
                                title="Sign up with Google"
                                variant="white"
                                onPress={() => Alert.alert('Coming soon', 'Google sign-in is Phase 2 for this capstone.')}
                                leftIcon={<GoogleIcon />}
                            />

                            <Text style={styles.toggle} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
                            </Text>
                        </Animated.View>

                        <Text style={styles.terms}>By continuing, you agree to our Terms & Privacy Policy</Text>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    campusBg: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
    campusOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,15,0.4)' },
    wordmark: {
        fontFamily: 'Inter_900Black',
        fontSize: 48,
        letterSpacing: -1,
    },
    tagline: { ...typography.body, color: colors.text60, marginTop: 8 },
    card: {
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 16,
    },
    cardTitle: { ...typography.h1, color: 'white', fontSize: 28, marginBottom: 6 },
    cardSub: { ...typography.body, color: colors.text60, marginBottom: 20 },
    fieldGroup: { marginBottom: 16 },
    label: { ...typography.caption, color: colors.text80, marginBottom: 8, fontSize: 13 },
    input: {
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.glassBorderStrong,
        borderRadius: radii.md,
        paddingVertical: 16,
        paddingHorizontal: 16,
        color: 'white',
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
    },
    inputIconWrap: { position: 'relative' },
    inputIcon: {
        position: 'absolute',
        left: 16,
        top: 19,
        zIndex: 1,
    },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.glassBorder },
    dividerText: { color: colors.text40, fontSize: 13, fontFamily: 'Inter_500Medium' },
    toggle: {
        color: colors.text60,
        textAlign: 'center',
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
    },
    terms: { color: colors.text40, fontSize: 12, textAlign: 'center', marginTop: 12, fontFamily: 'Inter_400Regular' },
});
