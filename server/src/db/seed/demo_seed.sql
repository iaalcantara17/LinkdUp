begin;

create temp table demo_people (key text primary key, id uuid not null, display_name text, username text, bio text,
    avatar_url text, avatar_color text, latitude double precision, longitude double precision, place text) on commit drop;

insert into demo_people values
    ('me',     'REPLACE_ME_DEMO_USER_ID', 'Demo Guest',        'demo_guest',  'Demo account. Look around, nothing here is real.', '/demo/avatar-demo.png',   '#6C3EF4', 40.7440, -74.0324, 'Hoboken, NJ'),
    ('maya',   'REPLACE_ME_FRIEND_1_ID',  'Maya Rivera (demo)', 'demo_maya',   'Demo friend. Trivia captain.',                      '/demo/avatar-maya.png',   '#EC4899', 40.7397, -74.0300, 'Hoboken, NJ'),
    ('theo',   'REPLACE_ME_FRIEND_2_ID',  'Theo Nguyen (demo)', 'demo_theo',   'Demo friend. Will find the rooftop.',               '/demo/avatar-theo.png',   '#0EA5E9', 40.7282, -74.0776, 'Jersey City, NJ'),
    ('priya',  'REPLACE_ME_FRIEND_3_ID',  'Priya Shah (demo)',  'demo_priya',  'Demo friend. Brunch planner.',                      '/demo/avatar-priya.png',  '#F59E0B', 40.7506, -74.0270, 'Hoboken, NJ'),
    ('jordan', 'REPLACE_ME_FRIEND_4_ID',  'Jordan Lee (demo)',  'demo_jordan', 'Demo friend. Arcade high score holder.',            '/demo/avatar-jordan.png', '#10B981', 40.7357, -74.1724, 'Newark, NJ'),
    ('sam',    'REPLACE_ME_FRIEND_5_ID',  'Sam Kim (demo)',     'demo_sam',    'Demo friend. Always down for tacos.',               '/demo/avatar-sam.png',    '#EF4444', 40.7178, -74.0431, 'Jersey City, NJ');

do $$
declare missing text;
begin
    select string_agg(p.key, ', ') into missing
    from demo_people p left join auth.users a on a.id = p.id
    where a.id is null;
    if missing is not null then
        raise exception 'Create these demo users in Supabase Auth first, then put their UUIDs in demo_people: %', missing;
    end if;
end $$;

create or replace function pg_temp.demo_id(k text) returns uuid language sql stable as $$
    select id from demo_people where key = k
$$;

insert into public.users (id, email, display_name, username, school_id, graduation_year, avatar_color, avatar_url,
    latitude, longitude, last_location_at, bio, has_seen_walkthrough, location_permission_status)
select p.id, a.email, p.display_name, p.username,
    (select id from public.schools where name = 'Stevens Institute of Technology'),
    2024, p.avatar_color, p.avatar_url, p.latitude, p.longitude, now(), p.bio, true, 'maybe_later'
from demo_people p join auth.users a on a.id = p.id
on conflict (id) do update set
    display_name = excluded.display_name,
    username = excluded.username,
    school_id = excluded.school_id,
    graduation_year = excluded.graduation_year,
    avatar_color = excluded.avatar_color,
    avatar_url = excluded.avatar_url,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    last_location_at = excluded.last_location_at,
    bio = excluded.bio,
    has_seen_walkthrough = true,
    location_permission_status = 'maybe_later',
    updated_at = now();

insert into public.friendships (id, requester_id, addressee_id, status, requested_at, responded_at)
select ('de300000-0000-4000-8000-00000010000' || n)::uuid, pg_temp.demo_id('me'), pg_temp.demo_id(k), 'accepted', now() - interval '30 days', now() - interval '29 days'
from (values (1, 'maya'), (2, 'theo'), (3, 'priya'), (4, 'jordan'), (5, 'sam')) f(n, k)
on conflict (requester_id, addressee_id) do update set status = 'accepted';

insert into public.user_follows (follower_id, followed_id)
select pg_temp.demo_id(a), pg_temp.demo_id(b)
from (values ('me', 'maya'), ('me', 'theo'), ('maya', 'me'), ('priya', 'me'), ('jordan', 'me')) f(a, b)
on conflict do nothing;

