# Paper Planes ✈️ + AIRMAIL

**Every reply on X is a paper plane.** Log in with X (read-only, we never post) and every reply you write takes off from your country and flies across a live world map to the country of the person you replied to. No bot and no prompt: you keep talking on X as usual, and the map draws it.

**[AIRMAIL](https://paper-planes-three.vercel.app/play)** turns those replies into a flight game. Every reply you've sent is a letter, and you fly it to the person you wrote to before your paper plane hits the ground.

## Why it's different

- **The levels are real conversations.** Log in and your mailbag holds your own replies, addressed to real people in real countries. Everyone else flies **Today's Mail #N**: the same sky for everyone that day, like Wordle, with a ghost of your best run.
- **An AI reads each reply once and folds it into a letter.** [TypeSafe](https://typesafe.ai)'s Jev, a System One model that returns typed judgments rather than text, labels every reply. 💌 warm letters glide long, 🔥 hot takes fly fast and burn, 😂 jokes ride the wind, ❓ questions lift double. Only the label is stored, never the text.
- **The weather is made of what people are saying.** Storms form over countries where X is arguing ("🔥 3 hot takes · US"). Pink thermals rise where people are kind.
- **The physics is real.** Trade winds blow west and the westerlies blow east, drawn as streaks with a tailwind/headwind gauge. Your altitude is your shadow, and diving trades height for speed.
- **Every run ends as a postcard.** Sharing makes a route image: your flight in airmail stripes over a riso map, a stamp on every country, and the score. It tags up to three of the people whose mail you delivered. Stamps also land in your passport on `/me`.

## Ranks, a daily board and music

- **Pilot ranks unlock airframes.** Letters delivered across all your runs raise your rank: Cadet flies the Dart, Courier unlocks the Glider (sinks slower, turns wider), Captain the Swallow (faster and sharper), and Ace the Crane (shrugs off storms and wind). Your airframe also flies your real replies on the live map.
- **Today's Mail has a leaderboard.** Everyone flies the same sky, so the board is fair. It shows the top pilots of the day with their X handle and rank. The client computes the score; the server rejects anything impossible (letters, a score ceiling, the day, a rate limit).
- **The music is generated as you fly.** A lo-fi loop in C, synthesized with WebAudio, whose melody is seeded by the day. It muffles as you lose altitude, the hi-hat doubles when you dive, and the pads detune in storms.

## Game feel, on purpose

Based on first-hand sources (notes in `docs/research/`):

- A hit-stop "sleep" and a bass thump on every stamp (Nijman, *The Art of Screenshake*).
- The plane banks, stretches and bounces in the same frame as your input (Swink, *Game Feel*).
- It crashes in a spin and crumples into a paper ball.
- Ink stamps stay on the map where each letter landed.
- You learn by flying, with in-flight hints instead of a rules screen.

All sound is synthesized with WebAudio. There are no asset files.

Also in the box: a pilot card per handle (`/p/@handle`), an air-traffic board of the busiest routes (`/traffic`), and a passport that fills with country stamps as your planes land.

## How it's built

- **Next.js 16** (App Router) on Vercel, **Neon Postgres**, **Better Auth** (X OAuth 2.0, read-only scopes).
- Map: **d3-geo** + world-atlas, a Miller projection with the seam in the Bering Strait. The main map is SVG. The game draws on **Canvas 2D** from the same projected country outlines, in a world that wraps around.
- Game core is pure TypeScript (`lib/airmail.ts`): winds by latitude, altitude, dive, thermals, storms, strays (other real replies flying their real great-circle routes), combos, and delivery into the recipient's drop circle. It is tested with `node --test`. The balance was tuned with an autopilot simulation.
- Today's Mail (`lib/postcard.ts`): a seeded RNG keyed to the New York date gives everyone the same letters, storms and strays. The share is a Wordle-style flag line, and `/play/r/[code]` renders the route postcard as the Open Graph image (satori + d3-geo).
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
