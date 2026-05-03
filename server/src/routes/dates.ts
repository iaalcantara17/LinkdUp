import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createCalendarEventForUser } from '../services/googleCalendar';

const router = Router();

async function assertMember(partyId: string, userId: string) {
    const { data } = await supabaseAdmin
        .from('party_members')
        .select('user_id')
        .eq('party_id', partyId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!data) throw new HttpError(403, 'not_a_member');
}

async function assertHost(partyId: string, userId: string) {
    const { data } = await supabaseAdmin
        .from('parties')
        .select('host_user_id')
        .eq('id', partyId)
        .single();
    if (!data) throw new HttpError(404, 'party_not_found');
    if (data.host_user_id !== userId) throw new HttpError(403, 'not_host');
}

// POST /:id/dates — any member proposes a single date
const proposeDateSchema = z.object({
    proposed_date: z.string().min(1),
    time_slot: z.string().optional(),
});

router.post('/:id/dates', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);

        const { proposed_date } = proposeDateSchema.parse(req.body);
        const start = new Date(proposed_date);
        if (isNaN(start.getTime())) throw new HttpError(400, 'invalid_date');
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

        const { data: existing } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at, proposed_by')
            .eq('party_id', partyId)
            .eq('starts_at', start.toISOString())
            .maybeSingle();
        if (existing) return res.json(existing);

        const { data: created, error } = await supabaseAdmin
            .from('party_dates')
            .insert({
                party_id: partyId,
                starts_at: start.toISOString(),
                ends_at: end.toISOString(),
                proposed_by: req.user!.id,
            })
            .select('id, starts_at, ends_at, proposed_by')
            .single();
        if (error || !created) throw new HttpError(500, 'propose_failed', error?.message);

        await supabaseAdmin
            .from('parties')
            .update({ status: 'scheduled', updated_at: new Date().toISOString() })
            .eq('id', partyId)
            .eq('status', 'matched');

        res.status(201).json(created);
    } catch (e) { next(e); }
});

async function getDateVoteSummary(dateId: string) {
    const { data: updatedVotes } = await supabaseAdmin
        .from('date_votes')
        .select('user_id, available')
        .eq('party_date_id', dateId);

    const voteCount = (updatedVotes ?? []).filter((v) => v.available).length;
    return { vote_count: voteCount, votes: updatedVotes ?? [] };
}

async function exportLockedDateToCalendars(partyId: string, dateRecord: { starts_at: string; ends_at: string }) {
    const { data: party } = await supabaseAdmin
        .from('parties')
        .select('matched_location_id, name')
        .eq('id', partyId)
        .single();

    const { data: location } = party?.matched_location_id
        ? await supabaseAdmin.from('locations').select('name, address').eq('id', party.matched_location_id).single()
        : { data: null };

    const { data: memberRows } = await supabaseAdmin
        .from('party_members')
        .select('user_id')
        .eq('party_id', partyId);

    const memberIds = (memberRows ?? []).map((m: any) => m.user_id);
    if (memberIds.length === 0) return 0;

    const { data: allMemberUsers } = await supabaseAdmin
        .from('users')
        .select('id, email, google_calendar_token')
        .in('id', memberIds);

    const attendeeEmails = (allMemberUsers ?? []).map((u: any) => u.email).filter(Boolean);
    const connectedUsers = (allMemberUsers ?? []).filter((u: any) => !!u.google_calendar_token);

    const ev = {
        summary: party?.name ? `LinkdUp: ${party.name}` : `LinkdUp meetup${location ? ` at ${location.name}` : ''}`,
        description: 'Locked in via LinkdUp.',
        location: location ? `${location.name} - ${location.address}` : undefined,
        startISO: dateRecord.starts_at,
        endISO: dateRecord.ends_at,
        attendeeEmails,
    };

    let exported = 0;
    for (const user of connectedUsers) {
        try {
            await createCalendarEventForUser(user.id, ev);
            exported++;
        } catch (e) {
            console.error(`[dates:lock] gcal export failed for ${user.id}:`, e);
        }
    }

    return exported;
}

