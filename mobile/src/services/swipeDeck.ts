export function deckProgress(index: number, total: number): { label: string; percent: number } {
    const size = Math.max(1, total);
    const position = Math.min(index + 1, size);
    return { label: `Card ${position} of ${size}`, percent: position / size };
}

export function turnLabel({ solo, locked, flash, waitingNames }: {
    solo: boolean;
    locked: boolean;
    flash: boolean;
    waitingNames: string[];
}): string {
    if (flash) return 'Everyone voted - next card!';
    if (!locked) return 'Your turn - swipe or tap to vote';
    if (solo) return 'Vote saved. Loading the next card…';
    return `Voted ✓ - waiting for ${waitingNames.length > 0 ? waitingNames.join(', ') : 'everyone'}…`;
}

export function swipeDecision(dx: number, width: number): 'like' | 'nope' | null {
    'worklet';
    const threshold = width * 0.25;
    if (dx > threshold) return 'like';
    if (dx < -threshold) return 'nope';
    return null;
}

export function stampOpacity(dx: number, width: number): { like: number; nope: number } {
    'worklet';
    const t = Math.min(Math.abs(dx) / (width * 0.25), 1);
    return { like: dx > 0 ? t : 0, nope: dx < 0 ? t : 0 };
}

export function cardTilt(dx: number, width: number): number {
    'worklet';
    return Math.max(-10, Math.min(10, (dx / width) * 10));
}

export function sortDeck<T extends { id: string; rating?: number | null; is_priority?: boolean | null; created_at?: string | null }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const aRound = a.created_at ?? '';
        const bRound = b.created_at ?? '';
        if (aRound !== bRound) return aRound < bRound ? -1 : 1;
        if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
        const aRating = a.rating ?? -1;
        const bRating = b.rating ?? -1;
        if (aRating !== bRating) return bRating - aRating;
        return a.id.localeCompare(b.id);
    });
}
