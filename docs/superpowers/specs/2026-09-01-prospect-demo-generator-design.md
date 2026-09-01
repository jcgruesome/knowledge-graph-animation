# Prospect demo generator — design spec

Status: draft, pending review. Companion to the item24 Spanish demo (`feat/item24-es-demo`),
which this generalizes.

## Problem

Building a personalized knowledge-graph demo for a prospect (item24) took a full hand session:
manual palette re-tuning, manual Q&A cleanup from a provided transcript, manual copy translation,
manual Vercel deploy. We want `pnpm generate-demo --url <prospect-url> --company "Acme Corp"` to
produce a comparable first draft with no hand-editing, for any company, in minutes.

## Goals

- One command takes a prospect URL + company name to a rendered demo (video) and a shareable
  preview link, with no source-file editing per company.
- Each company gets a structurally distinct graph (not just recolored) and a palette derived from
  their actual brand color.
- Output is explicitly a **draft**: a human reviews before anything goes to a stable/production
  URL or leaves the building.
- Content (Q&A, category labels) is grounded in real scraped text, with low-confidence output
  filtered rather than silently shipped.

## Non-goals (v1)

- Not building a UI for this — it's a CLI, run by whoever's prepping the demo.
- Not handling sites that block scraping entirely (Cloudflare hard-block, login walls) — those
  fail the pipeline with a clear error, no silent degraded output.
- Not attempting logo *vectorization* or cleanup — we take whatever logo asset we can extract,
  as-is.
- Not building a general-purpose shared package between the two repos — see "Repo boundary" below.

## Pipeline

```
generate-demo --url <prospect-url> --company "<name>" [--locale auto|es|en] [--density 1|2|3] [--seed-variant <n>]
```

1. **Scrape** — adapted from `design-system/packages/animator/src/lib/scrape.ts`: fetch the
   homepage plus FAQ/support/product pages it can find (sitemap + common-path probing), with the
   existing unblock-tier and Wayback-Machine fallback behavior. Also captures `<html lang>` /
   `hreflang` for locale detection.
2. **Brand extraction**
   - Palette: adapted from `derivePalette()` — theme-color meta, CTA button fills, link-color
     prominence scoring — down to one primary brand hex.
   - Logo: new heuristic (favicon, OpenGraph `og:image`, header/nav `<img>` matching
     `logo`/company-name in `alt`/`class`/`src`, largest SVG in the `<header>`). Downloaded as
     `public/kits/<slug>/logo.<ext>`.
3. **Content generation** — adapted from `qa.ts`: Claude generates ~15 candidate Q&A pairs and
   ~8-10 candidate category labels grounded in the scraped text, in the detected locale, **plus a
   self-rated grounding confidence (0–1) per item** (see "Content grounding gate" below).
4. **Grounding gate** — drop any Q&A/category item below confidence 0.6. If fewer than 8 Q&A pairs
   or 5 categories survive, the pipeline **fails** with a message telling the operator to supply
   content manually (matching how item24 actually got its content) rather than shipping thin or
   fabricated output.
5. **Palette derivation** — algorithmic, from the one extracted brand hex (see below). No LLM
   step; deterministic and testable.
6. **Structural randomization** — a numeric seed from `hash(company)` widens graph.ts's hub/cluster
   *counts* within a fixed range per density tier, not just leaf layout (see below).
7. **BrandKit assembly** — writes `public/kits/<slug>.json` (contract below) plus the logo asset.
8. **Render** — a Playwright driver loads `index.html?kit=<slug>`, waits for the `awake` HUD state,
   triggers a new `window.kg.exportLoop(): Promise<Blob>` hook (see "Export hook" below), saves the
   WebM, converts to MP4 via the existing ffmpeg recipe.
9. **Preview deploy** — `vercel --yes --scope reshapex` (**not** `--prod`) from this repo with the
   kit baked in, producing a preview URL. Nothing is aliased to a stable/production domain by this
   step.
10. **Report** — CLI prints: preview URL, MP4 path, which Q&A/category items were dropped by the
    grounding gate and why, and the extracted palette (for a human sanity check before promotion).

Promotion to a stable alias (e.g. `<slug>.vercel.app`, or an existing project) is a **separate**,
explicitly human-invoked command (`pnpm promote-demo <slug> --project <name>`) — this pipeline
never auto-promotes, consistent with "publishing" being a human decision.

## BrandKit contract

