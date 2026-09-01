export interface RatedItem<T> {
  item: T;
  confidence: number;
}

export class GroundingGateError extends Error {}

export function applyGroundingGate<T>(
  items: RatedItem<T>[],
  opts: { threshold?: number; minSurvivors: number },
): T[] {
  const threshold = opts.threshold ?? 0.6;
  const survivors = items.filter((r) => r.confidence >= threshold).map((r) => r.item);
  if (survivors.length < opts.minSurvivors) {
    throw new GroundingGateError(
      `Content grounding gate: only ${survivors.length} of ${items.length} items cleared confidence ${threshold}, need at least ${opts.minSurvivors}. Supply content manually instead.`,
    );
  }
  return survivors;
}
