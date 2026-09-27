# Paper Planes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живая карта мира, где каждый реплай в X между залогиненными юзерами летит бумажным самолётиком из страны в страну.

**Architecture:** Next.js (Vercel) — карта, логин через X, страница выбора страны. Supabase — Auth (провайдер `x`), Postgres, Realtime. Edge Function `collect` раз в 5 минут (pg_cron) читает новые твиты каждого юзера его же токеном, превращает реплаи в строки `planes`; карта получает их через Realtime и анимирует SVG `<animateMotion>`.

**Tech Stack:** Next.js (App Router, TS), `@supabase/supabase-js`, `@supabase/ssr`, `d3-geo`, `topojson-client`, `world-atlas`, `i18n-iso-countries`; Deno (Edge Functions + `deno test`); Node built-in test runner для фронтовой геометрии.

**Spec:** `docs/superpowers/specs/2026-09-28-paper-planes-design.md`

## Global Constraints

- На карте только страны (ISO-3166 alpha-2), никаких координат юзеров.
- Текст твитов не хранится нигде.
- Токены X недоступны клиенту: отдельная таблица `x_tokens` без RLS-политик (уточнение спеки — там токены были в `users`).
- Клиент может менять в `users` только `country` и `country_manual`.
- Страна `null` = «туман», точка `FOG = [-140, 5]` (Тихий океан).
- X API: `max_results` 20 на первом прогоне юзера, 100 дальше; пагинацию не делаем.
- Бот ничего не постит в X.
- Тексты интерфейса — на английском (карта глобальная).
- Уточнение спеки: подпись самолётика — нативный `<title>` (hover/tap), а не отдельный клик-попап; чтобы карта не стояла, раз в 2.5 с перелетает случайный самолётик из истории.

## Review Focus

1. Повторный логин не должен сбрасывать вручную выбранную страну и `since_id` → проверка в Task 5, Step 7.
2. Реплай самому себе (свой тред) не должен давать самолётик → тест в Task 2.
3. Реплай удалённому/забаненному аккаунту (нет юзера в `includes`) → самолётик пропускается, сборщик не падает → тест в Task 2.
4. Страна без геометрии на карте 110m (например `HK`, `SG`), неизвестный код, `null` → точка «туман», а не `NaN` → тест в Task 6.
5. Отозванный доступ / мёртвый refresh token → юзер выпадает (токены удаляются), остальные собираются → тест `refresh` в Task 4 + ручная проверка.

---

## File Structure

```
app/
  layout.tsx              (create-next-app, правим title)
  globals.css             стили карты
  page.tsx                главная: заголовок, LoginButton, PlaneMap
  LoginButton.tsx         client: логин через X / ссылка на /me
  PlaneMap.tsx            client: SVG-карта, Realtime, анимация
  me/page.tsx             client: выбор страны
  auth/callback/route.ts  обмен кода, сохранение юзера и токенов
lib/
  geo.ts                  проекция, страны, at(iso) → [lon, lat]
  geo.test.ts             node --test
  supabase/client.ts      браузерный клиент
  supabase/server.ts      серверный (cookies) + admin (secret key)
supabase/
  config.toml             (supabase init) + verify_jwt=false для collect
  migrations/20260928000000_init.sql
  migrations/20260928000100_cron.sql
  functions/_shared/country.ts      parseCountry
  functions/_shared/country.test.ts
  functions/_shared/planes.ts       toPlanes, resolveCountries
  functions/_shared/planes.test.ts
  functions/_shared/x.ts            refresh, getTweets, getMe
  functions/_shared/x.test.ts
  functions/collect/index.ts        сборщик
```

---

### Task 1: Скелет проекта + парсер страны

**Files:**
- Create: Next-скелет (create-next-app), `supabase/config.toml` (supabase init)
- Create: `supabase/functions/_shared/country.ts`
- Test: `supabase/functions/_shared/country.test.ts`

**Interfaces:**
- Produces: `parseCountry(location: string | null | undefined): string | null` — alpha-2 в верхнем регистре или `null`.

- [ ] **Step 1: Скелет Next + Supabase**

В корне репо (там уже есть `.git` и `docs/` — create-next-app их допускает):

```bash
npx create-next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes
npx supabase init
```

В `tsconfig.json` в `"exclude"` добавить `"supabase"` и `"**/*.test.ts"` (Deno-код и тесты не должны попадать в `next build`):

```json
"exclude": ["node_modules", "supabase", "**/*.test.ts"]
```

- [ ] **Step 2: Написать падающий тест**

`supabase/functions/_shared/country.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { parseCountry } from './country.ts'

const cases: [string | null, string | null][] = [
  ['Moscow', 'RU'],
  ['Berlin, Germany', 'DE'],
  ['🇧🇷 São Paulo', 'BR'],
  ['Paris, France 🇫🇷', 'FR'],
  ['Россия', 'RU'],
  ['NYC', 'US'],
  ['london | uk', 'GB'],
  ['Санкт-Петербург', 'RU'],
  ['на луне 🌙', null],
  ['Earth', null],
  ['', null],
  [null, null],
]

for (const [input, expected] of cases) {
  Deno.test(`parseCountry(${JSON.stringify(input)}) → ${expected}`, () => {
    assertEquals(parseCountry(input), expected)
  })
}
```

- [ ] **Step 3: Убедиться, что падает**

Run: `deno test supabase/functions/_shared/country.test.ts`
Expected: FAIL — `Module not found "…/country.ts"`

- [ ] **Step 4: Реализация**

`supabase/functions/_shared/country.ts`:

