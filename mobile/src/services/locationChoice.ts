export type Coords = { latitude: number; longitude: number };
export type AskReason = 'prompt' | 'denied' | 'unavailable' | 'timeout';
export type LiveResult = { ok: true; coords: Coords } | { ok: false; reason: AskReason };
export type LocationChoice =
    | { kind: 'live' }
    | { kind: 'custom'; label: string }
    | { kind: 'ask'; reason: AskReason };

export function choiceLabel(choice: LocationChoice): string {
    return choice.kind === 'live' ? 'Live' : choice.kind === 'custom' ? `Custom: ${choice.label}` : 'Not set';
}

export function locationSourceLabel(my?: { mode: string; custom_label: string | null; live_fresh: boolean } | null): string {
    return choiceLabel(chooseLocation({
        preferCustom: my?.mode === 'custom',
        live: my?.live_fresh ? { ok: true } : null,
        custom: my?.custom_label ? { label: my.custom_label } : null,
    }));
}

export function chooseLocation({ preferCustom, live, custom }: {
    preferCustom: boolean;
    live: { ok: true } | { ok: false; reason: AskReason } | null;
    custom: { label: string } | null;
}): LocationChoice {
    if (preferCustom && custom) return { kind: 'custom', label: custom.label };
    if (live?.ok) return { kind: 'live' };
    if (custom) return { kind: 'custom', label: custom.label };
    return { kind: 'ask', reason: live && !live.ok ? live.reason : 'prompt' };
}

type WebNavigator = {
    permissions?: { query(d: { name: 'geolocation' }): Promise<{ state: string }> };
    geolocation?: {
        getCurrentPosition(
            ok: (p: { coords: Coords }) => void,
            fail: (e: { code: number }) => void,
            opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
        ): void;
    };
};

const ERROR_REASONS: Record<number, AskReason> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

export async function readWebLocation(
    nav: WebNavigator | undefined,
    { prompt, timeoutMs = 10_000 }: { prompt: boolean; timeoutMs?: number },
): Promise<LiveResult> {
    const geo = nav?.geolocation;
    if (!geo) return { ok: false, reason: 'unavailable' };
    const state = await nav?.permissions?.query({ name: 'geolocation' }).then((s) => s.state, () => undefined);
    if (state === 'denied') return { ok: false, reason: 'denied' };
    if (state !== 'granted' && !prompt) return { ok: false, reason: 'prompt' };
    return new Promise((resolve) => {
        const timer = state === 'granted' ? setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs + 1000) : undefined;
        const done = (r: LiveResult) => { clearTimeout(timer); resolve(r); };
        geo.getCurrentPosition(
            (p) => done({ ok: true, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
            (e) => done({ ok: false, reason: ERROR_REASONS[e.code] ?? 'unavailable' }),
            { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
        );
    });
}
