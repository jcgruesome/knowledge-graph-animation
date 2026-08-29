import { Color } from 'three';
import type { Graph, GraphNode } from './graph';

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

/** Lifted violet so it survives additive blending on Deep Space. */
export const VIOLET_HALO = PALETTE.enterpriseViolet.clone().lerp(PALETTE.hotMagenta, 0.22).lerp(PALETTE.white, 0.28);

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

