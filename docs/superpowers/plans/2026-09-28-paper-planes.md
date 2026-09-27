# Paper Planes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живая карта мира, где каждый реплай в X залогиненного юзера летит бумажным самолётиком из страны в страну.

**Architecture:** Один Next.js-проект на Vercel. Better Auth логинит через X и хранит/обновляет токены в Neon. Сборщик живёт в `lib/collect.ts` и запускается в фоне (`after()`) из `GET /api/planes` не чаще раза в 5 минут (замок — одна строка в БД). Карта опрашивает `/api/planes?after=<id>` раз в 20 секунд и анимирует самолётики SVG `<animateMotion>`.

**Tech Stack:** Next.js (App Router, TS), `better-auth`, `pg`, Neon Postgres, `d3-geo`, `topojson-client`, `world-atlas`, `i18n-iso-countries`; тесты — встроенный `node --test` (Node 26 сам снимает типы с `.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-paper-planes-design.md`

## Global Constraints

- На карте только страны (ISO-3166 alpha-2), никаких координат юзеров.
- Текст твитов не хранится нигде.
- Браузер не ходит в БД; токены X живут только в таблице `account` Better Auth.
- Клиент меняет только свою страну, и только через `POST /api/me` с проверкой ISO-кода.
- Страна `null` = «туман», точка `FOG = [-140, 5]` (Тихий океан).
- X API: `max_results` 20 на первом прогоне юзера, 100 дальше; пагинацию не делаем.
- Сборщик — не чаще раза в 5 минут (замок в таблице `collector`); бот ничего не постит в X.
- Скоупы X: `users.read tweet.read offline.access` (дефолтный `users.email` Better Auth отключаем).
- Тексты интерфейса — на английском.
- Внутри `lib/` относительные импорты с расширением `.ts` (иначе `node --test` их не найдёт); в `app/` — через `@/lib/...` без расширения.

## Review Focus

1. Реплай самому себе (свой тред) не должен давать самолётик → тест в Task 2.
2. Реплай удалённому/забаненному аккаунту (нет юзера в `includes`) → самолётик пропускается, сборщик не падает → тест в Task 2.
3. Страна без геометрии на карте 110m (`SG`, `HK`), неизвестный код, `null` → «туман», а не `NaN` → тест в Task 6.
4. Мусор в `POST /api/me` (`"xx"`, `"RUS"`, `123`, `"<script>"`) → 400, в БД ничего не пишется → тест в Task 7.
5. Два посетителя одновременно открыли карту → сборщик запускается один раз (замок) → проверка в Task 5, Step 6.

---

## File Structure

```
app/
  layout.tsx                      (create-next-app, правим metadata)
  globals.css                     стили
  page.tsx                        главная: заголовок, LoginButton, PlaneMap
  LoginButton.tsx                 client: логин / ссылка на /me
  PlaneMap.tsx                    client: SVG-карта, опрос API, анимация
  me/page.tsx                     client: выбор страны
  api/auth/[...all]/route.ts      Better Auth
  api/planes/route.ts             лента самолётиков + запуск сборщика
  api/me/route.ts                 GET профиль / POST страна
lib/
  db.ts                           pg Pool
  auth.ts                         Better Auth (сервер)
  auth-client.ts                  Better Auth (браузер)
  country.ts   + country.test.ts  parseCountry, isCountry
  planes.ts    + planes.test.ts   replyTargets, resolveCountries, toPlanes
  x.ts         + x.test.ts        getTweets, getMe
  collect.ts                      сборщик (БД + X)
  geo.ts       + geo.test.ts      проекция, at(iso)
db/
  schema.sql                      свои таблицы
```

---

### Task 1: Скелет проекта + парсер страны

**Files:**
- Create: Next-скелет (create-next-app)
- Create: `lib/country.ts`
- Test: `lib/country.test.ts`

**Interfaces:**
- Produces: `parseCountry(location: string | null | undefined): string | null` — alpha-2 в верхнем регистре или `null`; `isCountry(v: unknown): v is string` — валидный alpha-2.

- [ ] **Step 1: Скелет**

В корне репо (там уже есть `.git` и `docs/` — create-next-app их допускает):

```bash
npx create-next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes
npm i i18n-iso-countries
```

`tsconfig.json` → в `compilerOptions` добавить:

```json
"allowImportingTsExtensions": true
```

`package.json` → добавить `"type": "module"` на верхний уровень и скрипт:

```json
"test": "node --test lib/*.test.ts"
```

- [ ] **Step 2: Падающий тест**

`lib/country.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCountry, parseCountry } from './country.ts'

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
  test(`parseCountry(${JSON.stringify(input)}) → ${expected}`, () => {
    assert.equal(parseCountry(input), expected)
  })
}

test('isCountry accepts only real alpha-2 codes', () => {
  assert.equal(isCountry('DE'), true)
  for (const bad of ['XX', 'de', 'RUS', '', 123, null, '<script>']) assert.equal(isCountry(bad), false)
})
```

- [ ] **Step 3: Убедиться, что падает**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/country.ts'`

- [ ] **Step 4: Реализация**

`lib/country.ts`:

```ts
import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' }
import ru from 'i18n-iso-countries/langs/ru.json' with { type: 'json' }

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

export const isCountry = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Z]{2}$/.test(v) && countries.isValid(v)

export const countryNames = () =>
  Object.entries(countries.getNames('en')).sort((a, b) => a[1].localeCompare(b[1]))
```

- [ ] **Step 5: Тесты проходят**

Run: `npm test`
Expected: PASS, 13 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: project skeleton and country parser"
```

---

### Task 2: Реплаи → самолётики

**Files:**
- Create: `lib/planes.ts`
- Test: `lib/planes.test.ts`

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
  replyTargets(me: Me, tweets: Tweet[]): string[]
  resolveCountries(ids: string[], registered: Map<string, string | null>, cached: Map<string, string | null>, users: XUser[])
    : { countryOf: Map<string, string | null>; newRecipients: Recipient[] }
  toPlanes(me: Me, tweets: Tweet[], users: XUser[], countryOf: Map<string, string | null>): Plane[]
  ```

- [ ] **Step 1: Падающий тест**

`lib/planes.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replyTargets, resolveCountries, toPlanes, type Tweet, type XUser } from './planes.ts'

const me = { x_id: '1', handle: 'me', country: 'RU' }
const t = (id: string, to?: string): Tweet => ({ id, created_at: '2026-09-28T00:00:00Z', in_reply_to_user_id: to })
const users: XUser[] = [
  { id: '2', username: 'bob', location: 'Berlin' },
  { id: '3', username: 'ann', location: 'somewhere' },
]

test('replyTargets: only replies to other people, unique', () => {
  assert.deepEqual(replyTargets(me, [t('a', '2'), t('b'), t('c', '1'), t('d', '2'), t('e', '3')]), ['2', '3'])
})

test('toPlanes: reply to other user becomes plane', () => {
  assert.deepEqual(toPlanes(me, [t('a', '2')], users, new Map([['2', 'DE']])), [{
    tweet_id: 'a', from_x_id: '1', to_x_id: '2', from_handle: 'me', to_handle: 'bob',
    from_country: 'RU', to_country: 'DE', created_at: '2026-09-28T00:00:00Z',
  }])
})

test('toPlanes: self-reply and non-reply are skipped', () => {
  assert.deepEqual(toPlanes(me, [t('a', '1'), t('b')], users, new Map()), [])
})

test('toPlanes: recipient missing from includes (deleted account) is skipped', () => {
  assert.deepEqual(toPlanes(me, [t('a', '99')], users, new Map()), [])
})

test('resolveCountries: registered beats cached beats parsed', () => {
  const { countryOf, newRecipients } = resolveCountries(
    ['2', '3', '4'],
    new Map([['2', 'FR']]), // bob залогинен и выбрал Францию
    new Map([['3', 'JP']]), // ann уже в кэше
    [...users, { id: '4', username: 'kim', location: 'Seoul' }],
  )
  assert.deepEqual([...countryOf], [['2', 'FR'], ['3', 'JP'], ['4', 'KR']])
  assert.deepEqual(newRecipients, [{ x_id: '4', handle: 'kim', country: 'KR' }])
})

test('resolveCountries: unknown user without includes → null, not cached', () => {
  const { countryOf, newRecipients } = resolveCountries(['9'], new Map(), new Map(), [])
  assert.equal(countryOf.get('9'), null)
  assert.deepEqual(newRecipients, [])
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/planes.ts'`

- [ ] **Step 3: Реализация**

`lib/planes.ts`:

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

Run: `npm test`
Expected: PASS, все тесты Task 1–2

- [ ] **Step 5: Commit**

```bash
git add lib/planes.ts lib/planes.test.ts
git commit -m "feat: turn replies into planes"
```

---

### Task 3: X-клиент

**Files:**
- Create: `lib/x.ts`
- Test: `lib/x.test.ts`

**Interfaces:**
- Consumes: типы `Tweet`, `XUser` (Task 2)
- Produces:
  ```ts
  class RateLimited extends Error; class Unauthorized extends Error
  getTweets(token: string, userId: string, sinceId: string | null, f?: typeof fetch)
    : Promise<{ tweets: Tweet[]; users: XUser[]; newestId: string | null }>
  getMe(token: string, f?: typeof fetch): Promise<{ location?: string }>
  ```

- [ ] **Step 1: Падающий тест**

`lib/x.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTweets, RateLimited, Unauthorized } from './x.ts'

const fake = (status: number, body: unknown, seen: string[] = []) =>
  ((url: string | URL | Request) => {
    seen.push(String(url))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch

test('getTweets first run: 20 tweets, no since_id', async () => {
  const seen: string[] = []
  const r = await getTweets('tok', '1', null, fake(200, { meta: { result_count: 0 } }, seen))
  const url = new URL(seen[0])
  assert.equal(url.pathname, '/2/users/1/tweets')
  assert.equal(url.searchParams.get('max_results'), '20')
  assert.equal(url.searchParams.has('since_id'), false)
  assert.deepEqual(r, { tweets: [], users: [], newestId: null })
})

test('getTweets with since_id: 100 tweets, parses includes and newest id', async () => {
  const seen: string[] = []
  const body = {
    data: [{ id: '10', created_at: 'x', in_reply_to_user_id: '2' }],
    includes: { users: [{ id: '2', username: 'bob' }] },
    meta: { newest_id: '10' },
  }
  const r = await getTweets('tok', '1', '5', fake(200, body, seen))
  const url = new URL(seen[0])
  assert.equal(url.searchParams.get('max_results'), '100')
  assert.equal(url.searchParams.get('since_id'), '5')
  assert.equal(r.newestId, '10')
  assert.equal(r.users[0].username, 'bob')
})

test('getTweets: no new tweets keeps old since_id', async () => {
  const r = await getTweets('tok', '1', '5', fake(200, { meta: { result_count: 0 } }))
  assert.equal(r.newestId, '5')
})

test('429 → RateLimited', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(429, {})), RateLimited)
})

test('401 → Unauthorized', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(401, {})), Unauthorized)
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/x.ts'`

- [ ] **Step 3: Реализация**

`lib/x.ts`:

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

Run: `npm test`
Expected: PASS, все тесты Task 1–3

- [ ] **Step 5: Commit**

```bash
git add lib/x.ts lib/x.test.ts
git commit -m "feat: X API client"
```

---

### Task 4: Neon + Better Auth (логин через X)

**Files:**
- Create: `lib/db.ts`, `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts`, `app/LoginButton.tsx`
- Create: `db/schema.sql`
- Create: `.env.local` (не коммитится)

**Interfaces:**
- Produces: `pool` (`lib/db.ts`); `auth` (`lib/auth.ts`) с полями юзера `handle`, `country`, `countryManual`, `sinceId`; `authClient` (`lib/auth-client.ts`); `<LoginButton />`. Таблицы `recipients`, `planes`, `collector`.

- [ ] **Step 1: Neon и X (делает человек — остановиться и попросить)**

1. Vercel → проект → Storage → Marketplace → **Neon** → создать базу и привязать к проекту (пропишет `DATABASE_URL`). Локально: `vercel link && vercel env pull .env.local`.
2. developer.x.com → проект и приложение → User authentication settings: Web App, Callback URL `http://localhost:3000/api/auth/callback/twitter`, Website URL `http://localhost:3000`. Скопировать OAuth 2.0 Client ID / Client Secret.

Дописать в `.env.local`:

```
X_CLIENT_ID=...
X_CLIENT_SECRET=...
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
```

Проверить, что `.env*` есть в `.gitignore`.

- [ ] **Step 2: Зависимости и сервер Better Auth**

```bash
npm i better-auth pg
npm i -D @types/pg
```

`lib/db.ts`:

```ts
import { Pool } from 'pg'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
```

`lib/auth.ts`:

```ts
import { betterAuth } from 'better-auth'
import { pool } from './db.ts'

export const auth = betterAuth({
  database: pool,
  socialProviders: {
    twitter: {
      clientId: process.env.X_CLIENT_ID!,
      clientSecret: process.env.X_CLIENT_SECRET!,
      disableDefaultScope: true, // дефолт тянет users.email — требует отдельной настройки в X
      scope: ['users.read', 'tweet.read', 'offline.access'],
      mapProfileToUser: (profile) => ({ handle: profile.data.username }),
    },
  },
  user: {
    additionalFields: {
      handle: { type: 'string', required: false, input: false },
      country: { type: 'string', required: false, input: false },
      countryManual: { type: 'boolean', required: false, defaultValue: false, input: false },
      sinceId: { type: 'string', required: false, input: false },
    },
  },
})
```

`app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

export const { GET, POST } = toNextJsHandler(auth)
```

`lib/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()
```

- [ ] **Step 3: Таблицы**

```bash
npx auth@latest migrate
```

Expected: создаёт `user` (с колонками `handle`, `country`, `countryManual`, `sinceId`), `session`, `account`, `verification`.

`db/schema.sql`:

```sql
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
```

Run: `psql "$(grep ^DATABASE_URL .env.local | cut -d= -f2- | tr -d '"')" -f db/schema.sql`
Expected: `CREATE TABLE` ×3, `INSERT 0 1`

- [ ] **Step 4: Кнопка логина**

`app/LoginButton.tsx`:

```tsx
'use client'
import { authClient } from '@/lib/auth-client'

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <a className="btn" href="/me">Your country</a>
  return (
    <button className="btn" onClick={() => authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' })}>
      Log in with X
    </button>
  )
}
```

Временно вставить `<LoginButton />` в `app/page.tsx` (окончательная страница — Task 6).

- [ ] **Step 5: Проверить логин**

Run: `npm run dev`, открыть `http://localhost:3000`, нажать «Log in with X», разрешить доступ.
Expected: редирект на `/me` (пока 404 — страница в Task 7). В БД:

```sql
select u.handle, a."accountId", a."refreshToken" is not null as has_refresh, a.scope
from "user" u join account a on a."userId" = u.id;
```

Expected: одна строка — твой хэндл, числовой X id, `has_refresh = t`, в `scope` есть `offline.access`.

- [ ] **Step 6: Commit**

```bash
git add lib app db package.json package-lock.json
git commit -m "feat: login with X via Better Auth on Neon"
```

---

### Task 5: Сборщик + лента самолётиков

**Files:**
- Create: `lib/collect.ts`, `app/api/planes/route.ts`

**Interfaces:**
- Consumes: `pool` (Task 4), `auth` (Task 4), `parseCountry` (Task 1), `replyTargets`/`resolveCountries`/`toPlanes` (Task 2), `getTweets`/`getMe`/`RateLimited` (Task 3).
- Produces:
  - `collect(userId?: string): Promise<number>` — собрать (всех или одного юзера), вернуть число новых самолётиков.
  - `collectIfDue(): Promise<void>` — собрать, если прошло ≥ 5 минут (замок).
  - `GET /api/planes?after=<id>` → `PlaneRow[]` (`{ id: number; from_handle; to_handle; from_country; to_country }`), новые первыми, максимум 200.

- [ ] **Step 1: Сборщик**

`lib/collect.ts`:

```ts
import { auth } from './auth.ts'
import { parseCountry } from './country.ts'
import { pool } from './db.ts'
import { type Me, replyTargets, resolveCountries, toPlanes } from './planes.ts'
import { getMe, getTweets, RateLimited } from './x.ts'

type Row = {
  user_id: string; account_id: string; x_id: string; handle: string
  country: string | null; country_manual: boolean | null; since_id: string | null
}

const toMap = (rows: { x_id: string; country: string | null }[]) => new Map(rows.map((r) => [r.x_id, r.country]))

async function collectUser(r: Row): Promise<number> {
  // Better Auth сам обновит протухший токен
  const { accessToken } = await auth.api.getAccessToken({ body: { accountId: r.account_id, userId: r.user_id } })
  const me: Me = { x_id: r.x_id, handle: r.handle, country: r.country }

  if (!r.since_id && !r.country && !r.country_manual) {
    me.country = parseCountry((await getMe(accessToken)).location)
    await pool.query(`update "user" set country = $1 where id = $2`, [me.country, r.user_id])
  }

  const { tweets, users, newestId } = await getTweets(accessToken, r.x_id, r.since_id)
  const ids = replyTargets(me, tweets)
  let count = 0

  if (ids.length) {
    const registered = await pool.query(
      `select a."accountId" as x_id, u.country from account a join "user" u on u.id = a."userId"
       where a."providerId" = 'twitter' and a."accountId" = any($1)`, [ids])
    const cached = await pool.query(`select x_id, country from recipients where x_id = any($1)`, [ids])
    const { countryOf, newRecipients } = resolveCountries(ids, toMap(registered.rows), toMap(cached.rows), users)

    await pool.query(
      `insert into recipients (x_id, handle, country)
       select x_id, handle, country from json_populate_recordset(null::recipients, $1::json)
       on conflict (x_id) do nothing`, [JSON.stringify(newRecipients)])

    const planes = toPlanes(me, tweets, users, countryOf)
    const res = await pool.query(
      `insert into planes (tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at)
       select tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at
       from json_populate_recordset(null::planes, $1::json)
       on conflict (tweet_id) do nothing`, [JSON.stringify(planes)])
    count = res.rowCount ?? 0
  }

  // since_id двигаем строго после вставки самолётиков — иначе потеряем их
  if (newestId !== r.since_id) await pool.query(`update "user" set "sinceId" = $1 where id = $2`, [newestId, r.user_id])
  return count
}

export async function collect(userId?: string): Promise<number> {
  const { rows } = await pool.query<Row>(
    `select u.id as user_id, a.id as account_id, a."accountId" as x_id, u.handle, u.country,
            u."countryManual" as country_manual, u."sinceId" as since_id
     from "user" u join account a on a."userId" = u.id and a."providerId" = 'twitter'
     where a."refreshToken" is not null and ($1::text is null or u.id = $1)`, [userId ?? null])

  // ponytail: юзеры по очереди в одном вызове; упрёмся в лимит времени функции (300 с) — батчить курсором
  let planes = 0
  for (const r of rows) {
    try {
      planes += await collectUser(r)
    } catch (e) {
      if (e instanceof RateLimited) break
      console.error(`collect @${r.handle}:`, e) // мёртвый токен и прочее: пропускаем, остальные собираются
    }
  }
  return planes
}

export async function collectIfDue(): Promise<void> {
  const { rowCount } = await pool.query(
    `update collector set last_run = now() where last_run < now() - interval '5 minutes'`)
  if (rowCount) await collect()
}
```

- [ ] **Step 2: Лента**

`app/api/planes/route.ts`:

```ts
import { after } from 'next/server'
import { collectIfDue } from '@/lib/collect'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  after(collectIfDue)
  const since = Number(new URL(req.url).searchParams.get('after')) || 0
  const { rows } = await pool.query(
    `select id, from_handle, to_handle, from_country, to_country
     from planes where id > $1 order by id desc limit 200`, [since])
  return Response.json(rows)
}
```

- [ ] **Step 3: Типы и сборка**

Run: `npx tsc --noEmit && npm test`
Expected: без ошибок, все тесты PASS

- [ ] **Step 4: Проверить на живом реплае**

Ответить кому-нибудь в X с залогиненного аккаунта. Сбросить замок и дёрнуть ленту:

```sql
update collector set last_run = 'epoch';
```

```bash
curl -s localhost:3000/api/planes
```

Подождать ~10 секунд (сбор идёт после ответа), повторить `curl`.
Expected: во втором ответе есть `{"from_handle":"<ты>","to_handle":"<кому ответил>",...}`. В БД `select "sinceId", country from "user";` — `sinceId` заполнен, `country` распознан из профиля или `null`.

- [ ] **Step 5: Нет дублей**

```sql
update collector set last_run = 'epoch';
```

Run: `curl -s localhost:3000/api/planes >/dev/null`, подождать 10 секунд.
Expected: `select count(*), count(distinct tweet_id) from planes;` — числа равны.

- [ ] **Step 6: Замок (Review Focus 5)**

```sql
update collector set last_run = 'epoch';
```

```bash
for i in 1 2 3 4 5; do curl -s localhost:3000/api/planes >/dev/null & done; wait
```

Expected: в логе `npm run dev` нет пяти параллельных сборов (добавить временно `console.log('collect run')` в начало `collect` и убрать после проверки) — ровно одна строка `collect run`.

- [ ] **Step 7: Commit**

```bash
git add lib/collect.ts app/api/planes
git commit -m "feat: visit-triggered collector and planes feed"
```

---

### Task 6: Карта с самолётиками

**Files:**
- Create: `lib/geo.ts`, `lib/geo.test.ts`, `app/PlaneMap.tsx`
- Modify: `app/page.tsx`, `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/planes` (Task 5), `<LoginButton />` (Task 4).
- Produces: `lib/geo.ts`: `W`, `H`, `FOG`, `projection`, `path`, `land`, `at(iso: string | null): [number, number]`.

- [ ] **Step 1: Зависимости**

```bash
npm i d3-geo topojson-client world-atlas
npm i -D @types/d3-geo @types/topojson-client
```

- [ ] **Step 2: Падающий тест (Review Focus 3)**

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

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/geo.ts'`

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

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Компонент карты**

`app/PlaneMap.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { at, FOG, H, land, path, projection, W } from '@/lib/geo'

type Plane = { id: number; from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
type Flight = Plane & { key: string }

const MAX_FLIGHTS = 200
const POLL_MS = 20_000
const [fogX, fogY] = projection(FOG)!

const fetchPlanes = (after: number): Promise<Plane[]> =>
  fetch(`/api/planes?after=${after}`).then((r) => (r.ok ? r.json() : []))

export default function PlaneMap() {
  const [flights, setFlights] = useState<Flight[]>([])

  useEffect(() => {
    let history: Plane[] = []
    let lastId = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const fly = (p: Plane) =>
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: `${p.id}-${performance.now()}` }])

    const take = (planes: Plane[]) => {
      if (planes.length) lastId = Math.max(lastId, planes[0].id)
      history = [...planes, ...history].slice(0, MAX_FLIGHTS)
      return planes
    }

    fetchPlanes(0).then((planes) => take(planes).slice(0, 20).forEach(fly))

    // новые приходят пачкой — раскидываем вылеты по интервалу опроса
    const poll = setInterval(async () => {
      const fresh = take(await fetchPlanes(lastId))
      fresh.forEach((p, i) => timers.push(setTimeout(() => fly(p), (i * POLL_MS) / fresh.length)))
    }, POLL_MS)

    // карта не должна стоять: раз в 2.5 с перелетает случайный старый самолётик
    const replay = setInterval(() => history.length && fly(history[Math.floor(Math.random() * history.length)]), 2500)

    return () => {
      clearInterval(poll)
      clearInterval(replay)
      timers.forEach(clearTimeout)
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
a { color: var(--accent); }
.btn { background: var(--fg); color: var(--bg); border: 0; border-radius: 999px; padding: 10px 18px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
.map { width: 100%; height: auto; display: block; }
.ocean { fill: #0f1730; }
.land { fill: var(--land); stroke: var(--edge); stroke-width: .5; }
.fog { fill: #fff; opacity: .15; }
.trail { fill: none; stroke: var(--accent); stroke-width: 1.2; animation: trail 12s forwards; }
.plane { fill: var(--fg); font-size: 16px; animation: land 3.6s forwards; pointer-events: none; }
.pulse { fill: var(--accent); animation: trail 4s forwards; }
select { font: inherit; padding: 6px; }
@keyframes trail { from { opacity: .9; } to { opacity: .08; } }
@keyframes land { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .plane { display: none; } .trail, .pulse { animation: none; opacity: .5; } }
```

- [ ] **Step 6: Проверить в браузере**

Вставить тестовые самолётики:

```sql
insert into planes (tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at) values
  ('test-1', 'a', 'b', 'alice', 'bob', 'RU', 'BR', now()),
  ('test-2', 'b', 'a', 'bob', 'alice', 'BR', null, now()),
  ('test-3', 'c', 'd', 'carl', 'dan', 'DE', 'DE', now());
```

Run: `npm run dev`, открыть `http://localhost:3000`.
Expected: самолётики летят RU→BR и BR→туман, над Германией пульс; наведение на след — `@alice → @bob`. Вставить `test-4` (`US`→`JP`) при открытой странице — самолётик вылетает в течение ~40 секунд. На ширине 375px карта влезает без горизонтального скролла.

Удалить: `delete from planes where tweet_id like 'test-%';`

- [ ] **Step 7: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts app package.json package-lock.json
git commit -m "feat: live plane map"
```

---

### Task 7: Выбор страны `/me`

**Files:**
- Create: `app/api/me/route.ts`, `app/me/page.tsx`

**Interfaces:**
- Consumes: `auth` (Task 4), `pool` (Task 4), `collect` (Task 5), `isCountry`/`countryNames` (Task 1).
- Produces: `GET /api/me` → `{ handle: string; country: string | null }` или 401; `POST /api/me` `{ country: string | null }` → 204 / 400 / 401.

- [ ] **Step 1: API**

`app/api/me/route.ts`:

```ts
import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { collect } from '@/lib/collect'
import { isCountry } from '@/lib/country'
import { pool } from '@/lib/db'

const session = async () => auth.api.getSession({ headers: await headers() })

export async function GET() {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const { rows } = await pool.query(`select handle, country, "sinceId" as since_id from "user" where id = $1`, [s.user.id])
  const me = rows[0]
  if (!me.since_id) after(() => collect(s.user.id)) // новый юзер — сразу собрать его реплаи
  return Response.json({ handle: me.handle, country: me.country })
}

export async function POST(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('country' in body)) return new Response('bad body', { status: 400 })
  const { country } = body
  if (country !== null && !isCountry(country)) return new Response('bad country', { status: 400 })
  await pool.query(`update "user" set country = $1, "countryManual" = true where id = $2`, [country, s.user.id])
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 2: Страница**

`app/me/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { countryNames } from '@/lib/country'

type Me = { handle: string; country: string | null }
const options = countryNames()

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/me').then(async (r) => setMe(r.ok ? await r.json() : null))
  }, [])

  if (me === undefined) return <main>Loading…</main>
  if (me === null) return <main><a className="btn" href="/">Log in first</a></main>

  const save = async (value: string) => {
    const country = value || null
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ country }) })
    if (r.ok) setMe({ ...me, country })
    setStatus(r.ok ? 'Saved ✈' : 'Could not save, try again')
  }

  return (
    <main>
      <h1>@{me.handle}</h1>
      <p>
        <label>
          Your planes take off from{' '}
          <select value={me.country ?? ''} onChange={(e) => save(e.target.value)}>
            <option value="">☁ the fog (unknown)</option>
            {options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
      </p>
      <p role="status">{status}</p>
      <p><a href="/">← back to the map</a></p>
    </main>
  )
}
```

- [ ] **Step 3: Проверить мусор на входе (Review Focus 4)**

Run: `npm run dev`, залогиниться, в DevTools-консоли на `localhost:3000`:

```js
for (const country of ['xx', 'RUS', 123, '<script>', 'XX']) {
  const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ country }) })
  console.log(country, r.status)
}
console.log('garbage', (await fetch('/api/me', { method: 'POST', body: 'not json' })).status)
```

Expected: все `400`, включая `garbage`. `select country from "user";` — страна не изменилась, мусора нет. `{ country: null }` → `204` (это «туман», легально).

Без логина: `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/me -d '{"country":"DE"}'` → `401`.

- [ ] **Step 4: Проверить UI**

Открыть `/me`, выбрать `Japan`.
Expected: «Saved ✈»; `select country, "countryManual" from "user";` → `JP | t`. Следующий сбор не перезаписывает страну (сборщик трогает её только если `country` пуст и `countryManual` ложь).

- [ ] **Step 5: Commit**

```bash
git add app/api/me app/me
git commit -m "feat: country picker"
```

---

### Task 8: Деплой

**Files:** —

- [ ] **Step 1: Env на Vercel (делает человек — остановиться и попросить)**

`DATABASE_URL` уже прописан интеграцией Neon. Добавить:

```bash
vercel env add X_CLIENT_ID production
vercel env add X_CLIENT_SECRET production
vercel env add BETTER_AUTH_SECRET production
vercel env add BETTER_AUTH_URL production   # https://<прод-домен>
```

В приложении X: добавить Callback URL `https://<прод-домен>/api/auth/callback/twitter`, Website URL — прод-домен.

- [ ] **Step 2: Деплой**

Run: `vercel deploy --prod`
Expected: `Production: https://…` без ошибок сборки.

- [ ] **Step 3: Смоук на проде**

Открыть прод, залогиниться, выбрать страну, ответить кому-то в X, держать карту открытой ≤ 6 минут.
Expected: самолётик вылетает сам. В дашборде X (Usage) проверить, по какому тарифу посчитаны чтения `users/:id/tweets` — owned read ($0.001) или обычный ($0.005); записать результат в раздел «Ограничения» спеки и закоммитить.

```bash
git add docs/superpowers/specs/2026-09-28-paper-planes-design.md
git commit -m "docs: record real X API read pricing"
```
