export const palette = {
    white: '#FFFFFF',
    black: '#000000',
    ink: '#0A0A0F',
    violet: '#6C3EF4',
    violet300: '#9B7BFF',
    cyan: '#00C2FF',
    blue600: '#2563EB',
    night900: '#0A0A0F',
    night800: '#15151F',
    night700: '#1F1F2E',
    paper50: '#FAFAFB',
    paper100: '#F0F0F6',
    red500: '#EF4444',
    red700: '#B91C1C',
    green500: '#22C55E',
    emerald500: '#10B981',
    yellow400: '#FACC15',
    amber500: '#F59E0B',
    emerald700: '#047857',
    amber800: '#92400E',
    grey200: '#E8E8E8',
    pink400: '#FF6B9D',
    googleBlueDark: '#1A73E8',
    googleBlue: '#4285F4',
    googleGreen: '#34A853',
    googleYellow: '#FBBC05',
    googleRed: '#EA4335',
};

const dark = {
    background: palette.night900,
    surface: palette.night800,
    surfaceRaised: palette.night700,
    border: 'rgba(255,255,255,0.10)',
    borderStrong: 'rgba(255,255,255,0.20)',
    text: palette.white,
    textMuted: 'rgba(255,255,255,0.60)',
    textFaint: 'rgba(255,255,255,0.50)',
    primary: palette.violet,
    onPrimary: palette.white,
    primaryText: palette.violet300,
    accent: palette.cyan,
    gradientEnd: palette.blue600,
    danger: palette.red500,
    dangerStrong: palette.red700,
    success: palette.green500,
    warning: palette.yellow400,
    scrim: 'rgba(0,0,0,0.55)',
    scrimStrong: 'rgba(0,0,0,0.85)',
    onMedia: palette.white,
    onMediaMuted: 'rgba(255,255,255,0.80)',
    onMediaFaint: 'rgba(255,255,255,0.30)',
    mediaFill: 'rgba(255,255,255,0.20)',
    chrome: 'rgba(10,10,15,0.80)',
    veil: 'rgba(10,10,15,0.40)',
    fill: 'rgba(255,255,255,0.05)',
    fillStrong: 'rgba(255,255,255,0.10)',
    primarySoft: 'rgba(108,62,244,0.18)',
    primaryBorder: 'rgba(108,62,244,0.35)',
    accentSoft: 'rgba(0,194,255,0.35)',
    dangerSoft: 'rgba(239,68,68,0.10)',
    dangerBorder: 'rgba(239,68,68,0.30)',
    warningSoft: 'rgba(245,158,11,0.10)',
    warningBorder: 'rgba(245,158,11,0.25)',
    successFill: palette.emerald700,
    switchThumb: palette.white,
};

export type ColorRoles = typeof dark;

const light: ColorRoles = {
    background: palette.paper50,
    surface: palette.white,
    surfaceRaised: palette.paper100,
    border: 'rgba(0,0,0,0.08)',
    borderStrong: 'rgba(0,0,0,0.15)',
    text: palette.ink,
    textMuted: 'rgba(10,10,15,0.60)',
    textFaint: 'rgba(10,10,15,0.58)',
    primary: palette.violet,
    onPrimary: palette.white,
    primaryText: palette.violet,
    accent: palette.cyan,
    gradientEnd: palette.blue600,
    danger: palette.red700,
    dangerStrong: palette.red700,
    success: palette.emerald700,
    warning: palette.amber800,
    scrim: 'rgba(0,0,0,0.55)',
    scrimStrong: 'rgba(0,0,0,0.85)',
    onMedia: palette.white,
    onMediaMuted: 'rgba(255,255,255,0.80)',
    onMediaFaint: 'rgba(255,255,255,0.30)',
    mediaFill: 'rgba(255,255,255,0.20)',
    chrome: 'rgba(250,250,251,0.85)',
    veil: 'rgba(250,250,251,0.40)',
    fill: 'rgba(0,0,0,0.04)',
    fillStrong: 'rgba(0,0,0,0.08)',
    primarySoft: 'rgba(108,62,244,0.18)',
    primaryBorder: 'rgba(108,62,244,0.35)',
    accentSoft: 'rgba(0,194,255,0.35)',
    dangerSoft: 'rgba(239,68,68,0.10)',
    dangerBorder: 'rgba(239,68,68,0.30)',
    warningSoft: 'rgba(245,158,11,0.10)',
    warningBorder: 'rgba(245,158,11,0.25)',
    successFill: palette.emerald700,
    switchThumb: palette.grey200,
};

export const color = { dark, light };

export const typeScale = {
    caption: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16 },
    footnote: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18 },
    body: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 },
    bodyStrong: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 24 },
    subtitle: { fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 24 },
    title: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 28 },
    headline: { fontFamily: 'Inter_900Black', fontSize: 28, lineHeight: 34 },
    display: { fontFamily: 'Inter_900Black', fontSize: 48, lineHeight: 52 },
};

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40, s12: 48 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const elevation = {
    0: { shadowColor: palette.black, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    1: { shadowColor: palette.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
    2: { shadowColor: palette.black, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
    3: { shadowColor: palette.black, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.35, shadowRadius: 32, elevation: 16 },
};

export const motion = { instant: 100, fast: 200, base: 300, slow: 500 };

export const control = { md: 48, lg: 56 };

export type MotionName = 'instant' | 'fast' | 'base';

export const duration = (name: MotionName, reduced: boolean) => (reduced ? 0 : motion[name]);

export const stagger = (index: number, reduced: boolean) => (reduced ? 0 : Math.min(index, 6) * 40);

export const press = { scale: 0.97, opacity: 0.85, ms: motion.instant };
