export const darkColors = {
    primary: '#6C3EF4',
    primaryAlt: '#00C2FF',
    gradient: ['#6C3EF4', '#00C2FF'] as const,

    bg: '#0A0A0F',
    bgBlack: '#000000',
    surface: '#15151F',
    surfaceElevated: '#1F1F2E',

    glass: 'rgba(255,255,255,0.05)',
    glassStrong: 'rgba(255,255,255,0.10)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassBorderStrong: 'rgba(255,255,255,0.20)',

    textPrimary: '#FFFFFF',
    text80: 'rgba(255,255,255,0.80)',
    text60: 'rgba(255,255,255,0.60)',
    text40: 'rgba(255,255,255,0.40)',
    text30: 'rgba(255,255,255,0.30)',
    textSecondary: 'rgba(255,255,255,0.60)',
    textMuted: 'rgba(255,255,255,0.40)',

    success: '#22C55E',
    successDim: 'rgba(34,197,94,0.18)',
    danger: '#EF4444',
    dangerDim: 'rgba(239,68,68,0.18)',
    warning: '#FACC15',

    confetti: ['#6C3EF4', '#00C2FF', '#FF6B9D', '#FFD93D', '#6BCF7F'] as const,

    border: 'rgba(255,255,255,0.10)',
};

export const lightColors = {
    primary: '#6C3EF4',
    primaryAlt: '#00C2FF',
    gradient: ['#6C3EF4', '#00C2FF'] as const,

    bg: '#FAFAFB',
    bgBlack: '#000000',
    surface: '#FFFFFF',
    surfaceElevated: '#F0F0F6',

    glass: 'rgba(0,0,0,0.04)',
    glassStrong: 'rgba(0,0,0,0.08)',
    glassBorder: 'rgba(0,0,0,0.08)',
    glassBorderStrong: 'rgba(0,0,0,0.15)',

    textPrimary: '#0A0A0F',
    text80: 'rgba(10,10,15,0.80)',
    text60: 'rgba(10,10,15,0.60)',
    text40: 'rgba(10,10,15,0.40)',
    text30: 'rgba(10,10,15,0.30)',
    textSecondary: 'rgba(10,10,15,0.60)',
    textMuted: 'rgba(10,10,15,0.40)',

    success: '#10B981',
    successDim: 'rgba(16,185,129,0.18)',
    danger: '#EF4444',
    dangerDim: 'rgba(239,68,68,0.18)',
    warning: '#F59E0B',

    confetti: ['#6C3EF4', '#00C2FF', '#FF6B9D', '#FFD93D', '#6BCF7F'] as const,

    border: 'rgba(0,0,0,0.08)',
};

export type AppColors = typeof darkColors;

export const colors = darkColors;
