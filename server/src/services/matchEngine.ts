import { supabaseAdmin } from '../db';

export interface MatchResult {
    matched: boolean;
    locationId?: string;
    yesVotes?: number;
    totalMembers?: number;
}

export async function evaluateMatch(partyId: string): Promise<MatchResult> {
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

    const { count: memberCount, error: memberErr } = await supabaseAdmin
        .from('party_members')
        .select('*', { count: 'exact', head: true })
        .eq('party_id', partyId);

    if (memberErr || memberCount == null || memberCount === 0) return { matched: false };

    const total = memberCount;
    const smallParty = total <= 2;

    if (smallParty) {
        // Gate: everyone must have voted on every venue before evaluating.
        const [{ count: locationCount }, { count: voteCount }] = await Promise.all([
            supabaseAdmin.from('locations').select('*', { count: 'exact', head: true }).eq('party_id', partyId),
            supabaseAdmin.from('votes').select('*', { count: 'exact', head: true }).eq('party_id', partyId),
        ]);

        const totalExpectedVotes = (locationCount ?? 0) * total;
        const allVoted = totalExpectedVotes > 0 && (voteCount ?? 0) >= totalExpectedVotes;
        if (!allVoted) return { matched: false };

        const { data: yesVotes } = await supabaseAdmin
            .from('votes')
            .select('location_id, voted_at')
            .eq('party_id', partyId)
            .eq('vote', true)
            .order('voted_at', { ascending: false });

        if (!yesVotes || yesVotes.length === 0) {
            return { matched: false };
        }

        const byLocation = new Map<string, { maxVotedAt: string; count: number }>();
        for (const v of yesVotes) {
            const existing = byLocation.get(v.location_id);
            if (!existing) {
                byLocation.set(v.location_id, { maxVotedAt: v.voted_at, count: 1 });
            } else {
                existing.count++;
                if (v.voted_at > existing.maxVotedAt) existing.maxVotedAt = v.voted_at;
            }
        }

        const sorted = [...byLocation.entries()].sort((a, b) => {
            const timeDiff = b[1].maxVotedAt.localeCompare(a[1].maxVotedAt);
            return timeDiff !== 0 ? timeDiff : b[1].count - a[1].count;
        });

        const [winnerId, winnerStats] = sorted[0];

        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({ status: 'matched', matched_location_id: winnerId, updated_at: new Date().toISOString() })
            .eq('id', partyId)
            .eq('status', 'swiping');

        if (updateErr) {
            console.error('[match] failed to lock in match', updateErr);
            return { matched: false };
        }

        return { matched: true, locationId: winnerId, yesVotes: winnerStats.count, totalMembers: total };
    }

    const { data: tallies, error: tallyErr } = await supabaseAdmin
        .from('v_party_vote_tallies')
        .select('location_id, yes_votes, total_members')
        .eq('party_id', partyId)
        .order('yes_votes', { ascending: false });

    if (tallyErr || !tallies || tallies.length === 0) return { matched: false };

    const top = tallies[0];
    const yes = Number(top.yes_votes ?? 0);

    if (2 * yes > total) {
        const { error: updateErr } = await supabaseAdmin
            .from('parties')
            .update({ status: 'matched', matched_location_id: top.location_id, updated_at: new Date().toISOString() })
            .eq('id', partyId)
            .eq('status', 'swiping');

        if (updateErr) {
            console.error('[match] failed to lock in match', updateErr);
            return { matched: false };
        }

        return { matched: true, locationId: top.location_id, yesVotes: yes, totalMembers: total };
    }

    return { matched: false, yesVotes: yes, totalMembers: total };
}
