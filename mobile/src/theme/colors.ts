// LinkdUp color tokens — extracted from the Figma Make source (not the brief)
export const colors = {
    // Brand
    primary: '#6C3EF4',          // deep purple
    primaryAlt: '#00C2FF',       // electric blue
    gradient: ['#6C3EF4', '#00C2FF'] as const,

    // Surfaces (dark mode base)
    bg: '#0A0A0F',               // was #0B0B14 — corrected from Figma source
    bgBlack: '#000000',          // pure black for Discover/video screens
    surface: '#15151F',
    surfaceElevated: '#1F1F2E',

    // Glass (Tailwind: bg-white/5 + backdrop-blur-xl + border-white/10)
    glass: 'rgba(255,255,255,0.05)',
    glassStrong: 'rgba(255,255,255,0.10)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassBorderStrong: 'rgba(255,255,255,0.20)',

    // Text (Tailwind: white, white/80, white/60, white/40, white/30)
    textPrimary: '#FFFFFF',
    text80: 'rgba(255,255,255,0.80)',
    text60: 'rgba(255,255,255,0.60)',
    text40: 'rgba(255,255,255,0.40)',
    text30: 'rgba(255,255,255,0.30)',
    textSecondary: 'rgba(255,255,255,0.60)',
    textMuted: 'rgba(255,255,255,0.40)',

    // Status (Tailwind: green-500, red-500, yellow-400)
    success: '#22C55E',
    successDim: 'rgba(34,197,94,0.18)',
    danger: '#EF4444',
    dangerDim: 'rgba(239,68,68,0.18)',
    warning: '#FACC15',

    // Confetti palette (from Match.tsx)
    confetti: ['#6C3EF4', '#00C2FF', '#FF6B9D', '#FFD93D', '#6BCF7F'] as const,

    // Legacy alias used elsewhere
    border: 'rgba(255,255,255,0.10)',
};
