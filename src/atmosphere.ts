import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { Graph } from './graph';
import { PALETTE, VIOLET_HALO } from './palette';
import { Random } from './random';

/** Deep-space backdrop: graphite gradient with restrained volumetric haze. */
export function createBackdrop(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uDeep: { value: PALETTE.deepSpace },
      uSlate: { value: PALETTE.slate },
      uViolet: { value: PALETTE.enterpriseViolet },
      uBlue: { value: PALETTE.enterpriseBlue },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uDeep; uniform vec3 uSlate; uniform vec3 uViolet; uniform vec3 uBlue; uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float n = mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        return n;
      }
      void main() {
        vec3 d = vDir;
        float haze = noise(d * 2.2 + uTime * 0.01) * 0.6 + noise(d * 5.0 - uTime * 0.007) * 0.4;
        float center = smoothstep(0.35, 1.0, -d.z);
        vec3 col = uDeep * 0.55;
        col += uSlate * 0.22 * center * haze;
        col += uViolet * 0.16 * haze * smoothstep(-0.3, 0.6, d.y);
        col += uBlue * 0.06 * haze * smoothstep(0.2, -0.7, d.y);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(300, 32, 24), mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Faint colored atmospheric fields at cluster centers. Not bubbles: soft, additive, low alpha. */
export class ClusterFields {
  readonly points: Points;
  private readonly alpha: BufferAttribute;

  constructor(graph: Graph) {
    const n = graph.clusters.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const tints: Record<number, Color> = {
      0: PALETTE.electricGreen,
      1: PALETTE.cyberBlue,
      2: VIOLET_HALO.clone().lerp(PALETTE.enterpriseViolet, 0.3),
    };
    graph.clusters.forEach((c, i) => {
      pos.set(c.center, i * 3);
      const tint = tints[c.tint] as Color;
      col.set([tint.r, tint.g, tint.b], i * 3);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(col, 3));
    this.alpha = new BufferAttribute(new Float32Array(n), 1);
    this.alpha.setUsage(35048);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aAlpha;
        uniform float uPixelRatio;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 26.0 * uPixelRatio * (220.0 / max(-mv.z, 1.0)) * 7.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord * 2.0 - 1.0);
          if (d > 1.0) discard;
          float a = exp(-d * d * 3.2) * vAlpha * 0.17;
          gl_FragColor = vec4(vColor * a, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
  }

  set(i: number, a: number): void {
    (this.alpha.array as Float32Array)[i] = a;
  }

  commit(pixelRatio: number): void {
    this.alpha.needsUpdate = true;
    (this.points.material as ShaderMaterial).uniforms.uPixelRatio!.value = pixelRatio;
  }
}

/** Micro layer: sparse dust for depth and parallax. */
export function createDust(seed: number, count: number): Points {
  const rng = new Random(seed ^ 0x51ed270b);
  const pos = new Float32Array(count * 3);
  const seedAttr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng.gaussian() * 50;
    pos[i * 3 + 1] = rng.gaussian() * 30;
    pos[i * 3 + 2] = rng.gaussian() * 45 - 10;
    seedAttr[i] = rng.next();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new BufferAttribute(seedAttr, 1));
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uSteel: { value: PALETTE.steel } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.11 + aSeed * 40.0) * 0.6;
        p.x += cos(uTime * 0.09 + aSeed * 23.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = -mv.z;
        vA = (0.35 + 0.65 * fract(aSeed * 7.0)) * smoothstep(300.0, 40.0, depth) * (0.6 + 0.4 * sin(uTime * 0.8 + aSeed * 90.0));
        gl_PointSize = (1.2 + aSeed * 1.6) * uPixelRatio * (140.0 / max(depth, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float; uniform vec3 uSteel; varying float vA;
      void main() {
        float d = length(gl_PointCoord * 2.0 - 1.0);
        if (d > 1.0) discard;
        float a = exp(-d * d * 6.0) * vA * 0.16;
        gl_FragColor = vec4(uSteel * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
