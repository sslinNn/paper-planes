---
name: Paper Planes
description: Every reply on X is a paper plane flying across the world, printed as a two-ink riso zine.
colors:
  paper: "#f5f3eb"
  paper-printed: "#ecebe4"
  riso-blue: "#0078bf"
  fluoro-pink: "#ff48b0"
  soot: "#1d1d1b"
typography:
  display:
    fontFamily: "Big Shoulders, sans-serif"
    fontSize: "clamp(2.3rem, 4.4vw, 4.4rem)"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Big Shoulders, sans-serif"
    fontSize: "clamp(2rem, 3.2vw, 2.9rem)"
    fontWeight: 900
    lineHeight: 0.85
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Big Shoulders, sans-serif"
    fontSize: "clamp(1.5rem, 2.2vw, 2rem)"
    fontWeight: 800
    lineHeight: 1.05
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  lede:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.25vw, 1.15rem)"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  none: "0"
spacing:
  sheet-pad: "clamp(14px, 2.2vw, 32px)"
  gap-sm: "8px"
  gap-md: "14px"
  gap-lg: "22px"
components:
  tag-stamp:
    backgroundColor: "{colors.fluoro-pink}"
    textColor: "{colors.soot}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.7em 1.1em 0.65em"
  chip-sky:
    backgroundColor: "transparent"
    textColor: "{colors.soot}"
    rounded: "{rounded.none}"
    padding: "6px 12px 7px"
  chip-sky-pressed:
    backgroundColor: "{colors.riso-blue}"
    textColor: "{colors.paper}"
  card-printed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.soot}"
    rounded: "{rounded.none}"
    padding: "18px 20px 20px"
    width: "min(340px, 86vw)"
  strip-caption:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.soot}"
    typography: "{typography.lede}"
    rounded: "{rounded.none}"
    padding: "0.45em 0.7em 0.5em"
  select-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.soot}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
---

# Design System: Paper Planes

## Overview

**Creative North Star: "The Two-Ink Riso Zine"**

The world is printed, not rendered. Newsprint paper carries a fixed multiply grain over everything; the map is riso blue linework with a rotated halftone for land; every flight is a pass of fluorescent pink ink. There is no screen light in this system: nothing glows, nothing floats on a shadow, and nothing is dark-mode. Depth comes only from ink layering, where pink and blue print over each other in `mix-blend-mode: multiply` and misregister by a pixel or two.

The map is a full-bleed flat Mercator spread (80N to 72S), bottom-anchored so Antarctica stays open, letterboxed with paper margins above a 17:10 aspect and pannable at full height on portrait. Chrome is printed onto the spread: one full-measure condensed headline band across the Arctic, a caption and counter on paper strips, a pink stamped tag. Below the fold, the sheet continues as plain paper.

Density is low on type and high on map. The product principle "the map is the product" is the layout rule: everything that is not map sits on paper strips or in one card, and yields to the map.

**Key Characteristics:**
- Two inks (blue, pink) plus soot on newsprint; any purple is an overprint, never a picked color.
- Off-register layering: second-ink passes sit 1-2px (or ~.014em) away from the first.
- Square corners everywhere; edges are cut, stamped, dashed or perforated.
- One condensed grotesk at 900 for display bands; one plain grotesk for reading.
- Motion is ink behavior: presses, stamps, drying trails. No bounce, no glow.

## Colors

A newsprint sheet printed in two riso inks, with soot for reading text.

### Primary
- **Riso Blue** (`riso-blue`): all map linework, land halftone, the graticule, the headline band, card headings and frame, the section rule under the spread, the scrollbar thumb. A hovered or pinned country floods to solid blue.

### Secondary
- **Fluorescent Pink** (`fluoro-pink`): the moving layer. Paper planes, dashed flight trails, arrival stamps, route highlights, the stamped login tag, the headline's under-pass, text selection and the dashed focus outline. Always printed with multiply when it overlaps blue.

