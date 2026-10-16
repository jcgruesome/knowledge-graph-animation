# Screensaver (macOS + Windows) design

Status: draft, pending approval. Branch `feat/screensaver`.

## Intent

Turn the "Signal becomes intelligence" knowledge-graph animation into a real, installable
screensaver for macOS and Windows. It must show the same concept as the real product (a customer
question lands on a catalog graph, is grounded, cross-validated, and resolves to one verified
answer) while containing **no real customer data**: every graph, color, SKU, family name and query
is synthetic and re-rolled.

Audiences, in order of build: (1) internal team laptops and trade-show booth machines, (2) later,
a free download for prospects. Prospect-facing distribution is out of scope for this pass.

## Goals

- A macOS `.saver` and a Windows `.scr` that install and appear in the OS screensaver settings
  (macOS: System Settings > Screen Saver; Windows: Screen Saver Settings), run after idle, and
  exit on input.
- Each run looks different: new graph seed and topology, new palette, new SKUs, families and
  queries. The loop keeps feeling fresh over hours on a booth screen.
- Visually unmistakably ReshapeX: same cinematic look and choreography.

## Non-goals

- No web-facing screensaver mode; the website and `pnpm dev` behavior do not change.
- No code signing, notarization or SmartScreen reputation work in this pass. Builds are unsigned
  and for internal testing. Signing (Apple Developer ID, Windows code-signing cert) is a
  follow-up once the owner has the accounts.
- No prospect download page, installer UX polish, auto-update, or telemetry.
- No audio. Screensavers are silent.
- No configuration UI (the `.scr` `/c` flag and macOS options sheet show a trivial "no options"
  state).

## Anti-goals (a failure even if it technically works)

- Any real customer name or real customer SKU/part number appears anywhere in the shipped
  bundle: strings, kit data, labels, query rotation, or logs. This includes the current default
  rotation in `src/queries.ts` and `src/i18n/en.ts` catalog names, which derive from a real case
  study (Novanta part numbers QC-11, VG10, etc.). Those defaults must NOT ship in the bundle.
- A palette that leaves the ReshapeX family (see Palette).
- A screensaver that burns CPU/GPU hot at idle, ignores the OS preview pane, or fails to quit on
  mouse movement or key press.

## Constraints and existing assets

- The animation is a Vite + Three.js + `postprocessing` WebGL app. `src/main.ts` builds the whole
  scene once at module load (top-level await): graph, palette, schedule, kit. There is no live
  rebuild path.
- A `BrandKit` mechanism already exists (`src/brandkit.ts`, `?kit=<slug>` loads
  `/kits/<slug>.json`) and overrides locale, palette, queries, logo, seed and hub names.
  `buildPalette(kit.palette)` and `deriveGraphPalette` (`src/generator/palette-algorithm.ts`)
  already derive a graph-legible palette from one hex.
- Randomness is deterministic from a seed (`src/random.ts`, mulberry32).
- pnpm only. Fail fast: no silent fallbacks (if kit generation or WebGL init fails, the
  screensaver exits with an error, it does not fall back to the real-data defaults).

## Design

### 1. Synthetic kit generator (shared, in this repo)

A pure, seeded function `generateSyntheticKit(seed): BrandKit` in `src/screensaver/`, built on
the existing `BrandKit` type. It composes from curated word banks written for this feature
(never derived from real customers):

- company: fictional name. The real ReshapeX logo (`public/reshapex-logo.svg`, a marketing asset) stays visible; the owner asked for it.
- palette: one brand hue drawn from a bounded set of ReshapeX-family hues, then
  `deriveGraphPalette` (existing). Deep Space background stays. Constraint set by owner:
  "keep the ReshapeX palette family".
- catalog family names, doc hub names, SKUs (fictional prefix + number patterns, checked
  against a denylist of known real part-number prefixes), fictional robot/equipment names, and
  question/answer templates in English.
- graph seed passed through to `buildGraph(seed, density)` so topology varies.

A unit test asserts: deterministic for a seed; output passes `parseBrandKit`; no string matches
the denylist (real customer names, real SKU patterns incl. QC-11 and VG10); palette hues stay
inside the allowed ReshapeX-family range.

### 2. Bundle-only entry point

A second Vite entry (`screensaver.html` + `src/screensaver/main.ts`) that, at startup, generates a
random seed, builds a synthetic kit, and hands it to the existing scene code in place of the
`?kit=` fetch. `src/main.ts` is refactored minimally so the kit can be injected rather than only
fetched. The default web entry behaves exactly as today. Runs fullscreen with no HUD, no search
box, no controls legend, no audio.

