import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Pressable,
    Modal,
    Linking,
    Platform,
    RefreshControl,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Calendar, Clock, MapPin, Users, ExternalLink, MoreVertical } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import BottomNav from '../components/BottomNav';
import HelpButton from '../components/HelpButton';
import FirstVisitHint from '../components/FirstVisitHint';

const HANGOUTS_HELP: { title: string; description: string }[] = [
    { title: 'Upcoming', description: 'Your confirmed hangouts, sorted by date.' },
    { title: 'Open in Calendar', description: 'Tap any hangout to view it in Google Calendar.' },
];
import { api } from '../services/api';
import { colors, radii } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HangoutVenue {
    id: string;
    name: string;
    address: string | null;
}

interface HangoutDate {
    id: string;
    starts_at: string;
    ends_at: string;
}

interface Hangout {
    id: string;
    name: string | null;
    code: string;
    status: 'matched' | 'scheduled' | 'locked';
    host_user_id: string;
    venue: HangoutVenue | null;
    locked_date: HangoutDate | null;
    member_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function routeForHangout(h: Hangout): { screen: string; params: { partyId: string } } {
    if (h.status === 'locked') return { screen: 'CalendarConfirmation', params: { partyId: h.id } };
    if (h.status === 'matched' && !h.locked_date) return { screen: 'DateTimeSetup', params: { partyId: h.id } };
    return { screen: 'PartyLobby', params: { partyId: h.id } };
}

function openGoogleCalendar() {
    const url = 'https://calendar.google.com';
    if (Platform.OS === 'web') {
        try { window.open(url, '_blank'); } catch {}
    } else {
        Linking.openURL(url).catch(() => {});
    }
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, [string, string]> = {
    matched:   ['#6C3EF4', '#9B6AF8'],
    scheduled: ['#00C2FF', '#0090C0'],
    locked:    ['#22C55E', '#16A34A'],
};

const STATUS_LABELS: Record<string, string> = {
    matched:   'MATCHED',
    scheduled: 'SCHEDULED',
    locked:    'LOCKED IN',
};

function StatusPill({ status }: { status: string }) {
    const gradColors = STATUS_COLORS[status] ?? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'];
    return (
        <LinearGradient
            colors={gradColors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusPill}
        >
            <Text style={styles.statusText}>{STATUS_LABELS[status] ?? status.toUpperCase()}</Text>
        </LinearGradient>
    );
}

// ─── Single card ─────────────────────────────────────────────────────────────

function HangoutCard({ item, index, onPress, onMenuPress }: { item: Hangout; index: number; onPress: () => void; onMenuPress: () => void }) {
    const venueName = item.venue?.name ?? item.name ?? 'Untitled hangout';
    const venueAddress = item.venue?.address ?? null;

    return (
        <Animated.View entering={FadeInDown.delay(index * 70).duration(400)}>
            {/* Pressable handles child press bubbling correctly on web.
                TouchableOpacity inside TouchableOpacity swallows inner taps on web. */}
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
                {/* Venue name + status + menu */}
                <View style={styles.cardHeader}>
                    <Text style={styles.venueName} numberOfLines={2}>{venueName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <StatusPill status={item.status} />
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation?.();
                                onMenuPress();
                            }}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={{ padding: 8, zIndex: 10 }}
                            activeOpacity={0.6}
                        >
                            <MoreVertical size={20} color={colors.text80} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Address */}
                {venueAddress ? (
                    <View style={styles.metaRow}>
                        <MapPin size={13} color={colors.text40} />
                        <Text style={styles.metaText} numberOfLines={1}>{venueAddress}</Text>
                    </View>
                ) : null}

                {/* Date / time row */}
                <View style={styles.metaRow}>
                    <Calendar size={13} color={item.locked_date ? colors.primaryAlt : colors.text40} />
                    {item.locked_date ? (
                        <Text style={[styles.metaText, { color: colors.text80 }]}>
                            {formatDate(item.locked_date.starts_at)}
                        </Text>
                    ) : (
                        <View style={styles.notSetPill}>
                            <Text style={styles.notSetText}>Date not set yet</Text>
                        </View>
                    )}
                    {item.locked_date ? (
                        <>
                            <Clock size={13} color={colors.text40} style={{ marginLeft: 12 }} />
                            <Text style={[styles.metaText, { color: colors.text80 }]}>
                                {formatTime(item.locked_date.starts_at)}
                            </Text>
                        </>
                    ) : null}
                </View>

                {/* Member count */}
                <View style={styles.metaRow}>
                    <Users size={13} color={colors.text40} />
                    <Text style={styles.metaText}>
                        {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
                    </Text>
                </View>

                {/* Google Calendar button — only when date is locked */}
                {item.locked_date ? (
                    <TouchableOpacity
                        style={styles.gcalBtn}
                        activeOpacity={0.75}
                        onPress={(e) => { e.stopPropagation?.(); openGoogleCalendar(); }}
                    >
                        <ExternalLink size={12} color={colors.primaryAlt} />
                        <Text style={styles.gcalText}>Open in Google Calendar</Text>
                    </TouchableOpacity>
                ) : null}
            </Pressable>
        </Animated.View>
    );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function HangoutsScreen() {
    const nav = useNavigation<any>();
    const [hangouts, setHangouts] = useState<Hangout[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [meId, setMeId] = useState<string | null>(null);
    const [menuHangout, setMenuHangout] = useState<Hangout | null>(null);
    // displayHangout holds the last-opened hangout during the close animation so
    // the modal body doesn't flash defaults while the fade-out is still running.
    const [displayHangout, setDisplayHangout] = useState<Hangout | null>(null);

    const load = useCallback(async () => {
        try {
            const [data, me] = await Promise.all([
                api.myHangouts().catch(() => []),
                api.me().catch(() => null),
            ]);
            setHangouts(Array.isArray(data) ? data : []);
            if (me?.id) setMeId(me.id);
        } catch {
            setHangouts([]);
        }
    }, []);

    const openHangoutMenu = (h: Hangout) => {
        console.log('[menu] openHangoutMenu fired for', h.id, 'host?', h.host_user_id === meId);
        setDisplayHangout(h);
        setMenuHangout(h);
    };

    const closeHangoutMenu = () => {
        setMenuHangout(null);
        setTimeout(() => setDisplayHangout(null), 300);
    };

    const confirmDelete = async (h: Hangout) => {
        setMenuHangout(null);
        let ok: boolean;
        if (Platform.OS === 'web') {
            const label = h.venue?.name ?? h.name ?? 'this hangout';
            ok = (window as any).confirm(`Delete "${label}"? This cannot be undone.`);
        } else {
            ok = await new Promise<boolean>(resolve => {
                Alert.alert('Delete hangout', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                ]);
            });
        }
        if (!ok) return;
        try {
            await api.deleteParty(h.id);
            setHangouts(hs => hs.filter(x => x.id !== h.id));
        } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'unknown');
        }
    };

