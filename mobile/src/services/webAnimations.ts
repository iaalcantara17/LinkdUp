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

const WEB_MOTION_CSS = `* { scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 1ms !important; animation-delay: 0ms !important; transition-duration: 1ms !important; } }`;

type StyleDoc = {
    getElementById(id: string): unknown;
    createElement(tag: 'style'): { id: string; textContent: string | null };
    head: { appendChild(node: any): unknown };
};

export function installWebMotion(doc: StyleDoc) {
    if (doc.getElementById('linkdup-motion')) return;
    const style = doc.createElement('style');
    style.id = 'linkdup-motion';
    style.textContent = WEB_MOTION_CSS;
    doc.head.appendChild(style);
}