Re-roll cadence: because the scene builds once, a fresh roll means a page reload. The host
reloads the view with a new seed every 3 loops (about 60 s) with a quick fade to black, and on
every screensaver activation. (Builder's call on the exact N and fade.)

### 3. macOS host

A Swift `ScreenSaverView` subclass in a `.saver` bundle hosting a `WKWebView` that loads the
bundled `screensaver.html` from the bundle's resources. Handles animateOneFrame, preview
(`isPreview`) with reduced density, and multi-display (one view per screen, distinct seeds).
Built with `xcodebuild`, unsigned, installed by double-click or copy to
`~/Library/Screen Savers`.

Known risk: recent macOS versions run third-party screensavers in a sandboxed legacy host
(`legacyScreenSaver`) with quirks around WKWebView, file access and process lifetime. The builder
must verify on the macOS version in use here and document any workaround; first spike this in
isolation before building the rest.

### 4. Windows host

A `.scr` (a renamed `.exe`) that implements the Windows screensaver contract: `/s` run fullscreen,
`/p <hwnd>` render into the preview window, `/c` show a "no options" dialog; exit on mouse move
(with a small threshold) or key press; one window per monitor. Rendering is a WebView2 host
loading the bundled local build. Builder chooses between a small native C#/.NET or C++ WebView2
host (preferred, small) and an Electron wrapper (fallback, larger download). The Windows build
cannot be produced or tested on this Mac: use a Windows VM or CI runner (GitHub Actions
`windows-latest`) and treat Windows verification as a separate, explicit step.

### 5. Build and layout

- `pnpm build:screensaver` builds the web bundle; `pnpm package:mac` produces the `.saver`;
  `pnpm package:win` produces the `.scr` (CI only if no local Windows).
- Hosts live in `screensaver/mac/` and `screensaver/win/`. Artifacts land in a gitignored
  `dist-screensaver/`.
- README gets a short "Screensaver" section: build, install, uninstall, known limitations (unsigned).

## Verification

- `pnpm test` and `pnpm build` pass, including the new generator tests.
- Web entry (`pnpm dev`) is visually unchanged.
- Headless check of `screensaver.html` via Playwright: renders, no console errors, three
  different seeds give different palettes and labels, no denylisted strings in the DOM or bundle
  (grep of `dist-screensaver`).
- macOS: install the `.saver`, confirm it appears in System Settings, preview pane works,
  fullscreen run after idle, quits on input, GPU use is sane at idle.
- Windows: same checklist on a Windows machine or VM. Explicitly reported as verified or not.

## Left to the builder

Exact word banks and hue range (within the family), re-roll interval and fade, WebView2 host
language, density per target (preview vs fullscreen), and frame-rate cap for battery.

## Owner calls recorded

Real screensaver install, not a launcher app. Downloads only, no web mode. Skip signing until
internally tested (no paid Apple Developer account yet). No real customer names or SKUs. Keep
the ReshapeX palette family.

## My calls (flag if wrong)

- Silent. Per-activation plus per-3-loops re-roll via reload. English only for the synthetic
  rotation. Native WebView2 host preferred over Electron. Fictional company names (not displayed).

## Builder-check resolutions (my calls, flag if wrong)

- **Fonts:** self-host Hanken Grotesk and Newsreader (both SIL OFL) inside the bundle; no network
  at runtime. Fail fast if a font fails to load rather than showing system-ui.
- **Scrub scope:** the screensaver entry must not statically import `src/queries.ts` defaults,
  the real `en.ts` catalog/doc names, `es.ts`, or the seven-language voice rotation. `main.ts` may
  be refactored so dictionary, voices and queries are injected via the kit. The web entry must
  look and behave the same; it need not be byte-identical. English only. A grep of the built
  bundle must pass.
- **Palette source:** hue bounds come from the ReshapeX tokens in
  `/Users/james/Projects/reshape/design-system/DESIGN.md` (Cyber Blue, Electric Green, Enterprise
  Violet and Blue families), not a guess.
- **Reload and audio:** the fade to black is host-driven (the host paints black while the view
  reloads). The screensaver entry never initializes `src/audio.ts` or the sound hint.
- **Spike failure:** if WKWebView under `legacyScreenSaver` is not viable on this macOS, stop and
  report. No fallback approach is pre-approved.
- **Build environment:** macOS 27.0.1, arm64 (build arm64 only for internal testing). Full Xcode
  is NOT installed (only Command Line Tools), so `xcodebuild` fails. Plan: assemble the `.saver`
  bundle with `swiftc` and a hand-written `Info.plist`, or install Xcode; decide at the spike.

## Owner answers (2026-10-16)

- **Denylist:** no owner-supplied list. The generator uses only fictional names. The test denylist
  is derived from real strings already in this repo (Novanta, QC-11, VG10 and the other part
  numbers and brands in `src/queries.ts`, `src/i18n/*`, kits and docs).
- **Done means macOS done.** Windows is built (host plus CI build of the `.scr`) and handed to a
  teammate to test; Windows verification is not a gate for this pass. Report it as unverified.
