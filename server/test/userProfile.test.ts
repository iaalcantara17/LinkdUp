import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { computeAge } from '../src/services/userProfile';

function on(isoDate: string, fn: () => void) {
    mock.timers.enable({ apis: ['Date'], now: new Date(`${isoDate}T00:00:00Z`).getTime() });
    try { fn(); } finally { mock.timers.reset(); }
}

test('computeAge counts a birthday that falls today', () => {
    on('2026-10-14', () => assert.equal(computeAge('2005-10-14'), 21));
    on('2002-01-01', () => assert.equal(computeAge('2001-01-01'), 1));
});

test('computeAge does not count a birthday that is still ahead this year', () => {
    on('2026-10-13', () => assert.equal(computeAge('2005-10-14'), 20));
});

test('computeAge treats a Feb 29 birthday as reached on Mar 1 in non-leap years', () => {
    on('2027-02-28', () => assert.equal(computeAge('2004-02-29'), 22));
    on('2027-03-01', () => assert.equal(computeAge('2004-02-29'), 23));
});

test('computeAge returns null for missing, invalid or future dates', () => {
    on('2026-10-14', () => {
        assert.equal(computeAge(null), null);
        assert.equal(computeAge('not-a-date'), null);
        assert.equal(computeAge('2030-01-01'), null);
    });
});
