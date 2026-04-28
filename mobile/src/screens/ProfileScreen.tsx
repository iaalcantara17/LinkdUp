import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
    Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Pencil, Trash2, ChevronRight, Check, MapPin, LogOut } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import AppSwitch from '../components/AppSwitch';
import GlassCard from '../components/GlassCard';
import HelpButton from '../components/HelpButton';
import AnchoredHint from '../components/AnchoredHint';
import AvatarBubble from '../components/AvatarBubble';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';
import type { ThemeMode } from '../context/ThemeContext';

const PROFILE_HELP: { title: string; description: string }[] = [
    { title: 'Edit profile', description: 'Tap any row to update your name, pronouns, birthday, bio, or school.' },
    { title: 'Location', description: 'Manage location access — needed for finding a midpoint for your crew.' },
    { title: 'Appearance', description: 'Switch between dark, light, or system theme.' },
    { title: 'Party defaults', description: 'Set whether new parties you create default to public or private.' },
    { title: 'Delete account', description: 'Permanently remove your account and all your data.' },
];

type EditField = 'displayName' | 'school' | 'gradYear' | 'pronouns' | 'birthday' | 'bio' | 'username';

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

const PRONOUNS_SUGGESTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any/all'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

function computeAgeFromISO(bday: string | null | undefined): number | null {
    if (!bday) return null;
    const d = new Date(bday);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    return Math.floor((today.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function NotSetPill({ colors }: { colors: AppColors }) {
    return (
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}>
            <Text style={{ color: colors.text40, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Not set</Text>
        </View>
    );
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; desc: string }[] = [
    { mode: 'dark',   label: 'Dark',         desc: 'Always dark' },
    { mode: 'light',  label: 'Light',        desc: 'Always light' },
    { mode: 'system', label: 'Match system', desc: 'Follows your device' },
];

export default function ProfileScreen() {
    const { signOut } = useAuth();
    const nav = useNavigation<any>();
    const { colors, isDark, mode: themeMode, setMode: setThemeMode } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [me, setMe] = useState<any>(null);
    const [schoolName, setSchoolName] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const [editModal, setEditModal] = useState<EditField | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const inputRef = useRef<TextInput>(null);
    const tourRowRef = useRef<View>(null);
    const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
    const [usernameReason, setUsernameReason] = useState<string | null>(null);

    const thisYear = new Date().getFullYear();
    const [bdayMonth, setBdayMonth] = useState(1);
    const [bdayDay, setBdayDay]     = useState(1);
    const [bdayYear, setBdayYear]   = useState(thisYear - 18);
    const minBdayYear = thisYear - 100;
    const maxBdayYear = thisYear - 13;
    const [bdayPickerOpen, setBdayPickerOpen] = useState<'month' | 'day' | 'year' | null>(null);

    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteTyped, setDeleteTyped] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [revoking, setRevoking] = useState(false);

    const [defaultPartyPrivate, setDefaultPartyPrivate] = useState<boolean>(() => {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('linkdup_default_party_public') !== 'true';
        }
        return true;
    });

    const loadProfile = async () => {
        try {
            const profile = await api.me();
            setMe(profile);
            if (profile?.school_id) {
                try {
                    const s = await api.getSchool(profile.school_id);
                    setSchoolName(s.name);
                } catch {
                    setSchoolName(null);
                }
            } else {
                setSchoolName(null);
            }
        } catch {}
    };

    useFocusEffect(useCallback(() => { loadProfile(); }, []));

    const handleUsernameEditChange = (text: string) => {
        const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
        setEditValue(clean);
        setUsernameStatus('idle');
        setUsernameReason(null);
        if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
        if (!clean) return;
        usernameDebounceRef.current = setTimeout(async () => {
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
                }
            } catch {
                setUsernameStatus('idle');
            }
        }, 300);
    };

    const openEdit = (field: EditField) => {
        if (field === 'displayName')  setEditValue(me?.display_name ?? '');
        else if (field === 'username') { setEditValue(me?.username ?? ''); setUsernameStatus('idle'); setUsernameReason(null); }
        else if (field === 'school')  setEditValue(schoolName ?? '');
        else if (field === 'gradYear') setEditValue(me?.graduation_year ? String(me.graduation_year) : '');
        else if (field === 'pronouns') setEditValue(me?.pronouns ?? '');
        else if (field === 'bio')     setEditValue(me?.bio ?? '');
        else if (field === 'birthday') {
            if (me?.birthday) {
                const [y, mo, d] = me.birthday.split('-').map(Number);
                setBdayYear(y || thisYear - 18);
                setBdayMonth(mo || 1);
                setBdayDay(d || 1);
            }
        }
        setEditModal(field);
        setTimeout(() => inputRef.current?.focus(), 150);
    };

    const closeEdit = () => {
        setEditModal(null);
        setEditValue('');
        setEditSaving(false);
    };

    const handleSave = async () => {
        if (editSaving) return;
        setEditSaving(true);
        try {
            if (editModal === 'username') {
                const trimmed = editValue.toLowerCase().trim();
                if (usernameStatus !== 'available') {
                    Alert.alert('Check username', usernameReason ?? 'Choose a valid, available username.');
                    return;
                }
                await api.updateProfile({ username: trimmed });
            } else if (editModal === 'displayName') {
                const trimmed = editValue.trim();
                if (!trimmed) { Alert.alert('Required', 'Display name cannot be empty.'); return; }
                await api.updateProfile({ display_name: trimmed });
            } else if (editModal === 'school') {
                const trimmed = editValue.trim();
                if (!trimmed) {
                    await api.updateProfile({ school_id: null });
                    setSchoolName(null);
                } else {
                    const school = await api.lookupSchool(trimmed);
                    await api.updateProfile({ school_id: school.id });
                    setSchoolName(school.name);
                }
            } else if (editModal === 'gradYear') {
                const trimmed = editValue.trim();
                if (!trimmed) {
                    await api.updateProfile({ graduation_year: null });
                } else {
                    const year = parseInt(trimmed, 10);
                    if (isNaN(year) || year < 1950 || year > 2100) {
                        Alert.alert('Invalid year', 'Please enter a year between 1950 and 2100.');
                        return;
                    }
                    await api.updateProfile({ graduation_year: year });
                }
            } else if (editModal === 'pronouns') {
                await api.updateProfile({ pronouns: editValue.trim() || null });
            } else if (editModal === 'birthday') {
                const iso = `${bdayYear}-${String(bdayMonth).padStart(2,'0')}-${String(bdayDay).padStart(2,'0')}`;
                const d = new Date(iso);
                if (isNaN(d.getTime())) { Alert.alert('Invalid date', 'Please enter a valid date.'); return; }
                const age = computeAgeFromISO(iso);
                if (age === null || age < 13) { Alert.alert('Age requirement', 'You must be at least 13 years old.'); return; }
                if (d > new Date()) { Alert.alert('Invalid date', 'Birthday cannot be in the future.'); return; }
                await api.updateProfile({ birthday: iso });
            } else if (editModal === 'bio') {
                await api.updateProfile({ bio: editValue.trim() || null });
            }
            closeEdit();
            await loadProfile();
        } catch (e: any) {
            Alert.alert('Save failed', e?.message ?? 'Unknown error');
        } finally {
            setEditSaving(false);
        }
    };

    const handleEditPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Allow access to your photo library to upload an avatar.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
        if (result.canceled || !result.assets?.[0]?.base64) return;
        setAvatarUploading(true);
        try {
            await api.updateAvatar(result.assets[0].base64);
            loadProfile();
        } catch (e: any) {
            Alert.alert('Upload failed', e?.message ?? 'Unknown error');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteTyped !== 'DELETE') return;
        setDeleting(true);
        try {
            await api.deleteAccount();
            await supabase.auth.signOut();
            setDeleteModal(false);
            nav.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        } catch (e: any) {
            Alert.alert('Could not delete account', e?.message ?? 'Unknown error');
        } finally {
            setDeleting(false);
        }
    };

    const handleRevokeLocation = () => {
        const doRevoke = async () => {
            setRevoking(true);
            try {
                await api.revokeLocation();
                await loadProfile();
            } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not revoke location');
            } finally {
                setRevoking(false);
            }
        };

        if (Platform.OS === 'web') {
            const confirmed = window.confirm(
                'Revoke location access?\n\nYour saved location will be cleared. Features that require location (like starting a party) will be unavailable until you grant access again.'
            );
            if (confirmed) doRevoke();
        } else {
            Alert.alert(
                'Revoke location access?',
                'Your saved location will be cleared. Features that require location (like starting a party) will be unavailable until you grant access again.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: doRevoke },
                ]
            );
        }
    };

    const profileIncomplete = me !== null && (!me.school_id || !me.graduation_year);
    const modalTitle =
        editModal === 'username'    ? 'Your username' :
        editModal === 'displayName' ? 'Update your name' :
        editModal === 'school'      ? 'Update your school' :
        editModal === 'gradYear'    ? 'Update your graduation year' :
        editModal === 'pronouns'    ? 'Your pronouns' :
        editModal === 'birthday'    ? 'Your birthday' :
                                      'About you';

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={styles.title}>Profile</Text>
                            <HelpButton items={PROFILE_HELP} />
                        </View>

                        {profileIncomplete && (
                            <View style={styles.tipBanner}>
                                <Text style={styles.tipText}>
                                    Complete your profile: add your school and graduation year to connect with classmates.
                                </Text>
                            </View>
                        )}

                        <View style={{ alignItems: 'center', marginBottom: 32 }}>
                            <AvatarBubble name={me?.display_name ?? '?'} color={me?.avatar_color} avatarUrl={me?.avatar_url} size={96} />
                            <TouchableOpacity onPress={handleEditPhoto} disabled={avatarUploading} style={styles.editPhotoBtn}>
                                <Text style={styles.editPhotoText}>{avatarUploading ? 'Uploading...' : 'Edit photo'}</Text>
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
                                <Text style={styles.name}>{me?.display_name ?? 'Loading...'}</Text>
                                {me && (
                                    <TouchableOpacity onPress={() => openEdit('displayName')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <Pencil size={14} color={colors.text60} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            {me?.username && <Text style={styles.username}>@{me.username}</Text>}
                            <Text style={styles.email}>{me?.email ?? ''}</Text>
                        </View>

                        <GlassCard style={{ marginBottom: 16 }}>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.label}>USERNAME</Text>
                                <TouchableOpacity onPress={() => openEdit('username')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : me?.username ? <Text style={styles.value}>@{me.username}</Text> : <NotSetPill colors={colors} />}
                        </GlassCard>

                        <GlassCard>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.label}>SCHOOL</Text>
                                <TouchableOpacity onPress={() => openEdit('school')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : schoolName ? <Text style={styles.value}>{schoolName}</Text> : <NotSetPill colors={colors} />}

                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>GRAD YEAR</Text>
                                <TouchableOpacity onPress={() => openEdit('gradYear')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : me?.graduation_year ? <Text style={styles.value}>{me.graduation_year}</Text> : <NotSetPill colors={colors} />}
                        </GlassCard>

                        <GlassCard style={{ marginTop: 16 }}>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.label}>PRONOUNS</Text>
                                <TouchableOpacity onPress={() => openEdit('pronouns')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : me?.pronouns ? <Text style={styles.value}>{me.pronouns}</Text> : <NotSetPill colors={colors} />}

                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>AGE</Text>
                                <TouchableOpacity onPress={() => openEdit('birthday')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : me?.age !== null && me?.age !== undefined ? <Text style={styles.value}>{me.age}</Text> : <NotSetPill colors={colors} />}

                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>BIO</Text>
                                <TouchableOpacity onPress={() => openEdit('bio')} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? <Text style={styles.value}>Loading...</Text> : me?.bio ? <Text style={[styles.value, { lineHeight: 22 }]}>{me.bio}</Text> : <NotSetPill colors={colors} />}
                        </GlassCard>

                        {/* ── Settings ── */}
                        <GlassCard style={{ marginTop: 16 }}>

                            {/* Location */}
                            <Text style={[styles.label, { marginBottom: 10 }]}>LOCATION</Text>
                            <TouchableOpacity
                                style={styles.settingsRow}
                                onPress={() => nav.navigate('LocationPermission')}
                                activeOpacity={0.75}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <MapPin size={18} color={colors.text60} />
                                    <View>
                                        <Text style={styles.settingsRowTitle}>Location access</Text>
                                        <Text style={[
                                            styles.settingsRowSub,
                                            me?.location_permission_status === 'granted' && { color: colors.success },
                                        ]}>
                                            {me?.location_permission_status === 'granted'
                                                ? 'Granted'
                                                : me?.location_permission_status === 'maybe_later'
                                                ? 'Not granted'
                                                : 'Not set'}
                                        </Text>
                                    </View>
                                </View>
                                <ChevronRight size={18} color={colors.text60} />
                            </TouchableOpacity>
                            {me?.location_permission_status === 'granted' && (
                                <TouchableOpacity
                                    style={[styles.settingsRow, { paddingTop: 4 }]}
                                    onPress={handleRevokeLocation}
                                    disabled={revoking}
                                    activeOpacity={0.75}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                        <MapPin size={18} color={colors.danger} />
                                        <View>
                                            <Text style={[styles.settingsRowTitle, { color: colors.danger }]}>
                                                {revoking ? 'Revoking…' : 'Revoke location access'}
                                            </Text>
                                            <Text style={styles.settingsRowSub}>Clear your saved location and deny access</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            )}

                            <View style={styles.settingsDivider} />

                            {/* Appearance */}
                            <Text style={[styles.label, { marginBottom: 8 }]}>APPEARANCE</Text>
                            {THEME_OPTIONS.map((opt) => {
                                const active = themeMode === opt.mode;
                                return (
                                    <TouchableOpacity
                                        key={opt.mode}
                                        onPress={() => setThemeMode(opt.mode)}
                                        activeOpacity={0.75}
                                        style={[styles.themeRow, active && styles.themeRowActive]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.themeLabel, active && { color: colors.primary }]}>{opt.label}</Text>
                                            <Text style={styles.themeDesc}>{opt.desc}</Text>
                                        </View>
                                        {active && <Check size={18} color={colors.primary} />}
                                    </TouchableOpacity>
                                );
                            })}

                            <View style={styles.settingsDivider} />

                            {/* Party Defaults */}
                            <Text style={[styles.label, { marginBottom: 10 }]}>PARTY DEFAULTS</Text>
                            <View style={styles.settingsRow}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                    <Text style={styles.settingsRowTitle}>New parties start private</Text>
                                    <Text style={styles.settingsRowSub}>Toggle off to make your parties public by default</Text>
                                </View>
                                <AppSwitch
                                    value={defaultPartyPrivate}
                                    onValueChange={(v) => {
                                        setDefaultPartyPrivate(v);
                                        if (typeof localStorage !== 'undefined') {
                                            localStorage.setItem('linkdup_default_party_public', v ? 'false' : 'true');
                                        }
                                    }}
                                    trackOnColor={colors.primary}
                                    trackOffColor={colors.glassStrong}
                                    thumbColor={isDark ? '#FFFFFF' : '#E8E8E8'}
                                />
                            </View>

                            <View style={styles.settingsDivider} />

                            {/* My Content */}
                            <Text style={[styles.label, { marginBottom: 10 }]}>MY CONTENT</Text>
                            <TouchableOpacity
                                style={styles.settingsRow}
                                onPress={() => nav.navigate('MyPosts')}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.settingsRowTitle}>My Posts</Text>
                                <ChevronRight size={18} color={colors.text60} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.settingsRow}
                                onPress={() => nav.navigate('Saved')}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.settingsRowTitle}>Saved</Text>
                                <ChevronRight size={18} color={colors.text60} />
                            </TouchableOpacity>

                            <View style={styles.settingsDivider} />

                            {/* Account */}
                            <Text style={[styles.label, { marginBottom: 10 }]}>ACCOUNT</Text>
                            <TouchableOpacity
                                ref={tourRowRef}
                                style={styles.settingsRow}
                                onPress={() => nav.navigate('Walkthrough', { fromSignup: false })}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.settingsRowTitle}>Take the tour again</Text>
                                <ChevronRight size={18} color={colors.text60} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.settingsRow}
                                onPress={signOut}
                                activeOpacity={0.75}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <LogOut size={18} color={colors.text60} />
                                    <Text style={styles.settingsRowTitle}>Sign out</Text>
                                </View>
                            </TouchableOpacity>

                            <View style={styles.settingsDivider} />

                            {/* Danger Zone */}
                            <Text style={[styles.label, { marginBottom: 10, color: colors.danger }]}>DANGER ZONE</Text>
                            <TouchableOpacity
                                style={[styles.settingsRow, { justifyContent: 'flex-start', gap: 10 }]}
                                onPress={() => { setDeleteTyped(''); setDeleteModal(true); }}
                                activeOpacity={0.75}
                            >
                                <Trash2 size={16} color={colors.danger} />
                                <Text style={[styles.settingsRowTitle, { color: colors.danger }]}>Delete account</Text>
                            </TouchableOpacity>

                        </GlassCard>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>

            {/* ── Edit modal ── */}
            <Modal visible={editModal !== null} transparent animationType="slide" onRequestClose={closeEdit}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeEdit} />
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{modalTitle}</Text>

                        {editModal === 'birthday' ? (
                            <View style={{ gap: 12 }}>
                                {(['month', 'day', 'year'] as const).map((field) => (
                                    <TouchableOpacity key={field} style={styles.bdayDropdownRow} onPress={() => setBdayPickerOpen(field)} activeOpacity={0.85}>
                                        <Text style={styles.bdayDropdownLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</Text>
                                        <Text style={styles.bdayDropdownValue}>
                                            {field === 'month' ? MONTH_NAMES[bdayMonth - 1] : field === 'day' ? bdayDay : bdayYear}
                                        </Text>
                                        <Text style={styles.bdayDropdownHint}>Choose ▾</Text>
                                    </TouchableOpacity>
                                ))}
                                <Text style={styles.bdayPreview}>{`Your birthday: ${MONTH_NAMES[bdayMonth - 1]} ${bdayDay}, ${bdayYear}`}</Text>
                            </View>
                        ) : (
                            <TextInput
                                ref={inputRef}
                                style={[styles.modalInput, editModal === 'bio' && { height: 100, textAlignVertical: 'top' }]}
                                value={editValue}
                                onChangeText={(t) => {
                                    if (editModal === 'username') { handleUsernameEditChange(t); return; }
                                    if (editModal === 'bio' && t.length > 200) return;
                                    setEditValue(t);
                                }}
                                placeholderTextColor={colors.text30}
                                placeholder={
                                    editModal === 'displayName' ? 'Your name' :
                                    editModal === 'school'      ? 'University of...' :
                                    editModal === 'gradYear'    ? 'e.g. 2026' :
                                    editModal === 'pronouns'    ? 'e.g. they/them' :
                                                                  'Tell your crew about yourself…'
                                }
                                keyboardType={editModal === 'gradYear' ? 'number-pad' : 'default'}
                                maxLength={editModal === 'gradYear' ? 4 : editModal === 'bio' ? 200 : editModal === 'pronouns' ? 50 : 100}
                                autoCapitalize={editModal === 'gradYear' || editModal === 'pronouns' ? 'none' : 'words'}
                                autoCorrect={editModal === 'school'}
                                multiline={editModal === 'bio'}
                                returnKeyType={editModal === 'bio' ? 'default' : 'done'}
                                onSubmitEditing={editModal !== 'bio' ? handleSave : undefined}
                            />
                        )}

                        {editModal === 'pronouns' && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                {PRONOUNS_SUGGESTIONS.map((p) => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[styles.chip, editValue === p && styles.chipActive]}
                                        onPress={() => setEditValue(p)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.chipText, editValue === p && { color: 'white' }]}>{p}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {editModal === 'bio' && (
                            <Text style={{ color: colors.text40, fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 4 }}>{editValue.length}/200</Text>
                        )}

                        {editModal === 'school' && (
                            <Text style={{ color: colors.text40, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
                                Type your school's full name, e.g. Rutgers University
                            </Text>
                        )}

                        <View style={{ marginTop: 20 }}>
                            <GradientButton title={editSaving ? 'Saving…' : 'Save'} onPress={handleSave} loading={editSaving} />
                        </View>
                        <TouchableOpacity onPress={closeEdit} style={{ alignItems: 'center', marginTop: 12, paddingVertical: 10 }}>
                            <Text style={{ color: colors.text60, fontSize: 15, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Birthday picker ── */}
            <Modal visible={bdayPickerOpen !== null} transparent animationType="slide" onRequestClose={() => setBdayPickerOpen(null)}>
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setBdayPickerOpen(null)} />
                    <View style={styles.bdayPickerSheet}>
                        <Text style={styles.bdayPickerTitle}>
                            {bdayPickerOpen === 'month' ? 'Month' : bdayPickerOpen === 'day' ? 'Day' : 'Year'}
                        </Text>
                        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                            {bdayPickerOpen === 'month' && MONTH_NAMES.map((name, i) => (
                                <TouchableOpacity key={name} style={styles.bdayPickerItem} onPress={() => {
                                    const m = i + 1;
                                    setBdayMonth(m);
                                    const max = daysInMonth(bdayYear, m);
                                    if (bdayDay > max) setBdayDay(max);
                                    setBdayPickerOpen(null);
                                }}>
                                    <Text style={styles.bdayPickerItemText}>{name}</Text>
                                </TouchableOpacity>
                            ))}
                            {bdayPickerOpen === 'day' && Array.from({ length: daysInMonth(bdayYear, bdayMonth) }, (_, i) => i + 1).map((day) => (
                                <TouchableOpacity key={day} style={styles.bdayPickerItem} onPress={() => { setBdayDay(day); setBdayPickerOpen(null); }}>
                                    <Text style={styles.bdayPickerItemText}>{day}</Text>
                                </TouchableOpacity>
                            ))}
                            {bdayPickerOpen === 'year' && Array.from({ length: maxBdayYear - minBdayYear + 1 }, (_, i) => maxBdayYear - i).map((year) => (
                                <TouchableOpacity key={year} style={styles.bdayPickerItem} onPress={() => { setBdayYear(year); setBdayPickerOpen(null); }}>
                                    <Text style={styles.bdayPickerItemText}>{year}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Delete modal ── */}
            <Modal visible={deleteModal} transparent animationType="slide" onRequestClose={() => !deleting && setDeleteModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => !deleting && setDeleteModal(false)} />
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.deleteModalTitle}>Delete your account?</Text>
                        <Text style={{ color: colors.text60, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 20 }}>
                            This will permanently delete your profile, parties you've hosted, and all your data.{'\n\n'}This cannot be undone.
                        </Text>
                        <Text style={{ color: colors.text80, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 8 }}>
                            Type <Text style={{ color: colors.danger, fontFamily: 'Inter_700Bold' }}>DELETE</Text> to confirm
                        </Text>
                        <TextInput
                            style={[styles.modalInput, deleteTyped === 'DELETE' && { borderColor: colors.danger }]}
                            value={deleteTyped}
                            onChangeText={setDeleteTyped}
                            placeholderTextColor={colors.text30}
                            placeholder="DELETE"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            editable={!deleting}
                        />
                        <TouchableOpacity
                            style={[{ marginTop: 20, backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }, (deleteTyped !== 'DELETE' || deleting) && { opacity: 0.4 }]}
                            onPress={handleDeleteAccount}
                            disabled={deleteTyped !== 'DELETE' || deleting}
                            activeOpacity={0.85}
                        >
                            {deleting ? <ActivityIndicator color="white" size="small" /> : <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Delete my account</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => !deleting && setDeleteModal(false)} style={{ alignItems: 'center', marginTop: 12, paddingVertical: 10 }} disabled={deleting}>
                            <Text style={{ color: colors.text60, fontSize: 15, fontFamily: 'Inter_500Medium' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <AnchoredHint screenKey="profile_tour_replay" title="Forgot something?" body="Tap 'Take the tour again' below to replay the welcome tour anytime." targetRef={tourRowRef} placement="top" />
            <BottomNav />
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 0 },
        tipBanner: {
            backgroundColor: 'rgba(108,62,244,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(108,62,244,0.30)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
        },
        tipText: { color: c.text80, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
        name: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 24 },
        username: { color: c.text60, fontSize: 13, marginTop: 2, fontFamily: 'Inter_400Regular' },
        email: { color: c.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },
        editPhotoBtn: {
            marginTop: 8,
            paddingHorizontal: 14,
            paddingVertical: 5,
            borderRadius: 12,
            backgroundColor: 'rgba(108,62,244,0.20)',
            borderWidth: 1,
            borderColor: 'rgba(108,62,244,0.40)',
        },
        editPhotoText: { color: c.primary, fontSize: 13, fontFamily: 'Inter_500Medium' },
        fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
        label: { color: c.text60, fontSize: 11, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
        value: { color: c.textPrimary, fontSize: 16, fontFamily: 'Inter_500Medium' },
        themeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 4,
            borderRadius: 10,
        },
        themeRowActive: { backgroundColor: c.glass },
        themeLabel: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        themeDesc: { color: c.text40, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
        modalSheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 40,
            borderTopWidth: 1,
            borderColor: c.glassBorder,
        },
        modalHandle: {
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: c.text40,
            alignSelf: 'center',
            marginBottom: 20,
        },
        modalTitle: { color: c.textPrimary, fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 16 },
        modalInput: {
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: c.textPrimary,
            fontSize: 16,
            fontFamily: 'Inter_400Regular',
        },
        settingsDivider: { height: 1, backgroundColor: c.glassBorder, marginVertical: 12 },
        settingsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10,
        },
        settingsRowTitle: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
        settingsRowSub: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
        deleteModalTitle: { color: c.textPrimary, fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 12 },
        bdayDropdownRow: {
            position: 'relative', paddingVertical: 12, paddingHorizontal: 14, paddingRight: 80,
            borderRadius: 12, borderWidth: 1, borderColor: c.glassBorder, backgroundColor: c.glass,
        },
        bdayDropdownLabel: { color: c.text40, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
        bdayDropdownValue: { color: c.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 17, marginTop: 4 },
        bdayDropdownHint: { position: 'absolute', right: 14, top: '50%', marginTop: -8, color: c.text40, fontSize: 12, fontFamily: 'Inter_500Medium' },
        bdayPreview: {
            color: c.text60, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 14,
            paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(108,62,244,0.10)',
            borderRadius: 10, borderWidth: 1, borderColor: 'rgba(108,62,244,0.20)',
        },
        bdayPickerSheet: {
            backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            borderTopWidth: 1, borderColor: c.glassBorder, paddingBottom: 28, maxHeight: '55%',
        },
        bdayPickerTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
        bdayPickerItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.glassBorder },
        bdayPickerItemText: { color: c.text80, fontFamily: 'Inter_500Medium', fontSize: 16 },
        chip: {
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
            backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder,
        },
        chipActive: { backgroundColor: 'rgba(108,62,244,0.30)', borderColor: 'rgba(108,62,244,0.60)' },
        chipText: { color: c.text60, fontSize: 13, fontFamily: 'Inter_500Medium' },
    });
}
