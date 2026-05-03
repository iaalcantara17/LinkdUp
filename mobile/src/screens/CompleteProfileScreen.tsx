import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
    View, Text, TextInput, StyleSheet, Alert, ScrollView,
    KeyboardAvoidingView, Platform, ActivityIndicator,
    TouchableOpacity, FlatList, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Check, X, AlertTriangle } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

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

interface School { id: string; name: string; city: string; state: string; }

interface FieldError {
    displayName: string | null;
    username: string | null;
    school: string | null;
}

export default function CompleteProfileScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const { refreshProfile, userProfile } = useAuth();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [displayName,  setDisplayName]  = useState('');
    const [username,     setUsername]     = useState('');
    const [gradYear,     setGradYear]     = useState('');
    const [loading,      setLoading]      = useState(false);

    const nameAlreadySet = Boolean(userProfile?.display_name?.trim());

    useEffect(() => {
        if (userProfile?.display_name?.trim()) {
            setDisplayName(userProfile.display_name.trim());
        }
    }, [userProfile?.display_name]);

    const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
    const [schoolQuery,    setSchoolQuery]    = useState('');
    const [schoolResults,  setSchoolResults]  = useState<School[]>([]);
    const [schoolSearching, setSchoolSearching] = useState(false);
    const [schoolDropdownOpen, setSchoolDropdownOpen] = useState(false);

    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
    const [usernameReason, setUsernameReason] = useState<string | null>(null);

    const [touched, setTouched] = useState({ displayName: false, username: false, school: false });
    const [errors, setErrors] = useState<FieldError>({ displayName: null, username: null, school: null });

    const usernameRef = useRef<TextInput>(null);
    const gradRef     = useRef<TextInput>(null);
    const selectedSchoolRef = useRef<School | null>(null);
    const selectingSchoolRef = useRef(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const schoolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const validateDisplayName = (val: string): string | null => {
        if (!val.trim()) return 'Display name is required';
        if (val.trim().length > 50) return 'Maximum 50 characters';
        return null;
    };

    useEffect(() => {
        if (!touched.displayName) return;
        setErrors(e => ({ ...e, displayName: validateDisplayName(displayName) }));
    }, [displayName, touched.displayName]);

    useEffect(() => {
        if (!touched.school) return;
        setErrors(e => ({ ...e, school: selectedSchool ? null : 'Please select a school from the list' }));
    }, [selectedSchool, touched.school]);

    const handleDisplayNameBlur = () => {
        setTouched(t => ({ ...t, displayName: true }));
        setErrors(e => ({ ...e, displayName: validateDisplayName(displayName) }));
    };

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

    const handleUsernameBlur = () => {
        setTouched(t => ({ ...t, username: true }));
    };

    const handleSchoolQueryChange = (text: string) => {
        setSchoolQuery(text);
        setSelectedSchool(null);
        selectedSchoolRef.current = null;
        setSchoolDropdownOpen(true);
        if (schoolDebounceRef.current) clearTimeout(schoolDebounceRef.current);
        if (!text.trim()) { setSchoolResults([]); return; }
        schoolDebounceRef.current = setTimeout(async () => {
            setSchoolSearching(true);
            try {
                const searchText = text.trim();
                const results = await api.schools(searchText);
                setSchoolResults(results);
                const exactMatch = results.find(s => s.name.toLowerCase() === searchText.toLowerCase());
                if (exactMatch) {
                    selectedSchoolRef.current = exactMatch;
                    setSelectedSchool(exactMatch);
                    setErrors(e => ({ ...e, school: null }));
                }
            } catch {
                setSchoolResults([]);
            } finally {
                setSchoolSearching(false);
            }
        }, 300);
    };

    const handleSchoolSelect = (school: School) => {
        selectingSchoolRef.current = true;
        selectedSchoolRef.current = school;
        setSelectedSchool(school);
        setSchoolQuery(school.name);
        setSchoolDropdownOpen(false);
        setSchoolResults([]);
        setTouched(t => ({ ...t, school: true }));
        setErrors(e => ({ ...e, school: null }));
        Keyboard.dismiss();
        setTimeout(() => {
            selectingSchoolRef.current = false;
        }, 250);
    };

    const handleSchoolBlur = () => {
        setTouched(t => ({ ...t, school: true }));
        if (selectingSchoolRef.current) return;
        if (!selectedSchoolRef.current) {
            setErrors(e => ({ ...e, school: 'Please select a school from the list' }));
            setSchoolQuery('');
        }
        setTimeout(() => setSchoolDropdownOpen(false), 150);
    };

    const canSubmit =
        !validateDisplayName(displayName) &&
        usernameStatus === 'available' &&
        selectedSchool !== null;

    const handleSave = async () => {
        setTouched({ displayName: true, username: true, school: true });
        const dnErr = nameAlreadySet ? null : validateDisplayName(displayName);
        const schoolErr = selectedSchool ? null : 'Please select a school from the list';
        setErrors({ displayName: dnErr, username: null, school: schoolErr });

        if (!canSubmit) return;
        setLoading(true);
        try {
            await api.updateProfile({
                display_name: displayName.trim(),
                username,
                school_id: selectedSchool!.id,
                graduation_year: gradYear ? parseInt(gradYear, 10) : undefined,
            });
            await refreshProfile();
            nav.replace(userProfile?.has_seen_walkthrough ? 'Home' : 'Walkthrough');
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

    const usernameInvalid = touched.username && usernameStatus === 'unavailable';

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}
                        keyboardShouldPersistTaps="always"
                    >
                        <Animated.View entering={FadeInDown.duration(500)}>
                            <Text style={styles.title}>Complete your profile</Text>
                            <Text style={styles.sub}>
                                {nameAlreadySet
                                    ? 'Choose a username and select your school to continue.'
                                    : 'Set up your display name, username, and school to continue.'}
                            </Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.card}>

                            {/* Display Name — hidden if already populated from Google / prior signup */}
                            {!nameAlreadySet && (
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.label}>
                                        Display Name <Text style={{ color: colors.danger }}>*</Text>
                                    </Text>
                                    <TextInput
                                        style={[styles.input, touched.displayName && errors.displayName ? styles.inputError : null]}
                                        placeholder="Your name"
                                        placeholderTextColor={colors.text30}
                                        value={displayName}
                                        onChangeText={setDisplayName}
                                        onBlur={handleDisplayNameBlur}
                                        returnKeyType="next"
                                        onSubmitEditing={() => usernameRef.current?.focus()}
                                        blurOnSubmit={false}
                                        maxLength={50}
                                    />
                                    {touched.displayName && errors.displayName && (
                                        <View style={styles.errorRow}>
                                            <AlertTriangle size={13} color="#EF4444" style={{ marginRight: 4 }} />
                                            <Text style={styles.errorText}>{errors.displayName}</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Username */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>
                                    Username <Text style={{ color: colors.danger }}>*</Text>
                                </Text>
                                <View style={[styles.usernameRow, touched.username && usernameInvalid ? styles.inputError : null]}>
                                    <Text style={styles.atSign}>@</Text>
                                    <TextInput
                                        ref={usernameRef}
                                        style={[styles.input, styles.usernameInput, { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }]}
                                        placeholder="your_handle"
                                        placeholderTextColor={colors.text30}
                                        value={username}
                                        onChangeText={handleUsernameChange}
                                        onBlur={handleUsernameBlur}
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
                                            <AlertTriangle size={13} color="#EF4444" style={{ marginRight: 4 }} />
                                        )}
                                        <Text style={[
                                            styles.validationText,
                                            usernameStatus === 'available'   && { color: colors.success },
                                            usernameStatus === 'unavailable' && { color: '#EF4444' },
                                        ]}>
                                            {usernameStatus === 'checking'    ? 'Checking...' :
                                             usernameStatus === 'available'   ? 'Available' :
                                             usernameStatus === 'unavailable' ? (usernameReason ?? 'Not available') : ''}
                                        </Text>
                                    </View>
                                )}
                                {touched.username && username.length === 0 && (
                                    <View style={styles.errorRow}>
                                        <AlertTriangle size={13} color="#EF4444" style={{ marginRight: 4 }} />
                                        <Text style={styles.errorText}>Username is required</Text>
                                    </View>
                                )}
                            </View>

                            {/* School (search + dropdown) */}
                            <View style={[styles.fieldGroup, { zIndex: 10 }]}>
                                <Text style={styles.label}>
                                    School <Text style={{ color: colors.danger }}>*</Text>
                                </Text>
                                <View>
                                    <View style={styles.schoolInputRow}>
                                        <TextInput
                                            style={[
                                                styles.input,
                                                { flex: 1 },
                                                touched.school && errors.school ? styles.inputError : null,
                                            ]}
                                            placeholder="Search for your school..."
                                            placeholderTextColor={colors.text30}
                                            value={schoolQuery}
                                            onChangeText={handleSchoolQueryChange}
                                            onBlur={handleSchoolBlur}
                                            autoCorrect={false}
                                        />
                                        {selectedSchool && (
                                            <View style={styles.schoolCheckIcon}>
                                                <Check size={16} color={colors.success} />
                                            </View>
                                        )}
                                    </View>
                                    {schoolDropdownOpen && schoolQuery.length > 0 && (
                                        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.glassBorder }]}>
                                            {schoolSearching ? (
                                                <ActivityIndicator size="small" color={colors.text60} style={{ padding: 12 }} />
                                            ) : schoolResults.length === 0 ? (
                                                <Text style={[styles.dropdownEmpty, { color: colors.text40 }]}>No schools found</Text>
                                            ) : (
                                                <FlatList
                                                    data={schoolResults}
                                                    keyExtractor={item => item.id}
                                                    keyboardShouldPersistTaps="always"
                                                    style={{ maxHeight: 200 }}
                                                    renderItem={({ item }) => (
                                                        <TouchableOpacity
                                                            style={[styles.dropdownItem, { borderBottomColor: colors.glassBorder }]}
                                                            onPressIn={() => handleSchoolSelect(item)}
                                                            activeOpacity={0.7}
                                                        >
                                                            <Text style={[styles.dropdownItemName, { color: colors.textPrimary }]}>
                                                                {item.name}
                                                            </Text>
                                                            {(item.city || item.state) && (
                                                                <Text style={[styles.dropdownItemSub, { color: colors.text60 }]}>
                                                                    {[item.city, item.state].filter(Boolean).join(', ')}
                                                                </Text>
                                                            )}
                                                        </TouchableOpacity>
                                                    )}
                                                />
                                            )}
                                        </View>
                                    )}
                                </View>
                                {touched.school && errors.school && (
                                    <View style={styles.errorRow}>
                                        <AlertTriangle size={13} color="#EF4444" style={{ marginRight: 4 }} />
                                        <Text style={styles.errorText}>{errors.school}</Text>
                                    </View>
                                )}
                            </View>

                            {/* Graduation Year (optional) */}
                            <View style={styles.fieldGroup}>
                                <Text style={styles.label}>Graduation Year <Text style={{ color: colors.text40 }}>(optional)</Text></Text>
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
                            {!canSubmit && (
                                <Text style={styles.hint}>Complete all required fields to continue.</Text>
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
        title: { ...typography.h1, color: c.textPrimary, fontSize: 30, marginBottom: 8 },
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
        usernameRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.glassStrong,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            borderRadius: radii.md,
            paddingHorizontal: 16,
        },
        atSign:        { color: c.text60, fontSize: 18, fontFamily: 'Inter_500Medium', marginRight: 6 },
        usernameInput: { flex: 1 },
        input: {
            backgroundColor: c.glassStrong,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            borderRadius: radii.md,
            paddingVertical: 14,
            paddingHorizontal: 16,
            color: c.textPrimary,
            fontSize: 16,
            fontFamily: 'Inter_400Regular',
        },
        inputError: {
            borderColor: '#EF4444',
        },
        errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
        errorText: { color: '#EF4444', fontSize: 12, fontFamily: 'Inter_400Regular' },
        validationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
        validationText: { color: c.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },
        hint: { color: c.text40, textAlign: 'center', marginTop: 10, fontSize: 12, fontFamily: 'Inter_400Regular' },
        schoolInputRow: { flexDirection: 'row', alignItems: 'center' },
        schoolCheckIcon: {
            position: 'absolute',
            right: 14,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
        },
        dropdown: {
            borderWidth: 1,
            borderRadius: radii.md,
            marginTop: 4,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
        },
        dropdownEmpty: { padding: 12, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
        dropdownItem: {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
        },
        dropdownItemName: { fontFamily: 'Inter_500Medium', fontSize: 14 },
        dropdownItemSub:  { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
    });
}
