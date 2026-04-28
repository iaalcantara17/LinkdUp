import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Image, ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { X, MapPin, ImagePlus } from 'lucide-react-native';
import { api } from '../services/api';
import { radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

interface VenueResult {
    google_place_id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
}

export default function CreatePostScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [photo, setPhoto] = useState<{ uri: string; blob?: Blob | File } | null>(null);
    const [caption, setCaption] = useState('');
    const [venueQuery, setVenueQuery] = useState('');
    const [venueResults, setVenueResults] = useState<VenueResult[]>([]);
    const [selectedVenue, setSelectedVenue] = useState<VenueResult | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    const pickPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow photo library access to pick a photo.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsEditing: true,
            aspect: [9, 16],
        });
        if (result.canceled || !result.assets.length) return;

        const asset = result.assets[0];
        if (Platform.OS === 'web') {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            setPhoto({ uri: asset.uri, blob });
        } else {
            setPhoto({ uri: asset.uri });
        }
    };

    const searchVenues = async (q: string) => {
        setVenueQuery(q);
        setSelectedVenue(null);
        if (q.trim().length < 2) { setVenueResults([]); return; }

        setSearchLoading(true);
        try {
            const results = await api.searchPlaces(q.trim());
            setVenueResults(results);
        } catch (e) {
            console.warn('[create-post] venue search failed', e);
        } finally {
            setSearchLoading(false);
        }
    };

    const selectVenue = (venue: VenueResult) => {
        setSelectedVenue(venue);
        setVenueResults([]);
        setVenueQuery('');
    };

    const canPost = photo !== null && caption.trim().length > 0 && selectedVenue !== null && !posting;

    const handlePost = async () => {
        if (!canPost || !photo || !selectedVenue) return;
        setPosting(true);
        try {
            let imageUrl: string;

            if (Platform.OS === 'web' && photo.blob) {
                imageUrl = await api.uploadFeedPhoto(photo.blob);
            } else {
                const response = await fetch(photo.uri);
                const blob = await response.blob();
                imageUrl = await api.uploadFeedPhoto(blob);
            }

            await api.createFeedPost({
                image_url: imageUrl,
                caption: caption.trim(),
                venue_name: selectedVenue.name,
                venue_address: selectedVenue.address,
                venue_lat: selectedVenue.latitude ?? undefined,
                venue_lng: selectedVenue.longitude ?? undefined,
                venue_google_place_id: selectedVenue.google_place_id,
            });

            showToast('Posted!');
            setTimeout(() => nav.goBack(), 600);
        } catch (e: any) {
            Alert.alert('Post failed', e?.message ?? 'Something went wrong');
        } finally {
            setPosting(false);
        }
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            {toast && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            <View style={styles.header}>
                <TouchableOpacity onPress={() => nav.goBack()} activeOpacity={0.8} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                    <X size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Post</Text>
                <View style={{ width: 22 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <TouchableOpacity
                    style={[styles.photoPicker, photo && styles.photoPickerFilled]}
                    onPress={pickPhoto}
                    activeOpacity={0.85}
                >
                    {photo ? (
                        <>
                            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                            <View style={styles.photoEditBadge}>
                                <Text style={styles.photoEditText}>Change</Text>
                            </View>
                        </>
                    ) : (
                        <View style={styles.photoPlaceholder}>
                            <ImagePlus size={36} color={colors.text40} />
                            <Text style={styles.photoPlaceholderText}>Pick a photo</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={styles.field}>
                    <Text style={styles.label}>Caption</Text>
                    <TextInput
                        style={styles.captionInput}
                        placeholder="What's the vibe?"
                        placeholderTextColor={colors.text40}
                        value={caption}
                        onChangeText={(t) => t.length <= 500 && setCaption(t)}
                        multiline
                        maxLength={500}
                    />
                    <Text style={styles.charCount}>{caption.length}/500</Text>
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Venue</Text>

                    {selectedVenue ? (
                        <View style={styles.selectedVenueCard}>
                            <MapPin size={16} color={colors.primary} style={{ marginTop: 2 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.selectedVenueName}>{selectedVenue.name}</Text>
                                {selectedVenue.address ? (
                                    <Text style={styles.selectedVenueAddress} numberOfLines={1}>
                                        {selectedVenue.address}
                                    </Text>
                                ) : null}
                            </View>
                            <TouchableOpacity
                                onPress={() => setSelectedVenue(null)}
                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            >
                                <X size={16} color={colors.text40} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <View style={styles.venueSearchRow}>
                                <MapPin size={16} color={colors.text40} />
                                <TextInput
                                    style={styles.venueInput}
                                    placeholder="Search for a venue…"
                                    placeholderTextColor={colors.text40}
                                    value={venueQuery}
                                    onChangeText={searchVenues}
                                    returnKeyType="search"
                                />
                                {searchLoading && (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                )}
                            </View>

                            {venueResults.length > 0 && (
                                <View style={styles.venueDropdown}>
                                    {venueResults.map((v) => (
                                        <TouchableOpacity
                                            key={v.google_place_id}
                                            style={styles.venueResultRow}
                                            onPress={() => selectVenue(v)}
                                            activeOpacity={0.8}
                                        >
                                            <MapPin size={13} color={colors.text40} style={{ marginTop: 2 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.venueResultName}>{v.name}</Text>
                                                {v.address ? (
                                                    <Text style={styles.venueResultAddress} numberOfLines={1}>
                                                        {v.address}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    onPress={handlePost}
                    disabled={!canPost}
                    activeOpacity={0.85}
                    style={{ width: '100%' }}
                >
                    <LinearGradient
                        colors={canPost ? (colors.gradient as any) : (['#333', '#333'] as any)}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.postBtn}
                    >
                        {posting
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.postBtnText}>Post</Text>
                        }
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: {
            flex: 1,
            backgroundColor: c.bg,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        headerTitle: {
            color: c.textPrimary,
            fontFamily: 'Inter_700Bold',
            fontSize: 17,
        },
        content: {
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 120,
            gap: 24,
        },
        photoPicker: {
            width: '100%',
            height: 260,
            borderRadius: radii.xl,
            borderWidth: 2,
            borderColor: c.glassBorder,
            borderStyle: 'dashed',
            overflow: 'hidden',
            backgroundColor: c.surface,
        },
        photoPickerFilled: {
            borderStyle: 'solid',
            borderColor: 'transparent',
        },
        photoPreview: {
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
        },
        photoEditBadge: {
            position: 'absolute',
            bottom: 12,
            right: 12,
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
        },
        photoEditText: {
            color: 'white',
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
        },
        photoPlaceholder: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
        },
        photoPlaceholderText: {
            color: c.text40,
            fontFamily: 'Inter_500Medium',
            fontSize: 15,
        },
        field: {
            gap: 8,
        },
        label: {
            color: c.text60,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        captionInput: {
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            minHeight: 80,
            maxHeight: 140,
            textAlignVertical: 'top',
        },
        charCount: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            textAlign: 'right',
        },
        venueSearchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 8,
        },
        venueInput: {
            flex: 1,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
        },
        venueDropdown: {
            backgroundColor: c.surfaceElevated,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.glassBorder,
            overflow: 'hidden',
        },
        venueResultRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        },
        venueResultName: {
            color: c.textPrimary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 14,
        },
        venueResultAddress: {
            color: c.text40,
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            marginTop: 2,
        },
        selectedVenueCard: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            backgroundColor: c.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: c.primary,
            paddingHorizontal: 14,
            paddingVertical: 12,
        },
        selectedVenueName: {
            color: c.textPrimary,
            fontFamily: 'Inter_600SemiBold',
            fontSize: 15,
        },
        selectedVenueAddress: {
            color: c.text60,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            marginTop: 2,
        },
        footer: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingVertical: 16,
            paddingBottom: 28,
            backgroundColor: c.bg,
            borderTopWidth: 1,
            borderTopColor: c.glassBorder,
        },
        postBtn: {
            paddingVertical: 16,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
        },
        postBtnText: {
            color: 'white',
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
        },
        toast: {
            position: 'absolute',
            top: 80,
            alignSelf: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
            zIndex: 99,
        },
        toastText: {
            color: 'white',
            fontFamily: 'Inter_500Medium',
            fontSize: 13,
        },
    });
}