// GET /:id/dates — all proposed dates, enriched with proposer + vote details
router.get('/:id/dates', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertMember(partyId, req.user!.id);
        const callerId = req.user!.id;

        const [partyRes, datesRes] = await Promise.all([
            supabaseAdmin.from('parties').select('locked_date_id').eq('id', partyId).single(),
            supabaseAdmin.from('party_dates').select('id, starts_at, ends_at, proposed_by').eq('party_id', partyId).order('starts_at'),
        ]);

        const dates = datesRes.data ?? [];
        if (dates.length === 0) return res.json([]);

        const { count: memberCount } = await supabaseAdmin
            .from('party_members')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId);

        const dateIds = dates.map((d) => d.id);

        const { data: votes } = await supabaseAdmin
            .from('date_votes')
            .select('party_date_id, user_id, available')
            .in('party_date_id', dateIds);

        const allUserIds = new Set<string>();
        dates.forEach((d) => { if (d.proposed_by) allUserIds.add(d.proposed_by); });
        (votes ?? []).forEach((v) => allUserIds.add(v.user_id));

        const userIds = Array.from(allUserIds);
        const { data: users } = userIds.length > 0
            ? await supabaseAdmin.from('users').select('id, display_name, username, avatar_color, avatar_url').in('id', userIds)
            : { data: [] as any[] };
        const userMap: Record<string, any> = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));

        const votesByDate = new Map<string, Array<{
            user_id: string;
            display_name: string;
            username: string | null;
            avatar_color: string | null;
            avatar_url: string | null;
            available: boolean;
        }>>();
        for (const v of votes ?? []) {
            if (!votesByDate.has(v.party_date_id)) votesByDate.set(v.party_date_id, []);
            const u = userMap[v.user_id];
            votesByDate.get(v.party_date_id)!.push({
                user_id: v.user_id,
                display_name: u?.display_name ?? '?',
                username: u?.username ?? null,
                avatar_color: u?.avatar_color ?? null,
                avatar_url: u?.avatar_url ?? null,
                available: v.available,
            });
        }

        const lockedDateId = partyRes.data?.locked_date_id ?? null;

        const enriched = dates.map((d) => {
            const dateVotes = votesByDate.get(d.id) ?? [];
            const voteCount = dateVotes.filter((v) => v.available).length;
            const proposerUser = d.proposed_by ? userMap[d.proposed_by] : null;
            const myVoteEntry = dateVotes.find((v) => v.user_id === callerId);
            return {
                id: d.id,
                starts_at: d.starts_at,
                ends_at: d.ends_at,
                proposed_by: proposerUser
                    ? {
                        user_id: d.proposed_by,
                        display_name: proposerUser.display_name,
                        username: proposerUser.username,
                        avatar_color: proposerUser.avatar_color,
                        avatar_url: proposerUser.avatar_url,
                    }
                    : null,
                vote_count: voteCount,
                member_count: memberCount ?? 0,
                votes: dateVotes,
                my_vote: myVoteEntry?.available ?? null,
                is_locked: lockedDateId === d.id,
            };
        });

        enriched.sort((a, b) => {
            if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
            return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
        });

        res.json(enriched);
    } catch (e) { next(e); }
});

// POST /:id/dates/:dateId/vote — any member votes available=true/false on a specific date
const voteSchema = z.object({ available: z.boolean() });

router.post('/:id/dates/:dateId/vote', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { id: partyId, dateId } = req.params;
        await assertMember(partyId, req.user!.id);

        const { available } = voteSchema.parse(req.body);

        const { data: dateRecord } = await supabaseAdmin
            .from('party_dates')
            .select('id')
            .eq('id', dateId)
            .eq('party_id', partyId)
            .maybeSingle();
        if (!dateRecord) throw new HttpError(404, 'date_not_found');

        const { error } = await supabaseAdmin
            .from('date_votes')
            .upsert(
                { party_date_id: dateId, user_id: req.user!.id, available, voted_at: new Date().toISOString() },
                { onConflict: 'party_date_id,user_id' }
            );
        if (error) throw new HttpError(500, 'vote_failed', error.message);

        const summary = await getDateVoteSummary(dateId);
        res.json({ ok: true, ...summary });
    } catch (e) { next(e); }
});

// POST /:id/dates/:dateId/lock — host locks this date, triggers GCal export for connected members
router.post('/:id/dates/:dateId/lock', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { id: partyId, dateId } = req.params;
        await assertHost(partyId, req.user!.id);

        const { data: dateRecord } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at')
            .eq('id', dateId)
            .eq('party_id', partyId)
            .maybeSingle();
        if (!dateRecord) throw new HttpError(404, 'date_not_found');

        const { error } = await supabaseAdmin
            .from('parties')
            .update({ status: 'locked', locked_date_id: dateId, updated_at: new Date().toISOString() })
            .eq('id', partyId);
        if (error) throw new HttpError(500, 'lock_failed', error.message);

        const gcalExported = await exportLockedDateToCalendars(partyId, dateRecord);

        res.json({ ok: true, gcal_exported: gcalExported });
    } catch (e) { next(e); }
});

