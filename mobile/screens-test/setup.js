require('react-native-gesture-handler/jestSetup');

if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
    });
}

if (typeof window !== 'undefined') {
    window.open = jest.fn(() => ({ closed: false, location: { href: '' } }));
}

process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('../src/services/supabase', () => {
    const channel = { on: () => channel, subscribe: () => channel, unsubscribe: jest.fn() };
    return {
        supabase: {
            auth: {
                getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok-alice', user: { id: 'alice' } } } })),
                getUser: jest.fn(async () => ({ data: { user: { id: 'alice', email: 'alice@test.dev' } } })),
                onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
                signOut: jest.fn(async () => ({ error: null })),
            },
            channel: jest.fn(() => channel),
            removeChannel: jest.fn(),
            storage: { from: () => ({ upload: jest.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        },
    };
});

global.__api = {
    fns: {},
    impl: () => Promise.resolve(null),
    reset(impl) {
        for (const key of Object.keys(this.fns)) delete this.fns[key];
        this.impl = impl;
    },
};

jest.mock('../src/services/api', () => {
    const fns = global.__api.fns;
    const api = new Proxy(fns, {
        get(target, key) {
            if (!Object.prototype.hasOwnProperty.call(target, key)) target[key] = jest.fn((...args) => global.__api.impl(key, ...args));
            return target[key];
        },
    });
    return {
        api,
        photoUri: (url) => url ?? undefined,
        VENUE_LIMIT_MESSAGE: 'Venue lookups are paused for today, try again tomorrow',
    };
});

jest.mock('../src/components/CrewMap', () => () => null);

jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, {
    get: (target, name) => (name in target ? target[name] : () => null),
}));

const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    push: jest.fn(),
    setOptions: jest.fn(),
    canGoBack: jest.fn(() => true),
    addListener: jest.fn(() => () => {}),
};
global.__route = { params: {} };
global.__navigation = navigation;

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    return {
        ...jest.requireActual('@react-navigation/native'),
        useNavigation: () => global.__navigation,
        useRoute: () => global.__route,
        useFocusEffect: (effect) => React.useEffect(() => effect(), []),
        useIsFocused: () => true,
    };
});

jest.mock('../src/context/ThemeContext', () => {
    const { darkColors } = jest.requireActual('../src/theme');
    return {
        useTheme: () => ({ mode: 'dark', isDark: true, colors: darkColors, setMode: jest.fn(), syncFromProfile: jest.fn() }),
    };
});

global.__profile = {
    id: 'alice',
    email: 'alice@test.dev',
    display_name: 'Alice',
    username: 'alice',
    school_id: null,
    graduation_year: null,
    avatar_color: '#6C3EF4',
    avatar_url: null,
    latitude: null,
    longitude: null,
    has_seen_walkthrough: true,
    location_permission_status: 'granted',
    pronouns: null,
    birthday: null,
    bio: null,
    theme_preference: 'dark',
    google_calendar_connected: false,
    age: null,
};

jest.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({
        session: { access_token: 'tok-alice', user: { id: 'alice', email: 'alice@test.dev' } },
        loading: false,
        userProfile: global.__profile,
        profileLoading: false,
        refreshProfile: jest.fn(async () => {}),
        signOut: jest.fn(async () => {}),
    }),
}));

jest.mock('../src/context/HintsContext', () => ({
    useHints: () => ({ ready: true, hasSeen: () => true, markSeen: jest.fn() }),
}));