```ts
import countries from 'npm:i18n-iso-countries@7'
import en from 'npm:i18n-iso-countries@7/langs/en.json' with { type: 'json' }
import ru from 'npm:i18n-iso-countries@7/langs/ru.json' with { type: 'json' }

countries.registerLocale(en)
countries.registerLocale(ru)

// ponytail: ручной список городов/алиасов; расширять, когда доля «тумана» на карте станет заметной
const PLACES: Record<string, string> = {
  usa: 'US', us: 'US', america: 'US', uk: 'GB', england: 'GB', scotland: 'GB', 'рф': 'RU',
  moscow: 'RU', 'москва': 'RU', 'мск': 'RU', 'saint petersburg': 'RU', spb: 'RU', 'санкт-петербург': 'RU', 'спб': 'RU', 'питер': 'RU',
  kyiv: 'UA', kiev: 'UA', 'киев': 'UA', minsk: 'BY', 'минск': 'BY', almaty: 'KZ', 'алматы': 'KZ', tashkent: 'UZ', tbilisi: 'GE', yerevan: 'AM',
  london: 'GB', manchester: 'GB', paris: 'FR', berlin: 'DE', munich: 'DE', amsterdam: 'NL', madrid: 'ES', barcelona: 'ES',
  lisbon: 'PT', rome: 'IT', milan: 'IT', warsaw: 'PL', prague: 'CZ', vienna: 'AT', zurich: 'CH', stockholm: 'SE',
  helsinki: 'FI', oslo: 'NO', copenhagen: 'DK', dublin: 'IE', istanbul: 'TR', dubai: 'AE', 'tel aviv': 'IL',
  'new york': 'US', nyc: 'US', 'los angeles': 'US', 'san francisco': 'US', sf: 'US', 'bay area': 'US', seattle: 'US',
  austin: 'US', chicago: 'US', miami: 'US', boston: 'US', 'washington dc': 'US',
  toronto: 'CA', vancouver: 'CA', montreal: 'CA', 'mexico city': 'MX', 'são paulo': 'BR', 'sao paulo': 'BR',
  'rio de janeiro': 'BR', 'buenos aires': 'AR', bogota: 'CO', lima: 'PE', santiago: 'CL',
  lagos: 'NG', nairobi: 'KE', cairo: 'EG', johannesburg: 'ZA', 'cape town': 'ZA',
  tokyo: 'JP', osaka: 'JP', seoul: 'KR', beijing: 'CN', shanghai: 'CN', 'hong kong': 'HK', singapore: 'SG',
  bangkok: 'TH', jakarta: 'ID', manila: 'PH', mumbai: 'IN', delhi: 'IN', 'new delhi': 'IN', bangalore: 'IN',
  bengaluru: 'IN', karachi: 'PK', lahore: 'PK', dhaka: 'BD', sydney: 'AU', melbourne: 'AU', auckland: 'NZ',
}

const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u

export function parseCountry(location: string | null | undefined): string | null {
  if (!location) return null
  const flag = location.match(FLAG)?.[0]
  if (flag) return [...flag].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('')

  const whole = location.toLowerCase().trim()
  const parts = whole.split(/[,|/·•]/).map((s) => s.trim()).filter(Boolean).reverse()
  for (const p of [whole, ...parts]) {
    const hit = PLACES[p] ?? countries.getAlpha2Code(p, 'en') ?? countries.getAlpha2Code(p, 'ru')
    if (hit) return hit
  }
  return null
}
```

- [ ] **Step 5: Тесты проходят**

Run: `deno test supabase/functions/_shared/country.test.ts`
Expected: PASS, 12 passed

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: project skeleton and country parser"
```

---

### Task 2: Реплаи → самолётики

**Files:**
- Create: `supabase/functions/_shared/planes.ts`
- Test: `supabase/functions/_shared/planes.test.ts`

**Interfaces:**
- Consumes: `parseCountry` (Task 1)
- Produces:
  ```ts
  type Tweet = { id: string; created_at: string; in_reply_to_user_id?: string }
  type XUser = { id: string; username: string; location?: string }
  type Me = { x_id: string; handle: string; country: string | null }
  type Plane = { tweet_id: string; from_x_id: string; to_x_id: string; from_handle: string; to_handle: string;
                 from_country: string | null; to_country: string | null; created_at: string }
  type Recipient = { x_id: string; handle: string; country: string | null }
  replyTargets(me: Me, tweets: Tweet[]): string[]            // уникальные id адресатов
  resolveCountries(ids: string[], registered: Map<string, string | null>, cached: Map<string, string | null>, users: XUser[])
    : { countryOf: Map<string, string | null>; newRecipients: Recipient[] }
  toPlanes(me: Me, tweets: Tweet[], users: XUser[], countryOf: Map<string, string | null>): Plane[]
  ```

- [ ] **Step 1: Падающий тест**

`supabase/functions/_shared/planes.test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert@1'
import { replyTargets, resolveCountries, toPlanes, type Tweet, type XUser } from './planes.ts'

const me = { x_id: '1', handle: 'me', country: 'RU' }
const t = (id: string, to?: string): Tweet => ({ id, created_at: '2026-09-28T00:00:00Z', in_reply_to_user_id: to })
const users: XUser[] = [
  { id: '2', username: 'bob', location: 'Berlin' },
  { id: '3', username: 'ann', location: 'somewhere' },
]

Deno.test('replyTargets: only replies to other people, unique', () => {
  assertEquals(replyTargets(me, [t('a', '2'), t('b'), t('c', '1'), t('d', '2'), t('e', '3')]), ['2', '3'])
})

