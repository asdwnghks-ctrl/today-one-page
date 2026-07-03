-- Run only after scripts/migrate-pins.ts has backfilled pin_hash for every existing profile.
alter table profiles alter column pin_hash set not null;