insert into public.parties (id, code, name, host_user_id, status, is_public, midpoint_lat, midpoint_lng, current_card_index, voting_round, created_at, updated_at)
values
    ('de300000-0000-4000-8000-0000000a0001', 'DEMOA1', 'Demo: Friday Trivia Night', pg_temp.demo_id('maya'), 'waiting',  false, null,    null,     null, 1, now() - interval '1 day',  now() - interval '1 hour'),
    ('de300000-0000-4000-8000-0000000a0002', 'DEMOB2', 'Demo: Saturday Brunch',     pg_temp.demo_id('me'),   'swiping',  false, 40.7444, -74.0310, 2,    1, now() - interval '2 days', now() - interval '20 minutes'),
    ('de300000-0000-4000-8000-0000000a0003', 'DEMOC3', 'Demo: Rooftop Hangout',     pg_temp.demo_id('theo'), 'swiping',  false, 40.7380, -74.0400, null, 1, now() - interval '6 days', now() - interval '3 days')
on conflict (id) do update set
    code = excluded.code, name = excluded.name, host_user_id = excluded.host_user_id, status = excluded.status,
    is_public = excluded.is_public, midpoint_lat = excluded.midpoint_lat, midpoint_lng = excluded.midpoint_lng,
    current_card_index = excluded.current_card_index, voting_round = excluded.voting_round,
    matched_location_id = null, locked_date_id = null, updated_at = excluded.updated_at;

insert into public.party_members (party_id, user_id, joined_at, is_online, location_mode, custom_latitude, custom_longitude, custom_label)
select m.party_id::uuid, p.id, now() - interval '1 day', false, 'custom', p.latitude, p.longitude, p.place
from (values
    ('de300000-0000-4000-8000-0000000a0001', 'maya'), ('de300000-0000-4000-8000-0000000a0001', 'me'), ('de300000-0000-4000-8000-0000000a0001', 'jordan'),
    ('de300000-0000-4000-8000-0000000a0002', 'me'), ('de300000-0000-4000-8000-0000000a0002', 'maya'), ('de300000-0000-4000-8000-0000000a0002', 'theo'), ('de300000-0000-4000-8000-0000000a0002', 'priya'),
    ('de300000-0000-4000-8000-0000000a0003', 'theo'), ('de300000-0000-4000-8000-0000000a0003', 'me'), ('de300000-0000-4000-8000-0000000a0003', 'sam'), ('de300000-0000-4000-8000-0000000a0003', 'jordan')
) m(party_id, key) join demo_people p on p.key = m.key
on conflict (party_id, user_id) do update set
    location_mode = 'custom', custom_latitude = excluded.custom_latitude, custom_longitude = excluded.custom_longitude, custom_label = excluded.custom_label;

create temp table demo_venues (slug text primary key, name text, address text, latitude double precision, longitude double precision,
    rating numeric(2,1), reviews int, category text, price int) on commit drop;

insert into demo_venues values
    ('harbor-light',        'Harbor Light Cafe (demo)',     '100 River St, Hoboken, NJ 07030',        40.7372, -74.0290, 4.6, 412, 'Cafe',            1),
    ('copper-kettle',       'Copper Kettle (demo)',         '220 Washington St, Hoboken, NJ 07030',   40.7395, -74.0305, 4.5, 838, 'Breakfast & brunch', 2),
    ('riverside-lawn',      'Riverside Lawn (demo)',        '500 Sinatra Dr, Hoboken, NJ 07030',      40.7445, -74.0255, 4.7, 1290, 'Park',           0),
    ('pier-lanes',          'Pier 13 Lanes (demo)',         '1300 Sinatra Dr, Hoboken, NJ 07030',     40.7510, -74.0240, 4.3, 356, 'Bowling alley',   2),
    ('washington-taqueria', 'Washington Taqueria (demo)',   '415 Washington St, Hoboken, NJ 07030',   40.7420, -74.0298, 4.4, 627, 'Mexican restaurant', 1),
    ('hudson-arcade',       'Hudson Arcade (demo)',         '78 Newark St, Hoboken, NJ 07030',        40.7368, -74.0318, 4.2, 214, 'Arcade',          2),
    ('mile-square-pub',     'Mile Square Pub (demo)',       '901 Bloomfield St, Hoboken, NJ 07030',   40.7490, -74.0300, 4.4, 503, 'Bar',             2),
    ('skyline-rooftop',     'Skyline Rooftop (demo)',       '1 Newark Ave, Jersey City, NJ 07302',    40.7360, -74.0370, 4.6, 974, 'Rooftop bar',     3);

