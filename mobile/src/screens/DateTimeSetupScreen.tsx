import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Modal, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft, CalendarPlus, Check, ChevronLeft, ChevronRight,
    Clock, Lock, Trash2, X,
} from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

type Member = {
    id: string;
    name: string;
    username?: string | null;
    color?: string;
    avatarUrl?: string | null;
};

type VoteUser = {
    user_id: string;
    display_name: string;
    username?: string | null;
    avatar_color?: string | null;
    avatar_url?: string | null;
    available: boolean;
};

type ProposedDate = {
    id: string;
    starts_at: string;
    ends_at: string;
    proposed_by: {
        user_id: string;
        display_name: string;
        username?: string | null;
        avatar_color?: string | null;
        avatar_url?: string | null;
    } | null;
    vote_count: number;
    member_count: number;
    votes: VoteUser[];
    my_vote: boolean | null;
    is_locked: boolean;
};

const QUICK_TIMES: Array<[string, number, number]> = [
    ['10:00 AM', 10, 0],
    ['12:00 PM', 12, 0],
    ['2:00 PM', 14, 0],
    ['5:00 PM', 17, 0],
    ['7:00 PM', 19, 0],
    ['9:00 PM', 21, 0],
];

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const DAY_INITIALS = ['S','M','T','W','T','F','S'];
const CAL_CELL_H = 46;
const CAL_GRID_H = CAL_CELL_H * 6;

function dayKeyFromDate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function dayKeyFromIso(iso: string) {
    return dayKeyFromDate(new Date(iso));
}

function todayKey() {
    return dayKeyFromDate(new Date());
}

