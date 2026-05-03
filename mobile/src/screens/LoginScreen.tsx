import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, StyleSheet, Image, ScrollView,
    KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Mail, ArrowRight, Eye, EyeOff, AlertTriangle } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import GradientButton from '../components/GradientButton';
import { colors, typography, spacing, radii } from '../theme';

const CAMPUS_BG = 'https://images.unsplash.com/photo-1631599143424-5bc234fbebf1?crop=entropy&cs=tinysrgb&fit=max&fm=webp&q=80&w=1080';

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
            <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </Svg>
    );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateDisplayName(v: string): string | null {
    if (!v.trim()) return 'Display name is required';
    if (v.trim().length < 2) return 'Must be at least 2 characters';
    if (v.trim().length > 50) return 'Must be 50 characters or fewer';
    return null;
}
function validateEmail(v: string): string | null {
    if (!v.trim()) return 'Email is required';
    if (!EMAIL_RE.test(v.trim())) return 'Enter a valid email address';
    return null;
}
function validatePassword(v: string): string | null {
    if (!v) return 'Password is required';
    if (v.length < 8) return 'Must be at least 8 characters';
    return null;
}
function validateConfirm(v: string, pw: string): string | null {
    if (!v) return 'Please confirm your password';
    if (v !== pw) return 'Passwords do not match';
    return null;
}

interface FieldErrors {
    displayName: string | null;
    email: string | null;
    password: string | null;
    confirmPassword: string | null;
}

