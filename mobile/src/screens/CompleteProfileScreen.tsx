import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, radii } from '../theme';

// Shown to new Google OAuth users whose public.users row is missing
// graduation_year / school_id.  Submitting updates the profile then
// navigates to Home.

export default function CompleteProfileScreen() {
    const nav = useNavigation<any>();
    const [schoolName,  setSchoolName]  = useState('');
    const [gradYear,    setGradYear]    = useState('');
    const [loading,     setLoading]     = useState(false);
    const gradRef = useRef<TextInput>(null);

    const handleSave = async () => {
        setLoading(true);
        try {
            let schoolId: string | undefined;
            if (schoolName.trim()) {
                try {
                    const school = await api.lookupSchool(schoolName.trim());
                    schoolId = school.id;
                } catch {
                    // Non-fatal — continue without school
                }
            }

            await api.updateProfile({
                graduation_year: gradYear ? parseInt(gradYear, 10) : undefined,
                school_id:       schoolId,
            });

            nav.replace('Home');
        } catch (e: any) {
            Alert.alert('Could not save', e?.message ?? 'Unknown error');
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
                                Just a couple more details to personalise your LinkdUp experience.
                            </Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.card}>
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
                                rightIcon={<ArrowRight size={20} color="white" />}
                            />

                            <Text
                                style={styles.skip}
                                onPress={() => nav.replace('Home')}
                            >
                                Skip for now →
                            </Text>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root:       { flex: 1, backgroundColor: colors.bg },
    title:      { ...typography.h1, color: 'white', fontSize: 32, marginBottom: 8 },
    sub:        { ...typography.body, color: colors.text60, marginBottom: 32 },
    card: {
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    fieldGroup: { marginBottom: 16 },
    label:      { color: colors.text80, fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
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
    skip: {
        color: colors.text40,
        textAlign: 'center',
        marginTop: 16,
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
    },
});