```ts
interface BrandKit {
  company: string;
  slug: string;              // url/filename-safe
  locale: 'es' | 'en';       // more locales = more i18n/<locale>.ts files, not code changes
  logoPath: string;          // public/kits/<slug>/logo.<ext>
  palette: {
    brand: string;    // root / CTA — the extracted color, as-is
    clusterA: string; // brand hue + 25°
    clusterB: string; // brand hue − 20°, darkened ~35%
    stakes: string;   // shifted toward magenta
    answer: string;   // brand hue + 150°, high lightness — the "one signal" accent
    background: string; // brand hue, ~8% lightness
    steel: string;     // brand hue, desaturated mid-gray
    usedFallback: boolean; // true if brand color tripped the achromatic/extreme-lightness fallback
  };
  catalogNames: string[];    // 6-10 items, survivors of the grounding gate
  queries: { question: string; answer: string; confidence: number }[];
  seed: number;              // hash(company); feeds graph structure + layout
  generatedAt: string;       // ISO timestamp
  sourceUrl: string;
}
```

Loaded at runtime via `?kit=<slug>` (fetches `/kits/<slug>.json`), not baked into a per-company
build. `palette.ts`, `queries.ts`, and every hardcoded Spanish string this session added become
consumers of this data instead of hardcoded source — see "i18n" below for the copy side of that.

## Palette algorithm

Deterministic, from one brand hex `H` → HSL `(h, s, l)`:

