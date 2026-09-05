create table if not exists artifacts (
  id text primary key,
  name text not null,
  still text not null,
  playlist text not null,
  prompt text not null default '',
  hung_at timestamptz not null default now(),
  grade text
);

create table if not exists citadels (
  id text primary key,
  name text not null,
  updated bigint not null,
  phase text not null default 'play',
  want int not null default 2,
  walks int not null default 0,
  thumb text not null default '',
  rooms int,
  hall int,
  body text not null
);

create index if not exists citadels_updated_idx on citadels (updated desc);
