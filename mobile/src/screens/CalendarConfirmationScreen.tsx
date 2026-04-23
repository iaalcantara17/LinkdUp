import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import AvatarBubble from '../components/AvatarBubble';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withSpring,
    FadeInDown,
} from 'react-native-reanimated';
import { Calendar as CalendarIcon, Clock, MapPin, Users, ArrowLeft, Bell } from 'lucide-react-native';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

type Attendee = { id: string; name: string; color?: string; avatarUrl?: string };

function GoogleCalIcon() {
    return (
        <View style={{ width: 22, height: 22, backgroundColor: 'black', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
            <CalendarIcon size={14} color="white" />
        </View>
    );
}

export default function CalendarConfirmationScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const [loading, setLoading] = useState(false);
    const [reminderOn, setReminderOn] = useState(true);
    const [googleConnected, setGoogleConnected] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [venue, setVenue] = useState<{ name: string; address?: string } | null>(null);
    const [lockedDate, setLockedDate] = useState<string | null>(null);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [partyCode, setPartyCode] = useState<string | null>(null);

    // Pulsing calendar badge
    const scale = useSharedValue(1);
    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.1, { duration: 800 }),
                withTiming(1, { duration: 800 })
            ),
            -1
        );
    }, []);
    const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    // Reminder switch
    const knobX = useSharedValue(reminderOn ? 24 : 0);
    useEffect(() => {
        knobX.value = withSpring(reminderOn ? 24 : 0, { damping: 15, stiffness: 300 });
    }, [reminderOn]);
    const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }] }));

    useEffect(() => {
        api.me().then((me: any) => {
            const connected =
                (typeof me?.google_calendar_connected === 'boolean' && me.google_calendar_connected) ||
                (me?.google_refresh_token !== null && me?.google_refresh_token !== undefined && String(me.google_refresh_token).trim() !== '');
            setGoogleConnected(!!connected);
        }).catch((e: any) => {
            console.error('[gcal]', e);
        });
    }, []);

    useEffect(() => {
        if (!partyId || partyId === 'demo') return;
        let cancelled = false;
        (async () => {
            try {
                const [matchData, partyData, members, me] = await Promise.all([
                    api.getMatch(partyId).catch(() => null),
                    api.getParty(partyId).catch(() => null),
                    api.getMembers(partyId).catch(() => []),
                    api.me().catch(() => null),
                ]);

                if (!cancelled && matchData?.location) {
                    setVenue({ name: matchData.location.name, address: matchData.location.address });
                }

                if (!cancelled && partyData?.party?.locked_date_id) {
                    const dates = await api.getDates(partyId).catch(() => []);
                    const locked = (dates as any[]).find((d: any) => d.id === partyData.party.locked_date_id);
                    if (locked?.starts_at) setLockedDate(locked.starts_at);
                }

                if (!cancelled && partyData?.party?.code) {
                    setPartyCode(partyData.party.code);
                }

                if (!cancelled && Array.isArray(members) && members.length > 0) {
                    setAttendees(
                        members.map((m: any) => ({
                            id: m.user_id,
                            name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                            color: m.users?.avatar_color,
                            avatarUrl: m.users?.avatar_url ?? undefined,
                        }))
                    );
                }
            } catch (e: any) {
                console.error('[calendar-confirm]', e);
            }
        })();
        return () => { cancelled = true; };
    }, [partyId]);

    useEffect(() => {
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, []);

    const startPollingForGoogleConnect = (party: string) => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }

        let tries = 0;
        pollRef.current = setInterval(async () => {
            tries += 1;
            try {
                const me: any = await api.me();
                const connected =
                    (typeof me?.google_calendar_connected === 'boolean' && me.google_calendar_connected) ||
                    (me?.google_refresh_token !== null && me?.google_refresh_token !== undefined && String(me.google_refresh_token).trim() !== '');

                if (connected) {
                    if (pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                    setGoogleConnected(true);
                    try {
                        await api.calendarExport(party);
                        Alert.alert('Added to Google Calendar ✓');
                    } catch (e: any) {
                        console.error('[gcal]', e);
                        Alert.alert('Could not export', e?.message ?? 'unknown');
                    }
                } else if (tries >= 10) {
                    if (pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                }
            } catch (e: any) {
                console.error('[gcal]', e);
                if (tries >= 10 && pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                }
            }
        }, 2000);
    };

    const handleShare = async () => {
        const venueName    = venue?.name ?? 'TBD';
        const venueAddress = venue?.address ?? '';
        const dateStr = lockedDate
            ? new Date(lockedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
            : 'Date TBD';
        const timeStr = lockedDate
            ? new Date(lockedDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '';
        const dateTime = lockedDate ? `${dateStr} at ${timeStr}` : dateStr;
        const code = partyCode ?? '';

        const message =
            `LinkdUp meetup locked in! 🎉\n\n${venueName}\n${venueAddress}\n\n${dateTime}\n\nJoin with code: ${code}`;
        const title = 'LinkdUp Meetup';

        if (Platform.OS !== 'web') {
            const { Share } = require('react-native');
            try {
                await Share.share({ message, title });
            } catch (e: any) {
                console.error('[share]', e);
            }
        } else {
            try {
                if ((navigator as any).canShare?.({ title, text: message })) {
                    await (navigator as any).share({ title, text: message });
                } else {
                    await navigator.clipboard.writeText(message);
                    Alert.alert('Copied to clipboard — paste it anywhere to share');
                }
            } catch (e: any) {
                // User cancelled native share — not an error
                if ((e as any)?.name !== 'AbortError') console.error('[share]', e);
            }
        }
    };

    const handleAddToGoogle = async () => {
        console.log('[gcal] click, connected=', googleConnected, 'party=', partyId);
        setLoading(true);
        try {
            if (!googleConnected) {
                let popup: Window | null = null;
                if (Platform.OS === 'web') {
                    try {
                        popup = window.open('about:blank', '_blank', 'width=500,height=700');
                    } catch (e: any) {
                        console.error('[gcal]', e);
                    }
                }

                const { url } = await api.calendarOAuthStart();

                if (Platform.OS === 'web') {
                    if (popup && !popup.closed) {
                        try {
                            popup.location.href = url;
                        } catch (e: any) {
                            console.error('[gcal]', e);
                            try { window.open(url, '_blank', 'width=500,height=700'); } catch (e2: any) { console.error('[gcal]', e2); }
                        }
                    } else {
                        try { window.open(url, '_blank', 'width=500,height=700'); } catch (e: any) { console.error('[gcal]', e); }
                    }
                } else {
                    await WebBrowser.openBrowserAsync(url);
                }

                Alert.alert('Almost there', "After you grant permission, tap 'Add to Google Calendar' again.");
                startPollingForGoogleConnect(partyId);
                return;
            }

            await api.calendarExport(partyId);
            Alert.alert('Added to Google Calendar ✓');
        } catch (e: any) {
            console.error('[gcal]', e);
            if (e?.message?.includes('user_not_connected_to_google') || e?.message?.includes('user_not_connected')) {
                setGoogleConnected(false);
                try {
                    let popup: Window | null = null;
                    if (Platform.OS === 'web') {
                        try {
                            popup = window.open('about:blank', '_blank', 'width=500,height=700');
                        } catch (e: any) {
                            console.error('[gcal]', e);
                        }
                    }

                    const { url } = await api.calendarOAuthStart();
                    if (Platform.OS === 'web') {
                        if (popup && !popup.closed) {
                            try {
                                popup.location.href = url;
                            } catch (e: any) {
                                console.error('[gcal]', e);
                                try { window.open(url, '_blank', 'width=500,height=700'); } catch (e2: any) { console.error('[gcal]', e2); }
                            }
                        } else {
                            try { window.open(url, '_blank', 'width=500,height=700'); } catch (e: any) { console.error('[gcal]', e); }
                        }
                    } else {
                        await WebBrowser.openBrowserAsync(url);
                    }
                    Alert.alert('Almost there', "After you grant permission, tap 'Add to Google Calendar' again.");
                    startPollingForGoogleConnect(partyId);
                } catch (inner: any) {
                    console.error('[gcal]', inner);
                    Alert.alert('Could not connect', inner?.message ?? 'unknown');
                }
            } else {
                Alert.alert('Could not export', e?.message ?? 'unknown');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Confirm</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                    {/* Success header */}
                    <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', marginBottom: 24 }}>
                        <Animated.View style={badgeStyle}>
                            <IconBadge size={80} radius={40}>
                                <CalendarIcon size={40} color="white" />
                            </IconBadge>
                        </Animated.View>
                        <Text style={styles.title}>You're all set! 🎉</Text>
                        <Text style={styles.subtitle}>Your hangout is locked in. See you there!</Text>
                    </Animated.View>

                    {/* Event preview */}
                    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.eventCard}>
                        <View style={styles.venueBlock}>
                            <Text style={styles.venueName}>{venue?.name ?? 'Loading...'}</Text>
                            {!!venue?.address && (
                                <View style={styles.venueAddress}>
                                    <MapPin size={14} color={colors.text60} />
                                    <Text style={styles.venueAddressText}>{venue.address}</Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <CalendarIcon size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Date</Text>
                                <Text style={styles.rowValue}>
                                    {lockedDate
                                        ? new Date(lockedDate).toLocaleDateString('en-US', {
                                              weekday: 'long',
                                              month: 'long',
                                              day: 'numeric',
                                              year: 'numeric',
                                          })
                                        : 'Loading...'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <Clock size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Time</Text>
                                <Text style={styles.rowValue}>
                                    {lockedDate
                                        ? new Date(lockedDate).toLocaleTimeString('en-US', {
                                              hour: 'numeric',
                                              minute: '2-digit',
                                          })
                                        : 'Loading...'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <Users size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Attendees ({attendees.length})</Text>
                                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                    {attendees.map((a, i) => (
                                        <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                                            <AvatarBubble name={a.name} color={a.color} avatarUrl={a.avatarUrl} size={36} />
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Actions */}
                    <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                        <GradientButton
                            title="Add to Google Calendar"
                            variant="white"
                            onPress={handleAddToGoogle}
                            loading={loading}
                            leftIcon={<GoogleCalIcon />}
                        />

                        {/* Reminder toggle */}
                        <TouchableOpacity
                            onPress={() => setReminderOn(!reminderOn)}
                            activeOpacity={0.85}
                            style={styles.reminderRow}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                <Bell size={22} color={colors.primary} />
                                <View>
                                    <Text style={styles.reminderTitle}>Reminder</Text>
                                    <Text style={styles.reminderSub}>1 hour before event</Text>
                                </View>
                            </View>
                            <View style={[styles.toggleTrack, reminderOn && styles.toggleTrackOn]}>
                                {reminderOn ? (
                                    <LinearGradient
                                        colors={colors.gradient as any}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                ) : null}
                                <Animated.View style={[styles.toggleKnob, knobStyle]} />
                            </View>
                        </TouchableOpacity>

                        <View style={styles.bottomButtons}>
                            <View style={{ flex: 1 }}>
                                <GradientButton
                                    title="Back to Home"
                                    variant="ghost"
                                    onPress={() => nav.navigate('Home')}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <GradientButton
                                    title="Share"
                                    onPress={handleShare}
                                />
                            </View>
                        </View>

                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>💡 You'll receive a notification when it's time to head out</Text>
                        </View>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
    headerTitle: { ...typography.h3, color: 'white' },

    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 36, marginTop: 16, textAlign: 'center' },
    subtitle: { color: colors.text60, fontSize: 16, textAlign: 'center', marginTop: 6, fontFamily: 'Inter_400Regular' },

    eventCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        padding: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 24,
    },
    venueBlock: { marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.glassBorder },
    venueName: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 26, marginBottom: 6 },
    venueAddress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    venueAddressText: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },

    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    rowLabel: { color: colors.text60, fontSize: 12, marginBottom: 2, fontFamily: 'Inter_400Regular' },
    rowValue: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 },
    attendeeAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.bg },

    reminderRow: {
        marginTop: 16,
        padding: 20,
        borderRadius: radii.lg,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        flexDirection: 'row',
        alignItems: 'center',
    },
    reminderTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
    reminderSub: { color: colors.text60, fontSize: 12, fontFamily: 'Inter_400Regular' },
    toggleTrack: {
        width: 52,
        height: 30,
        borderRadius: 15,
        backgroundColor: colors.glassStrong,
        padding: 3,
        overflow: 'hidden',
    },
    toggleTrackOn: {},
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'white',
    },

    bottomButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    infoBox: {
        marginTop: 16,
        padding: 16,
        borderRadius: radii.lg,
        backgroundColor: 'rgba(108,62,244,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.20)',
    },
    infoText: { color: colors.text60, fontSize: 13, textAlign: 'center', fontFamily: 'Inter_400Regular' },
});
