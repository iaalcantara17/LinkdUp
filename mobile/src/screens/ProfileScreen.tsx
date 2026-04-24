import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
    Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Pencil, Trash2, ChevronRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import GlassCard from '../components/GlassCard';
import HelpButton from '../components/HelpButton';
import FirstVisitHint from '../components/FirstVisitHint';
import AnchoredHint from '../components/AnchoredHint';

const PROFILE_HELP: { title: string; description: string }[] = [
    { title: 'Edit profile', description: 'Tap any row to update your name, pronouns, birthday, bio, or school.' },
    { title: 'Take the tour again', description: 'Replay the welcome walkthrough.' },
    { title: 'Delete account', description: 'Permanently remove your account and all your data.' },
];
import AvatarBubble from '../components/AvatarBubble';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { colors } from '../theme';

type EditField = 'displayName' | 'school' | 'gradYear' | 'pronouns' | 'birthday' | 'bio';

const PRONOUNS_SUGGESTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any/all'];

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year: number, month: number): number {
    // month is 1-indexed
    return new Date(year, month, 0).getDate();
}

function computeAgeFromISO(bday: string | null | undefined): number | null {
    if (!bday) return null;
    const d = new Date(bday);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    return Math.floor((today.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function NotSetPill() {
    return (
        <View style={styles.notSetPill}>
            <Text style={styles.notSetText}>Not set</Text>
        </View>
    );
}

export default function ProfileScreen() {
    const { signOut } = useAuth();
    const nav = useNavigation<any>();
    const [me, setMe] = useState<any>(null);
    const [schoolName, setSchoolName] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // Edit modal
    const [editModal, setEditModal] = useState<EditField | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const inputRef = useRef<TextInput>(null);
    const tourRowRef = useRef<View>(null);

    // Birthday stepper state (month 1-12, day 1-31, year)
    const thisYear = new Date().getFullYear();
    const [bdayMonth, setBdayMonth] = useState(1);
    const [bdayDay, setBdayDay]     = useState(1);
    const [bdayYear, setBdayYear]   = useState(thisYear - 18);
    const minBdayYear = thisYear - 100;
    const maxBdayYear = thisYear - 13;
    const [bdayPickerOpen, setBdayPickerOpen] = useState<'month' | 'day' | 'year' | null>(null);

    // Delete account modal
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteTyped, setDeleteTyped] = useState('');
    const [deleting, setDeleting] = useState(false);

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

    useEffect(() => { loadProfile(); }, []);

    const openEdit = (field: EditField) => {
        if (field === 'displayName')  setEditValue(me?.display_name ?? '');
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
            if (editModal === 'displayName') {
                const trimmed = editValue.trim();
                if (!trimmed) {
                    Alert.alert('Required', 'Display name cannot be empty.');
                    return;
                }
                console.log('[profile] saving displayName, value:', trimmed);
                const resp = await api.updateProfile({ display_name: trimmed });
                console.log('[profile] patch response:', resp);

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
                const normalized = editValue.trim() || null;
                console.log('[profile save]', 'pronouns', 'sending:', normalized);
                const response = await api.updateProfile({ pronouns: normalized });
                console.log('[profile save] response:', response);

            } else if (editModal === 'birthday') {
                const iso = `${bdayYear}-${String(bdayMonth).padStart(2,'0')}-${String(bdayDay).padStart(2,'0')}`;
                const d = new Date(iso);
                if (isNaN(d.getTime())) {
                    Alert.alert('Invalid date', 'Please enter a valid date.');
                    return;
                }
                const age = computeAgeFromISO(iso);
                if (age === null || age < 13) {
                    Alert.alert('Age requirement', 'You must be at least 13 years old.');
                    return;
                }
                if (d > new Date()) {
                    Alert.alert('Invalid date', 'Birthday cannot be in the future.');
                    return;
                }
                console.log('[profile save]', 'birthday', 'sending:', iso);
                const response = await api.updateProfile({ birthday: iso });
                console.log('[profile save] response:', response);

            } else if (editModal === 'bio') {
                const normalized = editValue.trim() || null;
                console.log('[profile save]', 'bio', 'sending:', normalized);
                const response = await api.updateProfile({ bio: normalized });
                console.log('[profile save] response:', response);
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
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
        });
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

    const profileIncomplete = me !== null && (!me.school_id || !me.graduation_year);

    const modalTitle =
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
                            <Text style={[styles.title, { marginBottom: 0 }]}>Profile</Text>
                            <HelpButton items={PROFILE_HELP} />
                        </View>

                        {profileIncomplete && (
                            <View style={styles.tipBanner}>
                                <Text style={styles.tipText}>
                                    Complete your profile: add your school and graduation year to connect with classmates.
                                </Text>
                            </View>
                        )}

                        <View style={styles.avatarSection}>
                            <AvatarBubble
                                name={me?.display_name ?? '?'}
                                color={me?.avatar_color}
                                avatarUrl={me?.avatar_url}
                                size={96}
                            />
                            <TouchableOpacity
                                onPress={handleEditPhoto}
                                disabled={avatarUploading}
                                style={styles.editPhotoBtn}
                            >
                                <Text style={styles.editPhotoText}>
                                    {avatarUploading ? 'Uploading...' : 'Edit photo'}
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.nameRow}>
                                <Text style={styles.name}>{me?.display_name ?? 'Loading...'}</Text>
                                {me && (
                                    <TouchableOpacity
                                        onPress={() => openEdit('displayName')}
                                        style={styles.pencilBtn}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <Pencil size={14} color={colors.text60} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.email}>{me?.email ?? ''}</Text>
                        </View>

                        <GlassCard>
                            <View style={styles.fieldHeader}>
                                <Text style={styles.label}>SCHOOL</Text>
                                <TouchableOpacity
                                    onPress={() => openEdit('school')}
                                    style={styles.pencilBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? (
                                <Text style={styles.value}>Loading...</Text>
                            ) : schoolName ? (
                                <Text style={styles.value}>{schoolName}</Text>
                            ) : (
                                <NotSetPill />
                            )}

                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>GRAD YEAR</Text>
                                <TouchableOpacity
                                    onPress={() => openEdit('gradYear')}
                                    style={styles.pencilBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? (
                                <Text style={styles.value}>Loading...</Text>
                            ) : me?.graduation_year ? (
                                <Text style={styles.value}>{me.graduation_year}</Text>
                            ) : (
                                <NotSetPill />
                            )}
                        </GlassCard>

                        {/* ── Pronouns · Age · Bio ── */}
                        <GlassCard style={{ marginTop: 16 }}>
                            {/* Pronouns */}
                            <View style={styles.fieldHeader}>
                                <Text style={styles.label}>PRONOUNS</Text>
                                <TouchableOpacity
                                    onPress={() => openEdit('pronouns')}
                                    style={styles.pencilBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? (
                                <Text style={styles.value}>Loading...</Text>
                            ) : me?.pronouns ? (
                                <Text style={styles.value}>{me.pronouns}</Text>
                            ) : (
                                <NotSetPill />
                            )}

                            {/* Age / Birthday */}
                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>AGE</Text>
                                <TouchableOpacity
                                    onPress={() => openEdit('birthday')}
                                    style={styles.pencilBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? (
                                <Text style={styles.value}>Loading...</Text>
                            ) : me?.age !== null && me?.age !== undefined ? (
                                <Text style={styles.value}>{me.age}</Text>
                            ) : (
                                <NotSetPill />
                            )}

                            {/* Bio */}
                            <View style={[styles.fieldHeader, { marginTop: 16 }]}>
                                <Text style={styles.label}>BIO</Text>
                                <TouchableOpacity
                                    onPress={() => openEdit('bio')}
                                    style={styles.pencilBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Pencil size={13} color={colors.text60} />
                                </TouchableOpacity>
                            </View>
                            {me === null ? (
                                <Text style={styles.value}>Loading...</Text>
                            ) : me?.bio ? (
                                <Text style={[styles.value, { lineHeight: 22 }]}>{me.bio}</Text>
                            ) : (
                                <NotSetPill />
                            )}
                        </GlassCard>

                        <View style={{ height: 24 }} />
                        <GradientButton title="Sign out" variant="ghost" onPress={signOut} />

                        <View ref={tourRowRef}>
                        <GlassCard style={{ marginTop: 16 }}>
                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                onPress={() => nav.navigate('Walkthrough', { fromSignup: false })}
                                activeOpacity={0.75}
                            >
                                <Text style={{ color: 'white', fontFamily: 'Inter_500Medium', fontSize: 15 }}>Take the tour again</Text>
                                <ChevronRight size={18} color={colors.text60} />
                            </TouchableOpacity>
                        </GlassCard>
                        </View>

                        {/* ── Danger zone ── */}
                        <View style={styles.dangerDivider} />
                        <Text style={styles.dangerZoneLabel}>DANGER ZONE</Text>
                        <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => { setDeleteTyped(''); setDeleteModal(true); }}
                            activeOpacity={0.75}
                        >
                            <Trash2 size={16} color={colors.danger} />
                            <Text style={styles.deleteBtnText}>Delete account</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>

            {/* ── Edit modal (bottom sheet) ── */}
            <Modal
                visible={editModal !== null}
                transparent
                animationType="slide"
                onRequestClose={closeEdit}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    {/* Tap outside to dismiss */}
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={closeEdit}
                    />

                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />

                        <Text style={styles.modalTitle}>{modalTitle}</Text>

                        {/* Birthday: labeled dropdowns (list pickers — no free text) */}
                        {editModal === 'birthday' ? (
                            <View style={{ gap: 12 }}>
                                <TouchableOpacity
                                    style={styles.bdayDropdownRow}
                                    onPress={() => setBdayPickerOpen('month')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.bdayDropdownLabel}>Month</Text>
                                    <Text style={styles.bdayDropdownValue}>{MONTH_NAMES[bdayMonth - 1]}</Text>
                                    <Text style={styles.bdayDropdownHint}>Choose ▾</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.bdayDropdownRow}
                                    onPress={() => setBdayPickerOpen('day')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.bdayDropdownLabel}>Day</Text>
                                    <Text style={styles.bdayDropdownValue}>{bdayDay}</Text>
                                    <Text style={styles.bdayDropdownHint}>Choose ▾</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.bdayDropdownRow}
                                    onPress={() => setBdayPickerOpen('year')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.bdayDropdownLabel}>Year</Text>
                                    <Text style={styles.bdayDropdownValue}>{bdayYear}</Text>
                                    <Text style={styles.bdayDropdownHint}>Choose ▾</Text>
                                </TouchableOpacity>
                                <Text style={styles.bdayPreview}>
                                    {`Your birthday: ${MONTH_NAMES[bdayMonth - 1]} ${bdayDay}, ${bdayYear}`}
                                </Text>
                            </View>
                        ) : (
                            <TextInput
                                ref={inputRef}
                                style={[
                                    styles.modalInput,
                                    editModal === 'bio' && { height: 100, textAlignVertical: 'top' },
                                ]}
                                value={editValue}
                                onChangeText={(t) => {
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

                        {/* Pronoun suggestion chips */}
                        {editModal === 'pronouns' && (
                            <View style={styles.chipRow}>
                                {PRONOUNS_SUGGESTIONS.map((p) => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[styles.chip, editValue === p && styles.chipActive]}
                                        onPress={() => setEditValue(p)}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.chipText, editValue === p && styles.chipTextActive]}>{p}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Bio char counter */}
                        {editModal === 'bio' && (
                            <Text style={styles.charCounter}>{editValue.length}/200</Text>
                        )}

                        {editModal === 'school' && (
                            <Text style={styles.modalHelper}>
                                Type your school's full name, e.g. Rutgers University
                            </Text>
                        )}

                        <View style={{ marginTop: 20 }}>
                            <GradientButton
                                title={editSaving ? 'Saving…' : 'Save'}
                                onPress={handleSave}
                                loading={editSaving}
                            />
                        </View>

                        <TouchableOpacity onPress={closeEdit} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Birthday list picker (month / day / year) */}
            <Modal
                visible={bdayPickerOpen !== null}
                transparent
                animationType="slide"
                onRequestClose={() => setBdayPickerOpen(null)}
            >
                <View style={styles.bdayPickerOverlay}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setBdayPickerOpen(null)} />
                    <View style={styles.bdayPickerSheet}>
                        <Text style={styles.bdayPickerTitle}>
                            {bdayPickerOpen === 'month' ? 'Month' : bdayPickerOpen === 'day' ? 'Day' : 'Year'}
                        </Text>
                        <ScrollView style={styles.bdayPickerScroll} keyboardShouldPersistTaps="handled">
                            {bdayPickerOpen === 'month' &&
                                MONTH_NAMES.map((name, i) => (
                                    <TouchableOpacity
                                        key={name}
                                        style={styles.bdayPickerItem}
                                        onPress={() => {
                                            const m = i + 1;
                                            setBdayMonth(m);
                                            const max = daysInMonth(bdayYear, m);
                                            if (bdayDay > max) setBdayDay(max);
                                            setBdayPickerOpen(null);
                                        }}
                                    >
                                        <Text style={styles.bdayPickerItemText}>{name}</Text>
                                    </TouchableOpacity>
                                ))}
                            {bdayPickerOpen === 'day' &&
                                Array.from({ length: daysInMonth(bdayYear, bdayMonth) }, (_, i) => i + 1).map((day) => (
                                    <TouchableOpacity
                                        key={day}
                                        style={styles.bdayPickerItem}
                                        onPress={() => { setBdayDay(day); setBdayPickerOpen(null); }}
                                    >
                                        <Text style={styles.bdayPickerItemText}>{day}</Text>
                                    </TouchableOpacity>
                                ))}
                            {bdayPickerOpen === 'year' &&
                                Array.from({ length: maxBdayYear - minBdayYear + 1 }, (_, i) => maxBdayYear - i).map((year) => (
                                    <TouchableOpacity
                                        key={year}
                                        style={styles.bdayPickerItem}
                                        onPress={() => { setBdayYear(year); setBdayPickerOpen(null); }}
                                    >
                                        <Text style={styles.bdayPickerItemText}>{year}</Text>
                                    </TouchableOpacity>
                                ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Delete account confirmation modal ── */}
            <Modal
                visible={deleteModal}
                transparent
                animationType="slide"
                onRequestClose={() => !deleting && setDeleteModal(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={() => !deleting && setDeleteModal(false)}
                    />
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />

                        <Text style={styles.deleteModalTitle}>Delete your account?</Text>
                        <Text style={styles.deleteModalBody}>
                            This will permanently delete your profile, parties you've hosted, and all your data.
                            {'\n\n'}This cannot be undone.
                        </Text>

                        <Text style={styles.deleteModalPrompt}>
                            Type <Text style={{ color: colors.danger, fontFamily: 'Inter_700Bold' }}>DELETE</Text> to confirm
                        </Text>
                        <TextInput
                            style={[styles.modalInput, deleteTyped === 'DELETE' && styles.modalInputDanger]}
                            value={deleteTyped}
                            onChangeText={setDeleteTyped}
                            placeholderTextColor={colors.text30}
                            placeholder="DELETE"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            editable={!deleting}
                        />

                        <TouchableOpacity
                            style={[
                                styles.deleteConfirmBtn,
                                (deleteTyped !== 'DELETE' || deleting) && { opacity: 0.4 },
                            ]}
                            onPress={handleDeleteAccount}
                            disabled={deleteTyped !== 'DELETE' || deleting}
                            activeOpacity={0.85}
                        >
                            {deleting ? (
                                <ActivityIndicator color="white" size="small" />
                            ) : (
                                <Text style={styles.deleteConfirmText}>Delete my account</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => !deleting && setDeleteModal(false)}
                            style={styles.cancelBtn}
                            disabled={deleting}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <AnchoredHint
                screenKey="profile_tour_replay"
                title="Forgot something?"
                body="Tap 'Take the tour again' below to replay the welcome tour anytime."
                targetRef={tourRowRef}
                placement="top"
            />
            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 16 },

    tipBanner: {
        backgroundColor: 'rgba(108,62,244,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.30)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
    },
    tipText: { color: colors.text80, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

    avatarSection: { alignItems: 'center', marginBottom: 32 },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
    name: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 24 },
    email: { color: colors.text60, fontSize: 13, marginTop: 4, fontFamily: 'Inter_400Regular' },

    editPhotoBtn: {
        marginTop: 8,
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 12,
        backgroundColor: 'rgba(108,62,244,0.20)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.40)',
    },
    editPhotoText: { color: colors.primary, fontSize: 13, fontFamily: 'Inter_500Medium' },

    fieldHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    label: { color: colors.text60, fontSize: 11, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
    value: { color: 'white', fontSize: 16, fontFamily: 'Inter_500Medium' },
    pencilBtn: { padding: 4 },

    notSetPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    notSetText: { color: colors.text40, fontSize: 13, fontFamily: 'Inter_400Regular' },

    // Modal / bottom sheet
    modalSheet: {
        backgroundColor: '#0A0A0F',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 40,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.20)',
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: { color: 'white', fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 16 },
    modalInput: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: 'white',
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
    },
    modalHelper: {
        color: colors.text40,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        marginTop: 6,
    },
    cancelBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 10 },
    cancelText: { color: colors.text60, fontSize: 15, fontFamily: 'Inter_500Medium' },

    // ── Danger zone ──
    dangerDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginVertical: 24,
    },
    dangerZoneLabel: {
        color: colors.text40,
        fontSize: 11,
        letterSpacing: 1.2,
        fontFamily: 'Inter_700Bold',
        marginBottom: 14,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        alignSelf: 'flex-start',
    },
    deleteBtnText: {
        color: colors.danger,
        fontSize: 15,
        fontFamily: 'Inter_500Medium',
    },

    // ── Birthday steppers (vertical layout — one row per field) ──
    bdayPicker: {
        flexDirection: 'column',
        gap: 14,
    },
    bdayFieldLabel: {
        color: colors.text40,
        fontSize: 10,
        fontFamily: 'Inter_700Bold',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 4,
        textAlign: 'center',
    },
    bdayPreview: {
        color: colors.text60,
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
        textAlign: 'center',
        marginTop: 14,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(108,62,244,0.10)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.20)',
    },
    bdayDropdownRow: {
        position: 'relative',
        paddingVertical: 12,
        paddingHorizontal: 14,
        paddingRight: 80,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    bdayDropdownLabel: {
        color: colors.text40,
        fontSize: 10,
        fontFamily: 'Inter_700Bold',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    bdayDropdownValue: {
        color: 'white',
        fontFamily: 'Inter_600SemiBold',
        fontSize: 17,
        marginTop: 4,
    },
    bdayDropdownHint: {
        position: 'absolute',
        right: 14,
        top: '50%',
        marginTop: -8,
        color: colors.text40,
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
    },
    bdayPickerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    bdayPickerSheet: {
        backgroundColor: '#12121A',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        paddingBottom: 28,
        maxHeight: '55%',
    },
    bdayPickerTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    bdayPickerScroll: { maxHeight: 360 },
    bdayPickerItem: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    bdayPickerItemText: {
        color: colors.text80,
        fontFamily: 'Inter_500Medium',
        fontSize: 16,
    },
    stepperGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
    },
    stepBtn: {
        width: 36,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    stepBtnText: { color: 'white', fontSize: 18, fontFamily: 'Inter_300Light', lineHeight: 22 },
    stepValue: {
        width: 38,
        textAlign: 'center',
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 16,
    },
    stepSep: { color: colors.text40, fontSize: 18, fontFamily: 'Inter_500Medium' },

    // ── Pronoun chips ──
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    chipActive: {
        backgroundColor: 'rgba(108,62,244,0.30)',
        borderColor: 'rgba(108,62,244,0.60)',
    },
    chipText: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_500Medium' },
    chipTextActive: { color: 'white' },

    // ── Bio char counter ──
    charCounter: {
        color: colors.text40,
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        textAlign: 'right',
        marginTop: 4,
    },

    // ── Delete confirm modal ──
    deleteModalTitle: {
        color: 'white',
        fontSize: 20,
        fontFamily: 'Inter_700Bold',
        marginBottom: 12,
    },
    deleteModalBody: {
        color: colors.text60,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        lineHeight: 20,
        marginBottom: 20,
    },
    deleteModalPrompt: {
        color: colors.text80,
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        marginBottom: 8,
    },
    modalInputDanger: {
        borderColor: colors.danger,
    },
    deleteConfirmBtn: {
        marginTop: 20,
        backgroundColor: colors.danger,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    deleteConfirmText: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 15,
    },
});
