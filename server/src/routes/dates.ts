import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';

const router = Router();

async function assertHost(partyId: string, userId: string) {
    const { data } = await supabaseAdmin.from('parties').select('host_user_id').eq('id', partyId).single();
    if (!data) throw new HttpError(404, 'party_not_found');
    if (data.host_user_id !== userId) throw new HttpError(403, 'not_host');
}

const SLOTS_PER_DAY = [
    { hour: 11, minute: 0, label: 'morning' },
    { hour: 13, minute: 30, label: 'lunch' },
    { hour: 18, minute: 0, label: 'evening' },
    { hour: 21, minute: 0, label: 'night' },
];

router.post('/:id/dates', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        await assertHost(partyId, req.user!.id);

        const { data: existing } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at')
            .eq('party_id', partyId)
            .order('starts_at');
        if (existing && existing.length > 0) return res.json(existing);

        const rows: Array<{ party_id: string; starts_at: string; ends_at: string }> = [];
        const now = new Date();
        for (let day = 1; day <= 30; day++) {
            for (const slot of SLOTS_PER_DAY) {
                const start = new Date(now);
                start.setDate(start.getDate() + day);
                start.setHours(slot.hour, slot.minute, 0, 0);
                const end = new Date(start);
                end.setHours(end.getHours() + 2);
                rows.push({
                    party_id: partyId,
                    starts_at: start.toISOString(),
                    ends_at: end.toISOString(),
                });
            }
        }

        const { error: insertErr } = await supabaseAdmin
            .from('party_dates')
            .upsert(rows, { onConflict: 'party_id,starts_at', ignoreDuplicates: true });
        if (insertErr) throw new HttpError(500, 'insert_failed', insertErr.message);

        await supabaseAdmin
            .from('parties')
            .update({ status: 'scheduled', updated_at: new Date().toISOString() })
            .eq('id', partyId)
            .eq('status', 'matched');

        const { data: created } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at')
            .eq('party_id', partyId)
            .order('starts_at');

        res.json(created ?? []);
    } catch (e) { next(e); }
});

router.get('/:id/dates', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const { data: dates } = await supabaseAdmin
            .from('party_dates')
            .select('id, starts_at, ends_at')
            .eq('party_id', partyId)
            .order('starts_at');

        const dateIds = (dates ?? []).map((d) => d.id);
        if (dateIds.length === 0) return res.json([]);

        const { data: votes } = await supabaseAdmin
            .from('date_votes')
            .select('party_date_id, user_id, available')
            .in('party_date_id', dateIds);

        const tally = new Map<string, number>();
        for (const v of votes ?? []) {
            if (v.available) tally.set(v.party_date_id, (tally.get(v.party_date_id) ?? 0) + 1);
        }

        const enriched = (dates ?? []).map((d) => ({
            ...d,
            yes_count: tally.get(d.id) ?? 0,
        }));

        res.json(enriched);
    } catch (e) { next(e); }
});

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

const customDateSchema = z.object({
    datetime: z.string().min(1),
});

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

        const body = customDateSchema.parse(req.body);
        const start = new Date(body.datetime);
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
            .insert({ party_id: partyId, starts_at: start.toISOString(), ends_at: end.toISOString() })
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
        const body = lockSchema.parse(req.body);

        const { error } = await supabaseAdmin
            .from('parties')
            .update({
                status: 'locked',
                locked_date_id: body.party_date_id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        if (error) throw new HttpError(500, 'lock_failed', error.message);

        res.json({ ok: true });
    } catch (e) { next(e); }
});

export default router;
