import { Color } from 'three';
import type { Graph, GraphNode } from './graph';
import type { GraphPalette } from './generator/palette-algorithm';

/** ReshapeX design tokens (design-system/DESIGN.md). Marketing mode: dark and vivid. */
export const PALETTE = {
  deepSpace: new Color('#0D1117'),
  slate: new Color('#1C2128'),
  steel: new Color('#8B9AAD'),
  cyberBlue: new Color('#00D9FF'),
  enterpriseBlue: new Color('#005C90'),
  electricGreen: new Color('#73B400'),
  enterpriseViolet: new Color('#340090'),
  hotMagenta: new Color('#FF006E'),
  voltYellow: new Color('#FFE500'),
  white: new Color('#FFFFFF'),
} as const;

/** Enterprise Violet lifted toward white (no hue change) so it survives additive blending. */
export const VIOLET_HALO = PALETTE.enterpriseViolet.clone().lerp(PALETTE.white, 0.3);

/**
 * Applies a BrandKit's GraphPalette onto the shared PALETTE/VIOLET_HALO singletons in place
 * (mutating each Color's channels, never reassigning), so every module that already imported
 * PALETTE/VIOLET_HALO by reference sees the override. Call before any scene object that reads
 * these colors is constructed. With no override, today's hardcoded ReshapeX values stand as-is.
 *
 * Mapping (see task-3 brief): brand -> electricGreen, clusterA -> cyberBlue, clusterB ->
 * enterpriseViolet (VIOLET_HALO recomputed from it), stakes -> hotMagenta, answer -> voltYellow,
 * background -> deepSpace and slate, steel -> steel. `white` and `enterpriseBlue` are never
 * overridden; there is no BrandKit field for them.
 */
export function buildPalette(override?: GraphPalette): typeof PALETTE {
  if (!override) return PALETTE;
  PALETTE.electricGreen.set(override.brand);
  PALETTE.cyberBlue.set(override.clusterA);
  PALETTE.enterpriseViolet.set(override.clusterB);
  PALETTE.hotMagenta.set(override.stakes);
  PALETTE.voltYellow.set(override.answer);
  PALETTE.deepSpace.set(override.background);
  PALETTE.slate.set(override.background);
  PALETTE.steel.set(override.steel);
  VIOLET_HALO.copy(PALETTE.enterpriseViolet).lerp(PALETTE.white, 0.3);
  return PALETTE;
}

/**
 * Halo color per node. Green = root, magenta = stakes (bridge endpoints: uncertain, routed to a human),
 * lifted field color = category hub, violet or cyan = the system's field.
 */
export function haloColor(graph: Graph, node: GraphNode): Color {
  if (node.kind === 2) return PALETTE.electricGreen;
  if (node.kind === 3) return PALETTE.hotMagenta;
  const field = graph.clusters[node.cluster]!.tint === 2 ? VIOLET_HALO : PALETTE.cyberBlue;
  if (node.kind === 1) return field.clone().lerp(PALETTE.white, 0.35);
  return field;
}

