# Screensaver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unsigned macOS `.saver` (verified) and Windows `.scr` (built, handed off untested) that run the knowledge-graph animation with a fresh, fully synthetic graph, palette, SKUs and queries each run.

**Architecture:** `main.ts` imports `resolveKit`, `getDictionary` and `DEFAULT_QUERIES` from one bare specifier, `@kg/runtime` (resolved by tsconfig `paths` for typecheck and by default to `src/runtime.ts`). A second Vite config (`vite.screensaver.config.ts`) aliases that single bare name to `src/screensaver/runtime.ts`, so the real-data modules (`queries.ts`, `i18n/*`) are never imported and never enter the bundle. (Vite aliases match import text, not resolved paths, so aliasing `./queries` style relative imports would NOT work.) Thin native hosts (Swift `ScreenSaverView` + `WKWebView`; C# WebView2) serve the built folder and reload it with a new `?seed=` every 60 s and on each activation.

**Tech Stack:** TypeScript, Vite 8, Three.js, vitest, Playwright (already installed); Swift via `swiftc` (no full Xcode installed, only Command Line Tools); .NET + WebView2 for Windows; pnpm only.

**Spec:** `docs/superpowers/specs/2026-10-16-screensaver-design.md`

## Global Constraints

- pnpm only. Fail fast: no silent fallbacks. If kit generation, fonts or WebGL fail, show/throw the error; never fall back to real-data defaults.
- No real customer name or SKU anywhere in the shipped bundle (strings, kit data, labels, queries, logs), including the Novanta-derived defaults in `src/queries.ts` and `src/i18n/en.ts`; `es.ts` does not ship; English only.
- Palette stays in the ReshapeX family: hue bounds from the tokens in `/Users/james/Projects/reshape/design-system/DESIGN.md` (Cyber Blue, Electric Green, Enterprise Violet and Blue families); Deep Space background stays.
- Silent: `src/audio.ts` is never initialized. No search box, sound hint or controls legend (beat label, voice line, query card and run log stay). Web entry (`pnpm dev`, `pnpm build`) looks and behaves the same.
- Fonts self-hosted (Hanken Grotesk, Newsreader, both SIL OFL); no network at runtime.
- Unsigned builds; macOS arm64 only. No signing, notarization, download page, auto-update or telemetry.
- Re-roll: host reloads with a new seed every 3 loops (60 s) and on each activation; fade to black is host-driven.
- If the macOS spike shows WKWebView under `legacyScreenSaver` is not viable: stop and report. No fallback approach is pre-approved.
- Done = macOS verified. Windows is built and handed to a teammate, reported unverified.
- Conventional commits; end each commit message with `Claude-Session: https://claude.ai/code/session_01UrC5iwLW3LmG3bkgWzHckb`. Work only in the lane `/Users/james/Projects/reshape/knowledge-graph-animation-lanes/feat-screensaver` (run `pnpm install` there first).

## Review Focus

1. Missing, non-numeric or negative `?seed=`: must throw a visible error, not render a default (Task 2 test, Task 3 verify).
2. Seeds `0` and `4294967295`: must still yield a valid kit (passes `parseBrandKit`, non-empty names) (Task 2 test).
3. Font files fail to load: must throw, not silently show system-ui/Georgia (Task 3).
4. Preview pane (about 152x112 px, `isPreview`) and secondary displays: no errors, reduced density, distinct seed per display (Task 4).
5. Screensaver stop/wake: macOS `legacyScreenSaver` can leave the WebView and process alive; `stopAnimation` must tear the view down so GPU use returns to idle (Task 4).

## File Structure

- `src/screensaver/denylist.ts` — real-string denylist + matcher (test and bundle-grep share it).
- `src/screensaver/banks.ts` — fictional word banks (companies, families, SKU patterns, equipment, query templates).
- `src/screensaver/kit.ts` — `generateSyntheticKit`.
- `src/screensaver/dictionary.ts` — neutral synthetic `Dictionary` (no case-study copy).
- `src/screensaver/runtime.ts` — alias target for `@kg/runtime`: synthetic `resolveKit`, `getDictionary`, `DEFAULT_QUERIES = []`, local font imports, error overlay. `src/screensaver/seed.ts` — pure `parseSeed`.
- `src/runtime.ts` — default `@kg/runtime`: `resolveKit()` (existing `?kit=` behavior), re-exports `getDictionary` and `DEFAULT_QUERIES`. `main.ts` is its only importer.
- `vite.screensaver.config.ts` — aliases, local fonts, HUD hiding, output `dist-screensaver/web`.
- `tools/screensaver/verify-web.ts` — Playwright + bundle-grep verification. Add `vite.screensaver.config.ts` and `tools/screensaver` to `tsconfig.tools.json` so `pnpm build` typechecks them.
- `screensaver/mac/` — Swift host, `Info.plist`, `package.sh`. `screensaver/win/` — C# host, `.github/workflows/screensaver-win.yml`.

---

### Task 1: macOS feasibility spike (go/no-go gate)

**Files:**
- Create: `screensaver/mac/spike/` (throwaway), `docs/superpowers/specs/2026-10-16-screensaver-spike-notes.md`

**Interfaces:**
- Produces: a recorded go/no-go, the density/cap decision, and the exact working `swiftc` invocation, `Info.plist` keys, and page-loading method (expected: `WKURLSchemeHandler` serving a folder, because `type=module` scripts fail from `file://`) that Task 4 reuses.

- [ ] **Step 1:** Write a minimal `ScreenSaverView` subclass (`init?(frame:isPreview:)`, `startAnimation`, `stopAnimation`) hosting a `WKWebView` that loads a trivial local page drawing a WebGL2 canvas with a spinning triangle and a `console`-visible text of `isPreview`.
- [ ] **Step 2:** Build the `.saver` bundle with `swiftc` and a hand-written `Info.plist` (`NSPrincipalClass`, bundle id `com.reshapex.kg-screensaver`). No `xcodebuild` (not installed).
- [ ] **Step 3:** Install to `~/Library/Screen Savers`, select it in System Settings > Screen Saver, confirm the preview pane and a fullscreen run both show the triangle, and confirm it quits on input. Check Activity Monitor for orphaned `legacyScreenSaver` after exit.
- [ ] **Step 4:** Also load a built module-script page (`pnpm build` output) through the same host to prove module scripts and top-level await work via the chosen loading method.
- [ ] **Step 4b:** Measure GPU use and fps with the real build at `?density=1`, `2` and `3` (Activity Monitor GPU history, in-page fps). Record the density to ship and whether a pixel-ratio/frame cap is needed (`main.ts:67` uses `setPixelRatio(min(dpr, 2))`, `requestAnimationFrame` is uncapped at `main.ts:~942`). Also confirm: the bundle needs an ad-hoc `codesign --force --sign -` to load on Apple Silicon; `swiftc` must link a bundle (`-emit-library -Xlinker -bundle`); `NSPrincipalClass` needs a module-qualified or `@objc(Name)` class; a custom scheme handler must strip the `?seed=` query when mapping to files; `main.ts:618` loads `/reshapex-logo.svg` and must be served or its 404 tolerated.
- [ ] **Step 5:** Record in the spike notes: macOS 27.0.1 result, the working commands, quirks. If WebGL or loading is not viable: **stop and report to the owner.** Commit notes plus spike (`chore: macOS screensaver spike`).

---

### Task 2: Synthetic kit generator (TDD)

**Files:**
- Create: `src/screensaver/denylist.ts`, `src/screensaver/banks.ts`, `src/screensaver/kit.ts`, `src/screensaver/dictionary.ts`
- Test: `src/screensaver/kit.test.ts`

**Interfaces:**
- Consumes: `BrandKit`, `parseBrandKit` (`src/brandkit.ts`); `deriveGraphPalette(brandHex: string): GraphPalette` (`src/generator/palette-algorithm.ts`); `Random` (`src/random.ts`); `Dictionary` (`src/i18n/types.ts`).
- Produces: `generateSyntheticKit(seed: number): BrandKit` (locale `'en'`, `logoPath: ''`, `sourceUrl: 'synthetic'`, `seed` equal to input, `catalogNames` >= 5 entries, `queries` >= 8 with `confidence: 1`); `syntheticDictionary: Dictionary`; `REAL_DENYLIST: readonly string[]`; `findDenied(text: string): string[]` (case-insensitive, word-boundary regex matching, e.g. `\bWA-\d`; entries are high-signal tokens or full part numbers, never bare short prefixes like `ABB`/`WA-`); `generateSyntheticKit` also sets `docNames` per seed.

- [ ] **Step 1: Write failing tests** in `kit.test.ts`: `generateSyntheticKit(42)` deep-equals `generateSyntheticKit(42)`; differs from seed 43 in `palette.brand` or `catalogNames`; `parseBrandKit(generateSyntheticKit(s))` does not throw for `s` in `[0, 1, 42, 4294967295]`; `findDenied(JSON.stringify(kit) + JSON.stringify(syntheticDictionary))` equals `[]` for 200 seeds; `findDenied('Novanta QC-11 VG10')` returns all three; for 200 seeds `palette.brand`, `clusterA`, `clusterB`, `stakes` and `answer` each lie within 15 degrees of a ReshapeX anchor hue from DESIGN.md (the generator post-clamps derived colors if `deriveGraphPalette`'s rotations leave the family), and `usedFallback` is false.
- [ ] **Step 2:** Run `pnpm vitest run src/screensaver` — expect FAIL (modules missing).
- [ ] **Step 3:** Implement `denylist.ts`: build `REAL_DENYLIST` by reading real strings from `src/queries.ts`, `src/i18n/en.ts`, `src/i18n/es.ts`, `public/kits`, `tools/`, `docs/` (Novanta, QC-11, QC-7, VG10, PG-70, WA-40, CD-25, WA-, and the real robot brands/models in the default rotation). Hard-code the resulting list as a literal; no runtime file reads.
- [ ] **Step 4:** Implement `banks.ts` (fictional only, no real brand or part-number lookalikes; SKU pattern like `<3 invented letters>-<2-3 digits>`) and `kit.ts` (seeded `Random`; brand hex built from an anchor hue plus bounded hue jitter and saturation/lightness kept inside `deriveGraphPalette`'s non-fallback bounds (s >= 0.08, 0.1 <= l <= 0.9), passed to `deriveGraphPalette` then clamped) and `dictionary.ts` (copy the `en` shape with neutral, case-study-free `voice`, `events`, `labels`).
- [ ] **Step 5:** Run `pnpm vitest run src/screensaver` and `pnpm test` — expect PASS.
- [ ] **Step 6:** Commit `feat: synthetic kit generator for screensaver`.

---

### Task 3: Screensaver web build (seam, bare-specifier alias, fonts, no real data)

**Files:**
- Create: `src/runtime.ts`, `src/screensaver/runtime.ts`, `src/screensaver/seed.ts`, `vite.screensaver.config.ts`, `tools/screensaver/verify-web.ts`
- Modify: `src/main.ts:30-32` (replace the `./i18n`, `./brandkit` loader and `./queries` imports with `import { resolveKit, getDictionary, DEFAULT_QUERIES } from '@kg/runtime'`) and `src/main.ts:49-50` (`const kit = await resolveKit();`) and `src/main.ts:57-60` (when `kit.logoPath === ''` hide the `.logo` element instead of setting `src`); `tsconfig.json` (`paths: { "@kg/runtime": ["./src/runtime.ts"] }`); `tsconfig.tools.json`; `package.json` (scripts `build:screensaver`, `verify:screensaver`; devDependencies `@fontsource/hanken-grotesk`, `@fontsource/newsreader`); `.gitignore` (`dist-screensaver`)
- Test: `src/screensaver/seed.test.ts`

**Interfaces:**
- Consumes: Task 2 `generateSyntheticKit`, `syntheticDictionary`, `findDenied`.
- Produces: `parseSeed(search: string): number` (throws `Error('screensaver: missing or invalid seed')` for absent, empty, non-integer, negative, or > 4294967295; accepts `0` and `4294967295`); `@kg/runtime` exports `resolveKit(): Promise<BrandKit | null>`, `getDictionary(locale)`, `DEFAULT_QUERIES` in both the default (`src/runtime.ts`, today's `?kit=`/no-kit behavior unchanged) and screensaver (`src/screensaver/runtime.ts`) versions. Screensaver `resolveKit` imports `@fontsource/hanken-grotesk/500.css`, `600.css`, `@fontsource/newsreader/400-italic.css`, then asserts `(await document.fonts.load('500 13px "Hanken Grotesk"')).length > 0` and `(await document.fonts.load('italic 400 22px "Newsreader"')).length > 0` (empty result means missing face: throw). Screensaver runtime also installs `window.onerror` and `unhandledrejection` handlers that write the message as text onto a black page (fail fast, visible, and forwardable by hosts). Output `dist-screensaver/web/` with `base: './'`.

- [ ] **Step 1: Write failing test** (`seed.test.ts`, pure, node env): `''`, `'?seed='`, `'?seed=abc'`, `'?seed=-1'`, `'?seed=1.5'`, `'?seed=4294967296'`, `''` all throw; `'?seed=0'` returns `0`; `'?seed=4294967295'` returns `4294967295`; `'?seed=42&density=1'` returns `42`.
- [ ] **Step 2:** Run it — expect FAIL.
- [ ] **Step 3:** Implement `seed.ts`, both runtimes, and the `main.ts` seam. Typecheck must pass (`pnpm build`).
- [ ] **Step 4:** `vite.screensaver.config.ts`: `resolve.alias: { '@kg/runtime': <abs path to src/screensaver/runtime.ts> }`, `base: './'`, `build.outDir: 'dist-screensaver/web'`; a `transformIndexHtml` plugin that removes the Google Fonts `<link>`s and injects CSS `display: none` for the search box, sound hint and controls hint. The default `vite.config` path (no config file today) must keep resolving `@kg/runtime` to `src/runtime.ts`: add a minimal `vite.config.ts` with that alias (it must not change the web build output).
- [ ] **Step 5:** `verify-web.ts`: serve `dist-screensaver/web`, load with Playwright at `?seed=1`, `?seed=2`, `?seed=3`; assert no console errors, canvas present, the three kits differ (palette and labels), the DOM text and every built JS/HTML/CSS file pass `findDenied(...) === []` (exclude hashed filenames), and that a load without `?seed=` renders the visible error text. Add `pnpm verify:screensaver` = `pnpm build:screensaver && tsx tools/screensaver/verify-web.ts`.
- [ ] **Step 6:** Run `pnpm build && pnpm test && pnpm verify:screensaver` — expect PASS. Load `pnpm dev` once with Playwright and confirm the web entry still renders the original HUD and default queries.
- [ ] **Step 7:** Commit `feat: screensaver web build with synthetic kit and local fonts`.

---

### Task 4: macOS host and packaging

**Files:**
- Create: `screensaver/mac/KGScreenSaverView.swift`, `screensaver/mac/Info.plist`, `screensaver/mac/package.sh`
- Modify: `package.json` (`package:mac`: `bash screensaver/mac/package.sh`)

**Interfaces:**
- Consumes: Task 1 notes (swiftc invocation, loading method); Task 3 `dist-screensaver/web/` and its `?seed=` and `?density=` parameters.
- Produces: `dist-screensaver/ReshapeXKnowledgeGraph.saver`.

- [ ] **Step 1:** Implement `KGScreenSaverView`: copies the built web folder into the bundle's Resources; serves it via the loading method proven in Task 1; picks a fresh random `UInt32` seed per view (distinct per display); `isPreview` and fullscreen use the density (and any cap) decided in Task 1 step 4b; the scheme handler strips the query string when mapping to files; a `WKUserScript` forwards `window.onerror` text to the host log; a `Timer` every 60 s (constant mirrors `3 * LOOP` in `src/schedule.ts`, with a comment) paints the view black, reloads with a new seed, then fades in; any load or JS error is shown as text on a black view (fail fast, no fallback).
- [ ] **Step 2:** `stopAnimation` invalidates the timer and tears down the `WKWebView` so no GPU work remains; `hasConfigureSheet` returns false.
- [ ] **Step 3:** `package.sh`: runs `pnpm build:screensaver`, compiles with `swiftc` (arm64), assembles the `.saver` with the plist and web folder, ad-hoc signs it (`codesign --force --sign -`, required to load on Apple Silicon; this is still "unsigned" for distribution), and prints the install path.
- [ ] **Step 4:** Run `pnpm package:mac`, install to `~/Library/Screen Savers`, and verify with the spec checklist: appears in System Settings, preview pane animates, fullscreen after idle, quits on input, a re-roll after 60 s shows a different palette and labels, a second display (if available) differs, Activity Monitor shows GPU near idle and no orphan process after exit.
- [ ] **Step 5:** Commit `feat: macOS .saver host and packaging`.

---

### Task 5: Windows host and CI build (built, not verified)

**Files:**
- Create: `screensaver/win/` (C# .NET WebView2 project producing `ReshapeXKnowledgeGraph.scr`), `.github/workflows/screensaver-win.yml`
- Modify: `package.json` (`package:win`: documented as CI-only)

**Interfaces:**
- Consumes: Task 3 `dist-screensaver/web/`.
- Produces: a `.scr` artifact from the `windows-latest` job.

- [ ] **Step 1:** Implement the screensaver contract: `/s` fullscreen one window per monitor; `/p <hwnd>` renders into the preview window; argument parsing accepts `/s`, `-s`, `/S`, `/p <hwnd>`, `/c`, `/c:<hwnd>` and case variants; `/c` shows a "no options" message; exit on key press or mouse movement beyond a small threshold, detected by forwarding `keydown`/`pointermove` from the page via `window.chrome.webview.postMessage` (the WebView2 child window swallows parent-window input events); WebView2 user-data folder is under `%LOCALAPPDATA%\\ReshapeXKnowledgeGraph` (via `CoreWebView2Environment.CreateAsync`; the default exe-adjacent folder is unwritable in `System32`); published self-contained; each window maps the built folder with `SetVirtualHostNameToFolderMapping` and loads it with a fresh `?seed=`; same 60 s black-fade reload as macOS; errors shown as text, no fallback.
- [ ] **Step 2:** Workflow: checkout, pnpm setup, `pnpm install`, `pnpm build:screensaver`, `dotnet publish`, rename to `.scr`, upload artifact.
- [ ] **Step 3:** Confirm the job builds green on the branch. Do not claim Windows works; record "built, untested" and the checklist for the teammate (install via right-click > Install, preview pane, multi-monitor, input exit, reload).
- [ ] **Step 4:** Commit `feat: Windows .scr host and CI build`.

---

### Task 6: Docs and final verification

**Files:**
- Modify: `README.md` (new "Screensaver" section: build, install, uninstall, unsigned-install steps for Gatekeeper and SmartScreen, known limitations, Windows untested)

- [ ] **Step 1:** Write the README section (absolute minimum, no speculative features).
- [ ] **Step 2:** Run `pnpm build && pnpm test && pnpm verify:screensaver` — expect all PASS; re-grep `dist-screensaver` and the `.saver` bundle with `findDenied` — expect no matches.
- [ ] **Step 3:** Commit `docs: screensaver build and install notes`; then hand back with a short self-review (risks, gaps, elevation) before the lane ships through `wrap-lane.sh`.
