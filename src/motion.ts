import { smoothstep } from './schedule';

/** Leaves rest in a tight bud at this fraction of the way from hub to final position. */
export const BUD = 0.32;
export const UNFURL_DUR = 1.15;

/** 1 while the graph is open, folding back to 0 during the recede (17.4 → 19.6 s). */
export function foldFactor(t: number): number {
  return smoothstep(19.6, 17.4, t);
}

/** Spring-damped ease with a little overshoot: the flower snaps open and settles. */
export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const y = x - 1;
  return 1 + c3 * y * y * y + c1 * y * y;
}

/** 0 = bud, 1 = fully unfurled. Hubs and roots pass -Infinity and stay put. */
export function unfurl(start: number, t: number): number {
  if (start === -Infinity) return 1;
  if (!Number.isFinite(start)) return 0;
  const age = t - start;
  if (age <= 0) return 0;
  const x = Math.min(1, age / UNFURL_DUR);
  return easeOutBack(x) * foldFactor(t);
}

/** GLSL twin of the functions above. Keep in sync. */
export const UNFURL_GLSL = /* glsl */ `
  const float BUD = ${BUD.toFixed(3)};
  const float UNFURL_DUR = ${UNFURL_DUR.toFixed(3)};
  float foldFactor(float t) { return smoothstep(19.6, 17.4, t); }
  float easeOutBack(float x) {
    float c1 = 1.70158; float c3 = c1 + 1.0; float y = x - 1.0;
    return 1.0 + c3 * y * y * y + c1 * y * y;
  }
  float unfurl(float start, float t) {
    if (start < -1.0e8) return 1.0;
    if (start > 1.0e8) return 0.0;
    float age = t - start;
    if (age <= 0.0) return 0.0;
    float x = min(1.0, age / UNFURL_DUR);
    return easeOutBack(x) * foldFactor(t);
  }
  vec3 unfurlPos(vec3 finalPos, vec3 anchor, float start, float t) {
    vec3 bud = mix(anchor, finalPos, BUD);
    return mix(bud, finalPos, unfurl(start, t));
  }
  // Heartbeat: a wave travelling outward from the root along the structure.
  float heartbeat(float dist, float age, float strength) {
    if (age < 0.0) return 0.0;
    float r = age * 42.0;
    return exp(-pow((dist - r) / 5.0, 2.0)) * strength * exp(-age * 0.9);
  }
`;
