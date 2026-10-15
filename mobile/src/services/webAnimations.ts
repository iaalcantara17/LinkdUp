type AnimationTarget = { style?: { animationName?: string } };
type AnimationDoc = {
    addEventListener(type: 'animationend', fn: (e: any) => void, capture: boolean): void;
    removeEventListener(type: 'animationend', fn: (e: any) => void, capture: boolean): void;
};

export function settleFinishedAnimations(doc: AnimationDoc): () => void {
    const onEnd = (e: { target: AnimationTarget; animationName: string }) => {
        const style = e.target?.style;
        if (style?.animationName === e.animationName) style.animationName = '';
    };
    doc.addEventListener('animationend', onEnd, true);
    return () => doc.removeEventListener('animationend', onEnd, true);
}
