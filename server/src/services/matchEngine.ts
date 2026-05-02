import { supabaseAdmin } from '../db';
import { getVenuesWithRotation } from './places';

export interface MatchResult {
    matched: boolean;
    locationId?: string;
    yesVotes?: number;
    totalMembers?: number;
}

export interface AdvanceResult {
    advanced: boolean;
    proposing: boolean;
    matchResult: MatchResult;
}

// ─── Legacy match evaluation (parties with NULL current_card_index) ───────────

async function legacyEvaluateMatch(partyId: string): Promise<MatchResult> {
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

        if (!yesVotes || yesVotes.length === 0) return { matched: false };

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

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function loadFiveMoreVenues(partyId: string): Promise<{ totalBefore: number }> {
    const { data: partyRow } = await supabaseAdmin
        .from('parties')
        .select('midpoint_lat, midpoint_lng, venue_rotation_seed, next_page_token')
        .eq('id', partyId)
        .single();

    if (!partyRow?.midpoint_lat) return { totalBefore: 0 };

    const center = { latitude: partyRow.midpoint_lat, longitude: partyRow.midpoint_lng };

    const { data: existing } = await supabaseAdmin
        .from('locations')
        .select('id, google_place_id')
        .eq('party_id', partyId);

    const totalBefore = (existing ?? []).length;
    const existingPlaceIds = new Set((existing ?? []).map((r: any) => r.google_place_id));

    const { venues, nextPageToken, newSeed } = await getVenuesWithRotation({
        center,
        pageToken: partyRow.next_page_token ?? undefined,
        rotationSeed: partyRow.venue_rotation_seed ?? 0,
        excludeIds: existingPlaceIds,
    });

    const toInsert = venues.slice(0, 5);
    if (toInsert.length > 0) {
        const rows = toInsert.map((v: any) => ({ ...v, party_id: partyId }));
        await supabaseAdmin
            .from('locations')
            .upsert(rows, { onConflict: 'party_id,google_place_id', ignoreDuplicates: true });
    }

    await supabaseAdmin
        .from('parties')
        .update({ next_page_token: nextPageToken ?? null, venue_rotation_seed: newSeed })
        .eq('id', partyId);

    return { totalBefore };
}

async function getRankedCandidates(
    partyId: string,
    excludeIds: string[],
): Promise<Array<{ location_id: string; yes_votes: number; location_name: string }>> {
    let query = supabaseAdmin
        .from('v_party_vote_tallies')
        .select('location_id, yes_votes, location_name')
        .eq('party_id', partyId)
        .gt('yes_votes', 0)
        .order('yes_votes', { ascending: false });

    if (excludeIds.length > 0) {
        query = (query as any).not('location_id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data } = await query;
    if (!data || data.length === 0) return [];

    return [...data].sort((a: any, b: any) => {
        const yDiff = Number(b.yes_votes) - Number(a.yes_votes);
        if (yDiff !== 0) return yDiff;
        return (a.location_name ?? '').localeCompare(b.location_name ?? '');
    });
}

// ─── New locked-step engine ───────────────────────────────────────────────────

export async function closeRound(partyId: string): Promise<void> {
    const { data: party } = await supabaseAdmin
        .from('parties')
        .select('voting_round, rejected_location_ids')
        .eq('id', partyId)
        .single();

    if (!party) return;

    const rejectedIds: string[] = party.rejected_location_ids ?? [];
    const candidates = await getRankedCandidates(partyId, rejectedIds);

    if (candidates.length === 0) {
        const { totalBefore } = await loadFiveMoreVenues(partyId);
        await supabaseAdmin
            .from('parties')
            .update({
                status: 'swiping',
                current_card_index: totalBefore,
                voting_round: (party.voting_round ?? 1) + 1,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        return;
    }

    const top = candidates[0];
    await supabaseAdmin
        .from('parties')
        .update({
            proposal_location_id: top.location_id,
            proposal_rank: 0,
            status: 'proposing',
            updated_at: new Date().toISOString(),
        })
        .eq('id', partyId);
}

export async function tryAdvanceCard(partyId: string): Promise<AdvanceResult> {
    const { data: party } = await supabaseAdmin
        .from('parties')
        .select('id, status, current_card_index, voting_round, rejected_location_ids, matched_location_id')
        .eq('id', partyId)
        .single();

    if (!party) return { advanced: false, proposing: false, matchResult: { matched: false } };

    // Backwards compat: NULL current_card_index → use legacy match engine
    if (party.current_card_index === null || party.current_card_index === undefined) {
        const matchResult = await legacyEvaluateMatch(partyId);
        return { advanced: false, proposing: false, matchResult };
    }

    if (party.status !== 'swiping') {
        return {
            advanced: false,
            proposing: party.status === 'proposing',
            matchResult: {
                matched: party.status === 'matched',
                locationId: party.matched_location_id ?? undefined,
            },
        };
    }

    const { count: memberCount } = await supabaseAdmin
        .from('party_members')
        .select('*', { count: 'exact', head: true })
        .eq('party_id', partyId);

    if (!memberCount || memberCount === 0) {
        return { advanced: false, proposing: false, matchResult: { matched: false } };
    }

    // Locations ordered identically to client (is_priority DESC, rating DESC, id ASC)
    const { data: locations } = await supabaseAdmin
        .from('locations')
        .select('id')
        .eq('party_id', partyId)
        .order('is_priority', { ascending: false })
        .order('rating', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true });

    if (!locations || locations.length <= party.current_card_index) {
        return { advanced: false, proposing: false, matchResult: { matched: false } };
    }

    const currentLocationId = locations[party.current_card_index].id;

    // Solo parties advance immediately after any vote
    if (memberCount > 1) {
        const { count: voteCount } = await supabaseAdmin
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('party_id', partyId)
            .eq('location_id', currentLocationId);

        if ((voteCount ?? 0) < memberCount) {
            return { advanced: false, proposing: false, matchResult: { matched: false } };
        }
    }

    const newIndex = party.current_card_index + 1;

    if (newIndex >= locations.length) {
        await closeRound(partyId);
        const { data: newParty } = await supabaseAdmin
            .from('parties')
            .select('status')
            .eq('id', partyId)
            .single();
        return {
            advanced: true,
            proposing: newParty?.status === 'proposing',
            matchResult: { matched: false },
        };
    }

    await supabaseAdmin
        .from('parties')
        .update({ current_card_index: newIndex, updated_at: new Date().toISOString() })
        .eq('id', partyId);

    return { advanced: true, proposing: false, matchResult: { matched: false } };
}

export async function evaluateProposal(partyId: string): Promise<void> {
    const { data: party } = await supabaseAdmin
        .from('parties')
        .select('proposal_location_id, proposal_rank, voting_round, rejected_location_ids, status')
        .eq('id', partyId)
        .single();

    if (!party || party.status !== 'proposing' || !party.proposal_location_id) return;

    const { count: memberCount } = await supabaseAdmin
        .from('party_members')
        .select('*', { count: 'exact', head: true })
        .eq('party_id', partyId);

    if (!memberCount) return;

    const { data: responses, count: responseCount } = await supabaseAdmin
        .from('proposal_responses')
        .select('user_id, accepted', { count: 'exact' })
        .eq('party_id', partyId)
        .eq('voting_round', party.voting_round)
        .eq('proposal_rank', party.proposal_rank);

    if ((responseCount ?? 0) < memberCount) return;

    const allAccepted = (responses ?? []).every((r: any) => r.accepted === true);

    if (allAccepted) {
        await supabaseAdmin
            .from('parties')
            .update({
                status: 'matched',
                matched_location_id: party.proposal_location_id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
        return;
    }

    const rejectedIds = [...(party.rejected_location_ids ?? []), party.proposal_location_id];
    const newRank = (party.proposal_rank ?? 0) + 1;

    const goToNextRound = async () => {
        const { totalBefore } = await loadFiveMoreVenues(partyId);
        await supabaseAdmin
            .from('parties')
            .update({
                status: 'swiping',
                current_card_index: totalBefore,
                voting_round: (party.voting_round ?? 1) + 1,
                proposal_location_id: null,
                rejected_location_ids: rejectedIds,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partyId);
    };

    if (newRank > 2) {
        await goToNextRound();
        return;
    }

    const candidates = await getRankedCandidates(partyId, rejectedIds);
    const nextCandidate = candidates[0];

    if (!nextCandidate) {
        await goToNextRound();
        return;
    }

    await supabaseAdmin
        .from('parties')
        .update({
            proposal_location_id: nextCandidate.location_id,
            proposal_rank: newRank,
            rejected_location_ids: rejectedIds,
            updated_at: new Date().toISOString(),
        })
        .eq('id', partyId);
}
