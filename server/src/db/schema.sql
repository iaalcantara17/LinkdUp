-- LinkdUp database schema
-- Postgres / Supabase
-- Run this in Supabase SQL Editor on a fresh project.

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =========================================================================
-- SCHOOLS (reference data for the alumni signup field)
-- =========================================================================
create table if not exists public.schools (
    id          uuid primary key default uuid_generate_v4(),
    name        varchar(200) not null unique,
    city        varchar(100),
    state       varchar(50),
    country     varchar(50) default 'USA',
    created_at  timestamptz not null default now()
);

create index if not exists schools_name_idx on public.schools using gin (to_tsvector('english', name));

-- Seed a handful so signup autocomplete is not empty in dev
insert into public.schools (name, city, state) values
    ('New Jersey Institute of Technology', 'Newark', 'NJ'),
    ('Rutgers University', 'New Brunswick', 'NJ'),
    ('Stevens Institute of Technology', 'Hoboken', 'NJ'),
    ('Princeton University', 'Princeton', 'NJ'),
    ('Columbia University', 'New York', 'NY'),
    ('New York University', 'New York', 'NY'),
    ('Massachusetts Institute of Technology', 'Cambridge', 'MA'),
    ('Carnegie Mellon University', 'Pittsburgh', 'PA'),
    ('University of California, Berkeley', 'Berkeley', 'CA'),
    ('Georgia Institute of Technology', 'Atlanta', 'GA')
on conflict (name) do nothing;

-- =========================================================================
-- USERS (mirrors Supabase auth.users by id)
-- =========================================================================
create table if not exists public.users (
    id                   uuid primary key,  -- matches auth.users.id
    email                varchar(255) not null unique,
    display_name         varchar(100) not null,
    school_id            uuid references public.schools(id),
    graduation_year      int,
    avatar_color         varchar(7) default '#6C3EF4',
    latitude             double precision,
    longitude            double precision,
    last_location_at     timestamptz,
    google_calendar_token text,    -- encrypted access token (set server-side only)
    google_calendar_refresh text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    constraint users_grad_year_check check (graduation_year is null or (graduation_year between 1950 and 2100))
);

create index if not exists users_email_idx on public.users (email);
create index if not exists users_school_idx on public.users (school_id);

-- =========================================================================
-- PARTIES
-- =========================================================================
create type party_status as enum ('waiting', 'swiping', 'matched', 'scheduled', 'locked');

