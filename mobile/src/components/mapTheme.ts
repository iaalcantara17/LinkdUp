export const DARK_MAP_CLASS = 'linkdup-map-dark';

export function mapThemeClass(isDark: boolean): string | undefined {
    return isDark ? DARK_MAP_CLASS : undefined;
}

export const leafletOverridesCss = `
    .leaflet-container { background: #0A0A0F !important; }
    .${DARK_MAP_CLASS} .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }
    @keyframes linkdup-pin-drop {
        from { transform: translateY(-20px) scale(0.4); opacity: 0; }
        to   { transform: translateY(0)    scale(1);   opacity: 1; }
    }
`;