insert into public.locations (id, party_id, google_place_id, name, address, latitude, longitude, photo_url, rating, user_ratings_total, category, price_level, created_at)
select l.id::uuid, l.party_id::uuid, 'demo-' || v.slug, v.name, v.address, v.latitude, v.longitude, '/demo/venue-' || v.slug || '.jpg',
    v.rating, v.reviews, v.category, v.price, now() - interval '2 days' + (l.n || ' minutes')::interval
from (values
    ('de300000-0000-4000-8000-0000000b0201', 'de300000-0000-4000-8000-0000000a0002', 'copper-kettle', 1),
    ('de300000-0000-4000-8000-0000000b0202', 'de300000-0000-4000-8000-0000000a0002', 'harbor-light', 2),
    ('de300000-0000-4000-8000-0000000b0203', 'de300000-0000-4000-8000-0000000a0002', 'washington-taqueria', 3),
    ('de300000-0000-4000-8000-0000000b0204', 'de300000-0000-4000-8000-0000000a0002', 'riverside-lawn', 4),
    ('de300000-0000-4000-8000-0000000b0205', 'de300000-0000-4000-8000-0000000a0002', 'hudson-arcade', 5),
    ('de300000-0000-4000-8000-0000000b0206', 'de300000-0000-4000-8000-0000000a0002', 'pier-lanes', 6),
    ('de300000-0000-4000-8000-0000000b0301', 'de300000-0000-4000-8000-0000000a0003', 'skyline-rooftop', 1),
    ('de300000-0000-4000-8000-0000000b0302', 'de300000-0000-4000-8000-0000000a0003', 'mile-square-pub', 2),
    ('de300000-0000-4000-8000-0000000b0303', 'de300000-0000-4000-8000-0000000a0003', 'pier-lanes', 3),
    ('de300000-0000-4000-8000-0000000b0304', 'de300000-0000-4000-8000-0000000a0003', 'washington-taqueria', 4)
) l(id, party_id, slug, n) join demo_venues v on v.slug = l.slug
on conflict (id) do update set
    name = excluded.name, address = excluded.address, latitude = excluded.latitude, longitude = excluded.longitude,
    photo_url = excluded.photo_url, rating = excluded.rating, user_ratings_total = excluded.user_ratings_total,
    category = excluded.category, price_level = excluded.price_level, created_at = excluded.created_at;