export default function LoginScreen() {
    const nav   = useNavigation<any>();
    const route = useRoute<any>();
    const { session } = useAuth();

    const [mode, setMode] = useState<'signup' | 'login'>(route.params?.mode ?? 'signup');
    const [displayName,     setDisplayName]     = useState('');
    const [email,           setEmail]           = useState('');
    const [password,        setPassword]        = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword,        setShowPassword]        = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [touched, setTouched] = useState({
        displayName: false, email: false, password: false, confirmPassword: false,
    });
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
        displayName: null, email: null, password: null, confirmPassword: null,
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [loading,   setLoading]   = useState(false);

    const emailRef   = useRef<TextInput>(null);
    const passRef    = useRef<TextInput>(null);
    const confirmRef = useRef<TextInput>(null);

    useEffect(() => {
        if (session) {
            try { nav.reset({ index: 0, routes: [{ name: 'Home' }] }); } catch {}
        }
    }, [session]);

    // Reset form errors when mode switches
    useEffect(() => {
        setFieldErrors({ displayName: null, email: null, password: null, confirmPassword: null });
        setTouched({ displayName: false, email: false, password: false, confirmPassword: false });
        setFormError(null);
    }, [mode]);

    const runFieldValidation = (field: keyof FieldErrors, value: string) => {
        let err: string | null = null;
        if (field === 'displayName')     err = validateDisplayName(value);
        if (field === 'email')           err = validateEmail(value);
        if (field === 'password')        err = validatePassword(value);
        if (field === 'confirmPassword') err = validateConfirm(value, password);
        setFieldErrors(prev => ({ ...prev, [field]: err }));
    };

    const handleBlur = (field: keyof FieldErrors, value: string) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        runFieldValidation(field, value);
    };

    const canSubmit = (() => {
        if (mode === 'login') {
            return email.trim().length > 0 && password.length > 0;
        }
        return (
            !validateDisplayName(displayName) &&
            !validateEmail(email) &&
            !validatePassword(password) &&
            !validateConfirm(confirmPassword, password)
        );
    })();

    const handleSubmit = async () => {
        setFormError(null);
        if (mode === 'signup') {
            const allTouched = { displayName: true, email: true, password: true, confirmPassword: true };
            setTouched(allTouched);
            const errors: FieldErrors = {
                displayName:     validateDisplayName(displayName),
                email:           validateEmail(email),
                password:        validatePassword(password),
                confirmPassword: validateConfirm(confirmPassword, password),
            };
            setFieldErrors(errors);
            if (Object.values(errors).some(Boolean)) return;
        }

        setLoading(true);
        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) throw error;
            } else {
                const result = await api.signup({
                    email: email.trim(),
                    password,
                    display_name: displayName.trim(),
                });
                await supabase.auth.setSession({
                    access_token:  result.session.access_token,
                    refresh_token: result.session.refresh_token,
                });
            }
        } catch (e: any) {
            setFormError(e?.message ?? 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = () => {
        setFormError('Check your inbox — a password reset link will be sent to your email.');
    };

    const FieldError = ({ msg }: { msg: string | null }) =>
        msg ? (
            <View style={styles.errorRow}>
                <AlertTriangle size={12} color="#EF4444" style={{ marginRight: 4 }} />
                <Text style={styles.errorText}>{msg}</Text>
            </View>
        ) : null;

    return (
        <View style={styles.root}>
            <Image source={{ uri: CAMPUS_BG }} style={styles.campusBg} accessibilityLabel="University campus" accessibilityRole="image" />
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

                            {/* Display name — signup only */}
                            {mode === 'signup' && (
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.label}>
                                        Full Name <Text style={{ color: '#EF4444' }}>*</Text>
                                    </Text>
                                    <TextInput
                                        style={[styles.input, touched.displayName && fieldErrors.displayName ? styles.inputError : null]}
                                        placeholder="Your name"
                                        placeholderTextColor={colors.text30}
                                        value={displayName}
                                        onChangeText={v => { setDisplayName(v); setFormError(null); }}
                                        onBlur={() => handleBlur('displayName', displayName)}
                                        returnKeyType="next"
                                        onSubmitEditing={() => emailRef.current?.focus()}
                                        blurOnSubmit={false}
                                        maxLength={50}
                                    />
                                    <FieldError msg={touched.displayName ? fieldErrors.displayName : null} />
                                </View>
                            )}

                            {/* Email */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>
                                    Alumni Email <Text style={{ color: '#EF4444' }}>*</Text>
                                </Text>
                                <View style={styles.inputIconWrap}>
                                    <Mail size={18} color={colors.text40} style={styles.inputIcon} />
                                    <TextInput
                                        ref={emailRef}
                                        style={[styles.input, { paddingLeft: 44 }, touched.email && fieldErrors.email ? styles.inputError : null]}
                                        placeholder="your.email@alumni.edu"
                                        placeholderTextColor={colors.text30}
                                        value={email}
                                        onChangeText={v => { setEmail(v); setFormError(null); }}
                                        onBlur={() => handleBlur('email', email)}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        returnKeyType="next"
                                        onSubmitEditing={() => passRef.current?.focus()}
                                        blurOnSubmit={false}
                                    />
                                </View>
                                <FieldError msg={touched.email ? fieldErrors.email : null} />
                            </View>

                            {/* Password */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>
                                    Password <Text style={{ color: '#EF4444' }}>*</Text>
                                </Text>
                                <View style={styles.inputWithToggle}>
                                    <TextInput
                                        ref={passRef}
                                        style={[
                                            styles.input,
                                            styles.inputPaddedRight,
                                            touched.password && fieldErrors.password ? styles.inputError : null,
                                        ]}
                                        placeholder="••••••••"
                                        placeholderTextColor={colors.text30}
                                        value={password}
                                        onChangeText={v => { setPassword(v); setFormError(null); }}
                                        onBlur={() => handleBlur('password', password)}
                                        secureTextEntry={!showPassword}
                                        returnKeyType={mode === 'login' ? 'go' : 'next'}
                                        onSubmitEditing={mode === 'login' ? handleSubmit : () => confirmRef.current?.focus()}
                                        blurOnSubmit={mode === 'login'}
                                    />
                                    <TouchableOpacity
                                        style={styles.eyeBtn}
                                        onPress={() => setShowPassword(p => !p)}
                                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                    >
                                        {showPassword
                                            ? <EyeOff size={18} color={colors.text40} />
                                            : <Eye size={18} color={colors.text40} />
                                        }
                                    </TouchableOpacity>
                                </View>
                                <FieldError msg={touched.password ? fieldErrors.password : null} />
                            </View>

                            {/* Confirm password — signup only */}
                            {mode === 'signup' && (
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.label}>
                                        Confirm Password <Text style={{ color: '#EF4444' }}>*</Text>
                                    </Text>
                                    <View style={styles.inputWithToggle}>
                                        <TextInput
                                            ref={confirmRef}
                                            style={[
                                                styles.input,
                                                styles.inputPaddedRight,
                                                touched.confirmPassword && fieldErrors.confirmPassword ? styles.inputError : null,
                                            ]}
                                            placeholder="••••••••"
                                            placeholderTextColor={colors.text30}
                                            value={confirmPassword}
                                            onChangeText={v => { setConfirmPassword(v); setFormError(null); }}
                                            onBlur={() => handleBlur('confirmPassword', confirmPassword)}
                                            secureTextEntry={!showConfirmPassword}
                                            returnKeyType="go"
                                            onSubmitEditing={handleSubmit}
                                        />
                                        <TouchableOpacity
                                            style={styles.eyeBtn}
                                            onPress={() => setShowConfirmPassword(p => !p)}
                                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                        >
                                            {showConfirmPassword
                                                ? <EyeOff size={18} color={colors.text40} />
                                                : <Eye size={18} color={colors.text40} />
                                            }
                                        </TouchableOpacity>
                                    </View>
                                    <FieldError msg={touched.confirmPassword ? fieldErrors.confirmPassword : null} />
                                </View>
                            )}

                            {/* Forgot password — login only */}
                            {mode === 'login' && (
                                <TouchableOpacity onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 12 }}>
                                    <Text style={styles.forgotLink}>Forgot password?</Text>
                                </TouchableOpacity>
                            )}

                            {/* Inline form error */}
                            {formError && (
                                <View style={styles.formErrorBox}>
                                    <AlertTriangle size={14} color="#EF4444" style={{ marginRight: 6 }} />
                                    <Text style={styles.formErrorText}>{formError}</Text>
                                </View>
                            )}

                            <GradientButton
                                title={mode === 'login' ? 'Sign In' : 'Create Account'}
                                onPress={handleSubmit}
                                loading={loading}
                                disabled={!canSubmit || loading}
                                rightIcon={<ArrowRight size={20} color="white" />}
                            />

                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>or</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            <GradientButton
                                title="Continue with Google"
                                variant="white"
                                onPress={async () => {
                                    setFormError(null);
                                    try {
                                        const redirectTo = Platform.OS === 'web'
                                            ? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081')
                                            : 'linkdup://auth-callback';
                                        const { error } = await supabase.auth.signInWithOAuth({
                                            provider: 'google',
                                            options: { redirectTo },
                                        });
                                        if (error) throw error;
                                    } catch (e: any) {
                                        setFormError(e?.message ?? 'Google sign-in failed');
                                    }
                                }}
                                leftIcon={<GoogleIcon />}
                            />

                            <Text style={styles.toggle} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
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
    root:          { flex: 1, backgroundColor: colors.bg },
    campusBg:      { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
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
    cardSub:   { ...typography.body, color: colors.text60, marginBottom: 20 },
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
    inputError: {
        borderColor: '#EF4444',
    },
    inputIconWrap:  { position: 'relative' },
    inputIcon:      { position: 'absolute', left: 16, top: 19, zIndex: 1 },
    inputWithToggle: { position: 'relative' },
    inputPaddedRight: { paddingRight: 48 },
    eyeBtn: {
        position: 'absolute',
        right: 14,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        zIndex: 1,
    },
    errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    errorText: { color: '#EF4444', fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
    formErrorBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(239,68,68,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.30)',
        borderRadius: radii.md,
        padding: 12,
        marginBottom: 16,
    },
    formErrorText: {
        color: '#EF4444',
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        flex: 1,
        lineHeight: 18,
    },
    forgotLink: {
        color: colors.text60,
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
        textDecorationLine: 'underline',
    },
    divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
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
