import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { searchNearbyVenues, searchNearbyVenuesPaged, getVenuesWithRotation } from '../src/services/places';

const KEY = process.env.GOOGLE_MAPS_API_KEY!;
const center = { latitude: 40.7, longitude: -74 };
const newPlace = {
    id: 'ChIJnew',
    displayName: { text: 'Cafe One' },
    primaryType: 'cafe',
    types: ['cafe'],
    photos: [{ name: 'places/ChIJnew/photos/AeYphoto-1' }],
};

afterEach(() => mock.restoreAll());

test('new API venues get a keyless proxy photo_url', async () => {
    mock.method(axios, 'post', async () => ({ data: { places: [newPlace] } }));
    const [v] = await searchNearbyVenues(center);
    assert.equal(v.photo_url, '/api/photo?name=places%2FChIJnew%2Fphotos%2FAeYphoto-1');
    const rotated = await getVenuesWithRotation({ center });
    assert.equal(rotated.venues[0].photo_url, v.photo_url);
    assert.ok(!JSON.stringify(rotated).includes(KEY));
});

test('legacy venues get a keyless proxy photo_url', async () => {
    mock.method(axios, 'get', async () => ({
        data: {
            results: [{ place_id: 'ChIJold', name: 'Old Bar', types: ['bar'], photos: [{ photo_reference: 'AUc7tXlegacy_ref-1' }] }],
        },
    }));
    const { venues } = await searchNearbyVenuesPaged(center);
    assert.equal(venues[0].photo_url, '/api/photo?ref=AUc7tXlegacy_ref-1');
    assert.ok(!JSON.stringify(venues).includes(KEY));
});
