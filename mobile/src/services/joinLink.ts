type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'linkdup_join_code';

export const cleanCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export const joinUrl = (code: string, origin = 'https://linkdup.app') => `${origin}/join/${code}`;

export function codeFromPath(path: string): string | null {
    const m = path.match(/^\/join\/([^/]+)\/?$/);
    const code = m ? cleanCode(m[1]) : '';
    return code.length === 6 ? code : null;
}

export function webSession(): Store | undefined {
    try {
        return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
    } catch {
        return undefined;
    }
}

export function rememberJoin(path: string, store: Store | undefined) {
    const code = codeFromPath(path);
    if (code) store?.setItem(KEY, code);
}

export function takeJoin(store: Store | undefined): string | null {
    const code = store?.getItem(KEY) ?? null;
    if (code) store?.removeItem(KEY);
    return code;
}
