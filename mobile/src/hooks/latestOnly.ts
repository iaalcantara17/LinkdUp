export function latestOnly() {
    let current = 0;
    return () => {
        const mine = ++current;
        return () => mine === current;
    };
}
