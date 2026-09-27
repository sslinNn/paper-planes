# Бумажные самолётики — дизайн

## Идея

Живая карта мира. Каждый реплай в X между залогиненными юзерами — бумажный самолётик,
летящий из страны ответившего в страну того, кому ответили. Ботов нет, специально ничего
писать не надо — люди просто общаются в X, а сайт это визуализирует.

Вирусная петля: «твои самолётики к друзьям летят, а их к тебе — нет, пока они не зайдут».

## Ограничения

- Весь поток реплаев X не отдаёт (firehose — Enterprise). Отслеживаем только реплаи
  **залогиненных** юзеров, читая их собственные твиты.
- Цена X API (pay-per-use, 2026): чтение своих данных ~$0.001, чужих — $0.005 за объект.
  Допущение: `GET /2/users/:id/tweets` с токеном самого юзера тарифицируется как owned read —
  **проверить в дашборде X после первого прогона**.
- Приватность: только страны, никаких координат. Текст реплаев не храним.

## Стек

- Next.js (App Router) на Vercel.
- Supabase: Auth (провайдер X, OAuth 2.0), Postgres, Realtime, Edge Function, pg_cron.
- Карта: `d3-geo` + `world-atlas` (TopoJSON стран), рендер в SVG.

## Данные

`users`
- `x_id` text PK
- `handle`, `avatar_url` text
- `country` text null — ISO-3166 alpha-2, null = «туман»
- `country_manual` bool — юзер выбрал сам, парсер больше не трогает
- `access_token`, `refresh_token` text, `token_expires_at` timestamptz
- `since_id` text null — последний обработанный твит
- `auth_user_id` uuid → `auth.users`

`recipients` — кэш стран незалогиненных получателей
- `x_id` text PK, `handle` text, `country` text null

`planes`
- `id` bigserial PK
- `tweet_id` text unique (идемпотентность)
- `from_x_id`, `to_x_id` text
- `from_handle`, `to_handle` text
- `from_country`, `to_country` text null
- `created_at` timestamptz — время твита

RLS: `planes` читают все (anon); `users` — только свой ряд, и только `country` на запись.
Токены недоступны клиенту вообще (service role only).

## Потоки

**Логин.** Supabase Auth → X, скоупы `tweet.read users.read offline.access`.
После колбэка сервер сохраняет `provider_token` / `provider_refresh_token` в `users`
(Supabase их сам не хранит), парсит `location` профиля в страну.

**Сборщик** (Edge Function, pg_cron раз в 5 мин). Для каждого юзера:
1. Токен истекает → рефреш через X OAuth2 (`client_id`/`client_secret`). Рефреш упал →
   токены обнуляем, юзер пропускается до следующего логина.
2. `GET /2/users/:id/tweets?since_id=…&tweet.fields=in_reply_to_user_id,created_at&expansions=in_reply_to_user_id&user.fields=location,profile_image_url`
3. Берём твиты с `in_reply_to_user_id`, не равным самому юзеру.
4. Страна получателя: из `users`, если залогинен; иначе из `recipients`; иначе парсим
   `location` из expansions и кладём в `recipients`.
5. `insert … on conflict (tweet_id) do nothing` в `planes`, обновляем `since_id`.
6. 429 от X → прекращаем прогон, продолжим в следующий.

Первый прогон после логина: без `since_id`, `max_results=20` — чтобы у нового юзера
сразу что-то полетело.

**Карта.** Страница грузит последние 200 самолётиков, дальше подписка на Realtime
`INSERT` в `planes`. Новый самолётик летит по дуге (great circle, `d3.geoInterpolate`)
от центроида страны до центроида, ~3 сек, в конце — короткая вспышка. Хвост маршрута
тает. Страна `null` → точка «туман» (облачко в океане). Клик по самолётику — `@a → @b`.

**Настройки.** `/me`: выпадающий список стран → `country`, `country_manual = true`.

## Парсер страны

Чистая функция `parseCountry(location: string): string | null`:
флаг-эмодзи → ISO; название страны (en/ru) → ISO; топ-городов → ISO; иначе null.
Словарь — один JSON-файл. Проверка: `parseCountry.test.ts` с десятком примеров
(«Moscow», «🇧🇷», «Berlin, Germany», «на луне 🌙» → null).

## Не делаем сейчас

Статистика, лидерборды, карточки для шеринга, профиль юзера, модерация.
Добавим, когда базовая карта заработает и появятся живые люди.
