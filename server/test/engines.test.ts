import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

function minMajor(range: string): number {
    return Math.min(...range.split('||').map((part) => {
        const m = part.match(/(?:>=|\^|~)?\s*v?(\d+)/);
        return m ? Number(m[1]) : 0;
    }));
}

test('every locked dependency runs on the Node major the server deploys with', () => {
    const runtime = Number(String(read('package.json').engines.node).match(/\d+/)![0]);
    const lock = read('package-lock.json');
    const tooNew = Object.entries<any>(lock.packages)
        .filter(([name, p]) => name && p.engines?.node && minMajor(String(p.engines.node)) > runtime)
        .map(([name, p]) => `${name.replace(/^.*node_modules\//, '')}@${p.version} needs ${p.engines.node}`);
    assert.deepEqual(tooNew, []);
});