- **Fallback branch** (checked first): if `s < 0.08` (effectively gray) or `l < 0.10` or `l > 0.90`
  (effectively black/white), the extracted color isn't usable as a hue anchor. Fall back to a
  curated default hue set (ReshapeX's own cyan/violet baseline) and set `usedFallback: true` so the
  CLI report flags it for a human to consider overriding by hand. This is the one place v1
  explicitly punts to a human rather than guessing.
- Otherwise:
  - `brand = H` (root/CTA, as extracted)
  - `clusterA = hue+25°, same s/l`
  - `clusterB = hue−20°, same s, l × 0.65`
  - `stakes = hue rotated toward 330° (magenta), s boosted to ≥0.7`
  - `answer = hue+150°, l raised to ≥0.75, s ≥0.6` — must read as "the one accent" against a
    background dominated by `brand`/`clusterA`/`clusterB`; verified by a plain contrast check
    (WCAG-style relative luminance delta) against `background`, not just eyeballed.
  - `background = hue at l=0.08, s reduced to 0.15` (near-black, faintly brand-tinted)
  - `steel = hue at l=0.55, s reduced to 0.08` (dormant-node neutral)

**Validation before this is considered done:** run this against at least 3 real extracted brand
colors spanning different hue families (a blue B2B SaaS, a green sustainability brand, item24's
red) and visually confirm legibility against `background` — the bar is "reads clearly," not just
"mathematically distinct."

## Structural randomization

`graph.ts` currently seeds leaf placement/angles but hub/cluster *counts* per density tier are
fixed constants. Change: each density tier's hub count, doc-cluster hub count, and tail size become
a seeded range (e.g. `hubs: 44 + rng.int(28)`) rather than a single fixed number, so two companies
at the same density are structurally different graphs, not the same skeleton recolored.

## i18n

Every HUD/log/voice/card string touched for the item24 demo moves out of `main.ts`/`schedule.ts`
literals into `src/i18n/<locale>.ts` dictionaries (event-template strings with placeholders, BEATS
labels, VOICE lines, search/caption copy, card labels). `es.ts` (ported from the item24 work) and
`en.ts` ship in v1. A new locale is a new dictionary file, not a code change. `schedule.ts` and
`main.ts` take the active dictionary as a parameter instead of importing literals directly.

## Content grounding gate

Claude's Q&A/category generation call returns structured output including a `confidence: number`
per item, defined in the prompt as "how directly is this answer supported by the provided source
text, not inferred or guessed." Items below 0.6 are dropped before they ever reach the BrandKit.
This is a self-rating, not an independent fact-check — it catches the model flagging its own
guesses, not adversarial hallucination. If this proves too permissive in practice (fast-follow):
add a second pass that checks each answer's key claims against the source text directly.

## Export hook

New `window.kg.exportLoop(): Promise<Blob>` in `main.ts`, doing programmatically what the `E` key
already does (drive `LoopExporter`), but resolving a promise with the recorded Blob instead of
depending on a keypress. The existing `<a download>` mechanism stays for interactive/manual use;
this is an additive hook, not a replacement. **Needs a spike before the plan commits to it**:
confirm MediaRecorder actually produces a valid WebM under headless Chromium (Playwright) without
extra launch flags — this was asserted based on Playwright's documented `acceptDownloads` handling
of the existing download-triggered flow, not independently verified for the *headless-encoding*
part specifically.

## Repo boundary

`design-system` is not published to a registry and these are two independent git repos — there is
no live cross-repo package dependency in v1. Instead: **vendor and adapt**, not import. The
scrape/palette-extraction/Q&A-generation logic is copied into
`tools/generate-demo/vendor/` in this repo, with a header comment naming the source file and
commit it was ported from. If reuse expands beyond these two consumers later, promoting the vendored
code to a real published package is a follow-up, not a v1 requirement.

This means v1 makes **no changes to `design-system` at all** — it only reads from it once, at
port time, as a reference implementation. See "Surfacing this in the DAM" below for the separate
question of whether this capability should later become part of the DAM itself.

## Locale conflicts, reruns, and preview hygiene

- **`--locale` vs. detected site language.** If the operator passes an explicit `--locale` that
  differs from what the scrape detects, Claude generates in the *requested* locale, translating
  from the scraped source language rather than refusing — the prompt says so explicitly. `auto`
  (the default) always uses the detected language.
- **Reruns are deterministic by design** (`seed = hash(company)`), which means a bad first draft
  can't be fixed by just running the same command again — structure and layout will be identical.
  `--seed-variant <n>` (default 0) salts the hash for an intentional do-over without changing the
  company slug or overwriting the first draft's kit file.
- **Preview deployments accumulate.** Every run creates a new, un-aliased Vercel preview and none
  are cleaned up automatically. Fine for occasional use; if this gets used often, pruning stale
  `generate-demo` previews is a fast-follow, not a v1 requirement.

## Surfacing this in the DAM

The user's original ask was to add this *to the DAM*. What's specified above is a self-contained
CLI in `knowledge-graph-animation` that vendors DAM logic for reference — it does not touch
`design-system`, and running it does not make this capability visible or usable from inside the
DAM itself. That's a deliberate v1 scope cut (confirmed in the "tool location" decision above), not
an oversight, but it means the original ask isn't fully done at the end of this plan.

Making it actually part of the DAM — e.g. a new render mode alongside the existing prospect-mockup
generator, wired into the DAM's governance/QC/sharing routes so a generated demo goes through the
same review path as other prospect assets — is real, separate work: a different repo, its own
Linear team (`DSX-<n>`, per `design-system/CONTRIBUTING.md`), its own branch/PR/CI/deploy workflow.
It is not something to fold into this repo's implementation plan silently.

**Recommendation:** ship v1 as scoped here, then open a `DSX` issue for "surface the knowledge-graph
generator in the DAM" as explicit, separately-planned follow-up work — most naturally scoped once
v1's actual output quality (palette algorithm, grounding gate) has been validated against a couple
of real prospects, so the DAM integration is designed around a proven pipeline rather than a
theoretical one. Whether that follow-up is done in this same session/lane-style workflow or handed
to whoever owns `design-system` day-to-day is the user's call, not something to assume either way.

## Risks

- **Fabricated-sounding answers reaching a prospect.** Mitigated by the grounding gate, but it's a
  self-rating, not ground truth — flagged above as a fast-follow candidate if it proves too loose.
- **Headless MediaRecorder encoding unverified in headless Chromium** — spike required, noted above.
- **Thin/blocked prospect sites** produce a hard pipeline failure (by design, goal above) rather
  than degraded output — expect this to happen often enough that "supply content manually" needs
  to be a documented, easy fallback path, not just an error message.
- **Scraping etiquette** (robots.txt, rate limiting) is inherited from the DAM's existing scraper
  and assumed already handled there — not independently verified in this spec.
- **Vendored code drifts from the DAM's original** over time since it's a copy, not a live
  dependency — acceptable for v1, called out so it isn't a surprise later.

## Testing / validation plan

- Palette algorithm: unit tests against known brand hexes (including the achromatic/extreme
  fallback branch) asserting hue relationships and the background-contrast check.
- Structural randomization: assert two different seeds at the same density produce different
  hub/cluster counts, and the same seed is reproducible.
- Grounding gate: unit test with a fixture Claude response mixing high/low-confidence items,
  asserting the filter and the "fail if too few survive" threshold.
- End-to-end: run the full pipeline against item24's actual URL and diff the output against this
  session's hand-built demo as a sanity check — it won't match exactly (that's expected; hand-tuning
  happened), but category names, palette family, and Q&A tone should be recognizably in the
  neighborhood.
- Export hook: the headless-encoding spike above, run before the implementation plan treats
  `exportLoop()` as a solved piece.
