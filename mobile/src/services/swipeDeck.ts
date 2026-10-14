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
