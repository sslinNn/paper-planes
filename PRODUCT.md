# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone on X (broad public, not a niche). They arrive from a link or screenshot in their feed, on a phone or a laptop, with a few seconds of curiosity to spend.

## Product Purpose

Paper Planes turns replies on X into a live world map: every reply a logged-in user posts flies as a paper plane from their country to the country of the person they replied to. Success is a visitor who lingers on the moving map and logs in with X to see their own planes fly.

## Positioning

No posting, no bot, no prompt: people keep talking on X as usual and the map visualizes it. The planes are real replies from real accounts, not a simulation.

## Operating Context

- Entry: a shared link on X. First viewport must be alive immediately (planes in flight), including when few real planes exist (history replay).
- Login: "Log in with X" (OAuth 2.0 via Better Auth). After login the user lands on `/me` to confirm their country.
- Data refresh: collector runs at most every 5 minutes, triggered by visits; the map polls every 20 s.

## Capabilities and Constraints

- Countries only (ISO alpha-2); never coordinates. Reply text is never stored or shown.
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

1. The map is the product; chrome stays out of its way.
2. Alive on arrival: motion from the first frame, never an empty stage.
3. Real people, lightly: handles and countries only, nothing more personal.
4. Logging in is the one action, and it should feel like joining the sky.

## Accessibility & Inclusion

Respect `prefers-reduced-motion` (planes become static routes). Hover content must also be reachable by tap on touch devices and by keyboard focus.
