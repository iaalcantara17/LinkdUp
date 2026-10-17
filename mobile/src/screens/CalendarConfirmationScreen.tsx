import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { ScreenHeader, Tap } from '../components/kit';
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
    FadeInDown,
} from 'react-native-reanimated';
import { Calendar as CalendarIcon, Clock, Download, MapPin, Users } from '../components/icons';
import IconBadge from '../components/IconBadge';
import GradientButton from '../components/GradientButton';
import { LoadError, SlowLoadNote } from '../components/LoadState';
import { api } from '../services/api';
import { errorText, showError, showInfo, toast } from '../components/dialogs';
import { typography, spacing, radii, palette, motion } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const CONNECT_HINT = "Allow calendar access in the window that opened. We'll add your hangout once you're connected. If it doesn't show up, tap Add to Google Calendar again.";

type Attendee = { id: string; name: string; color?: string; avatarUrl?: string };

function GoogleCalIcon() {
    return (
        <View style={{ width: 22, height: 22, backgroundColor: palette.black, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
            <CalendarIcon size={14} color={palette.white} />
        </View>
    );
}

function IcsIcon() {
    return (
        <View style={{ width: 22, height: 22, backgroundColor: palette.black, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
            <Download size={14} color={palette.white} />
        </View>
    );
}

export default function CalendarConfirmationScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const { colors, roles } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [loading, setLoading] = useState(false);
    const [icsLoading, setIcsLoading] = useState(false);
    const [googleConnected, setGoogleConnected] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [venue, setVenue] = useState<{ name: string; address?: string } | null>(null);
    const [lockedDate, setLockedDate] = useState<string | null>(null);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [partyCode, setPartyCode] = useState<string | null>(null);
    const [detailsLoaded, setDetailsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

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
                let failure: unknown = null;
                const [matchData, partyData, members, me] = await Promise.all([
                    api.getMatch(partyId).catch((e) => { failure = e; return null; }),
                    api.getParty(partyId).catch((e) => { failure = e; return null; }),
                    api.getMembers(partyId).catch(() => []),
                    api.me().catch(() => null),
                ]);
                if (cancelled) return;
                if (failure) {
                    setLoadError(failure);
                    return;
                }

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
                if (!cancelled) setDetailsLoaded(true);
            } catch (e: any) {
                console.error('[calendar-confirm]', e);
            }
        })();
        return () => { cancelled = true; };
    }, [partyId, loadAttempt]);

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
                        toast('Added to Google Calendar');
                    } catch (e: any) {
                        console.error('[gcal]', e);
                        showError("Couldn't add to Google Calendar", errorText(e, 'Try again in a moment.'));
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
                    toast('Copied. Paste it anywhere to share.', 'info');
                }
            } catch (e: any) {
                if ((e as any)?.name !== 'AbortError') console.error('[share]', e);
            }
        }
    };

    const handleDownloadIcs = async () => {
        if (Platform.OS !== 'web') {
            showInfo('Download it on the web', 'Open LinkdUp in a browser to download the .ics file.');
            return;
        }
        setIcsLoading(true);
        try {
            const ics = await api.calendarIcs(partyId);
            const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'linkdup-meetup.ics';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url));
            toast('Downloaded. Open the file to add it to your calendar.');
        } catch (e: any) {
            console.error('[ics]', e);
            showError("Couldn't download the .ics file", errorText(e, 'Try again in a moment.'));
        } finally {
            setIcsLoading(false);
        }
    };

    const handleAddToGoogle = async () => {
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

                showInfo('Almost there', CONNECT_HINT);
                startPollingForGoogleConnect(partyId);
                return;
            }

            await api.calendarExport(partyId);
            toast('Added to Google Calendar');
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
                    showInfo('Almost there', CONNECT_HINT);
                    startPollingForGoogleConnect(partyId);
                } catch (inner: any) {
                    console.error('[gcal]', inner);
                    showError("Couldn't connect Google Calendar", errorText(inner, 'Try again in a moment.'));
                }
            } else {
                showError("Couldn't add to Google Calendar", errorText(e, 'Try again in a moment.'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <ScreenHeader title="Confirm" onBack={() => nav.goBack()} />

                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.duration(motion.base)} style={{ alignItems: 'center', marginBottom: 24 }}>
                        <Animated.View style={badgeStyle}>
                            <IconBadge size={80} radius={40}>
                                <CalendarIcon size={40} color={roles.onPrimary} />
                            </IconBadge>
                        </Animated.View>
                        <Text style={styles.title}>You're all set! 🎉</Text>
                        <Text style={styles.subtitle}>Your hangout is locked in. See you there!</Text>
                    </Animated.View>

                    {loadError && !detailsLoaded ? (
                        <LoadError
                            title="We couldn't load your hangout details"
                            error={loadError}
                            onRetry={() => {
                                setLoadError(null);
                                setLoadAttempt((n) => n + 1);
                            }}
                        />
                    ) : (
                    <Animated.View entering={FadeInDown.delay(motion.instant).duration(motion.base)} style={styles.eventCard}>
                        {partyId !== 'demo' && !detailsLoaded && <SlowLoadNote loading />}
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
                                <CalendarIcon size={22} color={roles.onPrimary} />
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
                                <Clock size={22} color={roles.onPrimary} />
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
                                <Users size={22} color={roles.onPrimary} />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Attendees ({attendees.length})</Text>
                                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                                    {attendees.map((a, i) => (
                                        <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                                            <AvatarBubble name={a.name} color={a.color} avatarUrl={a.avatarUrl} size={36} />
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                    )}

                    <Animated.View entering={FadeInDown.delay(motion.fast).duration(motion.base)}>
                        <GradientButton
                            title="Add to Google Calendar"
                            variant="white"
                            onPress={handleAddToGoogle}
                            loading={loading}
                            leftIcon={<GoogleCalIcon />}
                        />
                        <GradientButton
                            title="Download .ics"
                            variant="white"
                            onPress={handleDownloadIcs}
                            loading={icsLoading}
                            leftIcon={<IcsIcon />}
                            style={{ marginTop: 12 }}
                        />
                        <Text style={styles.calendarNote}>
                            The .ics file works with any calendar app, like Apple, Outlook or Google. No connection needed.
                        </Text>

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
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },

        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 36, marginTop: 16, textAlign: 'center' },
        subtitle: { color: c.text60, fontSize: 16, textAlign: 'center', marginTop: 8, fontFamily: 'Inter_400Regular' },

        eventCard: {
            backgroundColor: c.glass,
            borderRadius: radii.xl,
            padding: 24,
            borderWidth: 1,
            borderColor: c.glassBorder,
            marginBottom: 24,
        },
        venueBlock: { marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: c.glassBorder },
        venueName: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 26, marginBottom: 8 },
        venueAddress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        venueAddressText: { color: c.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },

        row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        rowLabel: { color: c.text60, fontSize: 12, marginBottom: 4, fontFamily: 'Inter_400Regular' },
        rowValue: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 16 },
        attendeeAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: c.bg },

        calendarNote: { color: c.text60, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 12, fontFamily: 'Inter_400Regular' },
        bottomButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    });
}
