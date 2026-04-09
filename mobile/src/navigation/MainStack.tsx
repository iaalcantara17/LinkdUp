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
import { colors } from '../theme';

export type MainStackParamList = {
    Home: undefined;
    Discover: undefined;
    Profile: undefined;
    LocationPermission: undefined;
    CreateParty: undefined;
    JoinParty: undefined;
    PartyLobby: { partyId: string };
    Swipe: { partyId: string };
    Match: { partyId: string };
    DateTimeSetup: { partyId: string };
    CalendarConfirmation: { partyId: string };
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
        </Stack.Navigator>
    );
}
