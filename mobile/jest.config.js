module.exports = {
    preset: 'jest-expo',
    roots: ['<rootDir>/screens-test'],
    setupFiles: ['<rootDir>/screens-test/setup.js'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|react-leaflet|@react-leaflet/.*))',
    ],
};
