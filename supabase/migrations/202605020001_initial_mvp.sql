create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  role text not null default 'reader',
  color_key text not null,
  accent_color text not null,
  accent_deep text not null,
  accent_soft text not null,
  auth_email text,
  created_at timestamptz not null default now()
);

create table if not exists sections (
  id text primary key,
  name text not null,
  description text,
  sort_order integer not null
);

create table if not exists books (
  id text primary key,
  section_id text not null references sections(id),
  name text not null,
  sort_order integer not null,
  chapter_count integer not null,
  wol_book_number integer not null
);

create table if not exists segments (
  id text primary key,
  book_id text not null references books(id),
  book_name text not null,
  section_id text not null references sections(id),
  chapter integer not null,
  display text not null,
  sort_order integer not null,
  global_order integer not null,
  mark text,
  jw_url text,
  created_at timestamptz not null default now(),
  unique(book_id, chapter)
);

create table if not exists reading_progress (
  id uuid primary key default gen_random_uuid(),
  current_book_id text references books(id),
  current_segment_id text references segments(id),
  initial_book_id text references books(id),
  status text not null default 'reading',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists reading_states (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null references segments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(segment_id, profile_id)
);

create table if not exists book_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_book_id text not null references books(id),
  proposed_by uuid not null references profiles(id),
  accepted_by uuid references profiles(id),
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null references segments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  verse_ref text not null,
  start_verse integer,
  end_verse integer,
  note text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null references segments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null,
  parent_id uuid not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  emoji text not null default 'heart',
  created_at timestamptz not null default now(),
  unique(target_type, target_id, profile_id, emoji)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique(message_id, profile_id)
);

create table if not exists verse_counts (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references books(id) on delete cascade,
  chapter integer not null,
  verse_count integer not null,
  unique(book_id, chapter)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  target_type text,
  target_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_segments_book_order on segments(book_id, chapter);
create index if not exists idx_reading_states_segment on reading_states(segment_id);
create index if not exists idx_comments_segment on comments(segment_id, created_at);
create index if not exists idx_highlights_segment on highlights(segment_id, created_at);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_notifications_profile on notifications(profile_id, read_at, created_at desc);
