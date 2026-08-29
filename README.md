# ReshapeX × Novanta · Quick Consult graph animation

"Signal becomes intelligence." A cinematic, loopable (20 s) 3D graph-activation piece built
on the Novanta Quick Consult case study (reshapex.com/en/case-studies/quick-consult-novanta).
A customer query (robot, payload, application) lands on the end-of-arm-tooling catalog root,
grounding cascades through product families, the result is cross-validated against the
compatibility matrices, the 8.2 million valid configurations are searched, uncertain matches
route to an application engineer, and one validated part-number sequence leaves. The inbound
query rotates through Quick Consult's seven live languages each loop.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production bundle in dist/
```

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

