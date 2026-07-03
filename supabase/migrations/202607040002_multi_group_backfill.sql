-- Backfill existing 주환/희진 data into the first group.

insert into groups (name, invite_code, max_members)
values ('주환♥희진', 'TGBHER', 5)
on conflict (invite_code) do nothing;

update profiles
set group_id = (select id from groups where invite_code = 'TGBHER')
where group_id is null;

update reading_progress
set group_id = (select id from groups where invite_code = 'TGBHER')
where group_id is null;

update book_proposals
set group_id = (select id from groups where invite_code = 'TGBHER')
where group_id is null;

update groups g
set owner_id = (select p.id from profiles p where p.slug = 'joohwan' and p.group_id = g.id)
where g.invite_code = 'TGBHER' and g.owner_id is null;

alter table profiles alter column group_id set not null;
alter table reading_progress alter column group_id set not null;
alter table book_proposals alter column group_id set not null;

create unique index if not exists reading_progress_group_id_key on reading_progress(group_id);
