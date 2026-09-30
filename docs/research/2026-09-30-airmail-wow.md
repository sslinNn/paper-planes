# AIRMAIL: what makes judges say "wow" (research, 2026-09-30)

Scope: the Build Games rules, the judges' public signals, primary-source game-feel techniques, why short browser games spread, and a ranked change list for today. **[unverified]** marks claims I could not check against a primary source.

## 1. Competition facts (https://canivibecodeit.com/thebuildgames, https://canivibecodeit.com/thebuildgames/terms)

- Categories are split three ways, one winner each. **Most Creative**: "the build nobody saw coming", judged on "originality of the idea and of how it was built". **Most Polished**: "the one that feels like a finished product, not a demo", judged on "design, reliability, and completeness of the shipped thing".
- Submission needs a public demo URL, a public GitHub repo whose commit history shows the work happened inside the window, and an optional description of up to 200 characters. There is no demo-video field. Deadline is "september 30 · midnight new york". Winners are posted by Oct 15 with "a short judges' citation" (terms §6).
- Judges score independently, then reach one collective decision. Individual scores are not disclosed (terms §5). The Operator may ask for commit history or session logs as evidence (terms §4).
- **36 entries** at the time I checked. The entry list is not public: /thebuildgames/builders only explains the rules. The only public gallery is https://canivibecodeit.com/builds, which has 7 unrelated site builds, mostly SaaS clones plus one daily "Color Guesser" puzzle.
- **What this means:** judges open a bare URL cold. With no video, the first 10 seconds of /play and the 200-char blurb do all the pitching. They also read the repo, so a clean README and commit history help the "how it was built" half of Most Creative.

## 2. Judges: what they visibly value

