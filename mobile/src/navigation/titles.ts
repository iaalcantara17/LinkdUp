export const routeTitles: Record<string, string> = {
    Onboarding: 'Welcome',
    Login: 'Log In',
    AuthCallback: 'Signing In',
    Home: 'Home',
    Discover: 'Discover',
    Profile: 'Profile',
    Hangouts: 'Calendar',
    Friends: 'Friends',
    LocationPermission: 'Location',
    CreateParty: 'Create a Party',
    JoinParty: 'Join a Party',
    PartyLobby: 'Party Lobby',
    Swipe: 'Swipe',
    Proposal: 'Top Pick',
    Match: 'Match',
    DateTimeSetup: 'Pick a Date',
    CalendarConfirmation: 'Confirm',
    CompleteProfile: 'Complete Profile',
    CrewMapFullscreen: 'Crew Map',
    Walkthrough: 'How It Works',
    CreatePost: 'New Post',
    MyPosts: 'My Posts',
    Saved: 'Saved',
    FollowList: 'Followers',
    BlockedUsers: 'Blocked Users',
};

export function documentTitle(routeName: string | undefined): string {
    const title = routeName ? routeTitles[routeName] : undefined;
    return title ? `${title} · LinkdUp` : 'LinkdUp';
}
