export type Coords = { latitude: number; longitude: number };
export type AskReason = 'prompt' | 'denied' | 'unavailable' | 'timeout';
export type LiveResult = { ok: true; coords: Coords } | { ok: false; reason: AskReason };
export type LocationChoice =
    | { kind: 'live' }
    | { kind: 'custom'; label: string }
    | { kind: 'ask'; reason: AskReason };

export function choiceLabel(choice: LocationChoice): string {
    return choice.kind === 'live' ? 'Live' : choice.kind === 'custom' ? `Custom: ${choice.label}` : 'Not set yet';
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

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

type WebPermissionStatus = {
    state: string;
    addEventListener?(type: 'change', fn: () => void): void;
    removeEventListener?(type: 'change', fn: () => void): void;
};

type WebNavigator = {
    permissions?: { query(d: { name: 'geolocation' }): Promise<WebPermissionStatus> };
    geolocation?: {
        getCurrentPosition(
            ok: (p: { coords: Coords }) => void,
            fail: (e: { code: number }) => void,
            opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
        ): void;
    };
};

const ERROR_REASONS: Record<number, AskReason> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

export function watchWebPermission(nav: WebNavigator | undefined, onChange: (s: PermissionState) => void): () => void {
    let status: WebPermissionStatus | null = null;
    let stopped = false;
    const emit = () => onChange(status?.state as PermissionState);
    const query = nav?.permissions?.query({ name: 'geolocation' });
    if (!query) onChange('unknown');
    query?.then((s) => {
        if (stopped) return;
        status = s;
        emit();
        s.addEventListener?.('change', emit);
    }, () => { if (!stopped) onChange('unknown'); });
    return () => {
        stopped = true;
        status?.removeEventListener?.('change', emit);
    };
}

const PERMISSION_WORDS: Record<PermissionState, string | null> = {
    granted: 'Browser location: Allowed',
    denied: 'Browser location: Blocked',
    prompt: 'Browser location: Not asked yet',
    unknown: null,
};

export function permissionLabel(state: PermissionState): string | null {
    return PERMISSION_WORDS[state];
}

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

export function startGate(members: { display_lat?: number | null }[]): { canStart: boolean; reason: string } {
    if (members.some((m) => m.display_lat != null)) return { canStart: true, reason: '' };
    return {
        canStart: false,
        reason: members.length > 1
            ? 'Start swiping needs at least one location. Add yours above, or wait for someone in your crew to add theirs.'
            : 'Start swiping needs a location. Add yours above.',
    };
}

export function pendingAction() {
    let pending: (() => void) | null = null;
    return {
        arm(fn: () => void) { pending = fn; },
        resume(allowed: boolean) {
            const fn = pending;
            pending = null;
            if (allowed && fn) fn();
        },
    };
}

export function discoverStep(
    reading: LiveResult,
    picked: { latitude: number; longitude: number } | null,
    askedLive: boolean,
): { origin: { coords: Coords; live: boolean } | null; issue: AskReason | null } {
    if (reading.ok) return { origin: { coords: reading.coords, live: true }, issue: null };
    if (!picked) return { origin: null, issue: reading.reason };
    return {
        origin: { coords: { latitude: picked.latitude, longitude: picked.longitude }, live: false },
        issue: askedLive ? reading.reason : null,
    };
}
