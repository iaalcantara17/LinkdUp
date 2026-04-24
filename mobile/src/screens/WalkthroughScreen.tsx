import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import SlideOneVisual   from '../components/walkthrough/SlideOneVisual';
import SlideTwoVisual   from '../components/walkthrough/SlideTwoVisual';
import SlideThreeVisual from '../components/walkthrough/SlideThreeVisual';
import SlideFourVisual  from '../components/walkthrough/SlideFourVisual';
import SlideFiveVisual  from '../components/walkthrough/SlideFiveVisual';
import SlideSixVisual   from '../components/walkthrough/SlideSixVisual';
import { api } from '../services/api';
import { colors, radii } from '../theme';

const SLIDES = [
    {
        title: 'Welcome to LinkdUp 👋',
        body: "Let me show you around. This'll take 30 seconds — promise.",
    },
    {
        title: 'Start or join a party',
        body: 'Gather your crew. Create a party and share the code, or join one someone sent you.',
    },
    {
        title: "See where everyone's at",
        body: "We map your crew and find the perfect midpoint so nobody has to drive across town.",
    },
    {
        title: 'Swipe on spots together',
        body: "Like or pass on venues near your midpoint. When the majority agrees — it's a match.",
    },
    {
        title: 'Need a second opinion?',
        body: "Tap 'Why this?' on any spot for an instant AI take on the vibe and what the place is good for.",
    },
    {
        title: 'Lock it in',
        body: "Pick a date and time, sync to Google Calendar, and you're all set. See you there!",
    },
];

const VISUALS = [
    SlideOneVisual,
    SlideTwoVisual,
    SlideThreeVisual,
    SlideFourVisual,
    SlideFiveVisual,
    SlideSixVisual,
];

export default function WalkthroughScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const fromSignup: boolean = route.params?.fromSignup ?? true;
    const { width } = useWindowDimensions();
    const [current, setCurrent] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    const isLast = current === SLIDES.length - 1;

    const goTo = (index: number) => {
        scrollRef.current?.scrollTo({ x: index * width, animated: true });
        setCurrent(index);
    };

    const finish = async () => {
        api.markWalkthroughSeen().catch(() => {});
        if (fromSignup) {
            nav.replace('Home');
        } else {
            nav.goBack();
        }
    };

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.progressRow}>
                {SLIDES.map((_, i) => (
                    <View key={i} style={styles.progressTrack}>
                        <LinearGradient
                            colors={colors.gradient as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.progressFill, { width: i <= current ? '100%' : '0%' }]}
                        />
                    </View>
                ))}
            </View>

            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
                style={{ flex: 1 }}
                scrollEnabled={false}
            >
                {SLIDES.map(({ title, body }, i) => {
                    const Visual = VISUALS[i];
                    return (
                        <View key={i} style={[styles.slide, { width }]}>
                            <View style={styles.visualArea}>
                                <Visual />
                            </View>
                            <Text style={styles.title}>{title}</Text>
                            <Text style={styles.body}>{body}</Text>
                        </View>
                    );
                })}
            </ScrollView>

            <View style={styles.actions}>
                {isLast ? (
                    <GradientButton title="Let's go" onPress={finish} />
                ) : (
                    <View style={styles.navRow}>
                        <TouchableOpacity onPress={finish} style={{ padding: 12 }}>
                            <Text style={styles.skipText}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => goTo(current + 1)} activeOpacity={0.85}>
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
    progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 16 },
    progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
    progressFill: { height: '100%' },
    slide: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 36,
    },
    visualArea: {
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    title: {
        color: 'white',
        fontFamily: 'Inter_900Black',
        fontSize: 26,
        textAlign: 'center',
        marginBottom: 14,
    },
    body: {
        color: 'rgba(255,255,255,0.62)',
        fontFamily: 'Inter_400Regular',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 23,
    },
    actions: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    skipText: { color: 'rgba(255,255,255,0.38)', fontFamily: 'Inter_500Medium', fontSize: 16 },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: radii.pill,
    },
    nextText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 16 },
});
