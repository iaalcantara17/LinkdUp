import { supabaseAdmin } from '../db';
import { HttpError } from '../middleware/error';

export async function assertMember(partyId: string, userId: string) {
    const { data } = await supabaseAdmin
        .from('party_members')
        .select('user_id')
        .eq('party_id', partyId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!data) throw new HttpError(403, 'not_a_member');
}
