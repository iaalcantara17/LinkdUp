import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { ArrowLeft, Check, ArrowRight, Clock } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';

const WEEK_DAYS = [
    { day: 'Mon', date: 10, available: 2 },
    { day: 'Tue', date: 11, available: 3 },
    { day: 'Wed', date: 12, available: 4 },
    { day: 'Thu', date: 13, available: 2 },
    { day: 'Fri', date: 14, available: 4 },
    { day: 'Sat', date: 15, available: 4 },
    { day: 'Sun', date: 16, available: 3 },
];

const TIME_SLOTS = ['10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM', '8:00 PM'];

const CREW = [
    { id: 1, name: 'Alex', avatar: 'https://i.pravatar.cc/150?img=1', confirmed: true },
    { id: 2, name: 'Jordan', avatar: 'https://i.pravatar.cc/150?img=2', confirmed: true },
    { id: 3, name: 'Sam', avatar: 'https://i.pravatar.cc/150?img=3', confirmed: false },
    { id: 4, name: 'You', avatar: 'https://i.pravatar.cc/150?img=11', confirmed: false },
];

const TOTAL_MEMBERS = CREW.length;

export default function DateTimeSetupScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleLockIn = async () => {
        if (selectedDay === null || !selectedTime) return;
        setLoading(true);
        try {
            // Try to send real availability + lock to backend; fall through on failure
            const dates = await api.getDates(partyId).catch(() => []);
            if (dates.length > 0) {
                await api.voteDates(partyId, [dates[0].id]).catch(() => {});
                await api.lockDate(partyId, dates[0].id).catch(() => {});
            }
            nav.replace('CalendarConfirmation', { partyId });
        } catch (e: any) {
            Alert.alert('Could not save', e?.message ?? 'unknown');
            nav.replace('CalendarConfirmation', { partyId });
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
                    <Text style={styles.headerTitle}>Set the Date</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <Text style={styles.title}>When works for everyone?</Text>
                        <Text style={styles.subtitle}>Pick a day and time when your crew is available</Text>

                        {/* 7-day grid */}
                        <View style={styles.weekGrid}>
                            {WEEK_DAYS.map((item, i) => {
                                const isSelected = selectedDay === i;
                                return (
                                    <Animated.View
                                        key={i}
                                        entering={FadeInDown.delay(i * 40).duration(300)}
                                        style={{ flex: 1 }}
                                    >
                                        <TouchableOpacity
                                            onPress={() => setSelectedDay(i)}
                                            activeOpacity={0.85}
                                            style={{ flex: 1 }}
                                        >
                                            {isSelected ? (
                                                <LinearGradient
                                                    colors={colors.gradient as any}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={[styles.dayCell, styles.dayCellSelected]}
                                                >
                                                    <Text style={[styles.dayLabel, { color: 'white' }]}>{item.day}</Text>
                                                    <Text style={[styles.dateLabel, { color: 'white' }]}>{item.date}</Text>
                                                    <View style={styles.availRow}>
                                                        {Array.from({ length: TOTAL_MEMBERS }).map((_, j) => (
                                                            <View
                                                                key={j}
                                                                style={[
                                                                    styles.availDot,
                                                                    { backgroundColor: j < item.available ? 'white' : 'rgba(255,255,255,0.3)' },
                                                                ]}
                                                            />
                                                        ))}
                                                    </View>
                                                </LinearGradient>
                                            ) : (
                                                <View style={styles.dayCell}>
                                                    <Text style={styles.dayLabel}>{item.day}</Text>
                                                    <Text style={styles.dateLabel}>{item.date}</Text>
                                                    <View style={styles.availRow}>
                                                        {Array.from({ length: TOTAL_MEMBERS }).map((_, j) => (
                                                            <View
                                                                key={j}
                                                                style={[
                                                                    styles.availDot,
                                                                    { backgroundColor: j < item.available ? colors.success : 'rgba(255,255,255,0.2)' },
                                                                ]}
                                                            />
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </Animated.View>
                                );
                            })}
                        </View>

                        {/* Time slots */}
                        {selectedDay !== null && (
                            <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 24 }}>
                                <View style={styles.timeHeader}>
                                    <Clock size={18} color={colors.primary} />
                                    <Text style={styles.timeTitle}>Select a time</Text>
                                </View>
                                <View style={styles.timeGrid}>
                                    {TIME_SLOTS.map((time, i) => {
                                        const isSelected = selectedTime === time;
                                        return (
                                            <TouchableOpacity
                                                key={time}
                                                onPress={() => setSelectedTime(time)}
                                                activeOpacity={0.85}
                                                style={{ width: '48%' }}
                                            >
                                                {isSelected ? (
                                                    <LinearGradient
                                                        colors={colors.gradient as any}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 1, y: 0 }}
                                                        style={styles.timeSlot}
                                                    >
                                                        <Text style={styles.timeTextSelected}>{time}</Text>
                                                    </LinearGradient>
                                                ) : (
                                                    <View style={styles.timeSlotUnselected}>
                                                        <Text style={styles.timeText}>{time}</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </Animated.View>
                        )}

                        {/* Who's confirmed */}
                        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.confirmedCard}>
                            <Text style={styles.confirmedLabel}>Who's confirmed</Text>
                            {CREW.map((member, i) => (
                                <Animated.View
                                    key={member.id}
                                    entering={FadeInLeft.delay(400 + i * 50).duration(300)}
                                    style={styles.confirmedRow}
                                >
                                    <Image source={{ uri: member.avatar }} style={styles.confirmedAvatar} />
                                    <Text style={styles.confirmedName}>{member.name}</Text>
                                    {member.confirmed ? (
                                        <View style={styles.confirmedCheck}>
                                            <Check size={14} color="white" />
                                        </View>
                                    ) : (
                                        <View style={styles.confirmedUnchecked} />
                                    )}
                                </Animated.View>
                            ))}
                        </Animated.View>
                    </Animated.View>
                </ScrollView>

                {/* Bottom CTA */}
                <LinearGradient
                    colors={['transparent', colors.bg, colors.bg]}
                    style={styles.bottomFade}
                    pointerEvents="box-none"
                >
                    <GradientButton
                        title="Lock It In"
                        onPress={handleLockIn}
                        disabled={selectedDay === null || !selectedTime}
                        loading={loading}
                        rightIcon={<ArrowRight size={20} color="white" />}
                    />
                    {selectedDay !== null && selectedTime && (
                        <Text style={styles.selectedLabel}>
                            {WEEK_DAYS[selectedDay].day}, March {WEEK_DAYS[selectedDay].date} at {selectedTime}
                        </Text>
                    )}
                </LinearGradient>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
    headerTitle: { ...typography.h3, color: 'white' },

    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 26, marginBottom: 6 },
    subtitle: { color: colors.text60, fontSize: 14, marginBottom: 20, fontFamily: 'Inter_400Regular' },

    weekGrid: { flexDirection: 'row', gap: 6 },
    dayCell: {
        aspectRatio: 0.8,
        borderRadius: radii.lg,
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    dayCellSelected: {
        transform: [{ scale: 1.05 }],
        borderColor: 'transparent',
    },
    dayLabel: { color: colors.text60, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 4 },
    dateLabel: { color: 'white', fontSize: 18, fontFamily: 'Inter_900Black' },
    availRow: { flexDirection: 'row', gap: 2, marginTop: 6 },
    availDot: { width: 4, height: 4, borderRadius: 2 },

    timeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    timeTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
    timeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
    timeSlot: { paddingVertical: 16, borderRadius: radii.md, alignItems: 'center' },
    timeSlotUnselected: {
        paddingVertical: 16,
        borderRadius: radii.md,
        alignItems: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    timeText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
    timeTextSelected: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },

    confirmedCard: {
        marginTop: 24,
        padding: 20,
        borderRadius: radii.lg,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    confirmedLabel: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 12 },
    confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    confirmedAvatar: { width: 40, height: 40, borderRadius: 20 },
    confirmedName: { color: 'white', flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
    confirmedCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.success,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmedUnchecked: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.text30,
    },

    bottomFade: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 32,
    },
    selectedLabel: { color: colors.text60, fontSize: 13, textAlign: 'center', marginTop: 12, fontFamily: 'Inter_500Medium' },
});
