import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as fx from '../screens-test/fixtures.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist-shots');
const out = join(root, '..', 'docs', 'screens', 'slice-4');
const API = 'http://api.test';
const SUPABASE = 'http://supabase.test';

const p1 = { partyId: 'p1' };
const screens = [
    ['Home', null],
    ['PartyLobby', ['PartyLobby', p1]],
    ['Swipe', ['Swipe', p1]],
    ['Match', ['Match', p1]],
    ['CalendarConfirmation', ['CalendarConfirmation', p1]],
    ['Walkthrough', ['Walkthrough', { fromSignup: true }]],
    ['Discover', ['Discover']],
    ['Profile', ['Profile']],
    ['Friends', ['Friends']],
    ['Login', ['Login'], { signedOut: true }],
];
const only = process.argv.slice(2);

function build() {
    if (process.env.SHOTS_SKIP_BUILD && existsSync(dist)) return;
    const env = { ...process.env, EXPO_PUBLIC_API_URL: API, EXPO_PUBLIC_SUPABASE_URL: SUPABASE, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'stub' };
    const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-shots', '--clear'], { cwd: root, env, stdio: 'inherit', shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

function serve() {
    const server = createServer((req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = join(dist, path);
        if (!file.startsWith(dist) || !existsSync(file) || !extname(file)) file = join(dist, 'index.html');
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        res.end(readFileSync(file));
    });
    return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const lobby = { party: fx.party, members: fx.members, my_location: { mode: 'live', custom_label: null, live_fresh: true } };
const dates = [{ id: 'd1', starts_at: '2026-11-20T23:00:00.000Z', ends_at: '2026-11-21T01:00:00.000Z', is_locked: true, vote_count: 2, member_count: 2, votes: [] }];
const hints = ['discover_likes', 'discover_your_likes', 'hangouts_gcal', 'home_friends_card', 'party_share_code', 'swipe_why_this', 'swipe_done_button', 'profile_tour_replay'];

function apiData(path, theme) {
    const table = {
        '/api/auth/me': { ...fx.profile, school_id: 's1', theme_preference: theme },
        '/api/user/me/parties': fx.myParties,
        '/api/user/me/hangouts': [],
        '/api/user/me/hints': hints,
        '/api/friends': fx.friends,
        '/api/party/p1': lobby,
        '/api/party/p1/members': fx.members,
        '/api/party/p1/locations': fx.locations,
        '/api/party/p1/match': { matched: true, status: 'locked', location: fx.locations[0] },
        '/api/party/p1/dates': dates,
        '/api/discover/venues': fx.venues,
        '/api/discover/feed/posts': { posts: [], has_more: false, next_cursor: null },
    };
    if (path in table) return table[path];
    if (/follow-counts$/.test(path)) return { followers: 1, following: 2 };
    if (/^\/api\/schools\//.test(path)) return { id: 's1', name: 'Stevens Institute', city: 'Hoboken', state: 'NJ' };
    return /\/(pending|outgoing|votes|my-votes|likes|parties|blocked|collections)$/.test(path) ? [] : { ok: true };
}

function session() {
    const user = { id: 'alice', aud: 'authenticated', role: 'authenticated', email: 'alice@test.dev', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    return { access_token: 'stub', refresh_token: 'stub', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, user };
}

async function shoot(browser, base, [name, route, opts = {}], theme, width) {
    const context = await browser.newContext({
        viewport: { width, height: width < 600 ? 844 : 900 },
        colorScheme: theme,
        geolocation: { latitude: 40.74, longitude: -74.03 },
        permissions: ['geolocation'],
    });
    await context.addInitScript(([key, value, theme]) => {
        localStorage.setItem('linkdup_theme', theme);
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    }, ['sb-supabase-auth-token', opts.signedOut ? null : JSON.stringify(session()), theme]);
    await context.routeWebSocket(/.*/, () => {});
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === base) return route.continue();
        if (url.origin === API) return route.fulfill({ json: apiData(url.pathname, theme) });
        if (url.origin === SUPABASE) return route.fulfill({ json: url.pathname === '/auth/v1/user' ? session().user : {} });
        return route.abort();
    });
    const page = await context.newPage();
    await page.goto(base + '/');
    await page.waitForLoadState('networkidle');
    if (route) {
        await page.waitForTimeout(500);
        await page.evaluate(([name, params]) => {
            for (const el of document.querySelectorAll('div')) {
                const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
                for (let f = key && el[key]; f; f = f.return) {
                    if (f.memoizedProps?.navigation?.navigate) return f.memoizedProps.navigation.navigate(name, params);
                }
            }
            throw new Error('no navigation found');
        }, route);
        await page.waitForLoadState('networkidle');
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${name}-${theme}-${width}.png`) });
    await context.close();
}

build();
mkdirSync(out, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
    for (const s of screens.filter(([n]) => !only.length || only.includes(n))) {
        for (const theme of ['light', 'dark']) {
            for (const width of [390, 1440]) await shoot(browser, base, s, theme, width);
        }
        console.log(`shot ${s[0]}`);
    }
} finally {
    await browser.close();
    server.close();
}