create table if not exists public.parties (
    id                  uuid primary key default uuid_generate_v4(),
    code                varchar(6) not null unique,
    name                varchar(100),
    host_user_id        uuid not null references public.users(id) on delete cascade,
    status              party_status not null default 'waiting',
    matched_location_id uuid,    -- FK added below after locations table exists
    locked_date_id      uuid,    -- FK added below after party_dates table exists
    midpoint_lat        double precision,
    midpoint_lng        double precision,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists parties_code_idx on public.parties (code);
create index if not exists parties_host_idx on public.parties (host_user_id);
create index if not exists parties_status_idx on public.parties (status);

-- =========================================================================
-- PARTY MEMBERS (junction)
-- =========================================================================
create table if not exists public.party_members (
    party_id    uuid not null references public.parties(id) on delete cascade,
    user_id     uuid not null references public.users(id) on delete cascade,
    joined_at   timestamptz not null default now(),
    is_online   boolean not null default false,
    primary key (party_id, user_id)
);

create index if not exists party_members_user_idx on public.party_members (user_id);

-- =========================================================================
-- LOCATIONS (venue candidates per party)
-- =========================================================================
create table if not exists public.locations (
    id                uuid primary key default uuid_generate_v4(),
    party_id          uuid not null references public.parties(id) on delete cascade,
    google_place_id   varchar(255) not null,
    name              varchar(200) not null,
    address           varchar(500),
    latitude          double precision not null,
    longitude         double precision not null,
    photo_url         varchar(1000),
    rating            numeric(2,1),
    user_ratings_total int,
    category          varchar(100),
    price_level       int,
    created_at        timestamptz not null default now(),
    unique (party_id, google_place_id)
);

create index if not exists locations_party_idx on public.locations (party_id);

-- Add the deferred FK from parties.matched_location_id
alter table public.parties
    add constraint parties_matched_location_fk
    foreign key (matched_location_id) references public.locations(id) on delete set null;

-- =========================================================================
-- VOTES
-- =========================================================================
create table if not exists public.votes (
    id           uuid primary key default uuid_generate_v4(),
    party_id     uuid not null references public.parties(id) on delete cascade,
    user_id      uuid not null references public.users(id) on delete cascade,
    location_id  uuid not null references public.locations(id) on delete cascade,
    vote         boolean not null,
    voted_at     timestamptz not null default now(),
    unique (party_id, user_id, location_id)
);

create index if not exists votes_party_loc_idx on public.votes (party_id, location_id);
create index if not exists votes_party_user_idx on public.votes (party_id, user_id);

-- =========================================================================
-- PARTY DATES (proposed date/time slots after match)
-- =========================================================================
create table if not exists public.party_dates (
    id          uuid primary key default uuid_generate_v4(),
    party_id    uuid not null references public.parties(id) on delete cascade,
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    created_at  timestamptz not null default now(),
    unique (party_id, starts_at)
);

create index if not exists party_dates_party_idx on public.party_dates (party_id);

alter table public.parties
    add constraint parties_locked_date_fk
    foreign key (locked_date_id) references public.party_dates(id) on delete set null;

-- =========================================================================
-- DATE VOTES (availability per slot per user)
-- =========================================================================
create table if not exists public.date_votes (
    id            uuid primary key default uuid_generate_v4(),
    party_date_id uuid not null references public.party_dates(id) on delete cascade,
    user_id       uuid not null references public.users(id) on delete cascade,
    available     boolean not null default true,
    voted_at      timestamptz not null default now(),
    unique (party_date_id, user_id)
);

create index if not exists date_votes_party_date_idx on public.date_votes (party_date_id);

-- =========================================================================
-- HELPFUL VIEWS
-- =========================================================================

-- Vote tally per (party, location) — used by the match engine
create or replace view public.v_party_vote_tallies as
select
    l.party_id,
    l.id as location_id,
    l.name as location_name,
    count(v.id) filter (where v.vote = true) as yes_votes,
    count(v.id) filter (where v.vote = false) as no_votes,
    (select count(*) from public.party_members pm where pm.party_id = l.party_id) as total_members
from public.locations l
left join public.votes v on v.location_id = l.id
group by l.party_id, l.id, l.name;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================
-- We use Supabase Auth, so the JWT subject is the user's id.
-- The Express server uses the service_role key and bypasses RLS — RLS is here
-- as a defense-in-depth layer in case any client ever talks to Supabase directly.

alter table public.users enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.locations enable row level security;
alter table public.votes enable row level security;
alter table public.party_dates enable row level security;
alter table public.date_votes enable row level security;
alter table public.schools enable row level security;

-- Schools: read for everyone authenticated
create policy "schools_read_authenticated" on public.schools
    for select using (auth.role() = 'authenticated');

-- Users: a user can read and update only themselves
create policy "users_self_read" on public.users
    for select using (auth.uid() = id);
create policy "users_self_update" on public.users
    for update using (auth.uid() = id);

-- Party members can see their party rows
create policy "parties_member_read" on public.parties
    for select using (
        exists (select 1 from public.party_members pm where pm.party_id = parties.id and pm.user_id = auth.uid())
    );

create policy "party_members_self_read" on public.party_members
    for select using (
        user_id = auth.uid()
        or exists (select 1 from public.party_members pm where pm.party_id = party_members.party_id and pm.user_id = auth.uid())
    );

create policy "locations_member_read" on public.locations
    for select using (
        exists (select 1 from public.party_members pm where pm.party_id = locations.party_id and pm.user_id = auth.uid())
    );

create policy "votes_member_read" on public.votes
    for select using (
        exists (select 1 from public.party_members pm where pm.party_id = votes.party_id and pm.user_id = auth.uid())
    );

create policy "party_dates_member_read" on public.party_dates
    for select using (
        exists (select 1 from public.party_members pm where pm.party_id = party_dates.party_id and pm.user_id = auth.uid())
    );

create policy "date_votes_member_read" on public.date_votes
    for select using (
        exists (
            select 1
            from public.party_dates pd
            join public.party_members pm on pm.party_id = pd.party_id
            where pd.id = date_votes.party_date_id and pm.user_id = auth.uid()
        )
    );
