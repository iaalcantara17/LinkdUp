import { TextStyle } from 'react-native';

// Inter only (verified from figma_export/src/styles/fonts.css)
// Loaded via @expo-google-fonts/inter in App.tsx

export const typography = {
    display: { fontFamily: 'Inter_900Black', fontSize: 48, letterSpacing: -1 } as TextStyle,
    wordmarkLarge: { fontFamily: 'Inter_900Black', fontSize: 72, letterSpacing: -2 } as TextStyle,
    wordmarkMed: { fontFamily: 'Inter_900Black', fontSize: 40, letterSpacing: -0.5 } as TextStyle,
    h1: { fontFamily: 'Inter_900Black', fontSize: 32, letterSpacing: -0.5 } as TextStyle,
    h2: { fontFamily: 'Inter_900Black', fontSize: 24 } as TextStyle,
    h3: { fontFamily: 'Inter_700Bold', fontSize: 20 } as TextStyle,
    body: { fontFamily: 'Inter_400Regular', fontSize: 16 } as TextStyle,
    bodyMed: { fontFamily: 'Inter_500Medium', fontSize: 16 } as TextStyle,
    bodyBold: { fontFamily: 'Inter_700Bold', fontSize: 16 } as TextStyle,
    caption: { fontFamily: 'Inter_500Medium', fontSize: 13 } as TextStyle,
    captionBold: { fontFamily: 'Inter_700Bold', fontSize: 13 } as TextStyle,
    micro: { fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 0.3 } as TextStyle,
};
