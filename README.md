# ReshapeX graph animation

"Signal becomes intelligence." A cinematic, loopable (20 s) 3D graph-activation piece.

A customer query (robot, payload, application) lands on the catalog root, grounding cascades
through product families, the result is cross-validated against the compatibility matrices,
the configuration space is searched, uncertain matches route to an application engineer, and
one validated part-number sequence leaves. The inbound query rotates through seven languages
each loop.

**All catalog content is illustrative.** Product families, module ids and figures are synthetic
stand-ins chosen to look plausible for industrial end-of-arm tooling. They do not represent any
customer, and no real part numbers appear. A future iteration will drive the graph from real
product data in Neo4j.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production bundle in dist/
```

## Prospect demo generator

`pnpm generate-demo --url <prospect-url> --company "<name>"` turns this animation into a
personalized demo for any company: scrapes the site, extracts a brand color and logo, generates
grounded Q&A content via Claude, derives a full graph palette algorithmically from that one brand
color, randomizes the graph's structure per company, renders an MP4 via a headless browser, and
deploys an un-aliased Vercel preview. Full design:
`docs/superpowers/specs/2026-09-01-prospect-demo-generator-design.md`.

### Prerequisites

- `pnpm dev` running in another terminal. The render step drives a headless browser against it
  (default `http://localhost:5173`, override with `--base-url`).
- `ANTHROPIC_API_KEY` exported. Q&A generation needs it; the CLI fails fast and cleanly if it's
  missing rather than scraping first and failing later.
- `ffmpeg` on `PATH`. Used to transcode the recorded WebM to MP4; checked before the browser even
  launches.
- `pnpm exec playwright install chromium`, once, for the headless render.
- A `vercel` CLI login with access to the `reshapex` team.

### Usage

```bash
pnpm generate-demo --url https://example.com --company "Example Corp"
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--url <url>` | required | prospect site to scrape |
| `--company <name>` | required | drives the slug, the seed, and the generated content |
| `--locale <es\|en\|auto>` | `auto` | `auto` detects from the scraped site's `<html lang>` |
| `--density <1\|2\|3>` | `1` | passed through to the render |
| `--seed-variant <n>` | `0` | salts the seed for an intentional do-over without changing the company slug |
| `--base-url <url>` | `http://localhost:5173` | origin of the running dev/preview server the render navigates to |

Output: `public/kits/<slug>.json` (the generated BrandKit) and `dist-demos/<slug>.mp4`, plus an
un-aliased Vercel preview URL printed at the end. Preview it locally first: `pnpm dev`, then open
`/?kit=<slug>` (add `&density=<n>` to match a non-default `--density` run).

**Sanity-check the generated palette before promoting.** The scrape adapter reads brand color from
inline styles and a `theme-color` meta tag, not computed styles from external CSS, so a prospect
whose brand color lives only in a stylesheet gets a generic fallback instead of their real color.
Compare `public/kits/<slug>.json`'s `palette.brand` against the prospect's actual site and
hand-edit it (then re-render) if they don't match. See `deriveGraphPalette` in
`src/generator/palette-algorithm.ts` for how the rest of the palette derives from that one value.

Low-confidence Q&A pairs and category labels are dropped by a grounding gate
(`tools/generate-demo/grounding-gate.ts`). If fewer than 8 Q&A pairs or 5 categories survive, the
CLI fails rather than shipping thin content. An operator supplies content manually in that case.

### Promoting to a stable URL

`pnpm generate-demo` only ever deploys an un-aliased preview. Moving a specific kit to a stable,
named Vercel project is a separate, explicitly human-invoked step:

```bash
pnpm promote-demo <slug> --project <name>
```

This links (creating first if needed) a Vercel project named `<name>` under the `reshapex` team
and deploys it to production, aliased at `https://<name>.vercel.app`. Kept separate from the main
pipeline on purpose: it's a real production deploy under a real team account.

### Troubleshooting

