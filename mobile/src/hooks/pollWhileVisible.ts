export const LOBBY_POLL_MS = 15_000;

type VisibilityDoc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export function pollWhileVisible(
    fn: () => void,
    ms: number,
    doc: VisibilityDoc | undefined = typeof document === 'undefined' ? undefined : document,
) {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(fn, ms); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const onChange = () => {
        if (doc?.visibilityState === 'hidden') return stop();
        fn();
        start();
    };
    if (doc?.visibilityState !== 'hidden') start();
    doc?.addEventListener('visibilitychange', onChange);
    return () => {
        stop();
        doc?.removeEventListener('visibilitychange', onChange);
    };
}
