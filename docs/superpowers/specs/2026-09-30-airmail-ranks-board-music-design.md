# AIRMAIL: ранги, лидерборд, музыка — дизайн

Утверждено в чате 2026-09-30. Процесс упрощён по решению юзера: спек без отдельного плана, реализация через TDD.

## Ранги и ангар

Опыт (XP) = доставленные письма за все забеги. Залогиненный — сумма `delivered` в `airmail_runs`; гость — `localStorage['airmail-xp']`.

| Ранг | XP | Модель | Модификаторы (множители) |
|---|---|---|---|
| Cadet | 0 | dart | — |
| Courier | 10 | glider | sink 0.8, turn 0.85 |
| Captain | 30 | swallow | speed 1.15, turn 1.2, sink 1.1 |
| Ace | 60 | crane | storm 0.5, wind 0.7, speed 0.95 |

- Модели открываются только рангом. Донат даёт золото и штамп Patron, выбор модели из Support убран.
- `POST /api/me {plane}` разрешает модель, если XP юзера её открывает. Главная карта рисует `from_plane` без условия «патрон» (сервер уже проверил).
- Ангар на intro: 4 модели, закрытые серые с «Rank · N letters», шкала до следующего ранга. Выбор модели у залогиненного сохраняется через `POST /api/me`, у гостя — в `localStorage`.
- В итогах при новом ранге: «Promoted: Captain — Swallow unlocked».

## Лидерборд «Today's Mail #N»

- Таблица `airmail_runs (id, user_id, day, mode, score, delivered, km, countries, created_at)`, индекс `(day, mode, score desc)`.
- `POST /api/airmail/run {day, mode, score, delivered, km, countries}` — только залогиненный. Проверки: `mode ∈ {daily, mine}`; `day` = сегодняшний `dayNumber()` (или вчерашний — забег мог начаться до полуночи); `0 ≤ delivered ≤ 20`; `score ≤ maxScore(delivered)`; `km ≤ 200000`; `countries` — ISO-коды; `limited('run:'+user, 30, 3600)`. Ответ: `{ xp, rank, place }`.
  ponytail: счёт считает клиент, серверного пересчёта нет — есть только потолки правдоподобия.
- `GET /api/airmail/board` — топ-20 дня в режиме daily: лучший счёт каждого юзера, handle, image, rank; CDN `s-maxage=15`. Своё место — в ответе POST.
- UI: intro — «Today's leader: @handle · score»; итоги — топ-5 и «#N today»; гостю «Log in with X to get on the board».

## Музыка

Генеративный lo-fi на WebAudio в `app/play/sound.ts`: 84 BPM, Cmaj7–Am7–Fmaj7–G7 треугольными пэдами, мелодия из пентатоники по сиду дня, бочка и хэт из шума. Фильтр закрывается к земле (`alt`), в пике хэт вдвое чаще, в грозе диссонанс. Общий mute.

## Тесты

`lib/ranks.test.ts`: пороги рангов, `unlocked`, `maxScore`, валидация забега (`runRequest`). Физика моделей — тест в `lib/airmail.test.ts` (глайдер тонет медленнее дротика).
