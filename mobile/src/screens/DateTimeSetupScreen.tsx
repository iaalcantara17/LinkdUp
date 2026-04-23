import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { ArrowLeft, Check, ArrowRight, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import AvatarBubble from '../components/AvatarBubble';
import UserProfileSheet from '../components/UserProfileSheet';
import { api } from '../services/api';
import { colors, typography, radii } from '../theme';

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = { id: string; name: string; color?: string; avatarUrl?: string; confirmed: boolean };

type DateOption = {
    id: string;
    starts_at: string;
    ends_at: string;
    yes_count?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayKeyFromIso(iso: string) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function todayKey() {
    return dayKeyFromIso(new Date().toISOString());
}

// Quick-pick times: [displayLabel, 24h hour, minute]
const QUICK_TIMES: Array<[string, number, number]> = [
    ['10:00 AM', 10, 0],
    ['12:00 PM', 12, 0],
    ['2:00 PM',  14, 0],
    ['5:00 PM',  17, 0],
    ['7:00 PM',  19, 0],
    ['9:00 PM',  21, 0],
];

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
        if (customAmPm === 'AM') {
            h = customHour === 12 ? 0 : customHour;
        } else {
            h = customHour === 12 ? 12 : customHour + 12;
        }
        m = customMinute;
    }
    return `${dayKey}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function formatSelectedDatetime(dayKey: string, isoHint: string) {
    return new Date(isoHint).toLocaleString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ── Calendar grid helpers ─────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function firstWeekdayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay(); // 0=Sun
}

const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const DAY_INITIALS = ['S','M','T','W','T','F','S'];

// ── Calendar Modal ────────────────────────────────────────────────────────────

interface CalendarModalProps {
    visible: boolean;
    selectedDayKey: string | null;
    onSelect: (dayKey: string) => void;
    onClose: () => void;
}

// Cell height is fixed so the grid is always exactly 6 rows regardless of the month.
const CAL_CELL_H = 46;
const CAL_GRID_H = CAL_CELL_H * 6;

type CalCell =
    | { type: 'current'; day: number }
    | { type: 'prev'; day: number }
    | { type: 'next'; day: number };

function buildCalendarCells(year: number, month: number): CalCell[] {
    const totalDays = daysInMonth(year, month);
    const offset    = firstWeekdayOfMonth(year, month);
    const prevYear  = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevTotal = daysInMonth(prevYear, prevMonth);

    const cells: CalCell[] = [];
    // Leading padding — last N days of previous month
    for (let i = offset - 1; i >= 0; i--) {
        cells.push({ type: 'prev', day: prevTotal - i });
    }
    // Current month
    for (let d = 1; d <= totalDays; d++) {
        cells.push({ type: 'current', day: d });
    }
    // Trailing padding — next-month days until we hit exactly 42 cells (6 rows)
    let nextDay = 1;
    while (cells.length < 42) {
        cells.push({ type: 'next', day: nextDay++ });
    }
    return cells;
}

function CalendarModal({ visible, selectedDayKey, onSelect, onClose }: CalendarModalProps) {
    const today = new Date();
    const [year, setYear]   = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());

    const todayStr = dayKeyFromIso(today.toISOString());

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }
    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }

    const cells = buildCalendarCells(year, month);

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

    function isPast(key: string) { return key < todayStr; }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={calStyles.overlay}>
                <SafeAreaView style={calStyles.sheet} edges={['bottom']}>
                    {/* Header */}
                    <View style={calStyles.calHeader}>
                        <TouchableOpacity onPress={onClose} style={calStyles.closeBtn}>
                            <X size={20} color="white" />
                        </TouchableOpacity>
                        <Text style={calStyles.calTitle}>Pick a Date</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    {/* Month nav */}
                    <View style={calStyles.monthNav}>
                        <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn}>
                            <ChevronLeft size={20} color="white" />
                        </TouchableOpacity>
                        <Text style={calStyles.monthLabel}>
                            {MONTH_NAMES[month]} {year}
                        </Text>
                        <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn}>
                            <ChevronRight size={20} color="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Day-of-week row */}
                    <View style={calStyles.dowRow}>
                        {DAY_INITIALS.map((d, i) => (
                            <Text key={i} style={calStyles.dowLabel}>{d}</Text>
                        ))}
                    </View>

                    {/* Fixed-height grid — always exactly 6 rows, no layout bounce */}
                    <View style={[calStyles.grid, { height: CAL_GRID_H }]}>
                        {cells.map((cell, i) => {
                            const key        = cellKey(cell.type, cell.day);
                            const isCurrent  = cell.type === 'current';
                            const isSelected = isCurrent && key === selectedDayKey;
                            const isToday    = isCurrent && key === todayStr;
                            const past       = isPast(key);
                            // Padding cells (prev/next month) are greyed out and non-interactive
                            const disabled   = !isCurrent || past;

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
                                            { backgroundColor: 'transparent' },
                                            (disabled) && { opacity: 0.25 },
                                        ]}>
                                            <Text style={[calStyles.dayNum, (past && isCurrent) && { color: colors.text30 }]}>
                                                {cell.day}
                                            </Text>
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

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DateTimeSetupScreen() {
    const nav     = useNavigation<any>();
    const route   = useRoute<any>();
    const partyId: string = route.params?.partyId ?? 'demo';

    const [dateOptions, setDateOptions]       = useState<DateOption[]>([]);
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const [loading, setLoading]               = useState(false);
    const [members, setMembers]               = useState<Member[]>([]);
    const [myId, setMyId]                     = useState<string | null>(null);
    const [profileUserId, setProfileUserId]   = useState<string | null>(null);

    // Calendar modal
    const [showCalendar, setShowCalendar]     = useState(false);

    // Time picker
    const [timeMode, setTimeMode]     = useState<'quick' | 'custom'>('quick');
    const [quickIdx, setQuickIdx]     = useState<number | null>(null);
    const [customHour, setCustomHour] = useState(7);
    const [customMin, setCustomMin]   = useState(0);
    const [customAmPm, setCustomAmPm] = useState<'AM' | 'PM'>('PM');

    // Fetch dates from backend
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await api.generateDates(partyId);
                const dates = (await api.getDates(partyId)) as DateOption[];
                if (!cancelled) setDateOptions(Array.isArray(dates) ? dates : []);
            } catch {
                if (!cancelled) setDateOptions([]);
            }
        })();
        return () => { cancelled = true; };
    }, [partyId]);

    // Fetch members
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [rawMembers, me] = await Promise.all([
                    api.getMembers(partyId).catch(() => []),
                    api.me().catch(() => null),
                ]);
                if (!cancelled && Array.isArray(rawMembers) && rawMembers.length > 0) {
                    if (me?.id) setMyId(me.id);
                    setMembers(
                        rawMembers.map((m: any) => ({
                            id: m.user_id,
                            name: m.user_id === me?.id ? 'You' : (m.users?.display_name ?? '?'),
                            color: m.users?.avatar_color,
                            avatarUrl: m.users?.avatar_url ?? undefined,
                            confirmed: false,
                        }))
                    );
                }
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [partyId]);

    // Group options by day for the horizontal strip
    const days = useMemo(() => {
        const grouped = new Map<string, { key: string; date: Date; options: DateOption[]; available: number }>();
        for (const opt of dateOptions) {
            const key = dayKeyFromIso(opt.starts_at);
            const existing = grouped.get(key);
            if (existing) {
                existing.options.push(opt);
            } else {
                grouped.set(key, { key, date: new Date(opt.starts_at), options: [opt], available: 0 });
            }
        }
        const totalMembers = Math.max(1, members.length);
        return Array.from(grouped.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map((d) => {
                const maxYes = Math.max(0, ...d.options.map((o) => o.yes_count ?? 0));
                return {
                    ...d,
                    options: d.options.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
                    available: Math.min(totalMembers, maxYes),
                };
            });
    }, [dateOptions, members.length]);

    // If selectedDayKey is set but not in days, add a virtual day entry so the
    // strip can show it as selected.
    const allDays = useMemo(() => {
        if (!selectedDayKey || days.some(d => d.key === selectedDayKey)) return days;
        const [y, mo, da] = selectedDayKey.split('-').map(Number);
        const d = new Date(y, mo - 1, da, 12, 0, 0);
        return [...days, { key: selectedDayKey, date: d, options: [], available: 0 }]
            .sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [days, selectedDayKey]);

    // Derived: is a time chosen?
    const timeChosen = timeMode === 'custom' || quickIdx !== null;

    // Full ISO string for the chosen day+time (used for display and Lock It In)
    const isoDatetime = useMemo(() => {
        if (!selectedDayKey || !timeChosen) return null;
        return buildIsoDatetime(selectedDayKey, timeMode, quickIdx, customHour, customMin, customAmPm);
    }, [selectedDayKey, timeChosen, timeMode, quickIdx, customHour, customMin, customAmPm]);

    // Handler for when user picks a date from the calendar modal
    const handleCalendarSelect = (dayKey: string) => {
        setSelectedDayKey(dayKey);
        setQuickIdx(null); // reset time selection when date changes
    };

    const handleLockIn = async () => {
        if (!selectedDayKey || !isoDatetime) return;
        setLoading(true);
        try {
            // Find existing party_date matching the exact ISO datetime, or create one
            const normalised = new Date(isoDatetime).toISOString();
            let optionId = dateOptions.find(o => new Date(o.starts_at).toISOString() === normalised)?.id ?? null;

            if (!optionId) {
                const created = await api.createCustomDate(partyId, normalised);
                optionId = created.id;
                // Merge into local state so getDates reflects it
                setDateOptions(prev => [...prev, { id: created.id, starts_at: created.starts_at, ends_at: created.ends_at, yes_count: 0 }]);
            }

            await api.voteDates(partyId, [optionId]).catch(() => {});
            await api.lockDate(partyId, optionId).catch(() => {});
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

                <ScrollView
                    contentContainerStyle={{ padding: 24, paddingBottom: 140 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View entering={FadeInDown.duration(400)}>
                        <Text style={styles.title}>When works for everyone?</Text>
                        <Text style={styles.subtitle}>Pick a day and time when your crew is available</Text>

                        {/* ── Horizontal 30-day strip ─────────────────────── */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.dayList}
                        >
                            {allDays.map((d, i) => {
                                const isSelected  = selectedDayKey === d.key;
                                const dayAbbrev   = d.date.toLocaleDateString(undefined, { weekday: 'short' });
                                const monthAbbrev = d.date.toLocaleDateString(undefined, { month: 'short' });
                                const dateNum     = d.date.getDate();

                                return (
                                    <Animated.View key={d.key} entering={FadeInDown.delay(i * 20).duration(300)}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setSelectedDayKey(d.key);
                                                setQuickIdx(null);
                                            }}
                                            activeOpacity={0.85}
                                        >
                                            {isSelected ? (
                                                <LinearGradient
                                                    colors={colors.gradient as any}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={[styles.dayCard, styles.dayCellSelected]}
                                                >
                                                    <Text style={[styles.dayLabel, { color: 'white' }]}>{dayAbbrev}</Text>
                                                    <Text style={[styles.monthLabel, { color: 'white' }]}>{monthAbbrev}</Text>
                                                    <Text style={[styles.dateLabel, { color: 'white' }]}>{dateNum}</Text>
                                                    <View style={styles.availRow}>
                                                        {Array.from({ length: Math.max(1, members.length) }).map((_, j) => (
                                                            <View
                                                                key={j}
                                                                style={[
                                                                    styles.availDot,
                                                                    { backgroundColor: j < d.available ? 'white' : 'rgba(255,255,255,0.3)' },
                                                                ]}
                                                            />
                                                        ))}
                                                    </View>
                                                </LinearGradient>
                                            ) : (
                                                <View style={styles.dayCard}>
                                                    <Text style={styles.dayLabel}>{dayAbbrev}</Text>
                                                    <Text style={styles.monthLabel}>{monthAbbrev}</Text>
                                                    <Text style={styles.dateLabel}>{dateNum}</Text>
                                                    <View style={styles.availRow}>
                                                        {Array.from({ length: Math.max(1, members.length) }).map((_, j) => (
                                                            <View
                                                                key={j}
                                                                style={[
                                                                    styles.availDot,
                                                                    { backgroundColor: j < d.available ? colors.success : 'rgba(255,255,255,0.2)' },
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
                        </ScrollView>

                        {/* "Pick a specific date" link */}
                        <TouchableOpacity
                            onPress={() => setShowCalendar(true)}
                            activeOpacity={0.75}
                            style={styles.calendarLink}
                        >
                            <Text style={styles.calendarLinkText}>Pick a specific date →</Text>
                        </TouchableOpacity>

                        {/* ── Time picker (shown once a day is selected) ─── */}
                        {selectedDayKey !== null && (
                            <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 24 }}>
                                <View style={styles.timeHeader}>
                                    <Clock size={18} color={colors.primary} />
                                    <Text style={styles.timeTitle}>Select a time</Text>
                                </View>

                                {/* Segmented switch: Quick | Custom */}
                                <View style={styles.segmentedSwitch}>
                                    {(['quick', 'custom'] as const).map((mode) => (
                                        <TouchableOpacity
                                            key={mode}
                                            style={[
                                                styles.segmentBtn,
                                                timeMode === mode && styles.segmentBtnActive,
                                            ]}
                                            activeOpacity={0.8}
                                            onPress={() => setTimeMode(mode)}
                                        >
                                            <Text style={[
                                                styles.segmentText,
                                                timeMode === mode && styles.segmentTextActive,
                                            ]}>
                                                {mode === 'quick' ? 'Quick' : 'Custom'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {timeMode === 'quick' ? (
                                    /* 6 quick chips in 2-column grid */
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
                                    /* Custom time: Hour : Minute  AM/PM */
                                    <View style={styles.customTimePicker}>
                                        {/* Hour stepper (1-12) */}
                                        <View style={styles.stepperGroup}>
                                            <TouchableOpacity
                                                style={styles.stepBtn}
                                                onPress={() => setCustomHour(h => h === 1 ? 12 : h - 1)}
                                            >
                                                <Text style={styles.stepBtnText}>−</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.stepValue}>{String(customHour).padStart(2, '0')}</Text>
                                            <TouchableOpacity
                                                style={styles.stepBtn}
                                                onPress={() => setCustomHour(h => h === 12 ? 1 : h + 1)}
                                            >
                                                <Text style={styles.stepBtnText}>+</Text>
                                            </TouchableOpacity>
                                        </View>

                                        <Text style={styles.timeSep}>:</Text>

                                        {/* Minute selector: 00 / 15 / 30 / 45 */}
                                        <View style={styles.stepperGroup}>
                                            <TouchableOpacity
                                                style={styles.stepBtn}
                                                onPress={() => setCustomMin(m => m === 0 ? 45 : m - 15)}
                                            >
                                                <Text style={styles.stepBtnText}>−</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.stepValue}>{String(customMin).padStart(2, '0')}</Text>
                                            <TouchableOpacity
                                                style={styles.stepBtn}
                                                onPress={() => setCustomMin(m => m === 45 ? 0 : m + 15)}
                                            >
                                                <Text style={styles.stepBtnText}>+</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* AM / PM toggle */}
                                        <TouchableOpacity
                                            style={styles.ampmToggle}
                                            activeOpacity={0.8}
                                            onPress={() => setCustomAmPm(v => v === 'AM' ? 'PM' : 'AM')}
                                        >
                                            <LinearGradient
                                                colors={colors.gradient as any}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.ampmGradient}
                                            >
                                                <Text style={styles.ampmText}>{customAmPm}</Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </Animated.View>
                        )}

                        {/* ── Who's confirmed ──────────────────────────────── */}
                        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.confirmedCard}>
                            <Text style={styles.confirmedLabel}>Who's confirmed</Text>
                            {members.map((member, i) => {
                                const isConfirmed = member.confirmed ||
                                    (member.name === 'You' && !!selectedDayKey && timeChosen);
                                return (
                                    <Animated.View
                                        key={member.id}
                                        entering={FadeInLeft.delay(400 + i * 50).duration(300)}
                                        style={styles.confirmedRow}
                                    >
                                        <AvatarBubble
                                            name={member.name}
                                            color={member.color}
                                            avatarUrl={member.avatarUrl}
                                            size={40}
                                            onPress={member.id !== myId ? () => setProfileUserId(member.id) : undefined}
                                        />
                                        <Text style={styles.confirmedName}>{member.name}</Text>
                                        {isConfirmed ? (
                                            <View style={styles.confirmedCheck}>
                                                <Check size={14} color="white" />
                                            </View>
                                        ) : (
                                            <View style={styles.confirmedUnchecked} />
                                        )}
                                    </Animated.View>
                                );
                            })}
                        </Animated.View>
                    </Animated.View>
                </ScrollView>

                {/* ── Bottom CTA ──────────────────────────────────────────── */}
                <LinearGradient
                    colors={['transparent', colors.bg, colors.bg]}
                    style={styles.bottomFade}
                    pointerEvents="box-none"
                >
                    <GradientButton
                        title="Lock It In"
                        onPress={handleLockIn}
                        disabled={!selectedDayKey || !timeChosen}
                        loading={loading}
                        rightIcon={<ArrowRight size={20} color="white" />}
                    />
                    {isoDatetime && (
                        <Text style={styles.selectedLabel}>
                            {formatSelectedDatetime(selectedDayKey!, isoDatetime)}
                        </Text>
                    )}
                </LinearGradient>
            </SafeAreaView>

            <UserProfileSheet
                userId={profileUserId}
                visible={profileUserId !== null}
                onClose={() => setProfileUserId(null)}
            />

            {/* ── Calendar Modal ───────────────────────────────────────────── */}
            <CalendarModal
                visible={showCalendar}
                selectedDayKey={selectedDayKey}
                onSelect={handleCalendarSelect}
                onClose={() => setShowCalendar(false)}
            />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 8,
    },
    headerTitle: { ...typography.h3, color: 'white' },

    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 26, marginBottom: 6 },
    subtitle: { color: colors.text60, fontSize: 14, marginBottom: 20, fontFamily: 'Inter_400Regular' },

    dayList: { gap: 10, paddingRight: 24 },
    dayCard: {
        width: 72,
        height: 96,
        borderRadius: radii.lg,
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    dayCellSelected: { transform: [{ scale: 1.05 }], borderColor: 'transparent' },
    dayLabel: { color: colors.text60, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 4 },
    monthLabel: { color: colors.text60, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 2 },
    dateLabel: { color: 'white', fontSize: 18, fontFamily: 'Inter_900Black' },
    availRow: { flexDirection: 'row', gap: 2, marginTop: 6 },
    availDot: { width: 4, height: 4, borderRadius: 2 },

    calendarLink: { marginTop: 14, alignSelf: 'flex-start', paddingVertical: 4 },
    calendarLinkText: { color: colors.primaryAlt, fontFamily: 'Inter_500Medium', fontSize: 13 },

    timeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    timeTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },

    segmentedSwitch: {
        flexDirection: 'row',
        backgroundColor: colors.glass,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        marginBottom: 16,
        overflow: 'hidden',
    },
    segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: 'rgba(108,62,244,0.30)' },
    segmentText: { color: colors.text60, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    segmentTextActive: { color: 'white' },

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

    /* Custom time stepper */
    customTimePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
    },
    stepperGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.glass,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
    },
    stepBtn: {
        width: 40,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    stepBtnText: { color: 'white', fontSize: 20, fontFamily: 'Inter_300Light', lineHeight: 24 },
    stepValue: {
        width: 42,
        textAlign: 'center',
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 20,
    },
    timeSep: { color: 'white', fontSize: 22, fontFamily: 'Inter_700Bold' },
    ampmToggle: { borderRadius: radii.md, overflow: 'hidden' },
    ampmGradient: { paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    ampmText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 },

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
    confirmedName: { color: 'white', flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
    confirmedCheck: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: colors.success,
        alignItems: 'center', justifyContent: 'center',
    },
    confirmedUnchecked: {
        width: 24, height: 24, borderRadius: 12,
        borderWidth: 2, borderColor: colors.text30,
    },

    bottomFade: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 32,
    },
    selectedLabel: {
        color: colors.text60,
        fontSize: 13,
        textAlign: 'center',
        marginTop: 12,
        fontFamily: 'Inter_500Medium',
    },
});

// ── Calendar modal styles ─────────────────────────────────────────────────────

const calStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0A0A0F',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 20,
    },
    calTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18 },
    closeBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    monthLabel: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 17 },
    dowRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    dowLabel: {
        flex: 1,
        textAlign: 'center',
        color: colors.text40,
        fontFamily: 'Inter_500Medium',
        fontSize: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        overflow: 'hidden',
    },
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
    todayCircle: {
        borderWidth: 1,
        borderColor: colors.primary,
    },
    dayNum: {
        color: 'white',
        fontFamily: 'Inter_500Medium',
        fontSize: 15,
    },
});
