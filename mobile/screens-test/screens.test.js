import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '../src/services/api';
import { getLiveLocation } from '../src/services/liveLocation';
import * as fx from './fixtures';
import HomeScreen from '../src/screens/HomeScreen';
import FriendsScreen from '../src/screens/FriendsScreen';
import PartyLobbyScreen from '../src/screens/PartyLobbyScreen';
import SwipeScreen from '../src/screens/SwipeScreen';
import DiscoverScreen from '../src/screens/DiscoverScreen';
import ProfileScreen from '../src/screens/ProfileScreen';
import CalendarConfirmationScreen from '../src/screens/CalendarConfirmationScreen';
import WalkthroughScreen from '../src/screens/WalkthroughScreen';
import FollowListScreen from '../src/screens/FollowListScreen';
import LoginScreen from '../src/screens/LoginScreen';
import OnboardingScreen from '../src/screens/OnboardingScreen';
import DemoBanner from '../src/components/DemoBanner';
import { ColdStartNote } from '../src/components/LoadState';
import CommentSheet from '../src/components/CommentSheet';
import { supabase } from '../src/services/supabase';
import * as dialogs from '../src/components/dialogs';
import { color } from '../src/theme';

jest.mock('../src/services/liveLocation', () => ({
    getLiveLocation: jest.fn(),
    useLocationPermission: () => 'granted',
}));

const never = () => new Promise(() => {});
const failed = new Error('Failed to fetch');
const lobbyParty = { party: fx.party, members: fx.members, my_location: { mode: 'live', custom_label: null, live_fresh: true } };
const loaded = {
    me: fx.profile,
    myParties: fx.myParties,
    getFriends: fx.friends,
    getPendingRequests: [],
    getParty: lobbyParty,
    getMembers: fx.members,
    getLocations: fx.locations,
    getMyVotes: [],
    getMatch: { matched: true, status: 'locked', location: fx.locations[0] },
    getDates: [{ id: 'd1', starts_at: '2026-11-20T23:00:00.000Z', ends_at: '2026-11-21T01:00:00.000Z', is_locked: true, vote_count: 2, member_count: 2, votes: [] }],
    discoverVenues: fx.venues,
    discoverParties: [],
    getDiscoverLikes: [],
    getFollowCounts: { followers: 1, following: 2 },
    vote: { ok: true, match: { matched: false }, proposing: false },
    startParty: { ok: true },
};

async function show(Screen, overrides = {}, params = { partyId: 'p1' }) {
    global.__route = { params };
    global.__api.reset(fx.routes({ ...loaded, ...overrides }));
    const view = mount(Screen);
    await settle();
    return view;
}

function mount(Screen) {
    return render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <Screen />
        </SafeAreaProvider>,
    );
}