Deno.test('toPlanes: reply to other user becomes plane', () => {
  const planes = toPlanes(me, [t('a', '2')], users, new Map([['2', 'DE']]))
  assertEquals(planes, [{
    tweet_id: 'a', from_x_id: '1', to_x_id: '2', from_handle: 'me', to_handle: 'bob',
    from_country: 'RU', to_country: 'DE', created_at: '2026-09-28T00:00:00Z',
  }])
})

Deno.test('toPlanes: self-reply and non-reply are skipped', () => {
  assertEquals(toPlanes(me, [t('a', '1'), t('b')], users, new Map()), [])
})

Deno.test('toPlanes: recipient missing from includes (deleted account) is skipped', () => {
  assertEquals(toPlanes(me, [t('a', '99')], users, new Map()), [])
})

Deno.test('resolveCountries: registered beats cached beats parsed', () => {
  const { countryOf, newRecipients } = resolveCountries(
    ['2', '3', '4'],
    new Map([['2', 'FR']]),          // bob залогинен и выбрал Францию
    new Map([['3', 'JP']]),          // ann уже в кэше
    [...users, { id: '4', username: 'kim', location: 'Seoul' }],
  )
  assertEquals([...countryOf], [['2', 'FR'], ['3', 'JP'], ['4', 'KR']])
  assertEquals(newRecipients, [{ x_id: '4', handle: 'kim', country: 'KR' }])
})

