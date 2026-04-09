import { Router } from 'express';
import { supabaseAdmin } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { HttpError } from '../middleware/error';

const router = Router();

router.get('/:id/match', requireAuth, async (req: AuthedRequest, res, next) => {
    try {
        const partyId = req.params.id;

        const { data: party } = await supabaseAdmin
            .from('parties')
            .select('id, status, matched_location_id')
            .eq('id', partyId)
            .single();
        if (!party) throw new HttpError(404, 'party_not_found');

        if (!party.matched_location_id) {
            return res.json({ matched: false, status: party.status });
        }

        const { data: location } = await supabaseAdmin
            .from('locations')
            .select('*')
            .eq('id', party.matched_location_id)
            .single();

        res.json({ matched: true, status: party.status, location });
    } catch (e) { next(e); }
});

export default router;
