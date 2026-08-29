import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { PALETTE } from './palette';
import type { Color } from 'three';

export const DEFAULT_TINT = PALETTE.white.clone().lerp(PALETTE.cyberBlue, 0.6);

const TRAIL = 36;

const vertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  uniform float uFocus;
  uniform float uFocusRange;
  varying float vAlpha;
  varying float vCoc;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = -mv.z;
    float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
    vCoc = coc;
    vAlpha = aAlpha;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (1.0 + coc * 2.0) * (220.0 / max(depth, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCoc;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = length(c);
    if (d > 1.0) discard;
    float core = exp(-d * d * 18.0);
    float glow = exp(-d * d * 4.0) * 0.5;
    vec3 col = mix(vec3(1.0), vColor, 0.25) * core + vColor * glow;
    float a = (core + glow) * vAlpha / (1.0 + vCoc * 3.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Traveling data signals rendered as short trails: each signal contributes TRAIL points
 * sampled at slightly earlier parameter values along its path.
 */
export class SignalField {
  readonly points: Points;
  private readonly pos: BufferAttribute;
  private readonly alpha: BufferAttribute;
  private readonly size: BufferAttribute;
  private readonly color: BufferAttribute;
  private readonly capacity: number;
  private cursor = 0;
  private readonly material: ShaderMaterial;

  constructor(maxSignals: number) {
    this.capacity = maxSignals * TRAIL;
    const geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.alpha = new BufferAttribute(new Float32Array(this.capacity), 1);
    this.size = new BufferAttribute(new Float32Array(this.capacity), 1);
    this.pos.setUsage(35048);
    this.alpha.setUsage(35048);
    this.size.setUsage(35048);
    this.color = new BufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.color.setUsage(35048);
    geo.setAttribute('aColor', this.color);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aSize', this.size);
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uPixelRatio: { value: 1 },
        uFocus: { value: 40 },
        uFocusRange: { value: 26 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  begin(): void {
    this.cursor = 0;
  }

  /**
   * Emit a signal along `path(u, out)` at head parameter `u` (0..1). `trailLen` is the
   * parameter distance covered by the trail.
   */
  emit(path: (u: number, out: Vector3) => Vector3, u: number, strength: number, trailLen: number, tint: Color = DEFAULT_TINT): void {
    if (this.cursor + TRAIL > this.capacity) return;
    const p = this.pos.array as Float32Array;
    const c = this.color.array as Float32Array;
    const a = this.alpha.array as Float32Array;
    const s = this.size.array as Float32Array;
    const tmp = new Vector3();
    for (let k = 0; k < TRAIL; k++) {
      const f = k / (TRAIL - 1);
      const uu = u - f * trailLen;
      const i = this.cursor + k;
      if (uu < 0) {
        a[i] = 0;
        s[i] = 0;
        continue;
      }
      path(uu, tmp);
      c[i * 3] = tint.r;
      c[i * 3 + 1] = tint.g;
      c[i * 3 + 2] = tint.b;
      p[i * 3] = tmp.x;
      p[i * 3 + 1] = tmp.y;
      p[i * 3 + 2] = tmp.z;
      const fade = (1 - f) * (1 - f);
      a[i] = strength * (k === 0 ? 1.4 : fade * 0.55);
      s[i] = (k === 0 ? 2.6 : 1.9 * (1 - f) + 0.4) * (0.7 + strength * 0.5);
    }
    this.cursor += TRAIL;
  }

  commit(pixelRatio: number, focus: number): void {
    const a = this.alpha.array as Float32Array;
    for (let i = this.cursor; i < this.capacity; i++) a[i] = 0;
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.size.needsUpdate = true;
    this.color.needsUpdate = true;
    this.material.uniforms.uPixelRatio!.value = pixelRatio;
    this.material.uniforms.uFocus!.value = focus;
  }
}