- **The render is taking several minutes, not under one.** Headless Chromium's software WebGL
  renderer manages roughly 3 fps; GPU acceleration (`render.ts`'s launch args) should get it to
  ~60. A slow render almost always means GPU acceleration silently failed to engage rather than
  a hung process. Worth interrupting and investigating rather than waiting it out.
- **A stray Vercel project got created.** Running `generate-demo` from a fresh checkout or worktree
  with no `.vercel/` project link makes `vercel`'s own CLI infer a project name from the directory
  and create it. On the first run this can even auto-promote to production. Always `vercel link`
  a lane deliberately before its first `generate-demo` run if you want a specific project name;
  clean up an accidental one with `printf 'y\n' | vercel project rm <name> --scope reshapex` (the
  prompt wants a literal `y`, not the project name).

## Density

`?density=1` (default, ~2k nodes, most legible) · `?density=2` (~8k) · `?density=3` (~20k nodes, ~37k
ribbon segments). The schedule (activation, draw state, unfurl) is evaluated in the vertex shaders
from per-node/per-edge start times, so the CPU does no per-node work per frame at any density; only
interactions and traveling pulses are uploaded, through a small per-edge data texture.

## Controls

- **Click** a node: route a new query to it (inbound signal, impact, one-hop ripple)
- **Drag** or **arrow keys**: orbit · **Shift + drag/arrows** (or right-drag): pan · **Scroll**: zoom
- Any camera input takes over from the cinematic path; after 6 idle seconds it eases back. **C** returns it immediately
- **Hover** a hub to light its flower
- **Click anywhere** once to unlock sound (synthesized in Web Audio, quantized to the choreography). **M** mutes
- **E** records exactly one loop (20 s, 1920×1080, 60 fps, WebM with audio). Recording starts on the second loop so the previous loop's embers are present at the seam. Convert for LinkedIn with
  `ffmpeg -i quick-consult-loop.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac quick-consult-loop.mp4`
- **Space**: pause · **R**: restart loop · **H**: toggle HUD
- Console: `kg.seek(seconds)`, `kg.pause(bool)` for frame capture

## Architecture

| File | Role |
| --- | --- |
| `src/graph.ts` | Seeded hierarchical graph modeled on real ReshapeX knowledge graphs: a catalog root with a radial fan of 58 category hubs, each carrying a phyllotaxis "flower" of SKU leaves with fine sibling webbing; a violet documents system joined by bridges; a 430-node long-tail sunflower disc. Hub positions settle via constrained repulsion on a shell; positions cached in `localStorage`. |
| `src/schedule.ts` | Deterministic choreography: query lands on the root, six hero spokes draw and their flowers bloom inner-ring-out, a radial sweep wakes the rest, bridges carry the signal to documents and the long tail (spiral index), return traffic converges, one answer leaves. Also emits the run-log events and region labels. Everything is a pure function of loop time, so the loop is exact. |
| `src/nodes.ts` | Instanced billboard nodes with custom shader: dormant steel points, white-hot core + cyan/green halo, fake depth of field. |
| `src/edges.ts` | Glass-strand ribbons: each segment is a screen-space quad with a soft core and faint rim (GL lines can't be wider than 1 px). Curved root→hub spokes. GPU-evaluated draw state; CPU pulses/boosts via data texture. |
| `src/signals.ts` | Data signals as short trails driven by a 0..1 path parameter. |
| `src/atmosphere.ts` | Deep-space backdrop with haze, cluster atmospheric fields, dust. |
| `src/cameraRig.ts` | Camera on closed splines (push, glide, recede), pointer parallax, drag look. |
| `src/motion.ts` | Unfurl math shared by CPU and GLSL: leaves rest as a bud inside their hub and spring out (ease-out-back) as the hub wakes; the graph folds back during the recede. Heartbeat wave function. |
| `src/audio.ts` | Sound design: room tone, whoosh-to-chime landing, pentatonic plucks per spoke, granular ticks per flower, convergence pad, one bell for the answer. |
| `src/volumetrics.ts` | Ray-marched single-scattering haze (22 jittered steps): a fog volume that thickens around awake systems and is lit by the root, so the god rays travel through a real medium. |
| `src/trails.ts` | Motion blur for the light layer: signals and streaks accumulate in a decaying HDR buffer (frame-rate independent, energy-conserving) composited back additively. |
| `src/export.ts` | MediaRecorder loop export with HUD composited onto the frame and audio muxed. |
| `src/main.ts` | Scene, post (god rays from the root, bloom, ACES, vignette, grain, SMAA), rack focus, anamorphic streaks, dolly-zoom on the answer, interaction, HUD, region labels, run log, typed query, decoding answer card. |

## Palette (ReshapeX design system, marketing mode)

Deep Space `#0D1117` · Steel `#8B9AAD` (dormant) · Cyber Blue `#00D9FF` (activation, blue
clusters) · Enterprise Violet `#340090` (violet clusters, lifted for additive blending; haze)
· Electric Green `#73B400` (roots) · Hot Magenta `#FF006E` (stakes: bridge endpoints, uncertain
matches routed to a human, kept sparse) · Volt Yellow `#FFE500` (one per screen: the single answer
that leaves the root) · white signal energy.

## Narrative

The three systems map to Quick Consult's data: tooling catalog (cyan dandelion), compatibility
matrices (violet), configuration space (sunflower disc). Also inspired by the "350 bots, one decision" post: everything upstream of the decision runs without
the human. The run log shows that upstream noise; the loop ends with one Volt Yellow signal
leaving the root. "A thousand streams. One decision."

