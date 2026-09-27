create table if not exists recipients (
  x_id text primary key,
  handle text not null,
  country text
);

create table if not exists planes (
  id int generated always as identity primary key,
  tweet_id text not null unique,
  from_x_id text not null,
  to_x_id text not null,
  from_handle text not null,
  to_handle text not null,
  from_country text,
  to_country text,
  created_at timestamptz not null
);

create table if not exists collector (
  id boolean primary key default true check (id),
  last_run timestamptz not null default 'epoch'
);
insert into collector default values on conflict do nothing;

-- после `npx auth migrate`: отметка последнего сбора по юзеру (замок от накрутки X API)
alter table "user" add column if not exists "collectedAt" timestamptz;
