import { LOOP, smoothstep, TIME_SCALE } from './schedule';

/** Leaves rest in a tight bud at this fraction of the way from hub to final position. */
export const BUD = 0.32;
export const UNFURL_DUR = 1.15;

const FOLD_START = 17.4 * TIME_SCALE;
const FOLD_END = 19.6 * TIME_SCALE;
const ENV_T1 = 17 * TIME_SCALE;
const ENV_T2 = 19.8 * TIME_SCALE;
const ENV_T3 = 23.2 * TIME_SCALE;

/** 1 while the graph is open, folding back to 0 during the recede. */
export function foldFactor(t: number): number {
  return smoothstep(FOLD_END, FOLD_START, t);
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

/** GLSL twin of schedule.ts activation math so the GPU evaluates the choreography. */
export const ACTIVATION_GLSL = /* glsl */ `
  const float LOOP = ${LOOP.toFixed(3)};
  float envelope(float t) {
    if (t < ${ENV_T1.toFixed(3)}) return 1.0;
    float a = 1.0 - smoothstep(${ENV_T1.toFixed(3)}, ${ENV_T2.toFixed(3)}, t) * 0.65;
    float b = 1.0 - smoothstep(${ENV_T2.toFixed(3)}, ${ENV_T3.toFixed(3)}, t);
    return a * b;
  }
  float ignition(float age) {
    if (age <= 0.0) return 0.0;
    float attack = 1.0 - exp(-age * 14.0);
    float flare = 1.0 + 1.35 * exp(-age * 3.2);
    return attack * flare;
  }
  float nodeActivation(float start, float t) {
    if (start > 1.0e8) return 0.0;
    float cur = ignition(t - start) * envelope(t);
    float res = ignition(t + LOOP - start) * envelope(t + LOOP);
    return max(cur, res);
  }
  vec2 edgeStateAt(float start, float dur, float t) {
    float age = t - start;
    if (age <= 0.0) return vec2(0.0);
    float progress = min(1.0, age / dur);
    float settle = progress >= 1.0 ? 1.0 + 0.9 * exp(-(age - dur) * 2.5) : 1.0;
    return vec2(progress, settle * envelope(t));
  }
  vec2 edgeState(float start, float dur, float t) {
    if (start > 1.0e8) return vec2(0.0);
    vec2 cur = edgeStateAt(start, dur, t);
    vec2 res = edgeStateAt(start, dur, t + LOOP);
    return cur.y >= res.y ? cur : res;
  }
`;

/** GLSL twin of the functions above. Keep in sync. */
export const UNFURL_GLSL = /* glsl */ `
  const float BUD = ${BUD.toFixed(3)};
  const float UNFURL_DUR = ${UNFURL_DUR.toFixed(3)};
  float foldFactor(float t) { return smoothstep(${FOLD_END.toFixed(3)}, ${FOLD_START.toFixed(3)}, t); }
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