Deno.test('resolveCountries: unknown user without includes → null, not cached', () => {
  const { countryOf, newRecipients } = resolveCountries(['9'], new Map(), new Map(), [])
  assertEquals(countryOf.get('9'), null)
  assertEquals(newRecipients, [])
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `deno test supabase/functions/_shared/planes.test.ts`
Expected: FAIL — `Module not found "…/planes.ts"`

- [ ] **Step 3: Реализация**

`supabase/functions/_shared/planes.ts`:

```ts
import { parseCountry } from './country.ts'

export type Tweet = { id: string; created_at: string; in_reply_to_user_id?: string }
export type XUser = { id: string; username: string; location?: string }
export type Me = { x_id: string; handle: string; country: string | null }
export type Plane = {
  tweet_id: string; from_x_id: string; to_x_id: string; from_handle: string; to_handle: string
  from_country: string | null; to_country: string | null; created_at: string
}
export type Recipient = { x_id: string; handle: string; country: string | null }

const isReplyToOther = (me: Me, t: Tweet) => !!t.in_reply_to_user_id && t.in_reply_to_user_id !== me.x_id

export function replyTargets(me: Me, tweets: Tweet[]): string[] {
  return [...new Set(tweets.filter((t) => isReplyToOther(me, t)).map((t) => t.in_reply_to_user_id!))]
}

export function resolveCountries(
  ids: string[],
  registered: Map<string, string | null>,
  cached: Map<string, string | null>,
  users: XUser[],
) {
  const byId = new Map(users.map((u) => [u.id, u]))
  const countryOf = new Map<string, string | null>()
  const newRecipients: Recipient[] = []
  for (const id of ids) {
    if (registered.has(id)) countryOf.set(id, registered.get(id)!)
    else if (cached.has(id)) countryOf.set(id, cached.get(id)!)
    else {
      const u = byId.get(id)
      const country = parseCountry(u?.location)
      countryOf.set(id, country)
      if (u) newRecipients.push({ x_id: id, handle: u.username, country })
    }
  }
  return { countryOf, newRecipients }
}

export function toPlanes(me: Me, tweets: Tweet[], users: XUser[], countryOf: Map<string, string | null>): Plane[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  return tweets.flatMap((t) => {
    const to = isReplyToOther(me, t) ? byId.get(t.in_reply_to_user_id!) : undefined
    if (!to) return []
    return [{
      tweet_id: t.id, from_x_id: me.x_id, to_x_id: to.id, from_handle: me.handle, to_handle: to.username,
      from_country: me.country, to_country: countryOf.get(to.id) ?? null, created_at: t.created_at,
    }]
  })
}
```

- [ ] **Step 4: Тесты проходят**

Run: `deno test supabase/functions/_shared/`
Expected: PASS, все тесты Task 1 и Task 2

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planes.ts supabase/functions/_shared/planes.test.ts
git commit -m "feat: turn replies into planes"
```

---

### Task 3: Схема БД

**Files:**
- Create: `supabase/migrations/20260928000000_init.sql`

**Interfaces:**
- Produces: таблицы `users`, `x_tokens`, `recipients`, `planes` (колонки как в Task 2 `Plane` / `Recipient`), Realtime на `planes`.

- [ ] **Step 1: Supabase-проект**

Нужен проект Supabase. Спросить у человека, взять существующий или создать новый (организация, регион). Записать `project-ref`, URL, publishable key, secret key.

```bash
npx supabase link --project-ref <project-ref>
```

- [ ] **Step 2: Миграция**

`supabase/migrations/20260928000000_init.sql`:

```sql
create table users (
  x_id text primary key,
  handle text not null,
  avatar_url text,
  country text check (country ~ '^[A-Z]{2}$'),
  country_manual boolean not null default false,
  since_id text,
  auth_user_id uuid unique references auth.users on delete cascade
);

create table x_tokens (
  x_id text primary key references users on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null
);

create table recipients (
  x_id text primary key,
  handle text not null,
  country text
);

create table planes (
  id bigint generated always as identity primary key,
  tweet_id text not null unique,
  from_x_id text not null,
  to_x_id text not null,
  from_handle text not null,
  to_handle text not null,
  from_country text,
  to_country text,
  created_at timestamptz not null
);

alter table users enable row level security;
alter table x_tokens enable row level security;   -- без политик: только service role
alter table recipients enable row level security; -- без политик: только service role
alter table planes enable row level security;

create policy "planes are public" on planes for select to anon, authenticated using (true);
create policy "read own user" on users for select to authenticated using (auth_user_id = auth.uid());
create policy "update own user" on users for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

grant select on planes to anon, authenticated;
grant select on users to authenticated;
revoke update on users from authenticated;
grant update (country, country_manual) on users to authenticated;

alter publication supabase_realtime add table planes;
```

- [ ] **Step 3: Применить**

Run: `npx supabase db push`
Expected: `Finished supabase db push.`

- [ ] **Step 4: Проверить доступы**

```bash
curl -s "$SUPABASE_URL/rest/v1/planes?select=*" -H "apikey: $PUBLISHABLE_KEY"
curl -s "$SUPABASE_URL/rest/v1/x_tokens?select=*" -H "apikey: $PUBLISHABLE_KEY"
```

Expected: первый `[]`; второй `[]` или ошибка permission denied (главное — не данные).

В SQL-редакторе Supabase:

```sql
begin;
set local role authenticated;
update users set since_id = '1';
rollback;
```

Expected: `ERROR: permission denied for table users`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928000000_init.sql supabase/config.toml
git commit -m "feat: database schema"
```

---

### Task 4: Сборщик (Edge Function `collect`)

**Files:**
- Create: `supabase/functions/_shared/x.ts`
- Test: `supabase/functions/_shared/x.test.ts`
- Create: `supabase/functions/collect/index.ts`
- Modify: `supabase/config.toml` (секция функции)

**Interfaces:**
- Consumes: `parseCountry` (Task 1); `replyTargets`, `resolveCountries`, `toPlanes`, типы (Task 2); таблицы (Task 3).
- Produces:
  ```ts
  class RateLimited extends Error; class Unauthorized extends Error
  refresh(refreshToken: string | null, clientId: string, clientSecret: string, f?: typeof fetch)
    : Promise<{ access_token: string; refresh_token: string | null; expires_at: string }>
  getTweets(token: string, userId: string, sinceId: string | null, f?: typeof fetch)
    : Promise<{ tweets: Tweet[]; users: XUser[]; newestId: string | null }>
  getMe(token: string, f?: typeof fetch): Promise<{ location?: string }>
  ```
  HTTP: `POST /functions/v1/collect` с заголовком `x-cron-secret` → `{ users: number, planes: number }`.

- [ ] **Step 1: Падающий тест X-клиента**

`supabase/functions/_shared/x.test.ts`:

```ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { getTweets, RateLimited, refresh, Unauthorized } from './x.ts'

const fake = (status: number, body: unknown, seen: string[] = []) =>
  ((url: string | URL | Request) => {
    seen.push(String(url))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch

Deno.test('getTweets first run: 20 tweets, no since_id', async () => {
  const seen: string[] = []
  const r = await getTweets('tok', '1', null, fake(200, { meta: { result_count: 0 } }, seen))
  const url = new URL(seen[0])
  assertEquals(url.pathname, '/2/users/1/tweets')
  assertEquals(url.searchParams.get('max_results'), '20')
  assertEquals(url.searchParams.has('since_id'), false)
  assertEquals(r, { tweets: [], users: [], newestId: null })
})

Deno.test('getTweets with since_id: 100 tweets, parses includes and newest id', async () => {
  const seen: string[] = []
  const body = {
    data: [{ id: '10', created_at: 'x', in_reply_to_user_id: '2' }],
    includes: { users: [{ id: '2', username: 'bob' }] },
    meta: { newest_id: '10' },
  }
  const r = await getTweets('tok', '1', '5', fake(200, body, seen))
  const url = new URL(seen[0])
  assertEquals(url.searchParams.get('max_results'), '100')
  assertEquals(url.searchParams.get('since_id'), '5')
  assertEquals(r.newestId, '10')
  assertEquals(r.users[0].username, 'bob')
})

Deno.test('getTweets: no new tweets keeps old since_id', async () => {
  const r = await getTweets('tok', '1', '5', fake(200, { meta: { result_count: 0 } }))
  assertEquals(r.newestId, '5')
})

Deno.test('429 → RateLimited', async () => {
  await assertRejects(() => getTweets('tok', '1', null, fake(429, {})), RateLimited)
})

Deno.test('401 → Unauthorized', async () => {
  await assertRejects(() => getTweets('tok', '1', null, fake(401, {})), Unauthorized)
})

Deno.test('refresh: dead token (400) → Unauthorized', async () => {
  await assertRejects(() => refresh('r', 'id', 'secret', fake(400, { error: 'invalid_request' })), Unauthorized)
})

Deno.test('refresh: missing refresh token → Unauthorized without calling X', async () => {
  const seen: string[] = []
  await assertRejects(() => refresh(null, 'id', 'secret', fake(200, {}, seen)), Unauthorized)
  assertEquals(seen.length, 0)
})

Deno.test('refresh: ok returns future expires_at', async () => {
  const r = await refresh('r', 'id', 'secret', fake(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 7200 }))
  assertEquals(r.access_token, 'a2')
  assertEquals(r.refresh_token, 'r2')
  assert(new Date(r.expires_at).getTime() > Date.now())
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `deno test supabase/functions/_shared/x.test.ts`
Expected: FAIL — `Module not found "…/x.ts"`

- [ ] **Step 3: X-клиент**

`supabase/functions/_shared/x.ts`:

```ts
import type { Tweet, XUser } from './planes.ts'

export class RateLimited extends Error {}
export class Unauthorized extends Error {}

const API = 'https://api.x.com/2'

async function get<T>(url: string, token: string, f: typeof fetch): Promise<T> {
  const r = await f(url, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 429) throw new RateLimited()
  if (r.status === 401 || r.status === 403) throw new Unauthorized()
  if (!r.ok) throw new Error(`X ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function refresh(refreshToken: string | null, clientId: string, clientSecret: string, f: typeof fetch = fetch) {
  if (!refreshToken) throw new Unauthorized()
  const r = await f(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (r.status === 400 || r.status === 401) throw new Unauthorized()
  if (!r.ok) throw new Error(`X refresh ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return {
    access_token: j.access_token as string,
    refresh_token: (j.refresh_token ?? refreshToken) as string | null,
    expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  }
}

export async function getTweets(token: string, userId: string, sinceId: string | null, f: typeof fetch = fetch) {
  const q = new URLSearchParams({
    max_results: sinceId ? '100' : '20',
    'tweet.fields': 'in_reply_to_user_id,created_at',
    expansions: 'in_reply_to_user_id',
    'user.fields': 'username,location',
  })
  if (sinceId) q.set('since_id', sinceId)
  const j = await get<{ data?: Tweet[]; includes?: { users?: XUser[] }; meta?: { newest_id?: string } }>(
    `${API}/users/${userId}/tweets?${q}`, token, f,
  )
  return { tweets: j.data ?? [], users: j.includes?.users ?? [], newestId: j.meta?.newest_id ?? sinceId }
}

export async function getMe(token: string, f: typeof fetch = fetch) {
  const j = await get<{ data: { location?: string } }>(`${API}/users/me?user.fields=location`, token, f)
  return j.data
}
```

- [ ] **Step 4: Тесты проходят**

Run: `deno test supabase/functions/_shared/`
Expected: PASS, все тесты

- [ ] **Step 5: Функция-сборщик**

`supabase/functions/collect/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseCountry } from '../_shared/country.ts'
import { type Me, replyTargets, resolveCountries, toPlanes } from '../_shared/planes.ts'
import { getMe, getTweets, RateLimited, refresh, Unauthorized } from '../_shared/x.ts'

const env = (k: string) => Deno.env.get(k)!
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

type Token = { x_id: string; access_token: string; refresh_token: string | null; expires_at: string }
type User = { x_id: string; handle: string; country: string | null; country_manual: boolean; since_id: string | null }

const must = <T>({ data, error }: { data: T | null; error: unknown }) => {
  if (error) throw error
  return data as T
}
const toMap = (rows: { x_id: string; country: string | null }[]) => new Map(rows.map((r) => [r.x_id, r.country]))

async function freshToken(t: Token): Promise<string> {
  if (new Date(t.expires_at).getTime() > Date.now() + 60_000) return t.access_token
  const r = await refresh(t.refresh_token, env('X_CLIENT_ID'), env('X_CLIENT_SECRET'))
  must(await db.from('x_tokens').update(r).eq('x_id', t.x_id))
  return r.access_token
}

async function collectUser(u: User, t: Token): Promise<number> {
  const token = await freshToken(t)
  const me: Me = { x_id: u.x_id, handle: u.handle, country: u.country }

  if (!u.since_id && !u.country && !u.country_manual) {
    me.country = parseCountry((await getMe(token)).location)
    must(await db.from('users').update({ country: me.country }).eq('x_id', u.x_id))
  }

  const { tweets, users, newestId } = await getTweets(token, u.x_id, u.since_id)
  const ids = replyTargets(me, tweets)
  let planes: ReturnType<typeof toPlanes> = []

  if (ids.length) {
    const registered = must(await db.from('users').select('x_id, country').in('x_id', ids))
    const cached = must(await db.from('recipients').select('x_id, country').in('x_id', ids))
    const { countryOf, newRecipients } = resolveCountries(ids, toMap(registered), toMap(cached), users)
    if (newRecipients.length) must(await db.from('recipients').upsert(newRecipients))
    planes = toPlanes(me, tweets, users, countryOf)
    must(await db.from('planes').upsert(planes, { onConflict: 'tweet_id', ignoreDuplicates: true }))
  }

  // since_id двигаем только после успешной записи самолётиков — иначе потеряем их
  if (newestId !== u.since_id) must(await db.from('users').update({ since_id: newestId }).eq('x_id', u.x_id))
  return planes.length
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('nope', { status: 401 })

  const tokens = must<Token[]>(await db.from('x_tokens').select('*'))
  const users = must<User[]>(
    await db.from('users').select('x_id, handle, country, country_manual, since_id').in('x_id', tokens.map((t) => t.x_id)),
  )
  const tokenOf = new Map(tokens.map((t) => [t.x_id, t]))

  // ponytail: юзеры по очереди в одном вызове; упрёмся в лимит времени Edge Function (~150 с) — батчить по since_id/курсору
  let planes = 0
  for (const u of users) {
    try {
      planes += await collectUser(u, tokenOf.get(u.x_id)!)
    } catch (e) {
      if (e instanceof RateLimited) break
      if (e instanceof Unauthorized) {
        await db.from('x_tokens').delete().eq('x_id', u.x_id)
        continue
      }
      console.error(`collect @${u.handle}:`, e)
    }
  }
  return Response.json({ users: users.length, planes })
})
```

- [ ] **Step 6: Конфиг функции**

В конец `supabase/config.toml`:

```toml
[functions.collect]
verify_jwt = false
```

(Своя проверка через `x-cron-secret` — publishable key есть у всех, JWT-проверка тут не защищает.)

- [ ] **Step 7: Проверить, что функция собирается**

Run: `deno check supabase/functions/collect/index.ts`
Expected: без ошибок

- [ ] **Step 8: Commit**

```bash
git add supabase/functions supabase/config.toml
git commit -m "feat: collect edge function"
```

---

### Task 5: Next — Supabase-клиенты и логин через X

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`
- Create: `app/LoginButton.tsx`, `app/auth/callback/route.ts`
- Create: `.env.local` (не коммитится)

**Interfaces:**
- Consumes: таблицы `users`, `x_tokens` (Task 3).
- Produces: `createClient()` (браузер, `lib/supabase/client.ts`); `createServerSupabase()`, `createAdmin()` (`lib/supabase/server.ts`); `<LoginButton />`; маршрут `/auth/callback` → редирект на `/me` или `/?login=failed`.

- [ ] **Step 1: Зависимости и env**

```bash
npm i @supabase/supabase-js @supabase/ssr
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Проверить, что `.env*` есть в `.gitignore` (create-next-app добавляет).

- [ ] **Step 2: Клиенты**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  })
}

export const createAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
```

- [ ] **Step 3: Кнопка логина**

`app/LoginButton.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginButton() {
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
  }, [])

  if (loggedIn) return <a className="btn" href="/me">Your country</a>

  const login = () =>
    createClient().auth.signInWithOAuth({
      provider: 'x',
      options: { redirectTo: `${location.origin}/auth/callback`, scopes: 'tweet.read users.read offline.access' },
    })
  return <button className="btn" onClick={login}>Log in with X</button>
}
```

- [ ] **Step 4: Колбэк**

`app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createAdmin, createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const fail = NextResponse.redirect(`${origin}/?login=failed`)
  const code = searchParams.get('code')
  if (!code) return fail

  const { data, error } = await (await createServerSupabase()).auth.exchangeCodeForSession(code)
  if (error || !data.session.provider_token) return fail

  const { user, provider_token, provider_refresh_token } = data.session
  const m = user.user_metadata
  const x_id: string = m.provider_id ?? m.sub
  const admin = createAdmin()

  // только эти колонки: повторный логин не трогает country / country_manual / since_id
  const u = await admin
    .from('users')
    .upsert({ x_id, handle: m.user_name ?? m.preferred_username, avatar_url: m.avatar_url, auth_user_id: user.id })
  const t = await admin.from('x_tokens').upsert({
    x_id,
    access_token: provider_token,
    refresh_token: provider_refresh_token ?? null,
    expires_at: new Date(Date.now() + 110 * 60_000).toISOString(), // токен X живёт 2 ч
  })
  if (u.error || t.error) {
    console.error('callback', u.error ?? t.error)
    return fail
  }
  return NextResponse.redirect(`${origin}/me`)
}
```

- [ ] **Step 5: Настроить X и Supabase (руками, делает человек)**

1. developer.x.com → проект и приложение → User authentication settings: Web App, Callback URL `https://<project-ref>.supabase.co/auth/v1/callback`, Website URL — будущий домен (можно временно `http://127.0.0.1:3000`). Скопировать OAuth 2.0 Client ID / Client Secret.
2. Supabase → Authentication → Providers → **X / Twitter (OAuth 2.0)**: включить, вставить Client ID/Secret.
3. Supabase → Authentication → URL Configuration → Redirect URLs: добавить `http://localhost:3000/auth/callback`.

- [ ] **Step 6: Проверить логин**

Run: `npm run dev`, открыть `http://localhost:3000`, временно вставить `<LoginButton />` в `app/page.tsx`, нажать, залогиниться в X.
Expected: редирект на `/me` (пока 404 — это нормально, страница в Task 7). В SQL-редакторе:

```sql
select u.handle, u.avatar_url is not null as has_avatar, t.refresh_token is not null as has_refresh
from users u join x_tokens t using (x_id);
```

Expected: одна строка, `handle` — твой хэндл, `has_refresh = true`. Если `handle` пустой — посмотреть `user_metadata` (`select raw_user_meta_data from auth.users`) и поправить имена полей в колбэке. Если `has_refresh = false` — скоуп `offline.access` не дошёл, проверить настройки приложения X.

- [ ] **Step 7: Повторный логин не сбрасывает страну (Review Focus 1)**

```sql
update users set country = 'JP', country_manual = true, since_id = '123';
```

Выйти (`localStorage.clear()` + очистить cookies для localhost), залогиниться снова.

```sql
select country, country_manual, since_id from users;
```

Expected: `JP | true | 123`. Вернуть: `update users set country = null, country_manual = false, since_id = null;`

- [ ] **Step 8: Commit**

```bash
git add lib app/LoginButton.tsx app/auth package.json package-lock.json
git commit -m "feat: login with X"
```

---

### Task 6: Карта с самолётиками

**Files:**
- Create: `lib/geo.ts`
- Test: `lib/geo.test.ts`
- Create: `app/PlaneMap.tsx`
- Modify: `app/page.tsx`, `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Consumes: `createClient` (Task 5), таблица `planes` + Realtime (Task 3).
- Produces: `lib/geo.ts`: `W`, `H`, `FOG`, `projection`, `path`, `land` (features), `at(iso: string | null): [number, number]`.

- [ ] **Step 1: Зависимости**

```bash
npm i d3-geo topojson-client world-atlas i18n-iso-countries
npm i -D @types/d3-geo @types/topojson-client
```

- [ ] **Step 2: Падающий тест (Review Focus 4)**

`lib/geo.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { at, FOG } from './geo.ts'

test('known country → finite centroid in the right hemisphere', () => {
  const [lon, lat] = at('BR')
  assert.ok(Number.isFinite(lon) && Number.isFinite(lat))
  assert.ok(lon < -30 && lat < 5)
})

test('null, unknown code and country without 110m geometry → fog', () => {
  assert.equal(at(null), FOG)
  assert.equal(at('XX'), FOG)
  assert.equal(at('SG'), FOG)
})
```

Run: `node --test lib/geo.test.ts`
Expected: FAIL — `Cannot find module …/lib/geo.ts`

- [ ] **Step 3: Геометрия**

`lib/geo.ts`:

```ts
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import countries from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json' with { type: 'json' }

export const W = 960
export const H = 500
export const FOG: [number, number] = [-140, 5]

export const projection = geoNaturalEarth1().fitSize([W, H], { type: 'Sphere' })
export const path = geoPath(projection)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any
export const land = (feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection).features

// ponytail: центроид мультиполигона (Франция с Гвианой уезжает к Атлантике) — для игрушки ок
const centroids = new Map(land.map((f) => [String(f.id), geoCentroid(f)]))

export function at(iso: string | null): [number, number] {
  if (!iso) return FOG
  return centroids.get(countries.alpha2ToNumeric(iso) ?? '') ?? FOG
}
```

Run: `node --test lib/geo.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 4: Компонент карты**

`app/PlaneMap.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { at, H, land, path, projection, W, FOG } from '@/lib/geo'
import { createClient } from '@/lib/supabase/client'

type Plane = { id: number; from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
type Flight = Plane & { key: string }

const MAX_FLIGHTS = 200
const [fogX, fogY] = projection(FOG)!

export default function PlaneMap() {
  const [flights, setFlights] = useState<Flight[]>([])

  useEffect(() => {
    const db = createClient()
    let history: Plane[] = []
    const fly = (p: Plane) =>
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: `${p.id}-${performance.now()}` }])

    db.from('planes')
      .select('id, from_handle, to_handle, from_country, to_country')
      .order('id', { ascending: false })
      .limit(MAX_FLIGHTS)
      .then(({ data }) => {
        history = data ?? []
        history.slice(0, 20).forEach(fly)
      })

    const channel = db
      .channel('planes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'planes' }, ({ new: p }) => {
        history.unshift(p as Plane)
        fly(p as Plane)
      })
      .subscribe()

    // карта не должна стоять: раз в 2.5 с перелетает случайный старый самолётик
    const replay = setInterval(() => history.length && fly(history[Math.floor(Math.random() * history.length)]), 2500)

    return () => {
      clearInterval(replay)
      db.removeChannel(channel)
    }
  }, [])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="World map of X replies">
      <path d={path({ type: 'Sphere' })!} className="ocean" />
      {land.map((f, i) => <path key={i} d={path(f)!} className="land" />)}
      <circle cx={fogX} cy={fogY} r={12} className="fog"><title>Unknown country</title></circle>
      {flights.map((p) => <FlightView key={p.key} p={p} />)}
    </svg>
  )
}

function FlightView({ p }: { p: Plane }) {
  const motion = useRef<SVGAnimateMotionElement>(null)
  useEffect(() => motion.current?.beginElement(), [])

  const a = at(p.from_country)
  const b = at(p.to_country)
  const label = `@${p.from_handle} → @${p.to_handle}`
  const d = a === b ? null : path({ type: 'LineString', coordinates: [a, b] })

  if (!d) {
    const [x, y] = projection(b)!
    return <circle cx={x} cy={y} r={4} className="pulse"><title>{label}</title></circle>
  }
  return (
    <g>
      <path d={d} className="trail"><title>{label}</title></path>
      <text className="plane" dy="0.35em" textAnchor="middle">
        ✈
        <animateMotion ref={motion} dur="3s" begin="indefinite" fill="freeze" rotate="auto" path={d} />
      </text>
    </g>
  )
}
```

- [ ] **Step 5: Страница и стили**

`app/page.tsx` (заменить целиком):

```tsx
import LoginButton from './LoginButton'
import PlaneMap from './PlaneMap'

export default function Home() {
  return (
    <main>
      <header>
        <h1>✈ Paper Planes</h1>
        <p>Every reply you post on X flies across this map.</p>
        <LoginButton />
      </header>
      <PlaneMap />
    </main>
  )
}
```

`app/layout.tsx`: в `metadata` поставить `title: 'Paper Planes'`, `description: 'Every reply on X is a paper plane flying across the world.'`.

`app/globals.css` (заменить целиком):

```css
:root { --bg: #0b1020; --land: #1c2541; --edge: #3a506b; --fg: #f1f5f9; --accent: #ffd166; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 16px; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin-bottom: 16px; }
h1 { margin: 0; font-size: 1.6rem; }
header p { margin: 0; opacity: .7; flex: 1; min-width: 200px; }
.btn { background: var(--fg); color: var(--bg); border: 0; border-radius: 999px; padding: 10px 18px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
.map { width: 100%; height: auto; display: block; }
.ocean { fill: #0f1730; }
.land { fill: var(--land); stroke: var(--edge); stroke-width: .5; }
.fog { fill: #fff; opacity: .15; }
.trail { fill: none; stroke: var(--accent); stroke-width: 1.2; animation: trail 12s forwards; }
.plane { fill: var(--fg); font-size: 16px; animation: land 3.6s forwards; pointer-events: none; }
.pulse { fill: var(--accent); animation: trail 4s forwards; }
@keyframes trail { from { opacity: .9; } to { opacity: .08; } }
@keyframes land { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .plane { display: none; } .trail, .pulse { animation: none; opacity: .5; } }
```

- [ ] **Step 6: Проверить в браузере**

В SQL-редакторе вставить тестовые самолётики:

```sql
insert into planes (tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at) values
  ('test-1', 'a', 'b', 'alice', 'bob', 'RU', 'BR', now()),
  ('test-2', 'b', 'a', 'bob', 'alice', 'BR', null, now()),
  ('test-3', 'c', 'd', 'carl', 'dan', 'DE', 'DE', now());
```

Run: `npm run dev`, открыть `http://localhost:3000`.
Expected: самолётики летят RU→BR и BR→туман, над Германией пульс; при наведении на след — `@alice → @bob`. Вставить ещё одну строку (`test-4`, `US`→`JP`) при открытой странице — самолётик вылетает сразу (Realtime). Ширина 375px — карта влезает без горизонтального скролла.

Удалить тестовые: `delete from planes where tweet_id like 'test-%';`

- [ ] **Step 7: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts app package.json package-lock.json
git commit -m "feat: live plane map"
```

---

### Task 7: Выбор страны `/me`

**Files:**
- Create: `app/me/page.tsx`

**Interfaces:**
- Consumes: `createClient` (Task 5); политики `users` (Task 3).

- [ ] **Step 1: Страница**

`app/me/page.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'
import { createClient } from '@/lib/supabase/client'

countries.registerLocale(en)

type Me = { x_id: string; handle: string; country: string | null }

export default function MePage() {
  const db = useMemo(() => createClient(), [])
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const options = useMemo(
    () => Object.entries(countries.getNames('en')).sort((a, b) => a[1].localeCompare(b[1])),
    [],
  )

  useEffect(() => {
    db.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setMe(null)
      const { data: row } = await db.from('users').select('x_id, handle, country').eq('auth_user_id', data.user.id).single()
      setMe(row)
    })
  }, [db])

  if (me === undefined) return <main>Loading…</main>
  if (me === null) return <main><a className="btn" href="/">Log in first</a></main>

  const save = async (country: string) => {
    const { error } = await db.from('users').update({ country: country || null, country_manual: true }).eq('x_id', me.x_id)
    if (!error) {
      setMe({ ...me, country: country || null })
      setSaved(true)
    }
  }

  return (
    <main>
      <h1>@{me.handle}</h1>
      <label>
        Your planes take off from{' '}
        <select value={me.country ?? ''} onChange={(e) => save(e.target.value)}>
          <option value="">☁ the fog (unknown)</option>
          {options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      {saved && <p>Saved ✈</p>}
      <p><a href="/">← back to the map</a></p>
    </main>
  )
}
```

- [ ] **Step 2: Проверить**

Run: `npm run dev`, залогиниться, открыть `/me`, выбрать `Japan`.
Expected: «Saved ✈»; в SQL `select country, country_manual from users;` → `JP | true`. Без логина `/me` показывает «Log in first».

- [ ] **Step 3: Commit**

```bash
git add app/me
git commit -m "feat: country picker"
```

---

### Task 8: Деплой и крон

**Files:**
- Create: `supabase/migrations/20260928000100_cron.sql`

**Interfaces:**
- Consumes: всё выше.

- [ ] **Step 1: Секреты функции и деплой**

```bash
CRON_SECRET=$(openssl rand -hex 24)
npx supabase secrets set X_CLIENT_ID=<client-id> X_CLIENT_SECRET=<client-secret> CRON_SECRET=$CRON_SECRET
npx supabase functions deploy collect --no-verify-jwt
```

- [ ] **Step 2: Ручной прогон сборщика**

Залогиниться на сайте, ответить кому-нибудь в X, затем:

```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/collect" -H "x-cron-secret: $CRON_SECRET"
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/collect"
```

Expected: первый — `{"users":1,"planes":N}` с `N ≥ 1`, в `planes` строка с твоим реплаем; второй — `nope` (401). Повторный первый запрос — `"planes":0` (since_id сдвинулся, дублей нет).

Проверка Review Focus 5: `update x_tokens set expires_at = now(), refresh_token = 'dead';` → прогон → строка из `x_tokens` удалена, ответ `{"users":1,"planes":0}` без 500. Перелогиниться, чтобы вернуть токен.

- [ ] **Step 3: Крон**

В SQL-редакторе (секреты не коммитим):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
```

`supabase/migrations/20260928000100_cron.sql`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('collect-planes', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  )
$$);
```

Run: `npx supabase db push`
Через 5–10 минут: `select status, return_message from cron.job_run_details order by start_time desc limit 3;`
Expected: `succeeded`.

- [ ] **Step 4: Vercel**

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel deploy --prod
```

Затем: Supabase → Authentication → URL Configuration: Site URL = прод-домен, в Redirect URLs добавить `https://<домен>/auth/callback`. В приложении X Website URL = прод-домен.

- [ ] **Step 5: Смоук на проде**

Открыть прод, залогиниться, выбрать страну, ответить кому-то в X, подождать ≤5 минут с открытой картой.
Expected: самолётик вылетает сам (Realtime). В дашборде X (Usage) проверить, по какому тарифу посчитаны чтения `users/:id/tweets` — owned read ($0.001) или обычный ($0.005); записать в спеку.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260928000100_cron.sql
git commit -m "feat: schedule collector"
```
