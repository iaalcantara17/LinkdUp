import { color, palette } from './tokens';

const d = color.dark;
const l = color.light;

export const darkColors = {
    primary: d.primary,
    primaryAlt: d.accent,
    gradient: [d.primary, d.accent] as const,

    bg: d.background,
    bgBlack: palette.black,
    surface: d.surface,
    surfaceElevated: d.surfaceRaised,

    glass: 'rgba(255,255,255,0.05)',
    glassStrong: 'rgba(255,255,255,0.10)',
    glassBorder: d.border,
    glassBorderStrong: d.borderStrong,

    textPrimary: d.text,
    text80: 'rgba(255,255,255,0.80)',
    text60: d.textMuted,
    text40: d.textFaint,
    text30: 'rgba(255,255,255,0.30)',
    textSecondary: d.textMuted,
    textMuted: d.textFaint,

    success: d.success,
    successDim: 'rgba(34,197,94,0.18)',
    danger: d.danger,
    dangerStrong: d.dangerStrong,
    dangerDim: 'rgba(239,68,68,0.18)',
    warning: d.warning,

    confetti: ['#6C3EF4', '#00C2FF', '#FF6B9D', '#FFD93D', '#6BCF7F'] as const,

    border: d.border,
};

export const lightColors: typeof darkColors = {
    primary: l.primary,
    primaryAlt: l.accent,
    gradient: [l.primary, l.accent] as const,

    bg: l.background,
    bgBlack: palette.black,
    surface: l.surface,
    surfaceElevated: l.surfaceRaised,

    glass: 'rgba(0,0,0,0.04)',
    glassStrong: 'rgba(0,0,0,0.08)',
    glassBorder: l.border,
    glassBorderStrong: l.borderStrong,

    textPrimary: l.text,
    text80: 'rgba(10,10,15,0.80)',
    text60: l.textMuted,
    text40: l.textFaint,
    text30: 'rgba(10,10,15,0.30)',
    textSecondary: l.textMuted,
    textMuted: l.textFaint,

    success: l.success,
    successDim: 'rgba(16,185,129,0.18)',
    danger: l.danger,
    dangerStrong: l.dangerStrong,
    dangerDim: 'rgba(239,68,68,0.18)',
    warning: l.warning,

    confetti: ['#6C3EF4', '#00C2FF', '#FF6B9D', '#FFD93D', '#6BCF7F'] as const,

    border: l.border,
};

export type AppColors = typeof darkColors;

export const colors = darkColors;