    const confirmLeave = async (h: Hangout) => {
        setMenuHangout(null);
        let ok: boolean;
        if (Platform.OS === 'web') {
            ok = (window as any).confirm(`Leave this hangout?`);
        } else {
            ok = await new Promise<boolean>(resolve => {
                Alert.alert('Leave hangout', 'You will be removed from this party.', [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
                ]);
            });
        }
        if (!ok) return;
        try {
            await api.leaveParty(h.id);
            setHangouts(hs => hs.filter(x => x.id !== h.id));
        } catch (e: any) {
            Alert.alert('Could not leave', e?.message ?? 'unknown');
        }
    };

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <FlatList
                    data={hangouts}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="white"
                        />
                    }
                    ListHeaderComponent={
                        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.title}>Upcoming Hangouts</Text>
                                <HelpButton items={HANGOUTS_HELP} />
                            </View>
                            <Text style={styles.subtitle}>Your locked meetups, in order</Text>
                        </Animated.View>
                    }
                    ListEmptyComponent={
                        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.emptyCard}>
                            <Text style={styles.emptyIcon}>📅</Text>
                            <Text style={styles.emptyTitle}>Nothing locked in yet</Text>
                            <Text style={styles.emptyBody}>
                                Create a party and vote on spots with your crew to get started.
                            </Text>
                            <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                <GradientButton
                                    title="Create a Party"
                                    onPress={() => nav.navigate('CreateParty')}
                                />
                            </View>
                        </Animated.View>
                    }
                    renderItem={({ item, index }) => (
                        <HangoutCard
                            item={item}
                            index={index}
                            onPress={() => {
                                const { screen, params } = routeForHangout(item);
                                nav.navigate(screen, params);
                            }}
                            onMenuPress={() => openHangoutMenu(item)}
                        />
                    )}
                />
            </SafeAreaView>
            <FirstVisitHint
                screenKey="hangouts_gcal"
                title="Open in Google Calendar"
                body="Tap any hangout to open it directly in your calendar. You can edit or RSVP from there."
            />
            <BottomNav />

            {/* ── Hangout action sheet (works on web + native) ─────────── */}
            <Modal
                visible={menuHangout !== null}
                transparent
                animationType="fade"
                onRequestClose={closeHangoutMenu}
            >
                <Pressable
                    style={styles.menuOverlay}
                    onPress={closeHangoutMenu}
                >
                    {/* displayHangout retains the party data through the close animation */}
                    <View style={styles.menuSheet}>
                        <Text style={styles.menuTitle}>
                            {displayHangout?.venue?.name ?? displayHangout?.name ?? 'Hangout options'}
                        </Text>

                        {displayHangout?.host_user_id === meId ? (
                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => displayHangout && confirmDelete(displayHangout)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Delete hangout</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.menuRow}
                                onPress={() => displayHangout && confirmLeave(displayHangout)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.menuDestructive}>Leave hangout</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={closeHangoutMenu}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.menuCancel}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },

    listContent: {
        paddingHorizontal: 24,
        paddingBottom: 140,
    },

    header: {
        paddingTop: 8,
        paddingBottom: 24,
    },
    title: {
        color: 'white',
        fontFamily: 'Inter_900Black',
        fontSize: 32,
        marginBottom: 4,
    },
    subtitle: {
        color: colors.text60,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
    },

    // Card
    card: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
    },
    venueName: {
        flex: 1,
        color: 'white',
        fontFamily: 'Inter_900Black',
        fontSize: 20,
        lineHeight: 26,
    },

    // Meta rows (address, date, members)
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    metaText: {
        color: colors.text60,
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        flexShrink: 1,
    },

    // Status pill
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radii.pill,
        alignSelf: 'flex-start',
    },
    statusText: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 10,
        letterSpacing: 0.5,
    },

    // "Date not set yet" pill
    notSetPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    notSetText: {
        color: colors.text40,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
    },

    // Google Calendar link
    gcalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingVertical: 2,
    },
    gcalText: {
        color: colors.primaryAlt,
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
    },

    // Empty state
    emptyCard: {
        marginTop: 40,
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        padding: 32,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: 'center',
    },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 18,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyBody: {
        color: colors.text60,
        fontSize: 14,
        textAlign: 'center',
        fontFamily: 'Inter_400Regular',
        lineHeight: 20,
    },

    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    menuSheet: {
        backgroundColor: colors.bg,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        padding: 24,
        paddingBottom: 36,
    },
    menuTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        marginBottom: 16,
    },
    menuRow: {
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: colors.glassBorder,
    },
    menuDestructive: {
        color: '#FF4D5F',
        fontSize: 16,
        fontFamily: 'Inter_600SemiBold',
    },
    menuCancel: {
        color: colors.text60,
        fontSize: 16,
        fontFamily: 'Inter_500Medium',
    },
});
