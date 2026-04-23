import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Image, Modal, RefreshControl, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    MapPin, Star, Users, X, Heart, DollarSign, Compass,
    ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import BottomNav from '../components/BottomNav';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { colors, radii } from '../theme';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoverVenue {
    google_place_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    photo_url: string | null;
    rating: number | null;
    user_ratings_total: number | null;
    category: string | null;
    price_level: number | null;
    distance_miles: number;
}

interface DiscoverLike {
    id: string;
    google_place_id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    photo_url: string | null;
    rating: number | null;
    category: string | null;
    price_level: number | null;
    liked_at: string;
}

interface DiscoverParty {
    id: string;
    name: string | null;
    code: string;
    status: 'waiting' | 'swiping';
    member_count: number;
    host_display_name: string;
    miles_away: number;
    friends_inside?: boolean;
}

// ── Session-level cache (persists across navigations) ─────────────────────────

let _venueCache: DiscoverVenue[] | null = null;
let _partyCache: DiscoverParty[] | null = null;
let _cacheLat: number | null = null;
let _cacheLng: number | null = null;

function isCacheStale(lat: number, lng: number): boolean {
    if (_venueCache === null || _partyCache === null) return true;
    if (_cacheLat === null || _cacheLng === null) return true;
    return Math.abs(lat - _cacheLat) > 0.1 || Math.abs(lng - _cacheLng) > 0.1;
}

// ── Helper components ─────────────────────────────────────────────────────────

function PriceLevel({ level }: { level: number | null }) {
    if (level === null || level === 0) return null;
    const filled = level;
    const empty = 4 - level;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            {Array.from({ length: filled }).map((_, i) => (
                <DollarSign key={`f-${i}`} size={11} color={colors.success} />
            ))}
            {Array.from({ length: empty }).map((_, i) => (
                <DollarSign key={`e-${i}`} size={11} color={colors.text30} />
            ))}
        </View>
    );
}

// ── Venue detail modal ────────────────────────────────────────────────────────

