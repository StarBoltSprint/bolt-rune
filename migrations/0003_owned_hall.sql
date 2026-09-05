-- Hall and citadels are per-user. Unowned rows were a shared gallery anyone
-- could overwrite — drop them rather than hand the coffre to the first signer.

drop table if exists artifacts;
drop table if exists citadels;

create table artifacts (
  user_id text not null,
  id text not null,
  name text not null,
  still text not null,
  playlist text not null,
  prompt text not null default '',
  hung_at timestamptz not null default now(),
  grade text,
  primary key (user_id, id)
);

create index if not exists artifacts_user_hung_idx on artifacts (user_id, hung_at desc);

create table citadels (
  user_id text not null,
  id text not null,
  name text not null,
  updated bigint not null,
  phase text not null default 'play',
  want int not null default 2,
  walks int not null default 0,
  thumb text not null default '',
  rooms int,
  hall int,
  body text not null,
  primary key (user_id, id)
);

create index if not exists citadels_user_updated_idx on citadels (user_id, updated desc);
