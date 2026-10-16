import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
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
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <Screen />
        </SafeAreaProvider>,
    );
    await settle();
}

async function settle() {
    for (let i = 0; i < 20; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const button = (name) => screen.getByRole('button', { name });
const showsFailure = () => screen.getByText(/couldn't|could not|try again|went wrong/i);

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

    test.skip('BUG: a failed party load shows "No parties yet" instead of an error', async () => {
        await show(HomeScreen, { myParties: failed });
        expect(screen.queryByText('No parties yet')).toBeNull();
        showsFailure();
    });

    test.skip('BUG: Join a party, Friends and Help have no button role, so they have no accessible name as buttons', async () => {
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

    test.skip('BUG: a failed friends load shows "No friends yet" instead of an error', async () => {
        await show(FriendsScreen, { getFriends: failed });
        expect(screen.queryByText('No friends yet')).toBeNull();
        showsFailure();
    });

    test.skip('BUG: Find Friends and the Friends, Requests and Search tabs have no accessible role', async () => {
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

    test('a guest waits for the host and has no Start swiping button', async () => {
        await show(PartyLobbyScreen, { getParty: { ...lobbyParty, party: { ...fx.party, host_user_id: 'bob' } } });
        screen.getByText('Waiting for the host to start...');
        expect(screen.queryByRole('button', { name: 'Start swiping' })).toBeNull();
    });

    test.skip('BUG: a failed party load stays on "Loading..." forever with no error or retry', async () => {
        await show(PartyLobbyScreen, { getParty: failed, getMembers: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
        showsFailure();
    });

    test.skip('BUG: the back arrow, Invite friends tab and join code share have no accessible role or name', async () => {
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

    test.skip('BUG: a failed deck load shows "No spots in this area yet" instead of an error', async () => {
        await show(SwipeScreen, { getLocations: failed });
        expect(screen.queryByText('No spots in this area yet')).toBeNull();
        showsFailure();
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

    test.skip('BUG: a failed venue load shows "No spots found nearby" instead of an error', async () => {
        at(45.0);
        await show(DiscoverScreen, { discoverVenues: failed });
        await screen.findByText(/Trending near you/);
        expect(screen.queryByText(/No spots found nearby/)).toBeNull();
        showsFailure();
    });

    test.skip('BUG: the Explore, Feed and Your Likes switch has no tab role', async () => {
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

    test.skip('BUG: a failed profile load leaves every field on "Loading..." even though the signed-in profile is known', async () => {
        await show(ProfileScreen, { me: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
    });

    test.skip('BUG: Sign out, Delete account and Edit photo have no button role', async () => {
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

    test.skip('BUG: a failed load stays on "Loading..." with no error or retry', async () => {
        await show(CalendarConfirmationScreen, { getMatch: failed, getParty: failed, getMembers: failed, getDates: failed });
        expect(screen.queryAllByText('Loading...')).toHaveLength(0);
        showsFailure();
    });
});
