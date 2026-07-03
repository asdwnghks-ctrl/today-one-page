-- Multi-group support: schema only, no data changes yet.

create table if not exists groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text unique not null,
  owner_id     uuid references profiles(id),
  max_members  int not null default 5,
  reading_mode text not null default 'daily_one' check (reading_mode in ('daily_one', 'plan')),
  created_at   timestamptz not null default now()
);

alter table profiles add column if not exists group_id uuid references groups(id);
alter table profiles add column if not exists pin_hash text;

alter table profiles drop constraint if exists profiles_slug_key;
create unique index if not exists profiles_group_slug_key on profiles(group_id, slug);

alter table reading_progress add column if not exists group_id uuid references groups(id);
alter table reading_progress add column if not exists plan_day_index int;

alter table book_proposals add column if not exists group_id uuid references groups(id);

create index if not exists idx_book_proposals_group on book_proposals(group_id, status);

create table if not exists plan_days (
  day_index   int primary key,
  book_id     text not null references books(id),
  segment_ids text[] not null
);
