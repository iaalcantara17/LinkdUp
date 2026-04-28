import React, { useCallback, useMemo, useState } from 'react';
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
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const HANGOUTS_HELP: { title: string; description: string }[] = [
    { title: 'Upcoming', description: 'Your confirmed hangouts, sorted by date.' },
    { title: 'Open in Calendar', description: 'Tap any hangout to view it in Google Calendar.' },
];

interface HangoutVenue { id: string; name: string; address: string | null; }
interface HangoutDate { id: string; starts_at: string; ends_at: string; }
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

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

const STATUS_COLORS: Record<string, [string, string]> = {
    matched:   ['#6C3EF4', '#9B6AF8'],
    scheduled: ['#00C2FF', '#0090C0'],
    locked:    ['#22C55E', '#16A34A'],
};
const STATUS_LABELS: Record<string, string> = {
    matched: 'MATCHED', scheduled: 'SCHEDULED', locked: 'LOCKED IN',
};

function StatusPill({ status }: { status: string }) {
    const gradColors = STATUS_COLORS[status] ?? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.10)'];
    return (
        <LinearGradient colors={gradColors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, alignSelf: 'flex-start' }}>
            <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 }}>{STATUS_LABELS[status] ?? status.toUpperCase()}</Text>
        </LinearGradient>
    );
}

function HangoutCard({ item, index, onPress, onMenuPress, colors }: { item: Hangout; index: number; onPress: () => void; onMenuPress: () => void; colors: AppColors }) {
    const venueName = item.venue?.name ?? item.name ?? 'Untitled hangout';
    const venueAddress = item.venue?.address ?? null;

    return (
        <Animated.View entering={FadeInDown.delay(index * 70).duration(400)}>
            <Pressable onPress={onPress} style={({ pressed }) => [{ backgroundColor: colors.glass, borderRadius: radii.lg, padding: 20, borderWidth: 1, borderColor: colors.glassBorder, marginBottom: 12 }, pressed && { opacity: 0.85 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
                    <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: 'Inter_900Black', fontSize: 20, lineHeight: 26 }} numberOfLines={2}>{venueName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <StatusPill status={item.status} />
                        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onMenuPress(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 8, zIndex: 10 }} activeOpacity={0.6}>
                            <MoreVertical size={20} color={colors.text80} />
                        </TouchableOpacity>
                    </View>
                </View>

                {venueAddress ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <MapPin size={13} color={colors.text40} />
                        <Text style={{ color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular', flexShrink: 1 }} numberOfLines={1}>{venueAddress}</Text>
                    </View>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Calendar size={13} color={item.locked_date ? colors.primaryAlt : colors.text40} />
                    {item.locked_date ? (
                        <Text style={{ color: colors.text80, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{formatDate(item.locked_date.starts_at)}</Text>
                    ) : (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}>
                            <Text style={{ color: colors.text40, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Date not set yet</Text>
                        </View>
                    )}
                    {item.locked_date ? (
                        <>
                            <Clock size={13} color={colors.text40} style={{ marginLeft: 12 }} />
                            <Text style={{ color: colors.text80, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{formatTime(item.locked_date.starts_at)}</Text>
                        </>
                    ) : null}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Users size={13} color={colors.text40} />
                    <Text style={{ color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                        {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
                    </Text>
                </View>

                {item.locked_date ? (
                    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start', paddingVertical: 2 }} activeOpacity={0.75} onPress={(e) => { e.stopPropagation?.(); openGoogleCalendar(); }}>
                        <ExternalLink size={12} color={colors.primaryAlt} />
                        <Text style={{ color: colors.primaryAlt, fontSize: 12, fontFamily: 'Inter_500Medium' }}>Open in Google Calendar</Text>
                    </TouchableOpacity>
                ) : null}
            </Pressable>
        </Animated.View>
    );
}

export default function HangoutsScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [hangouts, setHangouts] = useState<Hangout[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [meId, setMeId] = useState<string | null>(null);
    const [menuHangout, setMenuHangout] = useState<Hangout | null>(null);
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
            ok = (window as any).confirm(`Delete "${h.venue?.name ?? h.name ?? 'this hangout'}"? This cannot be undone.`);
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
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text60} />}
                    ListHeaderComponent={
                        <Animated.View entering={FadeInDown.duration(400)} style={{ paddingTop: 8, paddingBottom: 24 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.title}>Upcoming Hangouts</Text>
                                <HelpButton items={HANGOUTS_HELP} />
                            </View>
                            <Text style={styles.subtitle}>Your locked meetups, in order</Text>
                        </Animated.View>
                    }
                    ListEmptyComponent={
                        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.emptyCard}>
                            <Text style={{ fontSize: 48, marginBottom: 16 }}>📅</Text>
                            <Text style={styles.emptyTitle}>Nothing locked in yet</Text>
                            <Text style={styles.emptyBody}>
                                Create a party and vote on spots with your crew to get started.
                            </Text>
                            <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                <GradientButton title="Create a Party" onPress={() => nav.navigate('CreateParty')} />
                            </View>
                        </Animated.View>
                    }
                    renderItem={({ item, index }) => (
                        <HangoutCard
                            item={item}
                            index={index}
                            colors={colors}
                            onPress={() => {
                                const { screen, params } = routeForHangout(item);
                                nav.navigate(screen, params);
                            }}
                            onMenuPress={() => openHangoutMenu(item)}
                        />
                    )}
                />
            </SafeAreaView>
            <FirstVisitHint screenKey="hangouts_gcal" title="Open in Google Calendar" body="Tap any hangout to open it directly in your calendar." />
            <BottomNav />

            <Modal visible={menuHangout !== null} transparent animationType="fade" onRequestClose={closeHangoutMenu}>
                <Pressable style={styles.menuOverlay} onPress={closeHangoutMenu}>
                    <View style={styles.menuSheet}>
                        <Text style={styles.menuTitle}>{displayHangout?.venue?.name ?? displayHangout?.name ?? 'Hangout options'}</Text>
                        {displayHangout?.host_user_id === meId ? (
                            <TouchableOpacity style={styles.menuRow} onPress={() => displayHangout && confirmDelete(displayHangout)} activeOpacity={0.7}>
                                <Text style={styles.menuDestructive}>Delete hangout</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.menuRow} onPress={() => displayHangout && confirmLeave(displayHangout)} activeOpacity={0.7}>
                                <Text style={styles.menuDestructive}>Leave hangout</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.menuRow} onPress={closeHangoutMenu} activeOpacity={0.7}>
                            <Text style={styles.menuCancel}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 4 },
        subtitle: { color: c.text60, fontSize: 14, fontFamily: 'Inter_400Regular' },
        emptyCard: {
            marginTop: 40,
            backgroundColor: c.glass,
            borderRadius: radii.xl,
            padding: 32,
            borderWidth: 1,
            borderColor: c.glassBorder,
            alignItems: 'center',
        },
        emptyTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 8, textAlign: 'center' },
        emptyBody: { color: c.text60, fontSize: 14, textAlign: 'center', fontFamily: 'Inter_400Regular', lineHeight: 20 },
        menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
        menuSheet: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: c.glassBorder, padding: 24, paddingBottom: 36 },
        menuTitle: { color: c.textPrimary, fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 16 },
        menuRow: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.glassBorder },
        menuDestructive: { color: '#FF4D5F', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
        menuCancel: { color: c.text60, fontSize: 16, fontFamily: 'Inter_500Medium' },
    });
}
