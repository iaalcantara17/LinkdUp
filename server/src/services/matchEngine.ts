import { supabaseAdmin } from '../db';

export interface MatchResult {
    matched: boolean;
    locationId?: string;
    yesVotes?: number;
    totalMembers?: number;
}

/**
 * Strict majority match: a location wins when its yes-vote count is
 * strictly greater than 50% of total party members. The first location to
 * cross the threshold wins; subsequent yes votes do not unmatch.
 */
export async function evaluateMatch(partyId: string): Promise<MatchResult> {
    // Look up party current state - if already matched, return early
    const { data: party, error: partyErr } = await supabaseAdmin
        .from('parties')
        .select('id, status, matched_location_id')
        .eq('id', partyId)
        .single();

    if (partyErr || !party) return { matched: false };
    if (party.status !== 'swiping') {
        return {
            matched: party.matched_location_id != null,
            locationId: party.matched_location_id ?? undefined,
        };
    }

    // Count members
    const { count: memberCount, error: memberErr } = await supabaseAdmin
        .from('party_members')
        .select('*', { count: 'exact', head: true })
        .eq('party_id', partyId);

    if (memberErr || memberCount == null || memberCount === 0) {
        return { matched: false };
    }

    // Pull yes vote tallies grouped by location, ordered by count desc
    const { data: tallies, error: tallyErr } = await supabaseAdmin
        .from('v_party_vote_tallies')
        .select('location_id, yes_votes, total_members')
        .eq('party_id', partyId)
        .order('yes_votes', { ascending: false });

    if (tallyErr || !tallies || tallies.length === 0) return { matched: false };

    const top = tallies[0];
    const yes = Number(top.yes_votes ?? 0);
    const total = memberCount;

    // Strict majority: yes / total > 0.5  <=>  2 * yes > total
    if (2 * yes > total) {
        // Lock in the match atomically
        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({ status: 'matched', matched_location_id: top.location_id, updated_at: new Date().toISOString() })
            .eq('id', partyId)
            .eq('status', 'swiping'); // optimistic guard

        if (updateErr) {
            console.error('[match] failed to lock in match', updateErr);
            return { matched: false };
        }

        return { matched: true, locationId: top.location_id, yesVotes: yes, totalMembers: total };
    }

    return { matched: false, yesVotes: yes, totalMembers: total };
}
