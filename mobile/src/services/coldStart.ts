export const COLD_START_MS = 3_000;

let slowCount = 0;
const listeners = new Set<() => void>();

function changeSlow(by: number) {
    const was = slowCount > 0;
    slowCount += by;
    if (was !== slowCount > 0) listeners.forEach((fn) => fn());
}

export function isSlow(): boolean {
    return slowCount > 0;
}

export function subscribeSlow(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export async function trackRequest<T>(work: Promise<T>): Promise<T> {
    let slow = false;
    const timer = setTimeout(() => {
        slow = true;
        changeSlow(1);
    }, COLD_START_MS);
    try {
        return await work;
    } finally {
        clearTimeout(timer);
        if (slow) changeSlow(-1);
    }
}
