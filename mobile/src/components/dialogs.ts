export type ButtonStyle = 'default' | 'cancel' | 'destructive';
export type DialogButton = { label: string; style: ButtonStyle };
export type Dialog = {
    id: number;
    role: 'dialog' | 'alertdialog';
    title: string;
    message?: string;
    buttons: DialogButton[];
};
export type ToastTone = 'success' | 'info';
export type Toast = { id: number; message: string; tone: ToastTone };
export type MenuAction = { label: string; destructive?: boolean; onPress: () => void };

export const TOAST_MS = 3000;

type Pending = { dialog: Dialog; resolve: (index: number) => void };

let nextId = 1;
let queue: Pending[] = [];
let hosts: number[] = [];
let snapshot: { dialog: Dialog | null; toasts: Toast[]; host: number | null } = { dialog: null, toasts: [], host: null };
const listeners = new Set<() => void>();

function emit(toasts = snapshot.toasts) {
    snapshot = { dialog: queue[0]?.dialog ?? null, toasts, host: hosts[hosts.length - 1] ?? null };
    listeners.forEach((l) => l());
}

export function claimHost(id: number) {
    hosts = [...hosts, id];
    emit();
    return () => {
        hosts = hosts.filter((h) => h !== id);
        emit();
    };
}

function open(d: Omit<Dialog, 'id'>): Promise<number> {
    return new Promise((resolve) => {
        queue = [...queue, { dialog: { ...d, id: nextId++ }, resolve }];
        emit();
    });
}

export function getSnapshot() {
    return snapshot;
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function respond(index: number) {
    const [head, ...rest] = queue;
    if (!head) return;
    queue = rest;
    head.resolve(index);
    emit();
}

export function dismiss() {
    respond(-1);
}

export async function confirm(opts: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}): Promise<boolean> {
    const index = await open({
        role: 'alertdialog',
        title: opts.title,
        message: opts.message,
        buttons: [
            { label: opts.cancelLabel ?? 'Cancel', style: 'cancel' },
            { label: opts.confirmLabel ?? 'OK', style: opts.destructive ? 'destructive' : 'default' },
        ],
    });
    return index === 1;
}

export async function showError(title: string, message?: string): Promise<void> {
    await open({ role: 'alertdialog', title, message, buttons: [{ label: 'OK', style: 'default' }] });
}

export async function showInfo(title: string, message?: string): Promise<void> {
    await open({ role: 'dialog', title, message, buttons: [{ label: 'OK', style: 'default' }] });
}

export async function showMenu(title: string, actions: MenuAction[]): Promise<void> {
    const index = await open({
        role: 'dialog',
        title,
        buttons: [
            ...actions.map((a): DialogButton => ({ label: a.label, style: a.destructive ? 'destructive' : 'default' })),
            { label: 'Cancel', style: 'cancel' },
        ],
    });
    actions[index]?.onPress();
}

export function dismissToast(id: number) {
    emit(snapshot.toasts.filter((t) => t.id !== id));
}

export function toast(message: string, tone: ToastTone = 'success') {
    const id = nextId++;
    emit([...snapshot.toasts, { id, message, tone }]);
    setTimeout(() => dismissToast(id), TOAST_MS);
}

const FRIENDLY: Record<string, string> = {
    blocked: "You can't do that with this person.",
    not_authorized: "You don't have permission to do that.",
    not_host: 'Only the party host can do that.',
    not_a_member: "You're not in this party anymore.",
    party_not_found: "We couldn't find that party. Check the code and try again.",
    party_already_started: 'This party has already started.',
    party_already_closed: 'This party has ended.',
    cannot_delete_locked_date: "This date is locked in, so it can't be deleted.",
    no_member_locations: "No one in the party has shared a location yet.",
    username_taken: 'That username is taken. Try another one.',
    caption_too_long: "That's too long. Shorten it and try again.",
    body_too_long: "That's too long. Shorten it and try again.",
    empty_body: 'Write something first.',
    'Failed to fetch': "We couldn't reach the server. Check your connection and try again.",
    'Network request failed': "We couldn't reach the server. Check your connection and try again.",
};

export function errorText(e: unknown, fallback: string): string {
    const raw = (e as { message?: unknown } | undefined)?.message;
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    if (FRIENDLY[raw]) return FRIENDLY[raw];
    if (/^[a-z0-9_]+$/.test(raw) || /\b\d{3}$/.test(raw)) return fallback;
    return raw;
}
