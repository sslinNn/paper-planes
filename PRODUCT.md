# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone on X (broad public, not a niche). They arrive from a link or screenshot in their feed, on a phone or a laptop, with a few seconds of curiosity to spend.

## Product Purpose

Paper Planes turns replies on X into a live world map: every reply a logged-in user posts flies as a paper plane from their country to the country of the person they replied to. AIRMAIL, the game on the home page, lets anyone fly those replies as letters without logging in. Success is a visitor who plays a run on arrival, then logs in with X to fly their own replies.

## Positioning

No posting, no bot, no prompt: people keep talking on X as usual and the map visualizes it. The planes are real replies from real accounts, not a simulation.

## Operating Context

- Entry: a shared link on X lands on `/`, which is AIRMAIL. The first viewport must be playable immediately: the day's mailbag ships in the HTML, the attract mode flies from the first frame.
- The live map lives on `/sky`; its primary action is Play, login is secondary. Game deliveries (Mail Wars) fly on the globe too, so it is alive without logged-in pilots.
- Login: "Log in with X" (OAuth 2.0 via Better Auth). After login the user lands on `/me` to confirm their country; a cancelled login returns to the page it started from and says so.
- Data refresh: collector runs at most every 5 minutes, triggered by visits; the map polls every 20 s.

## Capabilities and Constraints

- Countries only (ISO alpha-2); never coordinates. Reply text is never stored or shown; Jev (TypeSafe) reads each reply once at collection to label its letter kind (warm, hot, joke, question, plain).
- `/` is AIRMAIL (`/play` redirects there), a flight game over the same map: letters are real replies from the database, weather comes from Jev's labels, deliveries stamp the passport. No extra X API calls per player.
- Unknown country = Antarctica.
- Hovering a country shows who posts from there (handles, link to their X profile), how many planes, and highlights that country's routes.
- Stack: Next.js 16 on Vercel, Neon Postgres, Better Auth; map in SVG via d3-geo + world-atlas (110m).
- X API is pay-per-use (owned reads ~$0.001); nothing on the page may trigger X API calls per visitor beyond the shared collector.

## Brand Commitments

- Name: Paper Planes. The moving thing is a paper plane, not an airliner.
- Interface copy in English.

## Evidence on Hand

Real planes from @_sslinNn's replies in Neon. No testimonials, user counts, or press; do not invent any.

## Product Principles

1. Play first: a newcomer gets a flight, not a login wall.
2. Alive on arrival: motion from the first frame, never an empty stage.
3. Real people, lightly: handles and countries only, nothing more personal.
4. Logging in is the next step after a run, and it should feel like joining the sky.
5. On the map, chrome stays out of the way.

## Accessibility & Inclusion

Respect `prefers-reduced-motion` (planes become static routes). Hover content must also be reachable by tap on touch devices and by keyboard focus.
