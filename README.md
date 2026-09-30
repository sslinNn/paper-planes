# Paper Planes ✈️ + AIRMAIL

**Every reply on X is a paper plane.** Log in with X (read-only, we never post) and every reply you write takes off from your country and flies across a live world map to the country of the person you replied to. No bot and no prompt: you keep talking on X as usual, and the map draws it.

**AIRMAIL** (`/play`) turns your replies into a game. Every reply you've sent is a letter; fly it there before your paper plane hits the ground.

- **Your real replies are the levels.** Guests fly strangers' letters from the public sky. Log in and your mailbag holds your own replies, addressed to real people.
- **Real atmosphere.** Trade winds blow west, the westerlies blow east. Moscow → New York is faster if you drop south and take the Columbus route.
- **Jev reads every reply once.** [TypeSafe](https://typesafe.ai)'s System One model folds each reply into a letter: 💌 warm ones glide long, 🔥 hot takes fly fast and burn, 😂 jokes ride the wind, ❓ questions lift you double on delivery. Only the label is stored, never the text.
- **The weather is made of what people are saying.** Storms form over countries where X is arguing. Pink thermals rise where people are kind.
- **Your shadow is your altitude.** No numbers on screen: the higher you fly, the further your shadow falls.
- **Stamps land in your passport** (`/me`), each with a greeting in the local language. When you share a run on X, it tags up to three of the people whose mail you delivered.

Also in the box: a pilot card per handle (`/p/@handle`), an air-traffic board of the busiest routes (`/traffic`), and a passport that fills with country stamps as your planes land.

## How it's built

- **Next.js 16** (App Router) on Vercel, **Neon Postgres**, **Better Auth** (X OAuth 2.0, read-only scopes).
- Map: **d3-geo** + world-atlas, a Miller projection with the seam in the Bering Strait. The main map is SVG. The game draws on **Canvas 2D** from the same projected country outlines, in a world that wraps around.
- Game core is pure TypeScript (`lib/airmail.ts`): winds by latitude, altitude, thermals, storms and delivery by point-in-country. It is tested with `node --test`. The balance was tuned with an autopilot simulation.
- **All sound is synthesized** with WebAudio (rubber-stamp thud, paper rustle, wind). No audio files.
- Jev (`lib/jev.ts`): one Choice question per reply, batched 20 per request. The collector labels new replies and back-fills old ones with owned reads, so no extra X API spend per player.
- `prefers-reduced-motion` is respected: no shake, no confetti, no camera lead.

## Run it

    npm install
    cp .env.example .env.local   # fill in the keys
    node --env-file=.env.local scripts/migrate.ts
    npm run dev
    npm test

Built for [The Build Games](https://canivibecodeit.com/thebuildgames), September 2026.