async function settle() {
    for (let i = 0; i < 20; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const button = (name) => screen.getByRole('button', { name });
const NETWORK = "We couldn't reach the server. Check your connection and try again.";

function expectLoadError(title) {
    const alert = screen.getByRole('alert');
    within(alert).getByText(title);
    within(alert).getByText(NETWORK);
    return within(alert).getByRole('button', { name: 'Try again' });
}

async function retryLoads(tryAgain, overrides = {}) {
    global.__api.reset(fx.routes({ ...loaded, ...overrides }));
    fireEvent.click(tryAgain);
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
}

beforeEach(() => {
    getLiveLocation.mockResolvedValue({ ok: true, coords: { latitude: 40.74, longitude: -74.03 } });
});

describe('Home', () => {
    test('loading shows the party section without claiming there are no parties', async () => {
        await show(HomeScreen, { myParties: never });
        screen.getByText('Your Active Parties');
        expect(screen.queryByText('No parties yet')).toBeNull();
    });

    test('empty shows the create or join prompt', async () => {
        await show(HomeScreen, { myParties: [] });
        screen.getByText('No parties yet');
        screen.getByText(/join one with a code/);
    });

    test('loaded shows the party, its location source and online friends', async () => {
        await show(HomeScreen);
        screen.getByText('Friday Crew');
        screen.getByLabelText('Your location for this party: Live');
        screen.getByText('Bob');
        for (const tab of ['Home', 'Discover', 'Party', 'Calendar', 'Profile']) screen.getByRole('tab', { name: tab });
    });

    test('a failed party load shows an error with Try again instead of the empty state, and retrying loads the parties', async () => {
        await show(HomeScreen, { myParties: failed });
        expect(screen.queryByText('No parties yet')).toBeNull();
        await retryLoads(expectLoadError("We couldn't load your parties"));
        screen.getByText('Friday Crew');
    });

    test('Join a party, Friends and Help are named buttons', async () => {
        await show(HomeScreen);
        button(/Join a party/);
        button(/Friends/);
        button(/help/i);
    });
});

describe('Friends', () => {
    test('loading shows the tabs and no empty state', async () => {
        await show(FriendsScreen, { getFriends: never });
        screen.getByText('Requests');
        expect(screen.queryByText('No friends yet')).toBeNull();
    });

    test('empty invites the member to find friends', async () => {
        await show(FriendsScreen, { getFriends: [] });
        screen.getByText('No friends yet');
        screen.getByText('Find Friends');
    });

    test('loaded lists friends with labeled remove and block buttons', async () => {
        await show(FriendsScreen);
        screen.getByText('Bob Builder');
        button('Remove Bob Builder');
        button('Block Bob Builder');
    });

    test('a failed friends load shows an error with Try again instead of the empty state, and retrying loads friends', async () => {
        await show(FriendsScreen, { getFriends: failed });
        expect(screen.queryByText('No friends yet')).toBeNull();
        await retryLoads(expectLoadError("We couldn't load your friends"));
        screen.getByText('Bob Builder');
    });

    test('a failed requests load shows an error on the Requests tab instead of the empty state', async () => {
        await show(FriendsScreen, { getPendingRequests: failed });
        fireEvent.click(screen.getByText('Requests'));
        await settle();
        expect(screen.queryByText('No pending requests')).toBeNull();
        await retryLoads(expectLoadError("We couldn't load your friend requests"));
        screen.getByText('No pending requests');
    });

    test('Find Friends is a button and Requests is a tab', async () => {
        await show(FriendsScreen, { getFriends: [] });
        button('Find Friends');
        screen.getByRole('tab', { name: 'Requests' });
    });
});

describe('PartyLobby', () => {
    test('loading shows the lobby shell with the location card', async () => {
        await show(PartyLobbyScreen, { getParty: never, getMembers: never });
        screen.getByText('Loading...');
        screen.getByLabelText('Location source: Not set yet');
        button('Use my live location');
    });

    test('loaded host lobby shows the code, crew and location source, and Start swiping starts the party', async () => {
        await show(PartyLobbyScreen);
        screen.getByText('Friday Crew');
        screen.getByText('ABC234');
        screen.getByLabelText('Location source: Live');
        screen.getByText('Alice');
        screen.getByText('Bob');
        button('Use a different location');
        fireEvent.click(button('Start swiping'));
        await settle();
        expect(api.startParty).toHaveBeenCalledWith('p1');
    });

    test('a start that hits the venue limit shows Popular spots in the lobby instead of an error and stays in the lobby', async () => {
        const limited = Object.assign(new Error('Venue lookups are paused for today, try again tomorrow'), {
            data: { error: 'venue_limit_reached', fallback: true, venues: fx.popularSpots },
        });
        await show(PartyLobbyScreen, { startParty: limited });
        global.__navigation.replace.mockClear();
        fireEvent.click(button('Start swiping'));
        await settle();
        screen.getByText('Popular spots');
        screen.getByText('Live lookups are paused today.');
        screen.getByText('Harbor Light Cafe (demo)');
        screen.getByText('Copper Kettle (demo)');
        expect(dialogs.getSnapshot().dialog).toBeFalsy();
        expect(global.__navigation.replace).not.toHaveBeenCalledWith('Swipe', { partyId: 'p1' });
        expect(api.vote).not.toHaveBeenCalled();
    });

    test('a guest waits for the host and has no Start swiping button', async () => {
        await show(PartyLobbyScreen, { getParty: { ...lobbyParty, party: { ...fx.party, host_user_id: 'bob' } } });
        screen.getByText('Waiting for the host to start...');
        expect(screen.queryByRole('button', { name: 'Start swiping' })).toBeNull();
    });

    test('a failed party load shows an error with Try again instead of loading forever, and retrying loads the party', async () => {
        await show(PartyLobbyScreen, { getParty: failed, getMembers: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
        await retryLoads(expectLoadError("We couldn't load this party"));
        screen.getByText('Friday Crew');
    });

    test('a failed poll after the party loaded keeps the lobby on screen', async () => {
        jest.useFakeTimers();
        try {
            global.__route = { params: { partyId: 'p1' } };
            global.__api.reset(fx.routes(loaded));
            mount(PartyLobbyScreen);
            await act(async () => {
                await jest.advanceTimersByTimeAsync(100);
            });
            screen.getByText('Friday Crew');
            global.__api.reset(fx.routes({ ...loaded, getParty: failed, getMembers: failed }));
            await act(async () => {
                await jest.advanceTimersByTimeAsync(16_000);
            });
            expect(api.getParty).toHaveBeenCalled();
            screen.getByText('Friday Crew');
            expect(screen.queryByRole('alert')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    test('the back arrow and join code share are named buttons and Invite friends is a tab', async () => {
        await show(PartyLobbyScreen);
        button(/back/i);
        screen.getByRole('tab', { name: 'Invite friends' });
        button(/ABC234|share/i);
    });
});

describe('Swipe', () => {
    test('loading shows neither a card nor the empty state', async () => {
        await show(SwipeScreen, { getLocations: never });
        expect(screen.queryByText('Blue Bottle Cafe')).toBeNull();
        expect(screen.queryByText('No spots in this area yet')).toBeNull();
    });

    test('empty deck says there are no spots and offers the lobby', async () => {
        await show(SwipeScreen, { getLocations: [] });
        screen.getByText('No spots in this area yet');
        screen.getByText('Back to lobby');
    });

    test('loaded deck shows the first card, progress and labeled vote buttons, and Like votes yes', async () => {
        await show(SwipeScreen);
        screen.getByText('Card 1 of 2');
        screen.getByText('Blue Bottle Cafe');
        screen.getByText('Your turn - swipe or tap to vote');
        button('Back');
        button('Skip Blue Bottle Cafe');
        fireEvent.click(button('Like Blue Bottle Cafe'));
        await settle();
        expect(api.vote).toHaveBeenCalledWith('p1', 'l1', true);
    });

    test('a failed deck load shows an error with Try again instead of the empty state, and retrying loads the deck', async () => {
        await show(SwipeScreen, { getLocations: failed });
        expect(screen.queryByText('No spots in this area yet')).toBeNull();
        await retryLoads(expectLoadError("We couldn't load the spots for this party"));
        screen.getByText('Blue Bottle Cafe');
    });
});

describe('Discover', () => {
    const at = (latitude) => getLiveLocation.mockResolvedValue({ ok: true, coords: { latitude, longitude: -74.03 } });

    test('before any spots are cached, no location shows the reason with Try again and Pick a city', async () => {
        getLiveLocation.mockResolvedValue({ ok: false, reason: 'unavailable' });
        await show(DiscoverScreen);
        await screen.findByText(/couldn't find where you are/);
        button('Try again');
        button('Pick a city');
    });

    test('loading says it is finding spots and parties', async () => {
        at(41.0);
        await show(DiscoverScreen, { discoverVenues: never, discoverParties: never });
        await screen.findByText('Finding nearby spots…');
        screen.getByText('Looking for parties…');
        screen.getByText('Using: Live location');
    });

    test('fallback venues show as Popular spots with a plain paused line and no Load more', async () => {
        at(39.5);
        await show(DiscoverScreen, { discoverVenues: fx.popularSpots });
        await screen.findByText('Popular spots');
        screen.getByText('Live lookups are paused today.');
        expect(screen.queryByText('Trending near you')).toBeNull();
        expect(screen.getAllByText('Harbor Light Cafe (demo)').length).toBeGreaterThan(0);
        expect(screen.queryByText(/Load\s+more/)).toBeNull();
    });

    test('live venues keep the Trending near you heading without the paused line', async () => {
        at(39.7);
        await show(DiscoverScreen);
        await screen.findByText('Trending near you');
        expect(screen.queryByText('Popular spots')).toBeNull();
        expect(screen.queryByText('Live lookups are paused today.')).toBeNull();
    });

    test('a paused venue quota shows the paused message', async () => {
        at(42.0);
        await show(DiscoverScreen, { discoverVenues: new Error('Venue lookups are paused for today, try again tomorrow') });
        await screen.findByText(/paused for today/);
    });

    test('empty says nothing was found and offers Start a Party', async () => {
        at(43.0);
        await show(DiscoverScreen, { discoverVenues: [] });
        await screen.findByText(/No spots found nearby/);
        button('Start a Party');
    });

    test('loaded shows nearby venues from the live location', async () => {
        at(44.0);
        await show(DiscoverScreen);
        expect((await screen.findAllByText('Hudson Taproom')).length).toBeGreaterThan(0);
        for (const tab of ['Home', 'Discover', 'Party', 'Calendar', 'Profile']) screen.getByRole('tab', { name: tab });
    });

    test('a failed venue load shows an error with Try again instead of the empty state, and retrying loads spots', async () => {
        at(45.0);
        await show(DiscoverScreen, { discoverVenues: failed });
        await screen.findByText(/Trending near you/);
        expect(screen.queryByText(/No spots found nearby/)).toBeNull();
        await retryLoads(expectLoadError("We couldn't load spots near you"));
        expect(screen.getAllByText('Hudson Taproom').length).toBeGreaterThan(0);
    });

    test('the Explore, Feed and Your Likes switch is a set of tabs', async () => {
        at(46.0);
        await show(DiscoverScreen);
        screen.getByRole('tab', { name: 'Feed' });
    });
});

describe('Profile', () => {
    test('loading shows placeholders for every field', async () => {
        await show(ProfileScreen, { me: never });
        expect(screen.getAllByText('Loading...').length).toBeGreaterThan(3);
    });

    test('loaded shows the profile fields, follow counts and appearance choices', async () => {
        await show(ProfileScreen);
        screen.getByText('Alice Liddell');
        screen.getByText('alice@test.dev');
        screen.getByText('she/her');
        screen.getByText('Coffee first');
        screen.getByText('Followers');
        screen.getByText('Always dark');
        screen.getByText('Sign out');
    });

    test('a failed profile load shows an error with Try again instead of loading forever, and retrying loads the profile', async () => {
        await show(ProfileScreen, { me: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
        await retryLoads(expectLoadError("We couldn't load your profile"));
        screen.getByText('Alice Liddell');
    });

    test('Sign out, Delete account and Edit photo are buttons', async () => {
        await show(ProfileScreen);
        button('Sign out');
        button('Delete account');
        button('Edit photo');
    });
});

describe('CalendarConfirmation', () => {
    test('loading shows placeholders and the calendar actions', async () => {
        await show(CalendarConfirmationScreen, { getMatch: never, getParty: never });
        expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
        button('Add to Google Calendar');
        button('Download .ics');
    });

    test('loaded shows the Link venue, locked date, time and attendees', async () => {
        await show(CalendarConfirmationScreen);
        screen.getByText('Blue Bottle Cafe');
        screen.getByText('1 Main St');
        screen.getByText('Friday, November 20, 2026');
        screen.getByText('6:00 PM');
        button('Add to Google Calendar');
        button('Back to Home');
        button('Share');
    });

    test('Download .ics sits beside Add to Google Calendar and says it works in any calendar app without connecting', async () => {
        await show(CalendarConfirmationScreen);
        button('Add to Google Calendar');
        button('Download .ics');
        screen.getByText('The .ics file works with any calendar app, like Apple, Outlook or Google. No connection needed.');
    });

    test('Download .ics saves the hangout as linkdup-meetup.ics without asking to connect Google', async () => {
        const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
        const saved = [];
        URL.createObjectURL = jest.fn((blob) => { saved.push(blob); return 'blob:ics'; });
        URL.revokeObjectURL = jest.fn();
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { saved.push(this.download, this.href); });
        try {
            await show(CalendarConfirmationScreen, { calendarIcs: ics });
            fireEvent.click(button('Download .ics'));
            await settle();
            expect(api.calendarIcs).toHaveBeenCalledWith('p1');
            expect(api.calendarOAuthStart).not.toHaveBeenCalled();
            expect(click).toHaveBeenCalledTimes(1);
            expect(saved[0].type).toBe('text/calendar');
            const text = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsText(saved[0]); });
            expect(text).toBe(ics);
            expect(saved.slice(1)).toEqual(['linkdup-meetup.ics', 'blob:ics']);
        } finally {
            click.mockRestore();
        }
    });

    test('Add to Google Calendar asks a member without Google to connect first', async () => {
        await show(CalendarConfirmationScreen, { calendarOAuthStart: { url: 'https://accounts.google.com/o/oauth2' } });
        fireEvent.click(button('Add to Google Calendar'));
        await settle();
        expect(api.calendarOAuthStart).toHaveBeenCalledTimes(1);
        expect(api.calendarExport).not.toHaveBeenCalled();
    });

    test('when the server says Google is not connected, Add to Google Calendar falls back to connecting', async () => {
        await show(CalendarConfirmationScreen, {
            me: { ...fx.profile, google_calendar_connected: true },
            calendarExport: new Error('user_not_connected_to_google'),
            calendarOAuthStart: { url: 'https://accounts.google.com/o/oauth2' },
        });
        fireEvent.click(button('Add to Google Calendar'));
        await settle();
        expect(api.calendarExport).toHaveBeenCalledWith('p1');
        expect(api.calendarOAuthStart).toHaveBeenCalledTimes(1);
    });

    test('a failed load shows an error with Try again instead of loading forever, and retrying loads the hangout', async () => {
        await show(CalendarConfirmationScreen, { getMatch: failed, getParty: failed, getMembers: failed, getDates: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
        await retryLoads(expectLoadError("We couldn't load your hangout details"));
        screen.getByText('Blue Bottle Cafe');
    });
});

describe('FollowList', () => {
    test('View profile in the long-press menu opens that person in the profile sheet instead of a missing route', async () => {
        const menu = jest.spyOn(dialogs, 'showMenu').mockImplementation(async (title, actions) => {
            actions.find((a) => a.label === 'View profile').onPress();
        });
        try {
            await show(FollowListScreen, {
                getFollowers: [{ id: 'bob', display_name: 'Bob Builder', username: 'bob', avatar_color: '#22C55E', avatar_url: null }],
                getPublicUser: { id: 'bob', display_name: 'Bob Builder', username: 'bob', bio: 'Builds things', follower_count: 3, following_count: 4 },
                getFriends: [],
                getPendingRequests: [],
            }, { userId: 'alice', initialTab: 'followers', username: 'alice' });
            const row = screen.getByText('@bob');
            fireEvent.mouseDown(row);
            await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
            fireEvent.mouseUp(row);
            await settle();
            expect(menu).toHaveBeenCalledWith('Bob Builder', expect.any(Array));
            expect(global.__navigation.navigate).not.toHaveBeenCalledWith('UserProfile', expect.anything());
            expect(api.getPublicUser).toHaveBeenCalledWith('bob');
            await screen.findByText('Builds things');
        } finally {
            menu.mockRestore();
        }
    });
});

describe('Walkthrough', () => {
    afterEach(() => {
        global.__theme = undefined;
    });

    test('from signup in light mode paints no dark theme background on any slide', async () => {
        global.__theme = 'light';
        const { container } = await show(WalkthroughScreen, {}, { fromSignup: true });
        const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
        const dark = [color.dark.background, color.dark.surface, color.dark.surfaceRaised].map(rgb);
        const painted = [...container.querySelectorAll('*')].map((el) => getComputedStyle(el).backgroundColor);
        expect(painted).toContain(rgb(color.light.background));
        expect(painted.filter((bg) => dark.includes(bg))).toEqual([]);
    });
});

describe('slow loads', () => {
    const SLOW = 'Taking longer than usual. The server may be waking up, which can take up to a minute.';
    const cases = [
        ['Home', HomeScreen, { myParties: never }],
        ['Friends', FriendsScreen, { getFriends: never, getPendingRequests: never }],
        ['PartyLobby', PartyLobbyScreen, { getParty: never, getMembers: never }],
        ['Swipe', SwipeScreen, { getLocations: never }],
        ['Discover', DiscoverScreen, { discoverVenues: never, discoverParties: never }],
        ['Profile', ProfileScreen, { me: never }],
        ['CalendarConfirmation', CalendarConfirmationScreen, { getMatch: never, getParty: never }],
    ];

    afterEach(() => jest.useRealTimers());

    for (const [name, Screen, overrides] of cases) {
        test(`${name} says it is taking longer than usual after 8 seconds of loading`, async () => {
            getLiveLocation.mockResolvedValue({ ok: true, coords: { latitude: 47.0 + cases.findIndex((c) => c[0] === name), longitude: -74.03 } });
            jest.useFakeTimers();
            global.__route = { params: { partyId: 'p1' } };
            global.__api.reset(fx.routes({ ...loaded, ...overrides }));
            mount(Screen);
            await act(async () => {
                await jest.advanceTimersByTimeAsync(7_500);
            });
            expect(screen.queryByText(SLOW)).toBeNull();
            expect(screen.getByRole('status').textContent).toBe('');
            await act(async () => {
                await jest.advanceTimersByTimeAsync(1_000);
            });
            expect(screen.getByRole('status').textContent).toBe(SLOW);
        });
    }
});

describe('Cold start note', () => {
    const WAKING = 'Waking up the server. This can take about 30 seconds on the free plan.';
    const actual = jest.requireActual('../src/services/api');
    const realFetch = global.fetch;

    afterEach(() => {
        global.fetch = realFetch;
        jest.useRealTimers();
    });

    test('the first sign in screen shows a waking up note after 3 seconds and clears it when the request finishes', async () => {
        jest.useFakeTimers();
        let finish;
        global.fetch = jest.fn(() => new Promise((r) => { finish = r; }));
        global.__route = { params: {} };
        global.__api.reset(fx.routes({ demoAvailable: { available: false } }));
        render(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <LoginScreen />
                <ColdStartNote />
            </SafeAreaProvider>,
        );
        let request;
        await act(async () => {
            request = actual.api.health();
            await jest.advanceTimersByTimeAsync(2_900);
        });
        expect(screen.queryByText(WAKING)).toBeNull();
        await act(async () => {
            await jest.advanceTimersByTimeAsync(100);
        });
        const note = screen.getByText(WAKING);
        expect(note.getAttribute('role')).toBe('status');
        expect(note.getAttribute('aria-live')).toBe('polite');
        screen.getByText('Continue with Google');
        await act(async () => {
            finish({ ok: true, status: 200, text: async () => '{"ok":true}' });
            await request;
        });
        expect(screen.queryByText(WAKING)).toBeNull();
    });

    test('a venue limit error keeps the server body so the lobby can show the fallback spots', async () => {
        const body = { error: 'venue_limit_reached', fallback: true, venues: fx.popularSpots };
        global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => JSON.stringify(body) }));
        const err = await actual.api.startParty('p1').catch((e) => e);
        expect(err.message).toBe('Venue lookups are paused for today, try again tomorrow');
        expect(err.data).toEqual(body);
    });

    test('the waking up note does not animate, so reduced motion is respected', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '../src/components/LoadState.tsx'), 'utf8');
        const body = src.slice(src.indexOf('export function ColdStartNote'), src.indexOf('function makeStyles'));
        expect(body).not.toMatch(/Animated|entering|FadeIn|transition|animation/);
        expect(body).toMatch(/pointerEvents="none"/);
    });
});

describe('Demo mode', () => {
    const plainProfile = global.__profile;
    const actual = jest.requireActual('../src/services/api');
    const realFetch = global.fetch;
    const demoText = 'Demo mode, read only. Sign up to create your own parties.';
    const demo = { available: true };
    const session = { user: { id: 'demo' }, session: { access_token: 'tok-demo', refresh_token: 'refresh-demo', expires_at: 1 } };

    afterEach(() => {
        global.__profile = plainProfile;
        global.fetch = realFetch;
        while (dialogs.getSnapshot().dialog) dialogs.dismiss();
    });

    test('Login offers Try the demo with a one line explanation when the server has a demo, and it signs in with the demo session', async () => {
        await show(LoginScreen, { demoAvailable: demo, demo: session }, {});
        screen.getByText('Look around with sample data. No sign up needed.');
        fireEvent.click(button('Try the demo'));
        await settle();
        expect(api.demo).toHaveBeenCalled();
        expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'tok-demo', refresh_token: 'refresh-demo' });
    });

    test('Login hides Try the demo when the server has no demo or cannot be reached', async () => {
        await show(LoginScreen, { demoAvailable: { available: false } }, {});
        expect(screen.queryByRole('button', { name: 'Try the demo' })).toBeNull();
        await show(LoginScreen, { demoAvailable: failed }, {});
        expect(screen.queryByRole('button', { name: 'Try the demo' })).toBeNull();
    });

    test('a failed demo sign in shows a friendly message', async () => {
        await show(LoginScreen, { demoAvailable: demo, demo: new Error('rate_limited') }, {});
        fireEvent.click(button('Try the demo'));
        await settle();
        screen.getByText('Too many tries. Wait a minute and try again.');
    });

    test('the last Onboarding slide offers Try the demo', async () => {
        await show(OnboardingScreen, { demoAvailable: demo }, {});
        fireEvent.click(screen.getByText('Skip'));
        await settle();
        button('Get Started');
        button('Try the demo');
    });

    test('the demo banner says it is read only and Sign up signs out', async () => {
        global.__profile = { ...plainProfile, is_demo: true };
        await show(DemoBanner, {}, {});
        screen.getByText(demoText);
        fireEvent.click(button('Sign up'));
        expect(global.__signOut).toHaveBeenCalled();
    });

    test('the demo banner is hidden for normal accounts', async () => {
        await show(DemoBanner, {}, {});
        expect(screen.queryByText(demoText)).toBeNull();
    });

    test('a demo_read_only answer opens the demo dialog once, and Sign up signs out only this device', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: 'demo_read_only' }) }));
        await expect(actual.api.vote('p1', 'l1', true)).rejects.toThrow('demo_read_only');
        await expect(actual.api.likeFeedPost('post1')).rejects.toThrow('demo_read_only');
        expect(dialogs.getSnapshot().dialog.title).toBe('Demo mode, read only');
        dialogs.respond(1);
        await settle();
        expect(dialogs.getSnapshot().dialog).toBeNull();
        expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    test('background saves refused in demo mode stay quiet', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: 'demo_read_only' }) }));
        await expect(actual.api.markHintSeen('home')).rejects.toThrow('demo_read_only');
        await expect(actual.api.updateLocation(40.7, -74)).rejects.toThrow('demo_read_only');
        expect(dialogs.getSnapshot().dialog).toBeNull();
    });

    test('server photo paths go to the API and demo photos stay on the web app', () => {
        expect(actual.photoUri('/api/photo?name=places%2Fx')).toBe('http://api.test/api/photo?name=places%2Fx');
        expect(actual.photoUri('/demo/venue-harbor-light.jpg')).toBe('/demo/venue-harbor-light.jpg');
        expect(actual.photoUri('https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg');
    });

    test('demo Discover uses the stored demo location instead of asking for live location', async () => {
        global.__profile = { ...plainProfile, is_demo: true, latitude: 47.5, longitude: -74.03 };
        getLiveLocation.mockClear();
        await show(DiscoverScreen);
        expect((await screen.findAllByText('Hudson Taproom')).length).toBeGreaterThan(0);
        expect(api.discoverVenues).toHaveBeenCalledWith(47.5, -74.03);
        expect(getLiveLocation).not.toHaveBeenCalled();
        expect(api.updateLocation).not.toHaveBeenCalled();
        screen.getByText('Using: Chosen city');
    });

    test('demo vote buttons are disabled', async () => {
        global.__profile = { ...plainProfile, is_demo: true };
        await show(SwipeScreen);
        expect(button('Like Blue Bottle Cafe').getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(button('Like Blue Bottle Cafe'));
        await settle();
        expect(api.vote).not.toHaveBeenCalled();
    });

    test('demo comment send is disabled', async () => {
        global.__profile = { ...plainProfile, is_demo: true };
        global.__api.reset(fx.routes({ getFeedComments: [] }));
        mount(() => <CommentSheet visible postId="post1" onClose={() => {}} currentUserId="alice" initialCommentCount={0} onCommentCountChange={() => {}} />);
        await settle();
        const input = screen.getByPlaceholderText('Add a comment…');
        fireEvent.change(input, { target: { value: 'hi' } });
        await settle();
        expect(button('Send comment').getAttribute('aria-disabled')).toBe('true');
    });
});
