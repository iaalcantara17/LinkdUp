import React, { useMemo, useRef, useState } from 'react';
import {
    View, Text, TextInput, StyleSheet, Alert, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Check, X } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

function reasonToText(reason: string | undefined): string {
    switch (reason) {
        case 'too_short':          return 'Must be at least 3 characters';
        case 'too_long':           return 'Must be 20 characters or fewer';
        case 'invalid_chars':      return 'Only letters, numbers, and underscores';
        case 'starts_with_number': return 'Must start with a letter';
        case 'reserved':           return 'That username is reserved';
        case 'taken':              return 'Already taken';
        default:                   return 'Not available';
    }
}

export default function CompleteProfileScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [schoolName,  setSchoolName]  = useState('');
    const [gradYear,    setGradYear]    = useState('');
    const [username,    setUsername]    = useState('');
    const [loading,     setLoading]     = useState(false);

    const [usernameStatus,  setUsernameStatus]  = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
    const [usernameReason,  setUsernameReason]  = useState<string | null>(null);

    const gradRef     = useRef<TextInput>(null);
    const usernameRef = useRef<TextInput>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleUsernameChange = (text: string) => {
        const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
        setUsername(clean);
        setUsernameStatus('idle');
        setUsernameReason(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!clean) return;
        debounceRef.current = setTimeout(async () => {
            setUsernameStatus('checking');
            try {
                const result = await api.checkUsernameAvailable(clean);
                if (!result.valid) {
                    setUsernameStatus('unavailable');
                    setUsernameReason(reasonToText(result.reason));
                } else if (!result.available) {
                    setUsernameStatus('unavailable');
                    setUsernameReason(reasonToText(result.reason));
                } else {
                    setUsernameStatus('available');
                    setUsernameReason(null);
                }
            } catch {
                setUsernameStatus('idle');
            }
        }, 300);
    };

    const canSubmit = usernameStatus === 'available';

    const handleSave = async () => {
        if (!canSubmit) return;
        setLoading(true);
        try {
            let schoolId: string | undefined;
            if (schoolName.trim()) {
                try {
                    const school = await api.lookupSchool(schoolName.trim());
                    schoolId = school.id;
                } catch {}
            }
            await api.updateProfile({
                username,
                graduation_year: gradYear ? parseInt(gradYear, 10) : undefined,
                school_id: schoolId,
            });
            nav.replace('Home');
        } catch (e: any) {
            if (e?.message === 'username_taken') {
                setUsernameStatus('unavailable');
                setUsernameReason('Already taken');
            } else {
                Alert.alert('Could not save', e?.message ?? 'Unknown error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Animated.View entering={FadeInDown.duration(500)}>
                            <Text style={styles.title}>Almost there!</Text>
                            <Text style={styles.sub}>
                                Pick a username and add your school so people can find you.
                            </Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.card}>
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Username <Text style={{ color: colors.danger }}>*</Text></Text>
                                <View style={styles.usernameRow}>
                                    <Text style={styles.atSign}>@</Text>
                                    <TextInput
                                        ref={usernameRef}
                                        style={[styles.input, styles.usernameInput]}
                                        placeholder="your_handle"
                                        placeholderTextColor={colors.text30}
                                        value={username}
                                        onChangeText={handleUsernameChange}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="next"
                                        onSubmitEditing={() => gradRef.current?.focus()}
                                        blurOnSubmit={false}
                                        maxLength={20}
                                    />
                                </View>
                                {username.length > 0 && (
                                    <View style={styles.validationRow}>
                                        {usernameStatus === 'checking' && (
                                            <ActivityIndicator size="small" color={colors.text60} style={{ marginRight: 4 }} />
                                        )}
                                        {usernameStatus === 'available' && (
                                            <Check size={13} color={colors.success} style={{ marginRight: 4 }} />
                                        )}
                                        {usernameStatus === 'unavailable' && (
                                            <X size={13} color={colors.danger} style={{ marginRight: 4 }} />
                                        )}
                                        <Text style={[
                                            styles.validationText,
                                            usernameStatus === 'available'   && { color: colors.success },
                                            usernameStatus === 'unavailable' && { color: colors.danger },
                                        ]}>
                                            {usernameStatus === 'checking'    ? 'Checking...' :
                                             usernameStatus === 'available'   ? 'Available' :
                                             usernameStatus === 'unavailable' ? (usernameReason ?? 'Not available') : ''}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>School Name</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="University of..."
                                    placeholderTextColor={colors.text30}
                                    value={schoolName}
                                    onChangeText={setSchoolName}
                                    returnKeyType="next"
                                    onSubmitEditing={() => gradRef.current?.focus()}
                                    blurOnSubmit={false}
                                />
                            </View>

                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Graduation Year</Text>
                                <TextInput
                                    ref={gradRef}
                                    style={styles.input}
                                    placeholder="2026"
                                    placeholderTextColor={colors.text30}
                                    value={gradYear}
                                    onChangeText={setGradYear}
                                    keyboardType="number-pad"
                                    returnKeyType="go"
                                    onSubmitEditing={handleSave}
                                />
                            </View>

                            <GradientButton
                                title="Save & continue"
                                onPress={handleSave}
                                loading={loading}
                                disabled={!canSubmit || loading}
                                rightIcon={<ArrowRight size={20} color="white" />}
                            />
                            {!canSubmit && username.length === 0 && (
                                <Text style={styles.hint}>Choose a username to continue.</Text>
                            )}
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root:  { flex: 1, backgroundColor: c.bg },
        title: { ...typography.h1, color: c.textPrimary, fontSize: 32, marginBottom: 8 },
        sub:   { ...typography.body, color: c.text60, marginBottom: 32 },
        card: {
            backgroundColor: c.glass,
            borderRadius: radii.xl,
            padding: 24,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        fieldGroup:    { marginBottom: 16 },
        label:         { color: c.text80, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
        usernameRow:   { flexDirection: 'row', alignItems: 'center' },
        atSign:        { color: c.text60, fontSize: 18, fontFamily: 'Inter_500Medium', marginRight: 6 },
        usernameInput: { flex: 1 },
        input: {
            backgroundColor: c.glassStrong,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            borderRadius: radii.md,
            paddingVertical: 16,
            paddingHorizontal: 16,
            color: c.textPrimary,
            fontSize: 16,
            fontFamily: 'Inter_400Regular',
        },
        validationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
        validationText: { color: c.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },
        hint: { color: c.text40, textAlign: 'center', marginTop: 10, fontSize: 12, fontFamily: 'Inter_400Regular' },
    });
}