insert into public.votes (id, party_id, user_id, location_id, vote)
select v.id::uuid, v.party_id::uuid, pg_temp.demo_id(v.key), v.location_id::uuid, v.yes
from (values
    ('de300000-0000-4000-8000-0000000e0201', 'de300000-0000-4000-8000-0000000a0002', 'me',    'de300000-0000-4000-8000-0000000b0201', true),
    ('de300000-0000-4000-8000-0000000e0202', 'de300000-0000-4000-8000-0000000a0002', 'maya',  'de300000-0000-4000-8000-0000000b0201', true),
    ('de300000-0000-4000-8000-0000000e0203', 'de300000-0000-4000-8000-0000000a0002', 'theo',  'de300000-0000-4000-8000-0000000b0201', false),
    ('de300000-0000-4000-8000-0000000e0204', 'de300000-0000-4000-8000-0000000a0002', 'priya', 'de300000-0000-4000-8000-0000000b0201', true),
    ('de300000-0000-4000-8000-0000000e0205', 'de300000-0000-4000-8000-0000000a0002', 'me',    'de300000-0000-4000-8000-0000000b0202', false),
    ('de300000-0000-4000-8000-0000000e0206', 'de300000-0000-4000-8000-0000000a0002', 'maya',  'de300000-0000-4000-8000-0000000b0202', true),
    ('de300000-0000-4000-8000-0000000e0207', 'de300000-0000-4000-8000-0000000a0002', 'theo',  'de300000-0000-4000-8000-0000000b0202', true),
    ('de300000-0000-4000-8000-0000000e0208', 'de300000-0000-4000-8000-0000000a0002', 'priya', 'de300000-0000-4000-8000-0000000b0202', false),
    ('de300000-0000-4000-8000-0000000e0209', 'de300000-0000-4000-8000-0000000a0002', 'maya',  'de300000-0000-4000-8000-0000000b0203', true),
    ('de300000-0000-4000-8000-0000000e0210', 'de300000-0000-4000-8000-0000000a0002', 'theo',  'de300000-0000-4000-8000-0000000b0203', true),
    ('de300000-0000-4000-8000-0000000e0301', 'de300000-0000-4000-8000-0000000a0003', 'theo',  'de300000-0000-4000-8000-0000000b0301', true),
    ('de300000-0000-4000-8000-0000000e0302', 'de300000-0000-4000-8000-0000000a0003', 'me',    'de300000-0000-4000-8000-0000000b0301', true),
    ('de300000-0000-4000-8000-0000000e0303', 'de300000-0000-4000-8000-0000000a0003', 'sam',   'de300000-0000-4000-8000-0000000b0301', true),
    ('de300000-0000-4000-8000-0000000e0304', 'de300000-0000-4000-8000-0000000a0003', 'jordan','de300000-0000-4000-8000-0000000b0301', true),
    ('de300000-0000-4000-8000-0000000e0305', 'de300000-0000-4000-8000-0000000a0003', 'theo',  'de300000-0000-4000-8000-0000000b0302', true),
    ('de300000-0000-4000-8000-0000000e0306', 'de300000-0000-4000-8000-0000000a0003', 'me',    'de300000-0000-4000-8000-0000000b0302', false),
    ('de300000-0000-4000-8000-0000000e0307', 'de300000-0000-4000-8000-0000000a0003', 'sam',   'de300000-0000-4000-8000-0000000b0302', true),
    ('de300000-0000-4000-8000-0000000e0308', 'de300000-0000-4000-8000-0000000a0003', 'jordan','de300000-0000-4000-8000-0000000b0302', false)
) v(id, party_id, key, location_id, yes)
on conflict (id) do update set vote = excluded.vote;

insert into public.party_dates (id, party_id, starts_at, ends_at, proposed_by)
values
    ('de300000-0000-4000-8000-0000000c0301', 'de300000-0000-4000-8000-0000000a0003',
        date_trunc('day', now()) + interval '6 days 23 hours', date_trunc('day', now()) + interval '7 days 2 hours', pg_temp.demo_id('theo')),
    ('de300000-0000-4000-8000-0000000c0302', 'de300000-0000-4000-8000-0000000a0003',
        date_trunc('day', now()) + interval '7 days 22 hours', date_trunc('day', now()) + interval '8 days 1 hour', pg_temp.demo_id('sam'))