- **Tony Dinh (@tdinh_me).** He says demo clips drive his distribution: "this tweet showing the mobile app demo got 1,700 likes! It's almost like free marketing" (https://news.tonydinh.com/p/my-solopreneur-story-zero-to-45kmo). He favours a one-week MVP and early users (https://www.producthunt.com/stories/tony-dinh-on-what-he-s-learned-as-an-indie-developer). He builds in public on X. He is widely credited with Xnapper, whose pitch is "Snap Beautiful Screenshots Instantly" (https://xnapper.com). The site itself does not name him, so treat his authorship as **[unverified]** on the primary page.
- **Dudu (@dudufolio).** He built Shotbase, a Mac app to "capture, trim, annotate, share", launched 08/25/26 (https://x.com/dudufolio/status/2092337179607572694, via search snippet because X blocks fetching). He also runs Toolfolio, a curated tool directory with design-heavy categories (https://toolfolio.com/). His bio reads "Glorified Button Clicker Drawing Rectangles for a Living", which points to a designer's eye **[bio via search snippet]**.
- **Andrej Šimunaj (@scheemunai).** His studio Zero Point Studio (https://zeropointstudio.io/) sells "production-grade software" and advertises 49 ms median response and 99.97% uptime. That leans toward reliability and speed, which maps to the "reliability" part of Most Polished.
- **Inference (mine, not theirs):** two of the three judges sell screenshot and share tools, and the third sells reliability. That suggests they will notice (a) how good the shared image or card looks, (b) whether it loads instantly and never breaks, and (c) whether a 10-second clip of it would get likes. I found no public statement from any judge about indie games **[unverified / none found]**.

## 3. Game feel: primary-source techniques, translated to a Canvas 2D top-down flyer

Sources: Swink's *Game Feel* ch. 1 (http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf) defines game feel as "real-time control of virtual objects in a simulated space, with interactions emphasized by polish". He adds that for players "simulation and polish are indistinguishable". Gabler et al., "How to Prototype a Game in Under 7 Days" (https://www.cs.hmc.edu/~markk/SWE_copies/gabler_prototyping.html) defines juice: "A juicy game element will bounce and wiggle and squirt and make a little noise when you touch it". Their other tips are "Build the Toy First", "Create a Sense of Ownership", and "Complexity is Not Necessary for Fun".

Nijman, "The Art of Screenshake", INDIGO 2013 (https://www.youtube.com/watch?v=AJdEqssNZ-U). Its 30-item list comes via a secondary summary (https://artificials.ch/game-feeling/), so the item wording is **[secondary]**. Jonasson & Purho, "Juice it or lose it" (https://www.youtube.com/watch?v=Fy0aCDmgnxg; repo https://github.com/grapefrukt/juicy-breakout). The Jonasson & Purho items below come from memory of the talk, not a transcript **[unverified]**.

| Technique | Source | One-line how-to in AIRMAIL |
|---|---|---|
| **Sleep / hit-stop** | Nijman #17: "sleep for 100 or 200 ms" on a big hit [secondary] | On stamp: freeze `step()` for 60–120 ms (scale up with combo) while still drawing, then resume. It is the cheapest "weight" you can add. |
| **Camera kick / lerp / position** | Nijman #13, #14, #28 [secondary] | Lerp the camera toward the plane plus a lead of `velocity*0.3`. On delivery, nudge the camera 6 px toward the drop circle. |
| **Screenshake** | Nijman #15 | Already present. Keep it only for storm and delivery. Prefer a directional shake along the impact vector over random jitter. |
| **Permanence** | Nijman #12, #21, #30 [secondary] | Leave a stamp ink mark on the map where each letter landed, and keep the flown route as a faint dashed pink line for the whole run and on the end screen. |
| **More bass / sound layering** | Nijman #22 [secondary] | Stamp sound = low sine thump (60–90 Hz, 80 ms) + existing chime. Raise the pitch per combo step. |
| **Squash & stretch, tweening/easing** | Jonasson & Purho [unverified]; Swink ch. 1 says polish includes squash and stretch | Scale the plane sprite 1.0→1.25→1.0 with easeOutBack on lift. Pop the pink circle outward and fade it (easeOutCubic, 250 ms) on landing. |
| **Particles on every touch** | Gabler "Make it Juicy!"; Swink | Emit paper confetti in the two riso inks on stamp. Shed small blue specks when diving. |
| **Anticipation & readable feedback** | Swink: real-time control needs input → visible response fast | Tilt the plane and flash its shadow on the dive press within the same frame. Make the low-altitude alarm pulse the shadow. |
| **Kishōtenketsu** (introduce → develop → twist → conclude) | Hayashida on Mario level design (https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design) | Structure the 40 s run: first letter nearby and easy, then wind, then a storm twist, then a final long-haul "express" letter. |

## 4. Why short browser games spread (primary where possible)

- **Wordle (Josh Wardle).** "It's one puzzle, and everybody is solving it... If the word was random... it wouldn't have caught on" (https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/). A New Zealand player hand-typed the emoji grid first, and Wardle then built it in (same source). He wanted "three minutes of your time a day" and kept the link out of the share text because "if you throw up a link there it kind of looks crappy" (https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success). He chose a website so anyone could click and play instantly, per his GDC 2022 talk (https://gdcvault.com/play/1027882/-Wordle-Doing-the-Opposite).
  → The mechanics: **same seed for everyone, a spoiler-free visual grid, scarcity, and instant play from a link.**
- **Flappy Bird (Dong Nguyen).** He designed it for one hand in a fleeting moment on a commute, as an homage to simple Nintendo games (reported in Rolling Stone, https://www.rollingstone.com/culture/rs-gaming/the-flight-of-the-birdman-flappy-bird-creator-dong-nguyen-speaks-out-112457/, via https://slate.com/technology/2014/03/flappy-bird-returns-rolling-stone-interviews-dong-nguyen-in-vietnam.html; the Rolling Stone page itself was paywalled) **[secondary]**. → One input and instant restart.
- **slither.io (Steve Howse).** "A few days later... people with millions of subscribers already doing Let's Play videos" (https://www.pocketgamer.com/slither-io/interview-the-future-of-slither-io-and-tips-direct-from-the-developer/). → It spread because it was watchable and streamable: other real players on screen, and an instant browser join.
- **Chrome dino.** It is a zero-onboarding game where one key starts play. The origin story comes via Wikipedia (https://en.wikipedia.org/wiki/Dinosaur_Game) **[secondary]**.
- **Ghosts, daily challenges and streaks** (Mario Kart, Trackmania, GeoGuessr daily) are well-known patterns. I did not find a primary-source citation today **[unverified]**.

## 5. Ranked changes for AIRMAIL today

The code already has a shake on delivery, particles, combos, a localStorage best score, an X intent share with an emoji kind tally, and `step(g, input, dt, rand)` with injectable RNG (`lib/airmail.ts:225`). That last one makes a daily seed cheap.

### Wow in the first 10 seconds
1. **Hit-stop + bass thump + circle pop on every stamp.** A 80–120 ms freeze, a 70 Hz sine thump, an easeOutBack stamp scale and riso confetti. This is the single most-cited "weight" trick (Nijman #17, #22; Gabler "Make it Juicy!"). **S**
2. **First letter within 3 s of flight, guaranteed.** Pick the nearest recipient as letter #1 so the first stamp lands before the judge's attention drifts. Rationale: Wardle's instant play and Gabler's "Build the Toy First"; the judges arrive cold with no video (§1). **S**
3. **Plane squash/tilt on input, same frame.** Tilt the plane when steering, squash it and darken its shadow on dive. Swink: real-time control is felt through immediate visible response. **S**

### Depth / replay
4. **Daily route: "Today's Mail #N".** Seed `rand` and the letter order from the date (New York time) so everyone flies the same sky, and store a daily best. Wardle: "It's one puzzle, and everybody is solving it". **M** (the seedable RNG already exists; the daily letter set must be deterministic, so letters may need to come from a fixed daily pool when guests play).
5. **Ghost of your best run.** Record `(x, y)` every 100 ms into localStorage and draw it as a faint dashed blue plane. This follows the ghost pattern from racing games **[unverified source]**. **S–M**
6. **Permanence map on the end screen.** Show the full route line plus ink stamps at each drop, which doubles as the share image. Nijman's permanence items [secondary]. **S**
7. **Kishōtenketsu run arc.** Easy first letter, then wind, then a storm twist, then a final long-haul express letter worth 2×. Hayashida. **M**

### Share / virality
8. **Spoiler-free flag grid in the share text.** For example `✈️ Airmail #12 · 🇯🇵🇧🇷🇩🇪 · 3🔥1😂 · 42,310`. Countries become flag emoji in delivery order, with ✖ for the letter you died on. This is Wardle's grid adapted; it is short, visual, and shows scarcity. **S**
9. **Route-postcard share image.** Generate a dynamic OG image per run, e.g. `/play/r/[id]` or query params into the existing `opengraph-image.tsx`, showing the route over the riso map and the stamps. Two judges sell screenshot tools (§2, inference). **M**
10. **Make recipients want to play back.** Share already tags @recipients. Add "reply-to-sender" play links (`/play?from=@you`) so the tagged friend flies your letters back. This uses the slither.io "real people on screen" effect. **M**

### Polish signals judges notice
11. **Reliability pass:** offline or empty-reply fallback so the page never shows a dead state, 60 fps on a mid-range phone, `prefers-reduced-motion` (the calm mode exists, so verify it disables hit-stop and shake), and touch controls. This maps to "reliability, and completeness" in the criteria and to Andrej's uptime/latency pitch. **S–M**
12. **200-char blurb + README top section** naming the creative "how it was built": real X replies, real winds, Jev labels driving the weather. Most Creative judges "how it was built", and the entry form caps the blurb at 200 chars. **S**
