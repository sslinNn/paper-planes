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

-- донаты (lava.top): один ряд на оплаченный контракт — вебхук идемпотентен
create table if not exists patrons (
  contract_id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  amount numeric not null,
  currency text not null,
  paid_at timestamptz not null default now()
);
create index if not exists patrons_user on patrons (user_id);
-- модель самолётика донатера: dart | glider | swallow | crane
alter table "user" add column if not exists plane text;

-- живой счётчик «онлайн / за сегодня»: ряд на посетителя в день, heartbeat двигает last_seen
create table if not exists visitors (
  day date not null default current_date,
  id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (day, id)
);

-- расход X API по дням (UTC, оценка сверху): сборщик встаёт, когда за сутки набежал бюджет
create table if not exists x_spend (
  day date primary key,
  usd numeric not null default 0
);

-- точка «я живу здесь» внутри страны (долгота, широта): к ней летят самолётики, адресованные юзеру.
-- смена страны её сбрасывает
alter table "user" add column if not exists spot_lon double precision;
alter table "user" add column if not exists spot_lat double precision;

-- planes/me джойнят account по (providerId, accountId) — без индекса это seq scan на каждый опрос карты
create index if not exists account_provider_account on account ("providerId", "accountId");
