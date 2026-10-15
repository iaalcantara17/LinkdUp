export type ListView = 'loading' | 'empty' | 'list';

export function listView(items: readonly unknown[], loading: boolean): ListView {
    if (items.length > 0) return 'list';
    return loading ? 'loading' : 'empty';
}
