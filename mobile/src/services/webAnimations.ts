type AnimationTarget = { style?: { animationName?: string } };
type AnimationEvent = 'animationend' | 'animationcancel';
type AnimationDoc = {
    addEventListener(type: AnimationEvent, fn: (e: any) => void, capture: boolean): void;
    removeEventListener(type: AnimationEvent, fn: (e: any) => void, capture: boolean): void;
};

export function settleFinishedAnimations(doc: AnimationDoc): () => void {
    const onEnd = (e: { target: AnimationTarget; animationName: string }) => {
        const style = e.target?.style;
        if (style?.animationName === e.animationName) style.animationName = '';
    };
    doc.addEventListener('animationend', onEnd, true);
    doc.addEventListener('animationcancel', onEnd, true);
    return () => {
        doc.removeEventListener('animationend', onEnd, true);
        doc.removeEventListener('animationcancel', onEnd, true);
    };
}
