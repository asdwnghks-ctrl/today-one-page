-- Tie missed-reading records to the book session they belong to.
alter table reading_misses add column if not exists session_id uuid;

update reading_misses
set session_id = coalesce((select session_id from reading_progress limit 1), gen_random_uuid())
where session_id is null;

alter table reading_misses alter column session_id set not null;

create index if not exists idx_reading_misses_session on reading_misses(session_id);

-- Clean up proposals that were already applied by the old immediate-accept behavior.
update book_proposals
set status = 'started'
where status = 'accepted'
  and proposed_book_id = (select current_book_id from reading_progress limit 1)
  and accepted_at <= (select started_at from reading_progress limit 1);
