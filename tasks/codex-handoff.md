# Codex Handoff — Instagram Post Template Layout
Date: 2026-04-19
PR: #97 (feat/instagram-export)
Branch: feat/instagram-export

## The ask

Take over the Satori slide-template layout work. 10 iteration-rounds
between Opus + user + Codex (once) haven't converged on a robust render.
Current state (V10): split logic works (2 slides for long content), but
title and lead **visually overlap** on slide 1 because the title's tight
lineHeight (1.02) lets ExtraBold glyph descenders reach into the lead
box below.

The user wants a robust, reliable slide-template that:

1. Never overlaps neighbouring text blocks, regardless of content length.
2. Keeps **title→lead gap visually tighter than lead→body gap** (explicit
   user requirement — clear hierarchy).
3. Handles single-slide AND multi-slide cases identically (body paragraphs
   must never overflow the canvas; the splitter in `instagram-post.ts`
   already decides how many slides).
4. Respects the design: red `#ff5048` background, black `#000` text,
   PP Fragment Sans woff fonts.

## Files in scope

- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/slide-template.tsx` — the JSX Satori renders (**PRIMARY**)
- `src/lib/instagram-post.ts` — pure split-helper (threshold + overhead
  constants). Tests in `*.test.ts` cover the splitting; please keep
  them green.
- `src/lib/instagram-fonts.ts` — Node-only font-loader (woff files in
  `public/fonts/PPFragment-Sans{Light,Regular,ExtraBold}.woff`)
- `src/app/api/dashboard/agenda/[id]/instagram-slide/[slideIdx]/route.tsx` — the Node route that calls `ImageResponse(<SlideTemplate/>, {width:1080, height:1350, fonts})`

The slide-template is what renders; route is just plumbing.

## Canvas constraints

- Fixed **1080×1350px** output
- **80px padding** all sides → inner 920×1190 content box
- Fonts: 3 weights registered via `ImageResponse.fonts` (no webfont
  fallback — fail-closed if any weight fails to load)

## Slide layout requirements

**Slide 1 (`slide.isFirst === true`)**
1. Meta block (2 stacked lines): `datum · zeit` + `ort` — small, 26px
2. Title — big, ExtraBold 800, 76px
3. Lead — medium, Regular 400, 32px (only if `meta.lead`)
4. Body content (flex-grows): paragraphs from `slide.blocks[]`
5. Hashtags (last slide only, inline row with `flex-wrap`)

**Slides 2+**
1. Continuation header: `datum · truncated-title`, 26px, 1 line
2. Body content + hashtags (if last)

No footer bar (user removed it in V6).

## What Opus has tried (V1 → V10)

Every iteration is committed in the PR branch; the current file is V10.

| V | Change | Why it broke |
|---|---|---|
| V1 | meta-row `<span>` + no flex-wrap on title | "14:15 UhrLiteraturmuseum" concat (spans ignore space-between); title "Zürche[r]"/"Literatu[r]" clipped off right edge |
| V2 | `flexWrap:"wrap"` + `width:"100%"` on all text | Catastrophic: title rendered as "D"/"Ag"/"M"/"Li" single-char fragments stacked right column. flex-wrap on text divs makes Satori treat each word as a flex-item |
| V3 | Removed flex-wrap, added `flexDirection:"column"` to text divs | Slightly better but still horizontal overlap |
| V4 | Added `minWidth:0` + `wordBreak:"break-word"` + `whiteSpace:"normal"` per first Codex consultation | Still broken — meta+title+lead laying out horizontally next to each other |
| V5 | **Removed React fragments** (key insight) + full single-column, all divs direct children of outer flex-column | Layout finally correct! |
| V6 | User feedback: tighter title→lead, looser lead→body, hide footer, tight `Termin:/Ort:/Eintritt:` metalines | Works, but title→lead gap visually similar to lead→body |
| V7 | Tightened title `lineHeight:1.08→1.02` + `marginBottom:8→0`, lead `marginTop:4`, `marginBottom:88` | Hierarchy improved ✓ |
| V8 | Lead `marginTop:4→2`, `marginBottom:88→100` | User-approved spacing ✓ |
| V9 | Split-logic: PARAGRAPH_OVERHEAD=80, SLIDE1_OVERHEAD=300 | Over-conservative: 3 slides where 2 sufficed |
| V10 (now) | PARAGRAPH_OVERHEAD=80→30, SLIDE1_OVERHEAD=300→200 | Split now 2 slides ✓ BUT title+lead visually overlap on slide 1 |

## The current bug (V10)

Slide 1 screenshot attached in the PR conversation (alit-agenda-1-de/slide-1.png).

Observed: "Zürcher\nLiteraturwerkstatt" title rendered ExtraBold 76px with
`lineHeight: 1.02`. Below it (2px marginTop on lead) the lead
"mit Stauffer, Rüegger, Bachmann, Gilles, Pichler" renders at 32px Regular.

**The bottom glyph descenders of "Literaturwerkstatt" overlap with the
top of "mit Stauffer…"** — the two text baselines visually collide.
Tight lineHeight 1.02 on ExtraBold display type leaves no descender
room inside the box, and the flex-column stacking puts them adjacent
without any buffer.

## What to investigate/fix

1. Find a reliable Satori pattern for **flex-column stacking of text divs
   with differing lineHeights** that doesn't cause box-overflow overlap.
   Is this a known Satori limitation? Is there a workaround via
   explicit `paddingBottom` on the title, or `paddingTop` on the lead,
   or some other technique?

2. Propose a spacing scheme that achieves the user's **title→lead <
   lead→body** hierarchy WITHOUT overlap. Current user-approved targets:
   - Title → Lead: ~20-25px visible gap
   - Lead → Body: ~95-100px visible gap
   - Body paragraph → Body paragraph: ~22px
   - Body paragraph → Metaline (Termin/Ort/Eintritt): ~22px
   - Metaline → Metaline: ~6px (tight)

3. Consider: is the `flex-column` on text divs itself contributing?
   Would switching to just `display:flex` (no explicit direction) work
   better?

4. Check: are there other robustness issues that haven't surfaced yet
   (e.g. very long hashtags, super-long titles that wrap to 3+ lines,
   metaline with no colon, empty lead)?

## Reproduce locally

```bash
# 1. Feature branch
git checkout feat/instagram-export
pnpm install

