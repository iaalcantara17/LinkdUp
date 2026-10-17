export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const mapThemeClass = (isDark: boolean) => (isDark ? 'linkdup-map-dark' : '');

export const leafletOverridesCss = `
    .linkdup-map-dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }
    @keyframes linkdup-pin-drop {
        from { transform: translateY(-20px) scale(0.4); opacity: 0; }
        to   { transform: translateY(0)    scale(1);   opacity: 1; }
    }
`;
