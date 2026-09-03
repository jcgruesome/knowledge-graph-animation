export interface RatedItem<T> {
  item: T;
  confidence: number;
}

export class GroundingGateError extends Error {}

/**
 * Returns the surviving `RatedItem`s intact — item *and* confidence — so callers never have to
 * re-pair a survivor with its rating by index. Filtering shifts indices, so an index into the
 * original array is not a valid handle on a survivor.
 */
export function applyGroundingGate<T>(
  items: RatedItem<T>[],
  opts: { threshold?: number; minSurvivors: number },
): RatedItem<T>[] {
  const threshold = opts.threshold ?? 0.6;
  const survivors = items.filter((r) => r.confidence >= threshold);
  if (survivors.length < opts.minSurvivors) {
    throw new GroundingGateError(
      `Content grounding gate: only ${survivors.length} of ${items.length} items cleared confidence ${threshold}, need at least ${opts.minSurvivors}. Supply content manually instead.`,
    );
  }
  return survivors;
}
