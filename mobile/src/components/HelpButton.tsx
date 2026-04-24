import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { colors, radii } from '../theme';

interface HelpItem {
    title: string;
    description: string;
}

interface Props {
    items: HelpItem[];
}

export default function HelpButton({ items }: Props) {
    const [visible, setVisible] = useState(false);

    return (
        <>
            <TouchableOpacity
                style={styles.btn}
                onPress={() => setVisible(true)}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <Text style={styles.mark}>?</Text>
            </TouchableOpacity>

            <Modal
                visible={visible}
                transparent
                animationType="slide"
                onRequestClose={() => setVisible(false)}
            >
                <TouchableOpacity
                    style={styles.overlay}
                    activeOpacity={1}
                    onPress={() => setVisible(false)}
                />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.sheetTitle}>What you can do here</Text>
                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                        {items.map((item, i) => (
                            <View key={i} style={[styles.item, i > 0 && styles.itemBorder]}>
                                <Text style={styles.itemTitle}>{item.title}</Text>
                                <Text style={styles.itemDesc}>{item.description}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => setVisible(false)}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.doneBtnText}>Got it</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    btn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mark: { color: colors.text80, fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 18 },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        backgroundColor: '#12121A',
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 36,
        borderTopWidth: 1,
        borderColor: colors.glassBorder,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.text40,
        alignSelf: 'center',
        marginBottom: 20,
    },
    sheetTitle: {
        color: 'white',
        fontFamily: 'Inter_700Bold',
        fontSize: 18,
        marginBottom: 16,
    },
    item: { paddingVertical: 12 },
    itemBorder: {
        borderTopWidth: 1,
        borderTopColor: colors.glassBorder,
    },
    itemTitle: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 3 },
    itemDesc: { color: colors.text60, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
    doneBtn: {
        marginTop: 16,
        backgroundColor: colors.primary,
        borderRadius: radii.md,
        paddingVertical: 12,
        alignItems: 'center',
    },
    doneBtnText: { color: 'white', fontFamily: 'Inter_700Bold', fontSize: 15 },
});
