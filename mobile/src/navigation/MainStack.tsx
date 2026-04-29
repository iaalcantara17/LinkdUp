import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LocationPermissionScreen from '../screens/LocationPermissionScreen';
import CreatePartyScreen from '../screens/CreatePartyScreen';
import JoinPartyScreen from '../screens/JoinPartyScreen';
import PartyLobbyScreen from '../screens/PartyLobbyScreen';
import SwipeScreen from '../screens/SwipeScreen';
import MatchScreen from '../screens/MatchScreen';
import DateTimeSetupScreen from '../screens/DateTimeSetupScreen';
import CalendarConfirmationScreen from '../screens/CalendarConfirmationScreen';
import HangoutsScreen from '../screens/HangoutsScreen';
import AuthCallbackScreen from '../screens/AuthCallbackScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import FriendsScreen from '../screens/FriendsScreen';
import CrewMapFullscreenScreen from '../screens/CrewMapFullscreenScreen';
import WalkthroughScreen from '../screens/WalkthroughScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import MyPostsScreen from '../screens/MyPostsScreen';
import SavedScreen from '../screens/SavedScreen';
import FollowListScreen from '../screens/FollowListScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import { colors } from '../theme';

export type MainStackParamList = {
    Home: undefined;
    Discover: undefined;
    Profile: undefined;
    Hangouts: undefined;
    Friends: undefined;
    LocationPermission: undefined;
    CreateParty: undefined;
    JoinParty: undefined;
    PartyLobby: { partyId: string };
    Swipe: { partyId: string };
    Match: { partyId: string };
    DateTimeSetup: { partyId: string };
    CalendarConfirmation: { partyId: string };
    AuthCallback: undefined;
    CompleteProfile: undefined;
    CrewMapFullscreen: { partyId: string };
    Walkthrough: { fromSignup: boolean };
    CreatePost: undefined;
    MyPosts: undefined;
    Saved: undefined;
    FollowList: { userId: string; initialTab: 'followers' | 'following'; username?: string };
    BlockedUsers: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'slide_from_right',
            }}
            initialRouteName="Home"
        >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Discover" component={DiscoverScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />
            <Stack.Screen name="CreateParty" component={CreatePartyScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="JoinParty" component={JoinPartyScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="PartyLobby" component={PartyLobbyScreen} />
            <Stack.Screen name="Swipe" component={SwipeScreen} />
            <Stack.Screen name="Match" component={MatchScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="DateTimeSetup" component={DateTimeSetupScreen} />
            <Stack.Screen name="CalendarConfirmation" component={CalendarConfirmationScreen} />
            <Stack.Screen name="Hangouts" component={HangoutsScreen} />
            <Stack.Screen name="AuthCallback" component={AuthCallbackScreen} />
            <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Friends" component={FriendsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="CrewMapFullscreen" component={CrewMapFullscreenScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Walkthrough" component={WalkthroughScreen} options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="MyPosts" component={MyPostsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Saved" component={SavedScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="FollowList" component={FollowListScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ animation: 'slide_from_right' }} />
        </Stack.Navigator>
    );
}