function VenueDetailModal({ venue, onClose }: { venue: DiscoverVenue | null; onClose: () => void }) {
    const [pitch, setPitch] = useState<string | null>(null);
    const [pitchLoading, setPitchLoading] = useState(false);

    // Reset pitch state whenever venue changes
    useEffect(() => {
        setPitch(null);
        setPitchLoading(false);
    }, [venue?.google_place_id]);

    const fetchPitch = async () => {
        if (!venue || pitchLoading) return;
        setPitchLoading(true);
        try {
            const result = await api.getDiscoverPitch({
                name: venue.name,
                category: venue.category,
                rating: venue.rating,
                price_level: venue.price_level,
                address: venue.address,
                user_ratings_total: venue.user_ratings_total,
            });
            setPitch(result.pitch);
        } catch {
            setPitch("Looks like a solid pick — check the photos and see if the vibe matches!");
        } finally {
            setPitchLoading(false);
        }
    };

    if (!venue) return null;
    return (
        <Modal visible={!!venue} transparent animationType="slide" onRequestClose={onClose}>
            <View style={modalStyles.overlay}>
                <SafeAreaView style={modalStyles.sheet} edges={['bottom']}>
                    {venue.photo_url ? (
                        <Image source={{ uri: venue.photo_url }} style={modalStyles.photo} />
                    ) : (
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={modalStyles.photoFallback}
                        >
                            <Compass size={48} color="white" />
                        </LinearGradient>
                    )}

                    <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                        <X size={18} color="white" />
                    </TouchableOpacity>

                    <View style={modalStyles.body}>
                        {venue.category ? (
                            <Text style={modalStyles.category}>{venue.category}</Text>
                        ) : null}
                        <Text style={modalStyles.venueName}>{venue.name}</Text>

                        <View style={modalStyles.metaRow}>
                            {venue.rating !== null ? (
                                <View style={modalStyles.metaChip}>
                                    <Star size={13} color={colors.warning} fill={colors.warning} />
                                    <Text style={modalStyles.metaChipText}>
                                        {venue.rating.toFixed(1)}
                                        {venue.user_ratings_total ? ` (${venue.user_ratings_total.toLocaleString()})` : ''}
                                    </Text>
                                </View>
                            ) : null}
                            <View style={modalStyles.metaChip}>
                                <MapPin size={13} color={colors.text40} />
                                <Text style={modalStyles.metaChipText}>{venue.distance_miles} mi away</Text>
                            </View>
                            {venue.price_level !== null && venue.price_level > 0 ? (
                                <View style={modalStyles.metaChip}>
                                    <PriceLevel level={venue.price_level} />
                                </View>
                            ) : null}
                        </View>

                        <View style={modalStyles.addressRow}>
                            <MapPin size={14} color={colors.text40} style={{ marginTop: 2 }} />
                            <Text style={modalStyles.addressText}>{venue.address}</Text>
                        </View>

                        {/* ✨ Why this? AI pitch */}
                        {!pitch && !pitchLoading && (
                            <TouchableOpacity
                                style={modalStyles.pitchBtn}
                                onPress={fetchPitch}
                                activeOpacity={0.85}
                            >
                                <Text style={modalStyles.pitchBtnText}>✨ Why this?</Text>
                            </TouchableOpacity>
                        )}
                        {pitchLoading && (
                            <View style={{ marginTop: 14, alignItems: 'center' }}>
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        )}
                        {pitch && (
                            <View style={modalStyles.pitchBox}>
                                <Text style={modalStyles.pitchText}>{pitch}</Text>
                            </View>
                        )}
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

// ── Venue card (horizontal strip) ─────────────────────────────────────────────

function VenueCard({
    venue, onPress, liked, onLike,
}: {
    venue: DiscoverVenue;
    onPress: () => void;
    liked?: boolean;
    onLike?: () => void;
}) {
    return (
        <TouchableOpacity style={venueCardStyles.card} onPress={onPress} activeOpacity={0.85}>
            {venue.photo_url ? (
                <Image source={{ uri: venue.photo_url }} style={venueCardStyles.photo} />
            ) : (
                <LinearGradient
                    colors={colors.gradient as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={venueCardStyles.photo}
                >
                    <Compass size={32} color="white" />
                </LinearGradient>
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={venueCardStyles.overlay}>
                <Text style={venueCardStyles.name} numberOfLines={2}>{venue.name}</Text>
                <View style={venueCardStyles.metaRow}>
                    {venue.rating !== null ? (
                        <>
                            <Star size={12} color={colors.warning} fill={colors.warning} />
                            <Text style={venueCardStyles.metaText}>{venue.rating.toFixed(1)}</Text>
                            <Text style={venueCardStyles.dot}>•</Text>
                        </>
                    ) : null}
                    <MapPin size={11} color={colors.text60} />
                    <Text style={venueCardStyles.metaText}>{venue.distance_miles} mi</Text>
                </View>
            </LinearGradient>

            {onLike && (
                <TouchableOpacity
                    style={venueCardStyles.heartBtn}
                    onPress={(e) => { (e as any).stopPropagation?.(); onLike(); }}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <Heart
                        size={16}
                        color={liked ? colors.danger : 'white'}
                        fill={liked ? colors.danger : 'transparent'}
                    />
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}

// ── Liked venue card (Your Likes tab) ─────────────────────────────────────────

function LikedVenueCard({ venue, onUnlike }: { venue: DiscoverLike; onUnlike: () => void }) {
    return (
        <View style={likedCardStyles.card}>
            <View style={likedCardStyles.photoWrap}>
                {venue.photo_url ? (
                    <Image source={{ uri: venue.photo_url }} style={likedCardStyles.photo} />
                ) : (
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[likedCardStyles.photo, { alignItems: 'center', justifyContent: 'center' }]}
                    >
                        <Compass size={24} color="white" />
                    </LinearGradient>
                )}
                <TouchableOpacity
                    style={likedCardStyles.heartBtn}
                    onPress={onUnlike}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <Heart size={16} color={colors.danger} fill={colors.danger} />
                </TouchableOpacity>
            </View>
            <View style={likedCardStyles.info}>
                {venue.category ? (
                    <Text style={likedCardStyles.category}>{venue.category}</Text>
                ) : null}
                <Text style={likedCardStyles.name} numberOfLines={2}>{venue.name}</Text>
                <View style={likedCardStyles.metaRow}>
                    {venue.rating !== null ? (
                        <View style={likedCardStyles.metaItem}>
                            <Star size={12} color={colors.warning} fill={colors.warning} />
                            <Text style={likedCardStyles.metaText}>{Number(venue.rating).toFixed(1)}</Text>
                        </View>
                    ) : null}
                    {venue.address ? (
                        <View style={likedCardStyles.metaItem}>
                            <MapPin size={12} color={colors.text40} />
                            <Text style={likedCardStyles.metaText} numberOfLines={1}>{venue.address}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </View>
    );
}

// ── Party card (vertical list) ────────────────────────────────────────────────

function PartyCard({ party, onJoin, joining }: { party: DiscoverParty; onJoin: () => void; joining: boolean }) {
    const label = party.name ?? `${party.host_display_name}'s party`;
    const statusColor = party.status === 'swiping' ? colors.primary : colors.success;
    const statusLabel = party.status === 'swiping' ? 'SWIPING NOW' : 'OPEN';

    return (
        <Animated.View entering={FadeInDown.duration(350)}>
            <View style={partyCardStyles.card}>
                <View style={partyCardStyles.top}>
                    <View style={{ flex: 1 }}>
                        <Text style={partyCardStyles.name} numberOfLines={1}>{label}</Text>
                        <Text style={partyCardStyles.host}>by {party.host_display_name}</Text>
                        {party.friends_inside ? (
                            <View style={partyCardStyles.friendBadge}>
                                <Text style={partyCardStyles.friendBadgeText}>Friends inside</Text>
                            </View>
                        ) : null}
                    </View>
                    <View style={[partyCardStyles.statusBadge, { borderColor: statusColor }]}>
                        <Text style={[partyCardStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                </View>

                <View style={partyCardStyles.metaRow}>
                    <View style={partyCardStyles.metaItem}>
                        <Users size={13} color={colors.text40} />
                        <Text style={partyCardStyles.metaText}>
                            {party.member_count} {party.member_count === 1 ? 'member' : 'members'}
                        </Text>
                    </View>
                    <View style={partyCardStyles.metaItem}>
                        <MapPin size={13} color={colors.text40} />
                        <Text style={partyCardStyles.metaText}>{party.miles_away} mi away</Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={partyCardStyles.joinBtn}
                    onPress={onJoin}
                    activeOpacity={0.8}
                    disabled={joining}
                >
                    <LinearGradient
                        colors={colors.gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[partyCardStyles.joinGradient, joining && { opacity: 0.5 }]}
                    >
                        <Text style={partyCardStyles.joinText}>{joining ? 'Joining…' : 'Join'}</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
    const nav = useNavigation<any>();

    // Tab
    const [activeTab, setActiveTab] = useState<'explore' | 'likes'>('explore');

    // Explore data
    const [venues, setVenues] = useState<DiscoverVenue[]>([]);
    const [parties, setParties] = useState<DiscoverParty[]>([]);
    const [userLat, setUserLat] = useState<number | null>(null);
    const [userLng, setUserLng] = useState<number | null>(null);
    const [noLocation, setNoLocation] = useState(false);
    const [loadingVenues, setLoadingVenues] = useState(false);
    const [loadingParties, setLoadingParties] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [selectedVenue, setSelectedVenue] = useState<DiscoverVenue | null>(null);
    const [loadingMoreVenues, setLoadingMoreVenues] = useState(false);
    const [hasMoreVenues, setHasMoreVenues] = useState(true);
    const [featuredIndex, setFeaturedIndex] = useState(0);

    // Trending scroll (FIX 2)
    const trendingScrollRef = useRef<ScrollView>(null);
    const [trendingScrollX, setTrendingScrollX] = useState(0);

    // Personal likes (FIX 3 + 4)
    const [likedVenues, setLikedVenues] = useState<DiscoverLike[]>([]);
    const [likedPlaceIds, setLikedPlaceIds] = useState<Set<string>>(new Set());
    const [loadingLikes, setLoadingLikes] = useState(false);
    const likesLoadedRef = useRef(false);

    // ── Fetch likes ───────────────────────────────────────────────────────────

    const fetchLikes = useCallback(async (showSpinner = false) => {
        if (showSpinner) setLoadingLikes(true);
        try {
            const likes: DiscoverLike[] = await api.getDiscoverLikes();
            setLikedVenues(likes);
            const likedIds = new Set(likes.map((l) => l.google_place_id));
            setLikedPlaceIds(likedIds);
            setVenues((prev) => prev.filter((v) => !likedIds.has(v.google_place_id)));
            likesLoadedRef.current = true;
        } catch (e: any) {
            console.error('[discover] fetchLikes', e);
        } finally {
            setLoadingLikes(false);
        }
    }, []);

    // ── Load explore data ─────────────────────────────────────────────────────

    const load = useCallback(async (force = false) => {
        try {
            const me = await api.me().catch(() => null);
            const lat: number | null = me?.latitude ?? null;
            const lng: number | null = me?.longitude ?? null;

            if (lat === null || lng === null) {
                setNoLocation(true);
                return;
            }
            setUserLat(lat);
            setUserLng(lng);
            setNoLocation(false);

            if (!force && !isCacheStale(lat, lng)) {
                setVenues(_venueCache!);
                setParties(_partyCache!);
                return;
            }

            setLoadingVenues(true);
            setLoadingParties(true);

            const [likesList, venueData, partyData] = await Promise.allSettled([
                api.getDiscoverLikes(),
                api.discoverVenues(lat, lng),
                api.discoverParties(lat, lng),
            ]);

            const likes: DiscoverLike[] = likesList.status === 'fulfilled' ? likesList.value : [];
            const likedIds = new Set(likes.map((l) => l.google_place_id));
            setLikedVenues(likes);
            setLikedPlaceIds(likedIds);

            let v = venueData.status === 'fulfilled' ? venueData.value : [];
            v = v.filter((venue: DiscoverVenue) => !likedIds.has(venue.google_place_id));
            const p = partyData.status === 'fulfilled' ? partyData.value : [];

            _venueCache = v;
            _partyCache = p;
            _cacheLat = lat;
            _cacheLng = lng;

            // Auto-backfill: if user has liked everything in view, fetch one more page
            if (v.length === 0 && likedIds.size > 0) {
                try {
                    const more = await api.discoverMoreVenues(lat, lng, Array.from(likedIds));
                    const newVenues = more?.venues ?? [];
                    if (newVenues.length > 0) {
                        v = newVenues;
                        _venueCache = newVenues;
                    }
                } catch (e) {
                    console.error('[discover] auto-backfill failed', e);
                }
            }

            setVenues(v);
            setParties(p);
            setHasMoreVenues(true);
            setFeaturedIndex(0);
        } catch (e: any) {
            console.error('[discover]', e);
        } finally {
            setLoadingVenues(false);
            setLoadingParties(false);
        }
    }, []);

    useFocusEffect(useCallback(() => {
        load();
        fetchLikes(!likesLoadedRef.current);
    }, [load, fetchLikes]));

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (activeTab === 'likes') {
            await fetchLikes();
        } else {
            await load(true);
        }
        setRefreshing(false);
    }, [load, fetchLikes, activeTab]);

    // ── Like / unlike handlers ────────────────────────────────────────────────

    const handleLikeVenue = useCallback(async (venue: DiscoverVenue) => {
        const placeId = venue.google_place_id;
        setLikedPlaceIds((prev) => { const n = new Set(prev); n.add(placeId); return n; });
        setLikedVenues((prev) => {
            if (prev.some((l) => l.google_place_id === placeId)) return prev;
            const newLike: DiscoverLike = {
                id: placeId,
                google_place_id: placeId,
                name: venue.name,
                address: venue.address,
                latitude: venue.latitude,
                longitude: venue.longitude,
                photo_url: venue.photo_url,
                rating: venue.rating,
                category: venue.category,
                price_level: venue.price_level,
                liked_at: new Date().toISOString(),
            };
            return [newLike, ...prev];
        });
        setVenues((prev) => prev.filter((x) => x.google_place_id !== placeId));
        setFeaturedIndex(0);
        try {
            await api.likeDiscoverVenue({
                google_place_id: placeId,
                name: venue.name,
                address: venue.address,
                latitude: venue.latitude,
                longitude: venue.longitude,
                photo_url: venue.photo_url,
                rating: venue.rating,
                category: venue.category,
                price_level: venue.price_level,
            });
        } catch {
            setLikedPlaceIds((prev) => { const n = new Set(prev); n.delete(placeId); return n; });
            setLikedVenues((prev) => prev.filter((l) => l.google_place_id !== placeId));
            setVenues((prev) => [venue, ...prev]);
        }
    }, []);

    const handleUnlikeVenue = useCallback(async (placeId: string) => {
        const removed = likedVenues.find((l) => l.google_place_id === placeId);
        setLikedPlaceIds((prev) => { const n = new Set(prev); n.delete(placeId); return n; });
        setLikedVenues((prev) => prev.filter((l) => l.google_place_id !== placeId));
        try {
            await api.unlikeDiscoverVenue(placeId);
        } catch {
            if (removed) {
                setLikedPlaceIds((prev) => { const n = new Set(prev); n.add(placeId); return n; });
                setLikedVenues((prev) => [removed, ...prev]);
            }
        }
    }, [likedVenues]);

    // ── Load more venues ──────────────────────────────────────────────────────

    const handleLoadMoreVenues = useCallback(async () => {
        if (loadingMoreVenues || userLat === null || userLng === null) return;
        setLoadingMoreVenues(true);
        try {
            const excludeIds = [
                ...venues.map((v) => v.google_place_id),
                ...Array.from(likedPlaceIds),
            ];
            const result = await api.discoverMoreVenues(userLat, userLng, excludeIds);
            console.log('[discover load-more] api response:', result);
            const newVenues = result?.venues ?? [];
            if (newVenues.length > 0) {
                const existingIds = new Set(venues.map((v) => v.google_place_id));
                const fresh = newVenues.filter((v: any) => !existingIds.has(v.google_place_id));
                setVenues((prev) => [...prev, ...fresh]);
            }
            setHasMoreVenues(result?.hasMore ?? false);
        } catch (e: any) {
            console.error('[discover] load more venues', e);
        } finally {
            setLoadingMoreVenues(false);
        }
    }, [loadingMoreVenues, userLat, userLng, venues, likedPlaceIds]);

    const handleJoin = async (party: DiscoverParty) => {
        setJoiningId(party.id);
        try {
            const result = await api.joinParty(party.code);
            nav.navigate('PartyLobby', { partyId: result.party_id });
        } catch (e: any) {
            Alert.alert('Could not join', e?.message ?? 'Unknown error');
        } finally {
            setJoiningId(null);
        }
    };

    // ── Tab change (re-fetch likes on switch) ─────────────────────────────────

    const handleTabChange = (tab: 'explore' | 'likes') => {
        setActiveTab(tab);
        if (tab === 'likes') fetchLikes(likedVenues.length === 0);
    };

    // ── Trending scroll helpers (FIX 2 — web only) ───────────────────────────

    const scrollLeft = () => {
        const next = Math.max(0, trendingScrollX - 320);
        trendingScrollRef.current?.scrollTo({ x: next, animated: true });
    };

    const scrollRight = () => {
        trendingScrollRef.current?.scrollTo({ x: trendingScrollX + 320, animated: true });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                {/* ── Tab bar ───────────────────────────────────────────── */}
                <View style={styles.tabBar}>
                    <TouchableOpacity
                        style={[styles.tabPill, activeTab === 'explore' && styles.tabPillActive]}
                        onPress={() => handleTabChange('explore')}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabText, activeTab === 'explore' && styles.tabTextActive]}>
                            Explore
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabPill, activeTab === 'likes' && styles.tabPillActive]}
                        onPress={() => handleTabChange('likes')}
                        activeOpacity={0.8}
                    >
                        <Heart
                            size={13}
                            color={activeTab === 'likes' ? 'white' : colors.text60}
                            fill={activeTab === 'likes' ? 'white' : 'transparent'}
                            style={{ marginRight: 5 }}
                        />
                        <Text style={[styles.tabText, activeTab === 'likes' && styles.tabTextActive]}>
                            Your Likes
                        </Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="white"
                        />
                    }
                >
                    {/* ── EXPLORE TAB ─────────────────────────────────── */}
                    {activeTab === 'explore' && (
                        <>
                            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                                <Text style={styles.title}>Discover</Text>
                                <Text style={styles.subtitle}>Trending spots and parties near you</Text>
                            </Animated.View>

                            {/* No-location state */}
                            {noLocation && (
                                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.emptyCard}>
                                    <Text style={styles.emptyIcon}>📍</Text>
                                    <Text style={styles.emptyTitle}>Set your location first</Text>
                                    <Text style={styles.emptyBody}>
                                        We need your location to show trending spots and parties near you.
                                    </Text>
                                    <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                        <GradientButton
                                            title="Set Location"
                                            onPress={() => nav.navigate('LocationPermission')}
                                        />
                                    </View>
                                </Animated.View>
                            )}

                            {/* ── Section A: Trending venues ─────────────── */}
                            {!noLocation && (
                                <Animated.View entering={FadeInDown.delay(60).duration(400)}>
                                    <Text style={styles.sectionTitle}>Trending near you</Text>

                                    {loadingVenues ? (
                                        <View style={styles.loadingRow}>
                                            <ActivityIndicator color={colors.primary} />
                                            <Text style={styles.loadingText}>Finding nearby spots…</Text>
                                        </View>
                                    ) : venues.length === 0 ? (
                                        <View style={styles.inlineEmpty}>
                                            <Text style={styles.inlineEmptyText}>
                                                No spots found nearby. Try refreshing after setting a precise location.
                                            </Text>
                                        </View>
                                    ) : (
                                        <>
                                            {/* Web-only: featured card — show first unLiked venue */}
                                            {Platform.OS === 'web' && venues.filter(v => !likedPlaceIds.has(v.google_place_id))[featuredIndex] && (
                                                <View style={webCardStyles.wrapper}>
                                                    <TouchableOpacity
                                                        activeOpacity={0.9}
                                                        onPress={() => setSelectedVenue(venues[featuredIndex])}
                                                    >
                                                        {venues[featuredIndex].photo_url ? (
                                                            <Image
                                                                source={{ uri: venues[featuredIndex].photo_url! }}
                                                                style={webCardStyles.photo}
                                                            />
                                                        ) : (
                                                            <LinearGradient
                                                                colors={colors.gradient as any}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 1 }}
                                                                style={webCardStyles.photoFallback}
                                                            >
                                                                <Compass size={48} color="white" />
                                                            </LinearGradient>
                                                        )}
                                                        <LinearGradient
                                                            colors={['transparent', 'rgba(0,0,0,0.85)']}
                                                            style={webCardStyles.overlay}
                                                        >
                                                            <Text style={webCardStyles.name}>{venues[featuredIndex].name}</Text>
                                                            <View style={webCardStyles.meta}>
                                                                {venues[featuredIndex].rating !== null && (
                                                                    <>
                                                                        <Star size={13} color={colors.warning} fill={colors.warning} />
                                                                        <Text style={webCardStyles.metaText}>
                                                                            {venues[featuredIndex].rating!.toFixed(1)}
                                                                        </Text>
                                                                        <Text style={webCardStyles.dot}>•</Text>
                                                                    </>
                                                                )}
                                                                <MapPin size={12} color={colors.text60} />
                                                                <Text style={webCardStyles.metaText}>
                                                                    {venues[featuredIndex].distance_miles} mi
                                                                </Text>
                                                            </View>
                                                        </LinearGradient>
                                                    </TouchableOpacity>
                                                    {/* Skip / Like buttons */}
                                                    <View style={webCardStyles.buttons}>
                                                        <TouchableOpacity
                                                            style={webCardStyles.passBtn}
                                                            activeOpacity={0.85}
                                                            onPress={() => setFeaturedIndex((i) => Math.min(i + 1, venues.length - 1))}
                                                        >
                                                            <X size={24} color={colors.danger} />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            activeOpacity={0.85}
                                                            onPress={() => {
                                                                const v = venues[featuredIndex];
                                                                if (likedPlaceIds.has(v.google_place_id)) {
                                                                    handleUnlikeVenue(v.google_place_id);
                                                                } else {
                                                                    handleLikeVenue(v);
                                                                }
                                                            }}
                                                        >
                                                            <LinearGradient
                                                                colors={colors.gradient as any}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 1 }}
                                                                style={webCardStyles.likeBtn}
                                                            >
                                                                <Heart
                                                                    size={24}
                                                                    color="white"
                                                                    fill={likedPlaceIds.has(venues[featuredIndex]?.google_place_id) ? 'white' : 'transparent'}
                                                                />
                                                            </LinearGradient>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Horizontal scroll row with chevron buttons (web) */}
                                            <View style={styles.trendingScrollWrap}>
                                                {Platform.OS === 'web' && trendingScrollX > 10 && (
                                                    <TouchableOpacity
                                                        style={styles.chevronLeft}
                                                        onPress={scrollLeft}
                                                        activeOpacity={0.8}
                                                    >
                                                        <ChevronLeft size={20} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                                <ScrollView
                                                    ref={trendingScrollRef}
                                                    horizontal
                                                    showsHorizontalScrollIndicator={false}
                                                    contentContainerStyle={styles.venueRow}
                                                    onScroll={({ nativeEvent }) =>
                                                        setTrendingScrollX(nativeEvent.contentOffset.x)
                                                    }
                                                    scrollEventThrottle={16}
                                                >
                                                    {/* FIX 9B: filter already-liked venues from trending row */}
                                                    {venues.filter((v) => !likedPlaceIds.has(v.google_place_id)).map((v) => (
                                                        <VenueCard
                                                            key={v.google_place_id}
                                                            venue={v}
                                                            onPress={() => setSelectedVenue(v)}
                                                            liked={false}
                                                            onLike={() => handleLikeVenue(v)}
                                                        />
                                                    ))}
                                                    {hasMoreVenues && (
                                                        <TouchableOpacity
                                                            style={venueLoadMoreStyles.card}
                                                            onPress={handleLoadMoreVenues}
                                                            activeOpacity={0.8}
                                                            disabled={loadingMoreVenues}
                                                        >
                                                            {loadingMoreVenues ? (
                                                                <ActivityIndicator color="white" />
                                                            ) : (
                                                                <>
                                                                    <Text style={venueLoadMoreStyles.icon}>＋</Text>
                                                                    <Text style={venueLoadMoreStyles.label}>Load{'\n'}more</Text>
                                                                </>
                                                            )}
                                                        </TouchableOpacity>
                                                    )}
                                                </ScrollView>
                                                {Platform.OS === 'web' && (
                                                    <TouchableOpacity
                                                        style={styles.chevronRight}
                                                        onPress={scrollRight}
                                                        activeOpacity={0.8}
                                                    >
                                                        <ChevronRight size={20} color="white" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </>
                                    )}
                                </Animated.View>
                            )}

                            {/* ── Section B: Active parties nearby ─────────────── */}
                            {!noLocation && (
                                <Animated.View entering={FadeInDown.delay(120).duration(400)} style={{ marginTop: 32 }}>
                                    <Text style={styles.sectionTitle}>Active parties nearby</Text>

                                    {loadingParties ? (
                                        <View style={styles.loadingRow}>
                                            <ActivityIndicator color={colors.primary} />
                                            <Text style={styles.loadingText}>Looking for parties…</Text>
                                        </View>
                                    ) : parties.length === 0 ? (
                                        <View style={styles.emptyCard}>
                                            <Text style={styles.emptyIcon}>🎉</Text>
                                            <Text style={styles.emptyTitle}>No one's hanging out nearby yet</Text>
                                            <Text style={styles.emptyBody}>Be the first to start a party!</Text>
                                            <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                                <GradientButton
                                                    title="Start a Party"
                                                    onPress={() => nav.navigate('CreateParty')}
                                                />
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 12 }}>
                                            {parties.map((p) => (
                                                <PartyCard
                                                    key={p.id}
                                                    party={p}
                                                    onJoin={() => handleJoin(p)}
                                                    joining={joiningId === p.id}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </Animated.View>
                            )}
                        </>
                    )}

                    {/* ── YOUR LIKES TAB ──────────────────────────────── */}
                    {activeTab === 'likes' && (
                        <Animated.View entering={FadeInDown.duration(350)} style={{ paddingTop: 8 }}>
                            <Text style={styles.title}>Your Likes</Text>
                            <Text style={[styles.subtitle, { marginBottom: 24 }]}>
                                Venues you've saved from Explore
                            </Text>

                            {loadingLikes ? (
                                <View style={[styles.loadingRow, { justifyContent: 'center', paddingTop: 40 }]}>
                                    <ActivityIndicator color={colors.primary} />
                                    <Text style={styles.loadingText}>Loading your likes…</Text>
                                </View>
                            ) : likedVenues.length === 0 ? (
                                <View style={styles.emptyCard}>
                                    <Text style={styles.emptyIcon}>💛</Text>
                                    <Text style={styles.emptyTitle}>Nothing liked yet</Text>
                                    <Text style={styles.emptyBody}>
                                        Head to Explore and tap the heart on venues you want to save.
                                    </Text>
                                    <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
                                        <GradientButton
                                            title="Go to Explore"
                                            onPress={() => handleTabChange('explore')}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={{ gap: 12 }}>
                                    {likedVenues.map((like) => (
                                        <LikedVenueCard
                                            key={like.google_place_id}
                                            venue={like}
                                            onUnlike={() => handleUnlikeVenue(like.google_place_id)}
                                        />
                                    ))}
                                </View>
                            )}
                        </Animated.View>
                    )}
                </ScrollView>
            </SafeAreaView>

            <BottomNav />

            {/* Venue detail modal */}
            <VenueDetailModal
                venue={selectedVenue}
                onClose={() => setSelectedVenue(null)}
            />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: 24, paddingBottom: 140 },

    tabBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 8,
    },
    tabPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    tabPillActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    tabText: {
        color: colors.text60,
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
    },
    tabTextActive: { color: 'white' },

    header: { paddingTop: 8, paddingBottom: 24 },
    title: { color: 'white', fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 4 },
    subtitle: { color: colors.text60, fontSize: 14, fontFamily: 'Inter_400Regular' },

    sectionTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 18,
        marginBottom: 16,
    },

    venueRow: { gap: 12, paddingRight: 4 },

    // Trending scroll wrapper with room for absolute chevron buttons
    trendingScrollWrap: {
        position: 'relative',
    },
    chevronLeft: {
        position: 'absolute',
        left: 0,
        top: '50%',
        transform: [{ translateY: -20 }],
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronRight: {
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: [{ translateY: -20 }],
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 20,
    },
    loadingText: { color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 14 },

    inlineEmpty: {
        paddingVertical: 20,
        paddingHorizontal: 4,
    },
    inlineEmptyText: { color: colors.text40, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },

    emptyCard: {
        backgroundColor: colors.glass,
        borderRadius: radii.xl,
        padding: 28,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: 'center',
        marginTop: 8,
    },
    emptyIcon: { fontSize: 44, marginBottom: 14 },
    emptyTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 17,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyBody: {
        color: colors.text60,
        fontSize: 13,
        textAlign: 'center',
        fontFamily: 'Inter_400Regular',
        lineHeight: 19,
    },
});

const webCardStyles = StyleSheet.create({
    wrapper: { marginBottom: 20 },
    photo: {
        width: '100%',
        height: 220,
        borderRadius: radii.lg,
        resizeMode: 'cover',
    },
    photoFallback: {
        width: '100%',
        height: 220,
        borderRadius: radii.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        borderBottomLeftRadius: radii.lg,
        borderBottomRightRadius: radii.lg,
        padding: 16,
        paddingTop: 48,
    },
    name: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 6 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { color: 'rgba(255,255,255,0.80)', fontSize: 13, fontFamily: 'Inter_400Regular' },
    dot: { color: 'rgba(255,255,255,0.4)' },
    buttons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        marginTop: 24,
    },
    passBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: colors.danger,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    likeBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const venueLoadMoreStyles = StyleSheet.create({
    card: {
        width: 90,
        height: 220,
        borderRadius: radii.lg,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    icon: { color: 'white', fontSize: 28, fontFamily: 'Inter_700Bold' },
    label: { color: colors.text60, fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 16 },
});

const venueCardStyles = StyleSheet.create({
    card: {
        width: 180,
        height: 220,
        borderRadius: radii.lg,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    photo: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        resizeMode: 'cover',
    },
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 14,
        paddingTop: 40,
    },
    name: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 14,
        marginBottom: 6,
        lineHeight: 18,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'Inter_400Regular' },
    dot: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
    heartBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.50)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const likedCardStyles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        overflow: 'hidden',
    },
    photoWrap: {
        width: 96,
        height: 96,
        position: 'relative',
        flexShrink: 0,
    },
    photo: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    heartBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
        padding: 12,
        justifyContent: 'center',
    },
    category: {
        color: colors.text40,
        fontFamily: 'Inter_500Medium',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 3,
    },
    name: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 15,
        marginBottom: 6,
        lineHeight: 20,
    },
    metaRow: { gap: 6 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: {
        color: colors.text60,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        flexShrink: 1,
    },
});

const partyCardStyles = StyleSheet.create({
    card: {
        backgroundColor: colors.glass,
        borderRadius: radii.lg,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    name: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 2 },
    host: { color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 13 },
    friendBadge: {
        alignSelf: 'flex-start',
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(108,62,244,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.45)',
    },
    friendBadgeText: {
        color: colors.primary,
        fontFamily: 'Inter_700Bold',
        fontSize: 10,
        letterSpacing: 0.3,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radii.pill,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.4 },
    metaRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { color: colors.text60, fontSize: 13, fontFamily: 'Inter_400Regular' },
    joinBtn: { borderRadius: radii.md, overflow: 'hidden', alignSelf: 'flex-start' },
    joinGradient: { paddingHorizontal: 24, paddingVertical: 10, alignItems: 'center' },
    joinText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14 },
});

const modalStyles = StyleSheet.create({
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
        overflow: 'hidden',
        paddingBottom: 32,
    },
    photo: { width: '100%', height: 220, resizeMode: 'cover' },
    photoFallback: {
        width: '100%',
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: { paddingHorizontal: 24, paddingTop: 20 },
    category: {
        color: colors.text40,
        fontFamily: 'Inter_500Medium',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
    },
    venueName: {
        color: 'white',
        fontFamily: 'Inter_900Black',
        fontSize: 24,
        marginBottom: 14,
        lineHeight: 30,
    },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    metaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.glass,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    metaChipText: { color: colors.text80, fontSize: 13, fontFamily: 'Inter_500Medium' },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    addressText: {
        flex: 1,
        color: colors.text60,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        lineHeight: 20,
    },
    pitchBtn: {
        marginTop: 16,
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
        backgroundColor: 'rgba(108,62,244,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.35)',
    },
    pitchBtnText: {
        color: colors.primary,
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
    },
    pitchBox: {
        marginTop: 14,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(108,62,244,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(108,62,244,0.20)',
    },
    pitchText: {
        color: colors.text80,
        fontFamily: 'Inter_400Regular',
        fontSize: 14,
        lineHeight: 21,
    },
});
