import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { config } from '../src/config';
import { generateVenuePitch } from '../src/services/aiPitch';

const FALLBACK =
    "Looks like a solid pick — check the photos and see if the vibe matches what your crew's into.";
const party = { member_count: 3 };
let n = 0;
const venue = () => ({ name: `Venue ${++n}` });

function mockGemini() {
    return mock.method(axios, 'post', async () => ({
        data: { candidates: [{ content: { parts: [{ text: 'AI pitch' }] } }] },
    }));
}

afterEach(() => {
    mock.restoreAll();
    delete process.env.ENABLE_GEMINI_PITCHES;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key';
});
process.env.GEMINI_API_KEY = 'test-gemini-key';

for (const value of [undefined, 'false', 'FALSE', 'yes', '1', 'on', 'tru e', '']) {
    test(`ENABLE_GEMINI_PITCHES=${JSON.stringify(value)} makes zero Gemini calls`, async () => {
        if (value !== undefined) process.env.ENABLE_GEMINI_PITCHES = value;
        const post = mockGemini();
        assert.equal(config.features.geminiPitches, false);
        const { pitch } = await generateVenuePitch(venue(), party);
        assert.equal(pitch, FALLBACK);
        assert.equal(post.mock.callCount(), 0);
    });
}

for (const value of ['true', 'TRUE', ' True ']) {
    test(`ENABLE_GEMINI_PITCHES=${JSON.stringify(value)} calls Gemini`, async () => {
        process.env.ENABLE_GEMINI_PITCHES = value;
        const post = mockGemini();
        assert.equal(config.features.geminiPitches, true);
        const { pitch } = await generateVenuePitch(venue(), party);
        assert.equal(pitch, 'AI pitch');
        assert.equal(post.mock.callCount(), 1);
    });
}

test('flag off returns the fallback even when a pitch is cached', async () => {
    const v = venue();
    process.env.ENABLE_GEMINI_PITCHES = 'true';
    mockGemini();
    assert.equal((await generateVenuePitch(v, party)).pitch, 'AI pitch');
    process.env.ENABLE_GEMINI_PITCHES = 'false';
    assert.equal((await generateVenuePitch(v, party)).pitch, FALLBACK);
});

test('falls back to GOOGLE_GEMINI_API_KEY when GEMINI_API_KEY is unset', async () => {
    process.env.ENABLE_GEMINI_PITCHES = 'true';
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_GEMINI_API_KEY = 'alt-gemini-key';
    const post = mockGemini();
    await generateVenuePitch(venue(), party);
    assert.equal(post.mock.callCount(), 1);
    assert.match(String(post.mock.calls[0].arguments[0]), /key=alt-gemini-key/);
});
