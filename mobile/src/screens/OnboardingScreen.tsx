import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Image, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withDelay,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { colors, typography, radii } from '../theme';

const { width } = Dimensions.get('window');

const slides = [
    {
        title: 'Reconnect with your alumni',
        description: 'Find old friends and make new connections from your school',
        image: 'https://images.unsplash.com/photo-1758270705902-f50dde4add9f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    },
    {
        title: 'Swipe on spots together',
        description: 'Everyone votes on where to hang out. No more endless debates.',
        image: 'https://images.unsplash.com/photo-1605108222700-0d605d9ebafe?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    },
    {
        title: 'Lock in the date. No group chat chaos.',
        description: 'Coordinate schedules and confirm your hangout instantly',
        image: 'https://images.unsplash.com/photo-1765805913524-15f085ebb5b8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    },
];

function Splash() {
    const scale = useSharedValue(0.5);
    const opacity = useSharedValue(0);
    const subOpacity = useSharedValue(0);
    const subY = useSharedValue(20);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 500 });
        scale.value = withSpring(1, { damping: 12 });
        subOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
        subY.value = withDelay(300, withTiming(0, { duration: 400 }));
    }, []);

    const wordStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));
    const subStyle = useAnimatedStyle(() => ({
        opacity: subOpacity.value,
        transform: [{ translateY: subY.value }],
    }));

    return (
        <Animated.View entering={FadeIn} exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={colors.gradient as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
                <Animated.Text style={[styles.splashWordmark, wordStyle]}>LINKDUP</Animated.Text>
                <Animated.Text style={[styles.splashTagline, subStyle]}>
                    Find your people. Find your place.
                </Animated.Text>
            </LinearGradient>
        </Animated.View>
    );
}

export default function OnboardingScreen() {
    const nav = useNavigation<any>();
    const [showSplash, setShowSplash] = useState(true);
    const [currentSlide, setCurrentSlide] = useState(0);
    const scrollRef = React.useRef<ScrollView>(null);

    useEffect(() => {
        const t = setTimeout(() => setShowSplash(false), 1500);
        return () => clearTimeout(t);
    }, []);

    if (showSplash) return <Splash />;

    const isLastSlide = currentSlide === slides.length - 1;

    const goToSlide = (index: number) => {
        scrollRef.current?.scrollTo({ x: index * width, animated: true });
        setCurrentSlide(index);
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.progressRow}>
                {slides.map((_, i) => (
                    <View key={i} style={styles.progressTrack}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.progressFill, { width: i <= currentSlide ? '100%' : '0%' }]}
                        />
                    </View>
                ))}
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setCurrentSlide(Math.round(e.nativeEvent.contentOffset.x / width))}
                style={{ flex: 1 }}
            >
                {slides.map((slide, i) => (
                    <View key={i} style={styles.slide}>
                        <View style={styles.imageWrap}>
                            <Image source={{ uri: slide.image }} style={styles.image} resizeMode="cover" />
                        </View>
                        <Text style={styles.title}>{slide.title}</Text>
                        <Text style={styles.desc}>{slide.description}</Text>
                    </View>
                ))}
            </ScrollView>

            <View style={styles.actions}>
                {isLastSlide ? (
                    <>
                        <GradientButton title="Get Started" onPress={() => nav.navigate('Login')} />
                        <View style={{ height: 16 }} />
                        <GradientButton title="Log In" variant="ghost" onPress={() => nav.navigate('Login')} />
                    </>
                ) : (
                    <View style={styles.navRow}>
                        <TouchableOpacity onPress={() => goToSlide(slides.length - 1)} style={{ padding: 12 }}>
                            <Text style={styles.skipText}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => goToSlide(currentSlide + 1)} activeOpacity={0.85}>
                            <LinearGradient
                                colors={colors.gradient as any}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.nextBtn}
                            >
                                <Text style={styles.nextText}>Next</Text>
                                <ChevronRight size={20} color="white" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    splashWordmark: { ...typography.wordmarkLarge, color: 'white' },
    splashTagline: { ...typography.body, color: 'rgba(255,255,255,0.80)', marginTop: 16, fontSize: 18 },
    progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 16 },
    progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
    progressFill: { height: '100%' },
    slide: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    imageWrap: {
        width: 300,
        height: 300,
        borderRadius: radii.xl,
        overflow: 'hidden',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
    },
    image: { width: '100%', height: '100%' },
    title: { ...typography.h1, color: 'white', textAlign: 'center', marginBottom: 12, fontSize: 30 },
    desc: { ...typography.body, color: colors.text60, textAlign: 'center' },
    actions: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    skipText: { color: colors.text40, fontFamily: 'Inter_500Medium', fontSize: 16 },
    nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radii.pill },
    nextText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 },
});