### Neutral
- **Newsprint** (`paper`): the declared ground; also the fill of caption strips, cards and fields so they read as paper laid on the map.
- **Newsprint as printed** (`paper-printed`): the ground as it appears once the grain darkens it; used as the browser theme color. Do not use it as a fill; the grain produces it.
- **Soot** (`soot`): all reading text, text on pink, the plane wing outlines, the tag's dashed inner rule.

### Named Rules
**The Two Inks Rule.** Only blue and pink are inks. Purple exists solely where they overprint (the plane's fold facet: blue at .55 opacity multiplied over pink). Never pick a purple, green or any third ink.

**The Soot Reads Rule.** Text under display size is soot. Blue is linework and display ink (headlines, big numerals); pink is fill, never text on paper.

## Typography

**Display Font:** Big Shoulders (variable, `--font-display`), fallback sans-serif
**Body Font:** Archivo (variable, `--font-text`), fallback system-ui, sans-serif

**Character:** A tall condensed poster grotesk set heavy and tight, like wood type pulled on a zine cover, against a sturdy plain grotesk that just reads.

### Hierarchy
- **Display** (900, clamp(2.3rem, 4.4vw, 4.4rem), line-height .8, -.02em, uppercase, no wrap): one line in the masthead strip above the map. Blue, with the pink under-pass; on `/me` it wraps at min(12vw, 10rem) and keeps its own case.
- **Headline** (900, clamp(2rem, 3.2vw, 2.9rem), .85, uppercase): the country name on the card. Section heads below the fold use the same face at clamp(1.6rem, 3vw, 2.4rem)/.9.
- **Title** (800, clamp(1.5rem, 2.2vw, 2rem), 1.05): X handles in the card, set large as the people are the content.
- **Numerals** (Big Shoulders 900 at 1.3-1.5em, tabular): counts in the counter, chips and card tally. The card tally scales with volume, from 2rem up to 4.4rem on a log curve.
- **Lede** (Archivo 500, clamp(1rem, 1.25vw, 1.15rem), max 44ch, `text-wrap: pretty`): the one caption on the spread.
- **Body** (Archivo 400, 1rem, 1.5): default reading text; strong emphasis at 800.
- **Label** (Archivo 600-800, .8-.85rem): notes, list captions inside the card ("Posting from here"), colophon.

### Named Rules
**The Map Comes First Rule.** Nothing is printed over the map. Title, lede, counter and the login tag live in a paper masthead strip above it; the map fills the rest of the viewport with `meet`, so the whole world (Antarctica included) is always visible. The user rejected both the full-measure band and the corner overlay because they hid the Americas and Greenland.

**The Volume Is Scale Rule.** Quantity is shown by numeral size, not by a chart or badge.

## Layout

The home page is a spread: a `100svh` (min 540px) map stage, bottom-bordered in 2px blue, with an overlay whose width equals the map's width (`--map-w`) so the headline, caption and counter always align to the map, not the window. Overlay padding is `sheet-pad`. Headline sits top; caption strip and tag follow 14px below with 14px / 22px gaps; the counter aligns right under the headline.

Responsive behavior is by aspect, not only width:
- **Wider than 17:10:** the map is full height and centered with paper margins either side; the world is never cropped.
- **Narrower than 5:4:** the map stays full height and overflows horizontally; the stage scrolls sideways with hidden scrollbars and a pink "drag" strip that fades after 6s.
- **Under 640px:** the counter moves to the bottom right; the country card becomes a fixed sheet pinned to the bottom.

Below the spread, content sits in a paper sheet capped at 1440px, padded clamp(18px, 2.6vw, 36px) vertically and `sheet-pad` horizontally. Forms cap at 34rem.

## Elevation & Depth

Flat. There are no drop shadows, blurs or glows. Depth is conveyed by print layering: paper strips laid over the map (with a 1px blue hairline beneath, `0 1px 0 rgb(0 120 191 / .5)`), a fixed newsprint grain at .18 opacity multiplied over the whole viewport, and second-ink passes offset from the first.

### Named Rules
**The Misregistration Rule.** Layering is shown by a second ink pass slightly out of register, printed with multiply: the pink outline ghost of the land (offset 1.6, 1.1), the card's pink frame (offset 2px, 1.5px), the headline's pink under-pass (offset .014em, .01em). The headline pass sits under the blue, because multiplying these two inks over each other yields navy and erases the blue title.

**The Nothing Glows Rule.** No light effects of any kind. If something needs emphasis, it gets more ink (solid fill, denser halftone), not light.

## Shapes

Square corners throughout (`rounded.none`). Edges are print-shop edges: solid 1.5-2px blue rules, dashed fold lines (card destination rows, the tag's inner rule, the graticule, trails), and perforation notches (the tag's semicircular side cuts). Stamped elements are tilted a couple of degrees (-2 to -2.5deg). The land halftone is a dot screen rotated 15deg, a denser screen marking busy countries. The select's chevron is drawn in two blue triangles, not an icon.

## Components

### Buttons
**The stamped tag**: the one primary action, a pink ink stamp slapped onto the page.
- **Shape:** square, rotated -2.5deg, with perforation notches cut into both short sides and a dashed soot rule inset 4px.
- **Primary:** pink ground, soot Archivo 800 at 1rem, multiply blend so map lines show through.
- **Hover / Focus:** straightens to -1deg and lifts 1px over 120ms; press scales to .96 in 60ms. Focus uses the global dashed pink outline, offset 5px.
- Icons are hand-drawn inline SVG at 1em in currentColor (X mark, square-capped arrow, close), never glyph characters.

### Chips
**Busiest skies chips**: country buttons that pin the card.
- **Style:** transparent with a 1.5px blue rule, soot Archivo 700 at .95rem, count in pink Big Shoulders.
- **State:** hover and pressed flood to solid blue with paper text (120ms).

### Cards / Containers
**The printed card**: the country readout, laid on the map like a slip of paper.
- **Corner Style:** square.
- **Background:** paper, 2px blue frame, plus a pink frame printed 2px/1.5px off register.
- **Shadow Strategy:** none; see Elevation.
- **Internal Padding:** 18px 20px 20px; width min(340px, 86vw).
- **Entrance:** a 220ms press (rise 6px, scale from .98), no bounce. Destination rows are separated by dashed blue rules.

**Caption strips**: the lede and counter are set on paper strips with a blue hairline beneath, so the map never runs under reading text.

### Inputs / Fields
- **Style:** paper ground, 2px blue rule, square, Archivo 700 at 1.1rem, padding 12px 14px, native appearance removed, blue drawn chevron.
- **Focus:** the global dashed pink outline, 2px, offset 3px.

### Paper Dart (signature)
The plane is a folded paper dart: two pink facets outlined in .5 soot, with the lower facet overprinted by blue at .55 to produce the only purple in the system. It flutters (.42s alternate), eases along its route, and leaves a pink dashed trail that dries to .1 opacity over 60s; arrival presses a pink ink stamp (420ms, from scale 1.9). Replayed history flights are echoes: paler trails that dry in 14s. Under reduced motion, planes are removed and routes and stamps print static at .6.

## Do's and Don'ts

### Do:
- **Do** print every overlapping ink layer with `mix-blend-mode: multiply`.
- **Do** offset a second ink pass 1-2px (or ~.014em on display type) off the first; put pink under blue on headlines.
- **Do** set reading text in soot on paper; put text on pink in soot.
- **Do** keep every corner square and every edge a rule, a dash or a cut.
- **Do** lay chrome on paper strips over the map rather than letting text sit on linework.
- **Do** use the shared ease-out curve (`cubic-bezier(0.16, 1, 0.3, 1)`) for presses and state changes, 60-220ms.
- **Do** keep hover content reachable by tap and keyboard focus.

### Don't:
- **Don't** add a third ink or hand-pick a purple; purple only happens where blue multiplies over pink.
- **Don't** use drop shadows, glows, blurs or gradients for depth.
- **Don't** round corners.
- **Don't** set small text in blue or any text in pink on paper; neither reaches reading contrast.
- **Don't** print the pink headline pass over the blue; the multiply turns the title navy.
- **Don't** crop the world on wide screens; letterbox with paper margins instead.
