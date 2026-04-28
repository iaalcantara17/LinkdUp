import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import GradientButton from '../components/GradientButton';
import { api } from '../services/api';
import { typography, radii } from '../theme';
import type { AppColors } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function JoinPartyScreen() {
    const nav = useNavigation<any>();
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleJoin = async () => {
        if (code.length !== 6) {
            Alert.alert('Invalid code', 'Codes are 6 characters.');
            return;
        }
        setLoading(true);
        try {
            const r = await api.joinParty(code);
            nav.replace('PartyLobby', { partyId: r.party_id });
        } catch (e: any) {
            Alert.alert('Could not join', e?.message ?? 'unknown');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 8 }}>
                        <ArrowLeft size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Join a Party</Text>
                    <View style={{ width: 40 }} />
                </View>

                <Animated.View entering={FadeInDown.duration(400)} style={styles.content}>
                    <Text style={styles.title}>Enter the code</Text>
                    <Text style={styles.sub}>Ask the host for the 6-character party code</Text>

                    <TextInput
                        style={styles.codeInput}
                        value={code}
                        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                        autoCapitalize="characters"
                        maxLength={6}
                        placeholder="ABCDEF"
                        placeholderTextColor={colors.text30}
                        autoFocus
                    />

                    <GradientButton
                        title="Join"
                        onPress={handleJoin}
                        loading={loading}
                        rightIcon={<ArrowRight size={20} color="white" />}
                    />
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

function makeStyles(c: AppColors) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: c.bg },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 },
        headerTitle: { ...typography.h3, color: c.textPrimary },
        content: { flex: 1, padding: 24, paddingTop: 48 },
        title: { color: c.textPrimary, fontFamily: 'Inter_900Black', fontSize: 32, marginBottom: 8 },
        sub: { color: c.text60, fontSize: 15, marginBottom: 32, fontFamily: 'Inter_400Regular' },
        codeInput: {
            backgroundColor: c.glassStrong,
            borderWidth: 1,
            borderColor: c.glassBorderStrong,
            borderRadius: radii.lg,
            paddingVertical: 28,
            color: c.textPrimary,
            fontSize: 40,
            textAlign: 'center',
            letterSpacing: 12,
            fontFamily: 'Inter_900Black',
            marginBottom: 20,
        },
    });
}
