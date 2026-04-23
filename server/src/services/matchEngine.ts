import { supabaseAdmin } from '../db';

export interface MatchResult {
    matched: boolean;
    locationId?: string;
    yesVotes?: number;
    totalMembers?: number;
}

/**
 * Match rules:
 *
 * Small parties (1-2 members):
 *   - Gate: evaluate only after every member has voted on every venue.
 *   - Winner: the venue whose most-recent yes-vote timestamp is latest.
 *     This makes "the last right-swipe wins" deterministic, with yes_vote
 *     count as a secondary tie-breaker.
 *   - If nobody swiped right at all → { matched: false } (no-match end state).
 *
 * Normal parties (3+ members):
 *   - A venue wins as soon as its yes-vote count is a strict majority (>50%).
 *   - First to cross the threshold wins mid-deck.
 */
export async function evaluateMatch(partyId: string): Promise<MatchResult> {
    // Bail if the party isn't in swiping state (idempotent guard)
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

    // Member count
    const { count: memberCount, error: memberErr } = await supabaseAdmin
        .from('party_members')
        .select('*', { count: 'exact', head: true })
        .eq('party_id', partyId);

    if (memberErr || memberCount == null || memberCount === 0) return { matched: false };

    const total = memberCount;
    const smallParty = total <= 2;

    // ── Small-party path ──────────────────────────────────────────────────────
    if (smallParty) {
        // Gate: everyone must have voted on every venue before we evaluate
        const [{ count: locationCount }, { count: voteCount }] = await Promise.all([
            supabaseAdmin.from('locations').select('*', { count: 'exact', head: true }).eq('party_id', partyId),
            supabaseAdmin.from('votes').select('*', { count: 'exact', head: true }).eq('party_id', partyId),
        ]);

        const totalExpectedVotes = (locationCount ?? 0) * total;
        const allVoted = totalExpectedVotes > 0 && (voteCount ?? 0) >= totalExpectedVotes;
        if (!allVoted) return { matched: false };

        // Fetch all yes-votes ordered newest first, then group in JS to pick
        // the location whose most-recent yes-vote is latest (ties broken by count).
        const { data: yesVotes } = await supabaseAdmin
            .from('votes')
            .select('location_id, voted_at')
            .eq('party_id', partyId)
            .eq('vote', true)
            .order('voted_at', { ascending: false });

        if (!yesVotes || yesVotes.length === 0) {
            // Deck fully swiped with zero right-swipes → genuine no-match
            return { matched: false };
        }

        // Group: track max voted_at and count per location
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

        // Sort: primary → latest voted_at DESC, secondary → yes_count DESC
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

    // ── Normal-party path: strict majority mid-deck ───────────────────────────
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
