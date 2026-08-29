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

## Controls

- **Click** a node: route a new query to it (inbound signal, impact, one-hop ripple)
- **Drag** or **arrow keys**: orbit · **Shift + drag/arrows** (or right-drag): pan · **Scroll**: zoom
- Any camera input takes over from the cinematic path; after 6 idle seconds it eases back. **C** returns it immediately
- **Space**: pause · **R**: restart loop · **H**: toggle HUD
- Console: `kg.seek(seconds)`, `kg.pause(bool)` for frame capture

## Architecture

| File | Role |
| --- | --- |
| `src/graph.ts` | Seeded hierarchical graph modeled on real ReshapeX knowledge graphs: a catalog root with a radial fan of 58 category hubs, each carrying a phyllotaxis "flower" of SKU leaves with fine sibling webbing; a violet documents system joined by bridges; a 430-node long-tail sunflower disc. Hub positions settle via constrained repulsion on a shell; positions cached in `localStorage`. |
| `src/schedule.ts` | Deterministic choreography: query lands on the root, six hero spokes draw and their flowers bloom inner-ring-out, a radial sweep wakes the rest, bridges carry the signal to documents and the long tail (spiral index), return traffic converges, one answer leaves. Also emits the run-log events and region labels. Everything is a pure function of loop time, so the loop is exact. |
| `src/nodes.ts` | Instanced billboard nodes with custom shader: dormant steel points, white-hot core + cyan/green halo, fake depth of field. |
| `src/edges.ts` | Hairline filament shader: draw-progress head, persistent glow, traveling pulse. |
| `src/signals.ts` | Data signals as short trails driven by a 0..1 path parameter. |
| `src/atmosphere.ts` | Deep-space backdrop with haze, cluster atmospheric fields, dust. |
| `src/cameraRig.ts` | Camera on closed splines (push, glide, recede), pointer parallax, drag look. |
| `src/main.ts` | Scene, post (bloom, ACES, vignette, grain, SMAA), interaction, HUD, projected region labels, run log. |

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

