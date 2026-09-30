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

-- rate limit по ключу (IP, юзер): фиксированное окно, старые строки чистит сборщик
create table if not exists rate_limits (
  key text primary key,
  started timestamptz not null,
  n int not null
);

-- паспорт (/api/me) ищет самолётики юзера по from_x_id; таблица растёт вечно, без индекса это seq scan
create index if not exists planes_from_x_id on planes (from_x_id);

-- AIRMAIL: тип письма, который решил Jev (warm | hot | joke | question | plain). Текст реплая не храним
alter table planes add column if not exists kind text;

-- AIRMAIL: штамп за доставку письма в игре. Один на письмо и юзера
create table if not exists airmail (
  user_id text not null references "user"(id) on delete cascade,
  plane_id int not null references planes(id) on delete cascade,
  country text not null,
  delivered_at timestamptz not null default now(),
  primary key (user_id, plane_id)
);

-- AIRMAIL: забеги залогиненных — опыт (ранг) и лидерборд «Today's Mail #N». Счёт считает клиент, сервер режет невозможное
create table if not exists airmail_runs (
  id int generated always as identity primary key,
  user_id text not null references "user"(id) on delete cascade,
  day int not null,
  mode text not null,
  score int not null,
  delivered int not null,
  km int not null,
  countries text not null,
  created_at timestamptz not null default now()
);
create index if not exists airmail_runs_board on airmail_runs (day, mode, score desc);
create index if not exists airmail_runs_user on airmail_runs (user_id);

-- MAIL WARS: каждое доставленное письмо закрашивает страну флагом пилота. Правит страной нация, чья почта долетела туда чаще за неделю
create table if not exists wars (
  id int generated always as identity primary key,
  nation text not null,
  country text not null,
  n int not null,
  created_at timestamptz not null default now()
);
create index if not exists wars_recent on wars (created_at);
-- первый запуск: война начинается с уже сыгранных забегов (страна пилота → страны его доставок)
insert into wars (nation, country, n, created_at)
select u.country, substring(r.countries from i * 2 + 1 for 2), 1, r.created_at
from airmail_runs r join "user" u on u.id = r.user_id
cross join lateral generate_series(0, length(r.countries) / 2 - 1) i
where u.country is not null and substring(r.countries from i * 2 + 1 for 2) <> 'AQ' and not exists (select 1 from wars);
