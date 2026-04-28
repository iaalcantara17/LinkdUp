import { google } from 'googleapis';
import { config } from '../config';
import { supabaseAdmin } from '../db';

export function makeOAuthClient() {
    return new google.auth.OAuth2(
        config.google.oauthClientId,
        config.google.oauthClientSecret,
        config.google.oauthRedirectUri
    );
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export function getAuthUrl(state: string) {
    const oauth2Client = makeOAuthClient();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
    });
}

export async function exchangeCodeForTokens(code: string) {
    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

export async function storeUserTokens(userId: string, accessToken: string, refreshToken?: string | null) {
    await supabaseAdmin
        .from('users')
        .update({
            google_calendar_token: accessToken,
            google_calendar_refresh: refreshToken ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
}

export interface CalendarEventInput {
    summary: string;
    description?: string;
    location?: string;
    startISO: string;
    endISO: string;
    attendeeEmails?: string[];
}

export async function createCalendarEventForUser(userId: string, ev: CalendarEventInput) {
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('google_calendar_token, google_calendar_refresh')
        .eq('id', userId)
        .single();

    if (!user?.google_calendar_token) {
        throw new Error('user_not_connected_to_google');
    }

    const oauth2Client = makeOAuthClient();
    oauth2Client.setCredentials({
        access_token: user.google_calendar_token,
        refresh_token: user.google_calendar_refresh ?? undefined,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const result = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'all',
        requestBody: {
            summary: ev.summary,
            description: ev.description,
            location: ev.location,
            start: { dateTime: ev.startISO },
            end: { dateTime: ev.endISO },
            attendees: ev.attendeeEmails?.map((email) => ({ email })),
        },
    });

    return result.data;
}

export async function deleteCalendarEventForUser(userId: string, eventId: string): Promise<void> {
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('google_calendar_token, google_calendar_refresh')
        .eq('id', userId)
        .single();

    if (!user?.google_calendar_token) return;

    const oauth2Client = makeOAuthClient();
    oauth2Client.setCredentials({
        access_token: user.google_calendar_token,
        refresh_token: user.google_calendar_refresh ?? undefined,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId });
}

export function buildICS(ev: CalendarEventInput): string {
    const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `linkdup-${Date.now()}@linkdup.app`;
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LinkdUp//Capstone//EN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${fmt(new Date().toISOString())}`,
        `DTSTART:${fmt(ev.startISO)}`,
        `DTEND:${fmt(ev.endISO)}`,
        `SUMMARY:${escapeICS(ev.summary)}`,
        ev.location ? `LOCATION:${escapeICS(ev.location)}` : '',
        ev.description ? `DESCRIPTION:${escapeICS(ev.description)}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
        .filter(Boolean)
        .join('\r\n');
}

function escapeICS(s: string) {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