function buildIsoDatetime(
    dayKey: string,
    timeMode: 'quick' | 'custom',
    quickIdx: number | null,
    customHour: number,
    customMinute: number,
    customAmPm: 'AM' | 'PM',
): string {
    let h: number, m: number;
    if (timeMode === 'quick' && quickIdx !== null) {
        [, h, m] = QUICK_TIMES[quickIdx];
    } else {
        h = customAmPm === 'AM'
            ? (customHour === 12 ? 0 : customHour)
            : (customHour === 12 ? 12 : customHour + 12);
        m = customMinute;
    }
    return `${dayKey}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function firstWeekdayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

type CalCell =
    | { type: 'current'; day: number }
    | { type: 'prev'; day: number }
    | { type: 'next'; day: number };

function buildCalendarCells(year: number, month: number): CalCell[] {
    const totalDays = daysInMonth(year, month);
    const offset = firstWeekdayOfMonth(year, month);
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevTotal = daysInMonth(prevYear, prevMonth);

    const cells: CalCell[] = [];
    for (let i = offset - 1; i >= 0; i--) cells.push({ type: 'prev', day: prevTotal - i });
    for (let d = 1; d <= totalDays; d++) cells.push({ type: 'current', day: d });
    let nextDay = 1;
    while (cells.length < 42) cells.push({ type: 'next', day: nextDay++ });
    return cells;
}

interface CalendarModalProps {
    visible: boolean;
    selectedDayKey: string | null;
    onSelect: (dayKey: string) => void;
    onClose: () => void;
    colors: AppColors;
}

function CalendarModal({ visible, selectedDayKey, onSelect, onClose, colors }: CalendarModalProps) {
    const calStyles = useMemo(() => makeCalStyles(colors), [colors]);
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const todayStr = todayKey();
    const cells = buildCalendarCells(year, month);

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }

    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }

    function cellKey(type: CalCell['type'], day: number): string {
        if (type === 'prev') {
            const py = month === 0 ? year - 1 : year;
            const pm = month === 0 ? 11 : month - 1;
            return `${py}-${String(pm + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }
        if (type === 'next') {
            const ny = month === 11 ? year + 1 : year;
            const nm = month === 11 ? 0 : month + 1;
            return `${ny}-${String(nm + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }
        return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={calStyles.overlay}>
                <SafeAreaView style={calStyles.sheet} edges={['bottom']}>
                    <View style={calStyles.calHeader}>
                        <TouchableOpacity onPress={onClose} style={calStyles.closeBtn}>
                            <X size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={calStyles.calTitle}>Pick a Date</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    <View style={calStyles.monthNav}>
                        <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn}>
                            <ChevronLeft size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={calStyles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
                        <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn}>
                            <ChevronRight size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <View style={calStyles.dowRow}>
                        {DAY_INITIALS.map((d, i) => <Text key={i} style={calStyles.dowLabel}>{d}</Text>)}
                    </View>

                    <View style={[calStyles.grid, { height: CAL_GRID_H }]}>
                        {cells.map((cell, i) => {
                            const key = cellKey(cell.type, cell.day);
                            const isCurrent = cell.type === 'current';
                            const isSelected = isCurrent && key === selectedDayKey;
                            const isToday = isCurrent && key === todayStr;
                            const disabled = !isCurrent || key < todayStr;

                            return (
                                <TouchableOpacity
                                    key={`${cell.type}-${i}`}
                                    style={calStyles.cell}
                                    activeOpacity={disabled ? 1 : 0.75}
                                    disabled={disabled}
                                    onPress={() => { onSelect(key); onClose(); }}
                                >
                                    {isSelected ? (
                                        <LinearGradient
                                            colors={colors.gradient as any}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={calStyles.cellCircle}
                                        >
                                            <Text style={[calStyles.dayNum, { color: 'white' }]}>{cell.day}</Text>
                                        </LinearGradient>
                                    ) : (
                                        <View style={[
                                            calStyles.cellCircle,
                                            isToday && calStyles.todayCircle,
                                            disabled && { opacity: 0.25 },
                                        ]}>
                                            <Text style={calStyles.dayNum}>{cell.day}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

export default function DateTimeSetupScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [dates, setDates] = useState<ProposedDate[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [myId, setMyId] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyDateId, setBusyDateId] = useState<string | null>(null);
    const [proposing, setProposing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [showCalendar, setShowCalendar] = useState(false);
    const [timeMode, setTimeMode] = useState<'quick' | 'custom'>('quick');
    const [quickIdx, setQuickIdx] = useState<number | null>(4);
    const [customHour, setCustomHour] = useState(7);
    const [customMin, setCustomMin] = useState(0);
    const [customAmPm, setCustomAmPm] = useState<'AM' | 'PM'>('PM');

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    }, []);

    const refreshDates = useCallback(async () => {
        const nextDates = await api.getDates(partyId);
        setDates(Array.isArray(nextDates) ? nextDates as ProposedDate[] : []);
    }, [partyId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [rawDates, rawMembers, me, partyData] = await Promise.all([
                    api.getDates(partyId).catch(() => []),
                    api.getMembers(partyId).catch(() => []),
                    api.me().catch(() => null),
                    api.getParty(partyId).catch(() => null),
                ]);
                if (cancelled) return;

                setDates(Array.isArray(rawDates) ? rawDates as ProposedDate[] : []);
                if (me?.id) {
                    const partyHostId = partyData?.party?.host_user_id ?? partyData?.party?.host_id;
                    setMyId(me.id);
                    setIsHost(partyHostId === me.id);
                }
                setMembers((Array.isArray(rawMembers) ? rawMembers : []).map((m: any) => ({
                    id: m.user_id,
                    name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                    username: m.users?.username ?? null,
                    color: m.users?.avatar_color,
                    avatarUrl: m.users?.avatar_url ?? null,
                })));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [partyId]);

    useEffect(() => {
        const channel = supabase
            .channel(`party-dates-${partyId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'party_dates',
                filter: `party_id=eq.${partyId}`,
            }, () => { refreshDates().catch(() => {}); })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'date_votes',
            }, () => { refreshDates().catch(() => {}); })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'parties',
                filter: `id=eq.${partyId}`,
            }, () => { refreshDates().catch(() => {}); })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [partyId, refreshDates]);

    const dayGrid = useMemo(() => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        return Array.from({ length: 30 }).map((_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const key = dayKeyFromDate(d);
            const proposedCount = dates.filter(opt => dayKeyFromIso(opt.starts_at) === key).length;
            return { key, date: d, proposedCount };
        });
    }, [dates]);

    const selectedIso = useMemo(() => {
        if (!selectedDayKey) return null;
        return new Date(buildIsoDatetime(selectedDayKey, timeMode, quickIdx, customHour, customMin, customAmPm)).toISOString();
    }, [selectedDayKey, timeMode, quickIdx, customHour, customMin, customAmPm]);

    const lockedDate = dates.find(d => d.is_locked) ?? null;
    const highestVoteCount = Math.max(0, ...dates.map(d => d.vote_count));

    const handlePropose = async () => {
        if (!selectedIso) return;
        const tempId = `temp-${Date.now()}`;
        const optimistic: ProposedDate = {
            id: tempId,
            starts_at: selectedIso,
            ends_at: new Date(new Date(selectedIso).getTime() + 2 * 60 * 60 * 1000).toISOString(),
            proposed_by: myId ? {
                user_id: myId,
                display_name: 'You',
                username: null,
                avatar_color: members.find(m => m.id === myId)?.color ?? null,
                avatar_url: members.find(m => m.id === myId)?.avatarUrl ?? null,
            } : null,
            vote_count: 0,
            member_count: Math.max(1, members.length),
            votes: [],
            my_vote: null,
            is_locked: false,
        };

        setProposing(true);
        setDates(prev => [optimistic, ...prev]);
        try {
            await api.proposeDate(partyId, selectedIso, formatTime(selectedIso));
            showToast('Date proposed!');
            await refreshDates();
        } catch (e: any) {
            setDates(prev => prev.filter(d => d.id !== tempId));
            Alert.alert('Could not propose date', e?.message ?? 'unknown');
        } finally {
            setProposing(false);
        }
    };

    const handleVote = async (dateId: string, available: boolean) => {
        const date = dates.find(d => d.id === dateId);
        if (!date || !myId) return;
        setBusyDateId(dateId);
        setDates(prev => prev.map(d => {
            if (d.id !== dateId) return d;
            const votes = d.votes.filter(v => v.user_id !== myId);
            const me = members.find(m => m.id === myId);
            votes.push({
                user_id: myId,
                display_name: 'You',
                username: me?.username ?? null,
                avatar_color: me?.color ?? null,
                avatar_url: me?.avatarUrl ?? null,
                available,
            });
            return { ...d, votes, my_vote: available, vote_count: votes.filter(v => v.available).length };
        }));
        try {
            await api.voteOnDate(partyId, dateId, available);
            await refreshDates();
        } catch (e: any) {
            Alert.alert('Could not update vote', e?.message ?? 'unknown');
            await refreshDates().catch(() => {});
        } finally {
            setBusyDateId(null);
        }
    };

    const handleLock = async (dateId: string) => {
        setBusyDateId(dateId);
        try {
            await api.lockDateById(partyId, dateId);
            showToast('Date confirmed!');
            await refreshDates();
        } catch (e: any) {
            Alert.alert('Could not lock date', e?.message ?? 'unknown');
        } finally {
            setBusyDateId(null);
        }
    };

    const handleDelete = async (dateId: string) => {
        setBusyDateId(dateId);
        const previous = dates;
        setDates(prev => prev.filter(d => d.id !== dateId));
        try {
            await api.deleteProposedDate(partyId, dateId);
            showToast('Date removed');
            await refreshDates();
        } catch (e: any) {
            setDates(previous);
            Alert.alert('Could not delete date', e?.message ?? 'unknown');
        } finally {
            setBusyDateId(null);
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={styles.headerBtn}>
                        <ArrowLeft size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Pick a Date</Text>
                    <View style={{ width: 40 }} />
                </View>

                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator color={colors.primaryAlt} />
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {lockedDate && (
                            <Animated.View entering={FadeInDown.duration(300)} style={styles.lockedCard}>
                                <View style={styles.lockedIcon}>
                                    <Lock size={22} color="white" />
                                </View>
                                <Text style={styles.lockedKicker}>Date confirmed!</Text>
                                <Text style={styles.lockedTitle}>{formatDateTime(lockedDate.starts_at)}</Text>
                                <TouchableOpacity
                                    style={styles.calendarBtn}
                                    activeOpacity={0.85}
                                    onPress={() => nav.navigate('CalendarConfirmation', { partyId })}
                                >
                                    <CalendarPlus size={18} color="white" />
                                    <Text style={styles.calendarBtnText}>Add to Google Calendar</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}

                        {!lockedDate && (
                            <Animated.View entering={FadeInDown.duration(350)} style={styles.section}>
                                <Text style={styles.sectionTitle}>Propose a date</Text>
                                <Text style={styles.sectionSub}>Tap a day, choose a time, and add it to the shared list.</Text>

                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.dayList}
                                >
                                    {dayGrid.map((d, i) => {
                                        const isSelected = selectedDayKey === d.key;
                                        const dayAbbrev = d.date.toLocaleDateString(undefined, { weekday: 'short' });
                                        const monthAbbrev = d.date.toLocaleDateString(undefined, { month: 'short' });
                                        return (
                                            <Animated.View key={d.key} entering={FadeInDown.delay(i * 12).duration(250)}>
                                                <TouchableOpacity onPress={() => setSelectedDayKey(d.key)} activeOpacity={0.85}>
                                                    {isSelected ? (
                                                        <LinearGradient
                                                            colors={colors.gradient as any}
                                                            start={{ x: 0, y: 0 }}
                                                            end={{ x: 1, y: 1 }}
                                                            style={[styles.dayCard, styles.dayCellSelected]}
                                                        >
                                                            <Text style={[styles.dayLabel, { color: 'white' }]}>{dayAbbrev}</Text>
                                                            <Text style={[styles.monthLabel, { color: 'white' }]}>{monthAbbrev}</Text>
                                                            <Text style={[styles.dateLabel, { color: 'white' }]}>{d.date.getDate()}</Text>
                                                            <Text style={[styles.proposedCount, { color: 'rgba(255,255,255,0.82)' }]}>
                                                                {d.proposedCount || 'new'}
                                                            </Text>
                                                        </LinearGradient>
                                                    ) : (
                                                        <View style={styles.dayCard}>
                                                            <Text style={styles.dayLabel}>{dayAbbrev}</Text>
                                                            <Text style={styles.monthLabel}>{monthAbbrev}</Text>
                                                            <Text style={styles.dateLabel}>{d.date.getDate()}</Text>
                                                            <Text style={styles.proposedCount}>
                                                                {d.proposedCount > 0 ? `${d.proposedCount} proposed` : 'open'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </TouchableOpacity>
                                            </Animated.View>
                                        );
                                    })}
                                </ScrollView>

                                <TouchableOpacity onPress={() => setShowCalendar(true)} activeOpacity={0.75} style={styles.calendarLink}>
                                    <Text style={styles.calendarLinkText}>Pick a specific date</Text>
                                </TouchableOpacity>

                                {selectedDayKey && (
                                    <View style={styles.timePanel}>
                                        <View style={styles.timeHeader}>
                                            <Clock size={18} color={colors.primary} />
                                            <Text style={styles.timeTitle}>Optional time</Text>
                                        </View>

                                        <View style={styles.segmentedSwitch}>
                                            {(['quick', 'custom'] as const).map((mode) => (
                                                <TouchableOpacity
                                                    key={mode}
                                                    style={[styles.segmentBtn, timeMode === mode && styles.segmentBtnActive]}
                                                    activeOpacity={0.8}
                                                    onPress={() => setTimeMode(mode)}
                                                >
                                                    <Text style={[styles.segmentText, timeMode === mode && styles.segmentTextActive]}>
                                                        {mode === 'quick' ? 'Quick' : 'Custom'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {timeMode === 'quick' ? (
                                            <View style={styles.timeGrid}>
                                                {QUICK_TIMES.map(([label], idx) => {
                                                    const isSelected = quickIdx === idx;
                                                    return (
                                                        <TouchableOpacity
                                                            key={label}
                                                            onPress={() => setQuickIdx(idx)}
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
                                                                    <Text style={styles.timeTextSelected}>{label}</Text>
                                                                </LinearGradient>
                                                            ) : (
                                                                <View style={styles.timeSlotUnselected}>
                                                                    <Text style={styles.timeText}>{label}</Text>
                                                                </View>
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ) : (
                                            <View style={styles.customTimePicker}>
                                                <View style={styles.stepperGroup}>
                                                    <TouchableOpacity style={styles.stepBtn} onPress={() => setCustomHour(h => h === 1 ? 12 : h - 1)}>
                                                        <Text style={styles.stepBtnText}>-</Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.stepValue}>{String(customHour).padStart(2, '0')}</Text>
                                                    <TouchableOpacity style={styles.stepBtn} onPress={() => setCustomHour(h => h === 12 ? 1 : h + 1)}>
                                                        <Text style={styles.stepBtnText}>+</Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <Text style={styles.timeSep}>:</Text>

                                                <View style={styles.stepperGroup}>
                                                    <TouchableOpacity style={styles.stepBtn} onPress={() => setCustomMin(m => m === 0 ? 45 : m - 15)}>
                                                        <Text style={styles.stepBtnText}>-</Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.stepValue}>{String(customMin).padStart(2, '0')}</Text>
                                                    <TouchableOpacity style={styles.stepBtn} onPress={() => setCustomMin(m => m === 45 ? 0 : m + 15)}>
                                                        <Text style={styles.stepBtnText}>+</Text>
                                                    </TouchableOpacity>
                                                </View>

                                                <TouchableOpacity style={styles.ampmToggle} activeOpacity={0.8} onPress={() => setCustomAmPm(v => v === 'AM' ? 'PM' : 'AM')}>
                                                    <LinearGradient colors={colors.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ampmGradient}>
                                                        <Text style={styles.ampmText}>{customAmPm}</Text>
                                                    </LinearGradient>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}

                                <GradientButton
                                    title="Propose this date"
                                    onPress={handlePropose}
                                    disabled={!selectedIso || proposing}
                                    loading={proposing}
                                    leftIcon={<CalendarPlus size={19} color="white" />}
                                />
                                {selectedIso && <Text style={styles.selectedLabel}>{formatDateTime(selectedIso)}</Text>}
                            </Animated.View>
                        )}

                        <Animated.View entering={FadeInDown.delay(100).duration(350)} style={styles.section}>
                            <Text style={styles.sectionTitle}>Proposed dates</Text>
                            <Text style={styles.sectionSub}>
                                Vote on every date that works. No vote means unavailable.
                            </Text>

                            {dates.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyTitle}>No dates proposed yet</Text>
                                    <Text style={styles.emptyText}>Be the first to propose a date - tap a day above.</Text>
                                </View>
                            ) : dates.map((date) => {
                                const proposer = date.proposed_by;
                                const yesVotes = date.votes.filter(v => v.available);
                                const canDelete = !date.is_locked && (isHost || proposer?.user_id === myId);
                                const showLock = isHost && !date.is_locked && (!lockedDate || date.vote_count === highestVoteCount || highestVoteCount === 0);
                                return (
                                    <View key={date.id} style={[styles.dateCard, date.is_locked && styles.dateCardLocked]}>
                                        <View style={styles.dateTopRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.dateTitle}>{formatDateTime(date.starts_at)}</Text>
                                                <View style={styles.proposerRow}>
                                                    <AvatarBubble
                                                        name={proposer?.display_name ?? 'Someone'}
                                                        color={proposer?.avatar_color ?? undefined}
                                                        avatarUrl={proposer?.avatar_url ?? undefined}
                                                        size={26}
                                                        onPress={proposer?.user_id && proposer.user_id !== myId ? () => setProfileUserId(proposer.user_id) : undefined}
                                                    />
                                                    <Text style={styles.proposerText}>
                                                        Proposed by @{proposer?.username ?? proposer?.display_name ?? 'member'}
                                                    </Text>
                                                </View>
                                            </View>
                                            {canDelete && (
                                                <TouchableOpacity
                                                    style={styles.iconBtn}
                                                    activeOpacity={0.75}
                                                    disabled={busyDateId === date.id}
                                                    onPress={() => handleDelete(date.id)}
                                                >
                                                    <Trash2 size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <View style={styles.voteSummary}>
                                            <Text style={styles.voteSummaryText}>
                                                {date.vote_count} of {date.member_count || members.length || 1} members available
                                            </Text>
                                            <View style={styles.yesAvatarRow}>
                                                {yesVotes.slice(0, 5).map((vote) => (
                                                    <AvatarBubble
                                                        key={vote.user_id}
                                                        name={vote.display_name}
                                                        color={vote.avatar_color ?? undefined}
                                                        avatarUrl={vote.avatar_url ?? undefined}
                                                        size={28}
                                                        status="yes"
                                                        onPress={vote.user_id !== myId ? () => setProfileUserId(vote.user_id) : undefined}
                                                    />
                                                ))}
                                                {yesVotes.length === 0 && <Text style={styles.noVotesText}>No yes votes yet</Text>}
                                            </View>
                                        </View>

                                        <View style={styles.actionRow}>
                                            <TouchableOpacity
                                                style={[styles.voteBtn, date.my_vote === true && styles.voteBtnYesActive]}
                                                activeOpacity={0.82}
                                                disabled={busyDateId === date.id}
                                                onPress={() => handleVote(date.id, true)}
                                            >
                                                <Check size={16} color={date.my_vote === true ? 'white' : colors.success} />
                                                <Text style={[styles.voteBtnText, date.my_vote === true && styles.voteBtnTextActive]}>
                                                    Works for me
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.voteBtn, styles.voteBtnNo, date.my_vote === false && styles.voteBtnNoActive]}
                                                activeOpacity={0.82}
                                                disabled={busyDateId === date.id}
                                                onPress={() => handleVote(date.id, false)}
                                            >
                                                <X size={16} color={date.my_vote === false ? 'white' : colors.danger} />
                                                <Text style={[styles.voteBtnText, styles.voteBtnNoText, date.my_vote === false && styles.voteBtnTextActive]}>
                                                    Can't make it
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {showLock && (
                                            <TouchableOpacity
                                                style={styles.lockBtn}
                                                activeOpacity={0.85}
                                                disabled={busyDateId === date.id}
                                                onPress={() => handleLock(date.id)}
                                            >
                                                <Lock size={16} color="white" />
                                                <Text style={styles.lockBtnText}>Set as date</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                        </Animated.View>
                    </ScrollView>
                )}
            </SafeAreaView>

            {toast && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            <UserProfileSheet
                userId={profileUserId}
                visible={profileUserId !== null}
                onClose={() => setProfileUserId(null)}
            />

            <CalendarModal
                visible={showCalendar}
                selectedDayKey={selectedDayKey}
                onSelect={setSelectedDayKey}
                onClose={() => setShowCalendar(false)}
                colors={colors}
            />
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 24,
            paddingTop: 8,
        },
        headerBtn: { padding: 8 },
        headerTitle: { ...typography.h3, color: c.textPrimary },
        loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        content: { padding: 24, paddingBottom: 48, gap: 20 },
        section: {
            gap: 14,
        },
        sectionTitle: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 24 },
        sectionSub: { color: c.text60, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
        dayList: { gap: 10, paddingRight: 24 },
        dayCard: {
            width: 76,
            height: 104,
            borderRadius: radii.lg,
            padding: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        dayCellSelected: { transform: [{ scale: 1.04 }], borderColor: 'transparent' },
        dayLabel: { color: c.text60, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 4 },
        monthLabel: { color: c.text60, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 2 },
        dateLabel: { color: c.textPrimary, fontSize: 20, fontFamily: 'Inter_900Black' },
        proposedCount: { color: c.text40, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
        calendarLink: { alignSelf: 'flex-start', paddingVertical: 2 },
        calendarLinkText: { color: c.primaryAlt, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
        timePanel: {
            padding: 16,
            borderRadius: radii.lg,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            gap: 14,
        },
        timeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        timeTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 },
        segmentedSwitch: {
            flexDirection: 'row',
            backgroundColor: c.glassStrong,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
            overflow: 'hidden',
        },
        segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
        segmentBtnActive: { backgroundColor: 'rgba(108,62,244,0.30)' },
        segmentText: { color: c.text60, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
        segmentTextActive: { color: c.textPrimary },
        timeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
        timeSlot: { paddingVertical: 14, borderRadius: radii.md, alignItems: 'center' },
        timeSlotUnselected: {
            paddingVertical: 14,
            borderRadius: radii.md,
            alignItems: 'center',
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        timeText: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14 },
        timeTextSelected: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
        customTimePicker: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
        stepperGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.glass,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: c.glassBorder,
            overflow: 'hidden',
        },
        stepBtn: {
            width: 38,
            height: 50,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.glassStrong,
        },
        stepBtnText: { color: c.textPrimary, fontSize: 20, fontFamily: 'Inter_500Medium', lineHeight: 22 },
        stepValue: {
            width: 42,
            textAlign: 'center',
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 19,
        },
        timeSep: { color: c.textPrimary, fontSize: 22, fontFamily: 'Inter_700Bold' },
        ampmToggle: { borderRadius: radii.md, overflow: 'hidden' },
        ampmGradient: { paddingHorizontal: 18, height: 50, alignItems: 'center', justifyContent: 'center' },
        ampmText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 },
        selectedLabel: { color: c.text60, fontSize: 13, textAlign: 'center', fontFamily: 'Inter_500Medium' },
        lockedCard: {
            padding: 20,
            borderRadius: radii.lg,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            gap: 10,
        },
        lockedIcon: {
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: c.success,
            alignItems: 'center',
            justifyContent: 'center',
        },
        lockedKicker: { color: c.success, fontFamily: 'Inter_700Bold', fontSize: 14 },
        lockedTitle: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 24, lineHeight: 30 },
        calendarBtn: {
            marginTop: 6,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.primary,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 999,
        },
        calendarBtnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
        emptyState: {
            padding: 18,
            borderRadius: radii.lg,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
        },
        emptyTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 4 },
        emptyText: { color: c.text60, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
        dateCard: {
            padding: 16,
            borderRadius: radii.lg,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.glassBorder,
            gap: 14,
        },
        dateCardLocked: {
            borderColor: c.success,
            backgroundColor: c.successDim,
        },
        dateTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
        dateTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 24 },
        proposerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
        proposerText: { color: c.text60, fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1 },
        iconBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.dangerDim,
        },
        voteSummary: {
            padding: 12,
            borderRadius: radii.md,
            backgroundColor: c.glassStrong,
            gap: 10,
        },
        voteSummaryText: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14 },
        yesAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30 },
        noVotesText: { color: c.text40, fontFamily: 'Inter_500Medium', fontSize: 13 },
        actionRow: { flexDirection: 'row', gap: 10 },
        voteBtn: {
            flex: 1,
            minHeight: 44,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: c.success,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingHorizontal: 10,
        },
        voteBtnYesActive: { backgroundColor: c.success },
        voteBtnNo: { borderColor: c.danger },
        voteBtnNoActive: { backgroundColor: c.danger },
        voteBtnText: { color: c.success, fontFamily: 'Inter_700Bold', fontSize: 13 },
        voteBtnNoText: { color: c.danger },
        voteBtnTextActive: { color: 'white' },
        lockBtn: {
            minHeight: 44,
            borderRadius: 999,
            backgroundColor: c.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
        },
        lockBtnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
        toast: {
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 26,
            backgroundColor: 'rgba(0,0,0,0.82)',
            borderRadius: 999,
            paddingVertical: 12,
            paddingHorizontal: 18,
            alignItems: 'center',
        },
        toastText: { color: 'white', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
    });
}

function makeCalStyles(c: AppColors) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: c.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: c.glassBorder,
            paddingHorizontal: 16,
            paddingBottom: 32,
        },
        calHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 20,
        },
        calTitle: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 18 },
        closeBtn: {
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: c.glass,
            alignItems: 'center', justifyContent: 'center',
        },
        monthNav: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
        },
        navBtn: {
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: c.glass,
            alignItems: 'center', justifyContent: 'center',
        },
        monthLabel: { color: c.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 17 },
        dowRow: { flexDirection: 'row', marginBottom: 8 },
        dowLabel: {
            flex: 1,
            textAlign: 'center',
            color: c.text40,
            fontFamily: 'Inter_500Medium',
            fontSize: 12,
        },
        grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
        cell: {
            width: `${100 / 7}%` as any,
            height: CAL_CELL_H,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cellCircle: {
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
        },
        todayCircle: { borderWidth: 1, borderColor: c.primary },
        dayNum: {
            color: c.textPrimary,
            fontFamily: 'Inter_500Medium',
            fontSize: 15,
        },
    });
}
