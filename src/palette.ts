import { Color } from 'three';
import type { Graph, GraphNode } from './graph';

/**
 * item24 demo palette. UI chrome uses the literal item24 tokens (see index.html); the
 * graph itself is recolored to warm, item-adjacent hues rather than a literal
 * red/black/white treatment, so activation still reads clearly against deep space.
 * Root pulses brand red; the two catalog systems split into a coral and a deeper
 * maroon; stakes stay a pink-red; the one final answer lifts to amber/gold, which
 * still pops against a red-dominant scene the way volt yellow popped against blue.
 */
export const PALETTE = {
  deepSpace: new Color('#120F0E'),
  slate: new Color('#221D1B'),
  steel: new Color('#9A8F8C'),
  cyberBlue: new Color('#FF5A3C'),
  enterpriseBlue: new Color('#B0000A'),
  electricGreen: new Color('#E30613'),
  enterpriseViolet: new Color('#7A0D14'),
  hotMagenta: new Color('#FF1F5A'),
  voltYellow: new Color('#FFC233'),
  white: new Color('#FFFFFF'),
} as const;

/** Enterprise maroon lifted toward white (no hue change) so it survives additive blending. */
export const VIOLET_HALO = PALETTE.enterpriseViolet.clone().lerp(PALETTE.white, 0.3);

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

