---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/PlaneMap.tsx","app/me/page.tsx"]
---

# Surface: Paper Planes map (home `/` + `/me`)

Mode: Experience. Audience: anyone on X arriving from a shared link, phone or laptop. Job: be captivated by the live map, hover a country to see who posts from there and where their planes go, then log in with X. Constraints: see PRODUCT.md (countries only, no reply text, no per-visitor X API calls, reduced motion).

## Direction contract

THESIS: The world printed as a two-ink risograph zine. Refuses the dark flight-tracker default (glowing arcs on a navy globe): here the map is paper, the planes are paper, and every flight is a fresh pass of fluoro-pink ink over riso blue.

OWN-WORLD: Newsprint ground #ecebe4 with a fine grain; riso Blue #0078bf for all map linework and land halftone; Fluorescent Pink #ff48b0 for planes, trails, CTA; overprint of the two = Purple #3d2b8f (mix-blend multiply, never a fourth hand-picked color); soot #1d1d1b for small text. Every ink layer sits 1–2px off-register. Type: one condensed grotesk for display (full-measure bands), a plain grotesk for small text. Components are printed things: stamped tags, torn/cut edges, dashed fold lines.

STORY: The visitor sees the world alive with pink paper planes crossing the blue map, understands each is a real reply between two real people, hovers a country to meet who's posting there, and logs in to add their own planes.

FIRST VIEWPORT: Map fills the viewport edge to edge (the zine spread). "PAPER PLANES" set as one full-width condensed band across the top, printed in blue with a pink offset ghost. A stamped pink tag "Log in with X" top-right (or bottom on phone). A small honest counter (planes on the map) in soot. Hovering or tapping a country floods it with solid blue ink and opens a printed card: country name large, planes count scaled by volume, handles as big ink set type linking to X, top destinations; the country's routes brighten while the rest drop back.

SIGNATURE INTERACTION: Planes are folded paper darts (two-tone faceted SVG) that bank into turns, flutter slightly, and leave a dashed pink trail that dries (fades) over minutes; arriving planes stamp a small ink splat at the destination. Motion grammar: ink stamps land with a critically damped press (no bounce); flights ease along great circles; nothing glows.

FORM: Riso Zine Map — position 7 of my ordered list (1 Par Avion, 2 notebook doodle, 3 split-flap board, 4 classroom pull-down map, 5 night-lights earth, 6 origami crease diagram, 7 riso zine). Seed key 20aac31d. Raises: Glazier (reserved color), Oscilloscope (trail persistence), Massin (volume is scale), Hatch (full-measure headline).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