// DELETE /:id/dates/:dateId — proposer or host deletes a date (cannot delete the locked date)
router.delete('/:id/dates/:dateId', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const { id: partyId, dateId } = req.params;
        await assertMember(partyId, req.user!.id);

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('host_user_id, locked_date_id')
            .eq('id', partyId)
            .single();
        if (!party) throw new HttpError(404, 'party_not_found');
        if (party.locked_date_id === dateId) throw new HttpError(409, 'cannot_delete_locked_date');

        const { data: dateRecord } = await supabaseAdmin
            .from('party_dates')
            .select('id, proposed_by')
            .eq('id', dateId)
            .eq('party_id', partyId)
            .maybeSingle();
        if (!dateRecord) throw new HttpError(404, 'date_not_found');

        const isHost = party.host_user_id === req.user!.id;
        const isProposer = dateRecord.proposed_by === req.user!.id;
        if (!isHost && !isProposer) throw new HttpError(403, 'not_authorized');

        await supabaseAdmin.from('date_votes').delete().eq('party_date_id', dateId);
        const { error } = await supabaseAdmin.from('party_dates').delete().eq('id', dateId);
        if (error) throw new HttpError(500, 'delete_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

// --- Legacy endpoints kept for backward compatibility ---

const dateVoteSchema = z.object({
    date_slot_ids: z.array(z.string().uuid()).min(0),
});

router.post('/:id/dates/vote', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const body = dateVoteSchema.parse(req.body);

        const { data: existingDates } = await supabaseAdmin
            .from('party_dates')
            .select('id')
            .eq('party_id', partyId);
        const existingIds = (existingDates ?? []).map((d) => d.id);

        if (existingIds.length > 0) {
            await supabaseAdmin
                .from('date_votes')
                .delete()
                .eq('user_id', req.user!.id)
                .in('party_date_id', existingIds);
        }

        if (body.date_slot_ids.length > 0) {
            const rows = body.date_slot_ids.map((id) => ({
                party_date_id: id,
                user_id: req.user!.id,
                available: true,
            }));
            const { error } = await supabaseAdmin.from('date_votes').insert(rows);
            if (error) throw new HttpError(500, 'vote_failed', error.message);
        }

        res.json({ ok: true, count: body.date_slot_ids.length });
    } catch (e) { next(e); }
});

const customDateSchema = z.object({ datetime: z.string().min(1) });

router.post('/:id/dates/custom', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;

        const { data: membership } = await supabaseAdmin
            .from('party_members')
            .select('user_id')
            .eq('party_id', partyId)
            .eq('user_id', req.user!.id)
            .maybeSingle();
        if (!membership) throw new HttpError(403, 'not_a_member');

        const { datetime } = customDateSchema.parse(req.body);
        const start = new Date(datetime);
        if (isNaN(start.getTime())) throw new HttpError(400, 'invalid_datetime');
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

        const { data: existing } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at')
            .eq('party_id', partyId)
            .eq('starts_at', start.toISOString())
            .maybeSingle();
        if (existing) return res.json(existing);

        const { data: created, error } = await supabaseAdmin
            .from('party_dates')
            .insert({
                party_id: partyId,
                starts_at: start.toISOString(),
                ends_at: end.toISOString(),
                proposed_by: req.user!.id,
            })
            .select('id, starts_at, ends_at')
            .single();
        if (error || !created) throw new HttpError(500, 'date_create_failed', error?.message);

        res.status(201).json(created);
    } catch (e) { next(e); }
});

const lockSchema = z.object({ party_date_id: z.string().uuid() });

router.post('/:id/dates/lock', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertHost(partyId, req.user!.id);
        const { party_date_id } = lockSchema.parse(req.body);

        const { error } = await supabaseAdmin
            .from('parties')
            .update({ status: 'locked', locked_date_id: party_date_id, updated_at: new Date().toISOString() })
            .eq('id', partyId);
        if (error) throw new HttpError(500, 'lock_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
