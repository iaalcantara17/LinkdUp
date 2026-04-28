import { Router } from 'express';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import {
    getAuthUrl,
    exchangeCodeForTokens,
    storeUserTokens,
    createCalendarEventForUser,
    buildICS,
} from '../services/googleCalendar';

const router = Router();

router.get('/oauth/start', requireAuth, async (req: AuthedRequest, res) => {
    const url = getAuthUrl(req.user!.id);
    res.json({ url });
});

router.get('/oauth/callback', async (req, res, next) => {
    try {
        const code = req.query.code as string | undefined;
        const state = req.query.state as string | undefined;
        if (!code || !state) throw new HttpError(400, 'missing_params');

        const tokens = await exchangeCodeForTokens(code);
        if (!tokens.access_token) throw new HttpError(500, 'no_access_token');

        await storeUserTokens(state, tokens.access_token, tokens.refresh_token ?? null);

        res.send(`
            <html><body style="font-family:system-ui;background:#0B0B14;color:white;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="text-align:center;padding:32px;">
                    <h1 style="font-size:32px;margin:0 0 16px;">Connected</h1>
                    <p style="opacity:0.7">You can close this window and return to LinkdUp.</p>
                </div>
            </body></html>
        `);
    } catch (e) { next(e); }
});

router.post('/party/:id/export', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('id, locked_date_id, matched_location_id, name')
            .eq('id', partyId)
            .single();
        if (!party?.locked_date_id || !party.matched_location_id) {
            throw new HttpError(400, 'party_not_locked');
        }

        const [{ data: location }, { data: date }, { data: members }] = await Promise.all([
            supabaseAdmin.from('locations').select('name, address').eq('id', party.matched_location_id).single(),
            supabaseAdmin.from('party_dates').select('starts_at, ends_at').eq('id', party.locked_date_id).single(),
            supabaseAdmin
                .from('party_members')
                .select('users(email)')
                .eq('party_id', partyId),
        ]);

        if (!location || !date) throw new HttpError(404, 'data_missing');

        const attendeeEmails = (members ?? [])
            .map((m: any) => m.users?.email)
            .filter((e: string) => !!e);

        const ev = {
            summary: party.name ? `LinkdUp: ${party.name}` : `LinkdUp meetup at ${location.name}`,
            description: 'Locked in via LinkdUp.',
            location: `${location.name} - ${location.address}`,
            startISO: date.starts_at,
            endISO: date.ends_at,
            attendeeEmails,
        };

        const result = await createCalendarEventForUser(req.user!.id, ev);

        if (result.id) {
            await supabaseAdmin
                .from('parties')
                .update({ gcal_event_id: result.id })
                .eq('id', partyId);
        }

        res.json({ ok: true, event_id: result.id, html_link: result.htmlLink });
    } catch (e) { next(e); }
});

router.get('/party/:id/ics', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('locked_date_id, matched_location_id, name')
            .eq('id', partyId)
            .single();
        if (!party?.locked_date_id || !party.matched_location_id) {
            throw new HttpError(400, 'party_not_locked');
        }

        const [{ data: location }, { data: date }] = await Promise.all([
            supabaseAdmin.from('locations').select('name, address').eq('id', party.matched_location_id).single(),
            supabaseAdmin.from('party_dates').select('starts_at, ends_at').eq('id', party.locked_date_id).single(),
        ]);
        if (!location || !date) throw new HttpError(404, 'data_missing');

        const ics = buildICS({
            summary: party.name ? `LinkdUp: ${party.name}` : `LinkdUp meetup at ${location.name}`,
            location: `${location.name} - ${location.address}`,
            startISO: date.starts_at,
            endISO: date.ends_at,
        });

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="linkdup-meetup.ics"');
        res.send(ics);
    } catch (e) { next(e); }
});

export default router;