on conflict (id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, proposed_by = excluded.proposed_by;

insert into public.date_votes (id, party_date_id, user_id, available)
select d.id::uuid, d.date_id::uuid, pg_temp.demo_id(d.key), d.ok
from (values
    ('de300000-0000-4000-8000-0000000d0301', 'de300000-0000-4000-8000-0000000c0301', 'theo',   true),
    ('de300000-0000-4000-8000-0000000d0302', 'de300000-0000-4000-8000-0000000c0301', 'me',     true),
    ('de300000-0000-4000-8000-0000000d0303', 'de300000-0000-4000-8000-0000000c0301', 'sam',    true),
    ('de300000-0000-4000-8000-0000000d0304', 'de300000-0000-4000-8000-0000000c0301', 'jordan', true),
    ('de300000-0000-4000-8000-0000000d0305', 'de300000-0000-4000-8000-0000000c0302', 'sam',    true),
    ('de300000-0000-4000-8000-0000000d0306', 'de300000-0000-4000-8000-0000000c0302', 'me',     false)
) d(id, date_id, key, ok)
on conflict (id) do update set available = excluded.available;

update public.parties
set status = 'locked',
    matched_location_id = 'de300000-0000-4000-8000-0000000b0301',
    locked_date_id = 'de300000-0000-4000-8000-0000000c0301'
where id = 'de300000-0000-4000-8000-0000000a0003';

insert into public.feed_posts (id, creator_id, image_url, caption, venue_name, venue_address, venue_latitude, venue_longitude, venue_google_place_id, created_at)
select f.id::uuid, pg_temp.demo_id(f.key), '/demo/' || f.image || '.jpg', f.caption, v.name, v.address, v.latitude, v.longitude, 'demo-' || v.slug,
    now() - (f.hours || ' hours')::interval
from (values
    ('de300000-0000-4000-8000-0000000f0001', 'theo',   'post-rooftop-sunset', 'Golden hour with the crew. Demo post. #rooftop',          'skyline-rooftop',     3),
    ('de300000-0000-4000-8000-0000000f0002', 'maya',   'post-trivia-win',     'We finally won trivia night. Demo post. #trivia',         'mile-square-pub',     9),
    ('de300000-0000-4000-8000-0000000f0003', 'priya',  'post-brunch-table',   'Brunch spread worth waking up for. Demo post. #brunch',   'copper-kettle',       20),
    ('de300000-0000-4000-8000-0000000f0004', 'jordan', 'post-arcade-night',   'New high score, nobody can stop me. Demo post. #arcade',  'hudson-arcade',       30),
    ('de300000-0000-4000-8000-0000000f0005', 'sam',    'post-park-picnic',    'Picnic by the river before tacos. Demo post. #outdoors',  'riverside-lawn',      44)
) f(id, key, image, caption, slug, hours) join demo_venues v on v.slug = f.slug
on conflict (id) do update set
    image_url = excluded.image_url, caption = excluded.caption, venue_name = excluded.venue_name,
    venue_address = excluded.venue_address, created_at = excluded.created_at;

insert into public.feed_likes (user_id, post_id)
select pg_temp.demo_id(l.key), l.post_id::uuid
from (values
    ('me', 'de300000-0000-4000-8000-0000000f0001'), ('me', 'de300000-0000-4000-8000-0000000f0003'),
    ('maya', 'de300000-0000-4000-8000-0000000f0001'), ('priya', 'de300000-0000-4000-8000-0000000f0001'),
    ('theo', 'de300000-0000-4000-8000-0000000f0002'), ('sam', 'de300000-0000-4000-8000-0000000f0002'),
    ('jordan', 'de300000-0000-4000-8000-0000000f0003'), ('maya', 'de300000-0000-4000-8000-0000000f0004'),
    ('theo', 'de300000-0000-4000-8000-0000000f0005')
) l(key, post_id)
on conflict do nothing;

insert into public.feed_comments (id, post_id, author_id, body, created_at)
select c.id::uuid, c.post_id::uuid, pg_temp.demo_id(c.key), c.body, now() - (c.hours || ' hours')::interval
from (values
    ('de300000-0000-4000-8000-000000110001', 'de300000-0000-4000-8000-0000000f0001', 'maya',  'That view though. Demo comment.', 2),
    ('de300000-0000-4000-8000-000000110002', 'de300000-0000-4000-8000-0000000f0002', 'theo',  'Rematch next Friday. Demo comment.', 8)
) c(id, post_id, key, body, hours)
on conflict (id) do update set body = excluded.body;

insert into public.feed_bookmarks (user_id, post_id)
values (pg_temp.demo_id('me'), 'de300000-0000-4000-8000-0000000f0005')
on conflict do nothing;

insert into public.discover_likes (user_id, google_place_id, name, address, latitude, longitude, photo_url, rating, category, price_level)
select pg_temp.demo_id('me'), 'demo-' || v.slug, v.name, v.address, v.latitude, v.longitude, '/demo/venue-' || v.slug || '.jpg', v.rating, v.category, v.price
from demo_venues v where v.slug in ('harbor-light', 'riverside-lawn')
on conflict (user_id, google_place_id) do update set name = excluded.name, photo_url = excluded.photo_url;

commit;

select 'demo rows' as check,
    (select count(*) from public.users where username like 'demo\_%') as users,
    (select count(*) from public.parties where code like 'DEMO%') as parties,
    (select count(*) from public.locations where google_place_id like 'demo-%') as venues,
    (select count(*) from public.feed_posts where id::text like 'de300000-%') as posts;
