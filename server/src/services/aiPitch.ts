import axios from 'axios';
import { config } from '../config';

export interface VenuePitchInput {
    name: string;
    category?: string | null;
    rating?: number | null;
    price_level?: number | null;
    address?: string | null;
    user_ratings_total?: number | null;
}

export interface PartyPitchContext {
    member_count: number;
    party_name?: string | null;
}

const FALLBACK =
    "Looks like a solid pick — check the photos and see if the vibe matches what your crew's into.";

const pitchCache = new Map<string, string>();

function cacheKey(venue: VenuePitchInput, partyCtx: PartyPitchContext): string {
    return `${venue.name}|${venue.address ?? ''}|${partyCtx.member_count}|${partyCtx.party_name ?? ''}`;
}

export async function generateVenuePitch(
    venue: VenuePitchInput,
    partyCtx: PartyPitchContext,
): Promise<{ pitch: string }> {
    const key = cacheKey(venue, partyCtx);
    const cached = pitchCache.get(key);
    if (cached) return { pitch: cached };

    const apiKey =
        (config as any).gemini?.apiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        '';

    if (!apiKey) return { pitch: FALLBACK };

    const reviews = venue.user_ratings_total != null
        ? `${venue.user_ratings_total.toLocaleString()} reviews`
        : 'reviews N/A';
    const priceHuman =
        venue.price_level != null && venue.price_level > 0
            ? `${venue.price_level}/4`
            : 'N/A';
    const groupLine =
        partyCtx.member_count > 0
            ? `Group: ${partyCtx.member_count} people${
                  partyCtx.party_name ? ` meeting up as ${partyCtx.party_name}` : ''
              }`
            : '';

    const prompt =
        "You're a fun, opinionated friend recommending a hangout spot for a group meetup. " +
        "Give a 2-3 sentence pitch for this venue. Be specific about vibe and use cases. " +
        "Avoid generic adjectives like 'great' or 'awesome'. If you don't know the specific venue, infer from category.\n\n" +
        `Venue: ${venue.name}\n` +
        `Category: ${venue.category ?? 'unknown'}\n` +
        `Rating: ${venue.rating ?? 'N/A'}/5 (${reviews})\n` +
        `Price: ${priceHuman}\n` +
        `Location: ${venue.address ?? 'unknown'}\n` +
        (groupLine ? `${groupLine}\n` : '') +
        '\nReturn only the pitch, no preamble.';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
        const res = await axios.post(
            url,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 200,
                },
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15_000,
            },
        );

        const candidates = res.data?.candidates ?? [];
        const firstText: string =
            candidates[0]?.content?.parts?.[0]?.text?.trim?.() ?? '';
        const pitch = firstText || FALLBACK;
        pitchCache.set(key, pitch);
        return { pitch };
    } catch (e: any) {
        const status = e?.response?.status;
        const body = e?.response?.data;
        console.error('[aiPitch] Gemini error', status, body ?? e?.message);
        return { pitch: FALLBACK };
    }
}