# 2. Dev server
pnpm dev

# 3. Seed admin session (any admin bootstrap), then:
curl -b cookies.txt \
  'http://localhost:3000/api/dashboard/agenda/1/instagram-slide/0?locale=de&scale=m' \
  -o slide-0.png
```

Agenda items in staging (id 1 = Zürcher Literaturwerkstatt reproduces
the V10 overlap bug; id 2 = LyrikTalk is simpler; id 3/4 were earlier
tests).

Staging: https://staging.alit.hihuydo.com/dashboard/ (admin login
required).

## Constraints for your fix

- Must keep `instagram-post.test.ts` (18 cases) green.
- Must keep `route.test.ts` metadata + slide-route font-fail tests green.
- Must not add new deps (next/og + satori + resvg are already pulled
  via Next.js).
- Satori CSS subset: no `grid`, no `filter`, no `box-shadow`, no
  `position: absolute`. Flex-only.
- Fonts are woff (not woff2) to match Satori's opentype.js decoder.

## References

- Satori README / supported CSS: https://github.com/vercel/satori
- Next.js `ImageResponse`: https://nextjs.org/docs/app/api-reference/functions/image-response
- Prior Codex consultation (during V3→V4) saved in conversation log,
  key insight: "flexWrap on text divs splits words into flex-items"

## Sprint context

The broader sprint (PR #97) is **Agenda → Instagram Post Generator v1**.
All other Sprint-Contract DKs (1..12) are green. PMC-1 through PMC-4
are open until after merge. Only the slide-template visual quality is
blocking a merge approval.

Please commit fixes as `fix(instagram-post): V11+ — <description>` so
the iteration-trail stays readable in `git log`.
