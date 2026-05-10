-- 못 읽기 기록 (하루 2am 경계 1회씩, UNIQUE로 중복 방지)
create table if not exists reading_misses (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null references segments(id),
  profile_id uuid not null references profiles(id),
  book_id text not null,
  missed_boundary timestamptz not null,
  created_at timestamptz not null default now(),
  unique(segment_id, profile_id, missed_boundary)
);

-- 선물 서약 (책 한 권 세션마다, 상대방에게 미공개)
create table if not exists book_gifts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  profile_id uuid not null references profiles(id),
  gift_description text not null,
  is_revealed boolean not null default false,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, profile_id)
);

-- 책이 바뀔 때마다 새 UUID가 되는 session_id
alter table reading_progress add column if not exists session_id uuid not null default gen_random_uuid();
