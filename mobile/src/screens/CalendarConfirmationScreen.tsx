import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
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

const DEMO_EVENT = {
    venue: 'Maple Pool Lounge',
    date: 'Friday, March 14, 2026',
    time: '6:00 PM',
    address: '789 Game Street, Midtown',
    attendees: [
        { id: 1, name: 'Alex', avatar: 'https://i.pravatar.cc/150?img=1' },
        { id: 2, name: 'Jordan', avatar: 'https://i.pravatar.cc/150?img=2' },
        { id: 3, name: 'Sam', avatar: 'https://i.pravatar.cc/150?img=3' },
        { id: 4, name: 'You', avatar: 'https://i.pravatar.cc/150?img=11' },
    ],
};

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

    const handleAddToGoogle = async () => {
        setLoading(true);
        try {
            await api.calendarExport(partyId);
            Alert.alert('Added to your Google Calendar ✓', 'Check your calendar app.');
        } catch (e: any) {
            if (e?.message?.includes('user_not_connected_to_google') || e?.message?.includes('user_not_connected')) {
                try {
                    const { url } = await api.calendarOAuthStart();
                    await WebBrowser.openBrowserAsync(url);
                    Alert.alert('Almost there', 'After granting permission, tap Add to Google Calendar again.');
                } catch (inner: any) {
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
                            <Text style={styles.venueName}>{DEMO_EVENT.venue}</Text>
                            <View style={styles.venueAddress}>
                                <MapPin size={14} color={colors.text60} />
                                <Text style={styles.venueAddressText}>{DEMO_EVENT.address}</Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <CalendarIcon size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Date</Text>
                                <Text style={styles.rowValue}>{DEMO_EVENT.date}</Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <Clock size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Time</Text>
                                <Text style={styles.rowValue}>{DEMO_EVENT.time}</Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <IconBadge>
                                <Users size={22} color="white" />
                            </IconBadge>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.rowLabel}>Attendees ({DEMO_EVENT.attendees.length})</Text>
                                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                                    {DEMO_EVENT.attendees.map((a, i) => (
                                        <Image
                                            key={a.id}
                                            source={{ uri: a.avatar }}
                                            style={[styles.attendeeAvatar, { marginLeft: i === 0 ? 0 : -10 }]}
                                        />
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
                                    onPress={() => Alert.alert('Share', 'Share link coming soon.')}
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
