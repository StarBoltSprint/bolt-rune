-- Room line: Keep lists the whole citadel, not a guessed neighbor.
alter table citadels add column if not exists from_id text;
alter table citadels add column if not exists via text;
alter table citadels add column if not exists title text;
create index if not exists citadels_user_from_idx on citadels (user_id, from_id);
