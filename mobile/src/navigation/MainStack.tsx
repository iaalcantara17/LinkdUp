import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LocationPermissionScreen from '../screens/LocationPermissionScreen';
import CreatePartyScreen from '../screens/CreatePartyScreen';
import JoinPartyScreen from '../screens/JoinPartyScreen';
import PartyLobbyScreen from '../screens/PartyLobbyScreen';
import SwipeScreen from '../screens/SwipeScreen';
import ProposalScreen from '../screens/ProposalScreen';
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
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion, withScreenFade } from '../components/kit';
import { motion } from '../theme';

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
    Proposal: { partyId: string; locationId: string };
    Match: { partyId: string };
    DateTimeSetup: { partyId: string };
    CalendarConfirmation: { partyId: string };
    AuthCallback: undefined;
    CompleteProfile: undefined;
    CrewMapFullscreen: { partyId: string };
    Walkthrough: { fromSignup?: boolean };
    CreatePost: undefined;
    MyPosts: undefined;
    Saved: undefined;
    FollowList: { userId: string; initialTab: 'followers' | 'following'; username?: string };
    BlockedUsers: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

interface MainStackProps {
    startScreen?: 'CompleteProfile' | 'Walkthrough' | 'LocationPermission' | 'Home';
}

export default function MainStack({ startScreen = 'Home' }: MainStackProps) {
    const { colors } = useTheme();
    const reduced = useReducedMotion();
    const anim = <T extends string>(a: T) => (reduced ? 'none' : a);
    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: anim('slide_from_right'),
                    animationDuration: motion.base,
                }}
                initialRouteName={startScreen}
            >
                <Stack.Screen name="Home" component={withScreenFade(HomeScreen)} />
                <Stack.Screen name="Discover" component={withScreenFade(DiscoverScreen)} />
                <Stack.Screen name="Profile" component={withScreenFade(ProfileScreen)} />
                <Stack.Screen name="LocationPermission" component={withScreenFade(LocationPermissionScreen)} />
                <Stack.Screen name="CreateParty" component={withScreenFade(CreatePartyScreen)} options={{ animation: anim('slide_from_bottom') }} />
                <Stack.Screen name="JoinParty" component={withScreenFade(JoinPartyScreen)} options={{ animation: anim('slide_from_bottom') }} />
                <Stack.Screen name="PartyLobby" component={withScreenFade(PartyLobbyScreen)} />
                <Stack.Screen name="Swipe" component={withScreenFade(SwipeScreen)} />
                <Stack.Screen name="Proposal" component={withScreenFade(ProposalScreen)} options={{ animation: anim('slide_from_bottom') }} />
                <Stack.Screen name="Match" component={withScreenFade(MatchScreen)} options={{ animation: anim('fade') }} />
                <Stack.Screen name="DateTimeSetup" component={withScreenFade(DateTimeSetupScreen)} />
                <Stack.Screen name="CalendarConfirmation" component={withScreenFade(CalendarConfirmationScreen)} />
                <Stack.Screen name="Hangouts" component={withScreenFade(HangoutsScreen)} />
                <Stack.Screen name="AuthCallback" component={withScreenFade(AuthCallbackScreen)} />
                <Stack.Screen name="CompleteProfile" component={withScreenFade(CompleteProfileScreen)} options={{ animation: anim('slide_from_bottom'), gestureEnabled: false }} />
                <Stack.Screen name="Friends" component={withScreenFade(FriendsScreen)} options={{ animation: anim('slide_from_right') }} />
                <Stack.Screen name="CrewMapFullscreen" component={withScreenFade(CrewMapFullscreenScreen)} options={{ animation: anim('slide_from_bottom') }} />
                <Stack.Screen name="Walkthrough" component={withScreenFade(WalkthroughScreen)} options={{ animation: anim('fade'), gestureEnabled: false }} />
                <Stack.Screen name="CreatePost" component={withScreenFade(CreatePostScreen)} options={{ animation: anim('slide_from_bottom') }} />
                <Stack.Screen name="MyPosts" component={withScreenFade(MyPostsScreen)} options={{ animation: anim('slide_from_right') }} />
                <Stack.Screen name="Saved" component={withScreenFade(SavedScreen)} options={{ animation: anim('slide_from_right') }} />
                <Stack.Screen name="FollowList" component={withScreenFade(FollowListScreen)} options={{ animation: anim('slide_from_right') }} />
                <Stack.Screen name="BlockedUsers" component={withScreenFade(BlockedUsersScreen)} options={{ animation: anim('slide_from_right') }} />
            </Stack.Navigator>
        </View>
    );
}
