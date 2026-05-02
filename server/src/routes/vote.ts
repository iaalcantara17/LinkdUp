import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { tryAdvanceCard } from '../services/matchEngine';

const router = Router();

const voteSchema = z.object({
    location_id: z.string().uuid(),
    vote: z.boolean(),
});

router.post('/:id/vote', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const body = voteSchema.parse(req.body);

        const { data: member } = await supabaseAdmin
            .from('party_members')
            .select('user_id')
            .eq('party_id', partyId)
            .eq('user_id', req.user!.id)
            .maybeSingle();
        if (!member) throw new HttpError(403, 'not_a_member');

        const { data: loc } = await supabaseAdmin
            .from('locations')
            .select('id, party_id')
            .eq('id', body.location_id)
            .single();
        if (!loc || loc.party_id !== partyId) throw new HttpError(404, 'location_not_found');

        const { error: voteErr } = await supabaseAdmin.from('votes').upsert(
            {
                party_id: partyId,
                user_id: req.user!.id,
                location_id: body.location_id,
                vote: body.vote,
                voted_at: new Date().toISOString(),
            },
            { onConflict: 'party_id,user_id,location_id' }
        );
        if (voteErr) throw new HttpError(500, 'vote_failed', voteErr.message);

        const result = await tryAdvanceCard(partyId);

        res.json({ ok: true, match: result.matchResult });
    } catch (e) { next(e); }
});

router.get('/:id/votes', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const { data, error } = await supabaseAdmin
            .from('v_party_vote_tallies')
            .select('location_id, location_name, yes_votes, no_votes, total_members')
            .eq('party_id', partyId);
        if (error) throw error;
        res.json(data ?? []);
    } catch (e) { next(e); }
});

router.get('/:id/my-votes', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;
        const { data, error } = await supabaseAdmin
            .from('votes')
            .select('location_id')
            .eq('party_id', partyId)
            .eq('user_id', req.user!.id);
        if (error) throw error;
        res.json(data ?? []);
    } catch (e) { next(e); }
});

export default router;
