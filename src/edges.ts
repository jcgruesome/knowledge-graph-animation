import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  Mesh,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { Graph } from './graph';
import { haloColor, PALETTE } from './palette';
import { ACTIVATION_GLSL, UNFURL_GLSL } from './motion';

const SPOKE_SEGMENTS = 10;
const TEX_W = 2048;

const vertex = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute vec3 aAnchorA;
  attribute vec3 aAnchorB;
  attribute vec2 aStartAB;     // unfurl starts of the two endpoints
  attribute vec2 aSideT;       // x: side (-1/+1), y: which end (0 = A, 1 = B)
  attribute vec2 aTAB;         // edge parameter at A and at B
  attribute vec4 aMeta;        // edgeId, hero, weight, dist-from-root
  attribute vec3 aColor;
  attribute vec2 aTiming;      // edge draw start, duration

  uniform float uLoopT;
  uniform float uHeartAge;
  uniform float uHeartStrength;
  uniform vec2 uViewport;      // device pixels
  uniform float uPixelRatio;
  uniform float uDensityGain;
  uniform sampler2D uDynamic;  // per-edge: r = boost glow, g = pulse position (-1 none)
  uniform vec2 uDynamicSize;

  varying vec3 vColor;
  varying float vT;
  varying float vSide;
  varying vec3 vState;
  varying float vHero;
  varying float vWeight;
  varying float vDepthFade;
  varying float vBeat;
  varying float vIntensity;

  ${UNFURL_GLSL}
  ${ACTIVATION_GLSL}

  void main() {
    float edgeId = aMeta.x;
    vHero = aMeta.y;
    vWeight = aMeta.z;
    vColor = aColor;
    vSide = aSideT.x;
    vT = mix(aTAB.x, aTAB.y, aSideT.y);
    vBeat = heartbeat(aMeta.w, uHeartAge, uHeartStrength);

    vec2 uv = (vec2(mod(edgeId, uDynamicSize.x), floor(edgeId / uDynamicSize.x)) + 0.5) / uDynamicSize;
    vec4 dyn = texture2D(uDynamic, uv);
    vec2 st = edgeState(aTiming.x, aTiming.y, uLoopT);
    float progress = dyn.r > 0.0 ? 1.0 : st.x;
    float glow = max(st.y, dyn.r * 1.3);
    vState = vec3(progress, glow, dyn.g);

    vec3 pA = unfurlPos(aPosA, aAnchorA, aStartAB.x, uLoopT);
    vec3 pB = unfurlPos(aPosB, aAnchorB, aStartAB.y, uLoopT);
    vec4 cA = projectionMatrix * modelViewMatrix * vec4(pA, 1.0);
    vec4 cB = projectionMatrix * modelViewMatrix * vec4(pB, 1.0);
    vec4 cThis = mix(cA, cB, aSideT.y);
    vec2 nA = cA.xy / max(abs(cA.w), 1.0e-4);
    vec2 nB = cB.xy / max(abs(cB.w), 1.0e-4);
    vec2 dir = (nB - nA) * uViewport;
    float len = length(dir);
    dir = len > 1.0e-4 ? dir / len : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);

    // Glass strand width in pixels: hairline when dormant, a little fuller when lit.
    float lit = glow * step(vT, progress);
    float widthPx = (2.4 + lit * (vHero > 0.5 ? 3.0 : mix(0.8, 2.0, vWeight))) * uPixelRatio;
    vIntensity = 4.2 * uPixelRatio * uDensityGain / widthPx; // conserve energy as the strand widens
    cThis.xy += normal * (widthPx / uViewport) * cThis.w * aSideT.x;

    float depth = -(modelViewMatrix * vec4(mix(pA, pB, aSideT.y), 1.0)).z;
    vDepthFade = smoothstep(320.0, 45.0, depth);
    gl_Position = cThis;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec3 uSteel;
  uniform vec3 uBlue;
  uniform vec3 uGreen;

  varying vec3 vColor;
  varying float vT;
  varying float vSide;
  varying vec3 vState;
  varying float vHero;
  varying float vWeight;
  varying float vDepthFade;
  varying float vBeat;
  varying float vIntensity;

  void main() {
    float progress = vState.x;
    float glow = vState.y;
    float pulse = vState.z;

    // Cross-section: soft bright core with a faint rim, light inside a glass fibre.
    float x = clamp(abs(vSide), 0.0, 1.0);
    float core = pow(max(1.0 - x, 0.0), 1.6);
    float rim = smoothstep(0.55, 0.95, x) * (1.0 - smoothstep(0.95, 1.0, x)) * 0.35;
    float profile = core + rim;

    float dormant = mix(0.014, 0.065, vWeight);
    vec3 col = uSteel * dormant;
    float alpha = dormant;

    float drawn = step(vT, progress);
    float head = exp(-pow((progress - vT) * 22.0, 2.0)) * step(progress, 0.999);
    vec3 lit = vHero > 0.5 ? mix(uBlue, uGreen, 0.35) : vColor;
    float lineA = drawn * glow * (vHero > 0.5 ? 0.55 : mix(0.07, 0.2, vWeight));
    lineA *= 1.0 + vBeat * 2.2 * step(0.999, progress);
    float headA = head * glow * mix(0.3, 1.6, vWeight);
    col += lit * lineA + vec3(1.0) * headA;
    alpha += lineA + headA;

    if (pulse >= 0.0) {
      float dp = vT - pulse;
      float p = exp(-pow(dp * 26.0, 2.0)) + 0.55 * exp(-pow(max(-dp, 0.0) * 9.0, 2.0)) * step(dp, 0.0);
      col += (vec3(1.0) * 0.7 + vColor * 0.5) * p * 1.8;
      alpha += p * 1.8;
    }

    float k = vDepthFade * profile * vIntensity;
    vec4 outc = vec4(col * k, alpha * k);
    if (any(isnan(outc)) || any(isinf(outc))) outc = vec4(0.0);
    gl_FragColor = outc;
  }
`;

/**
 * Glass-strand filaments: each segment is a screen-space ribbon (two triangles) with a soft
 * core and faint rim. Root→hub spokes are gently curved and split into segments. Draw state
 * is evaluated on the GPU from the schedule; only interactions and pulses come from the CPU,
 * through a small per-edge data texture.
 */
export class EdgeField {
  readonly mesh: Mesh;
  /** +1 means the edge parameter runs a->b, -1 means b->a */
  readonly orientation: Int8Array;
  private readonly material: ShaderMaterial;
  private readonly dynamic: DataTexture;
  private readonly dynamicData: Float32Array;
  private readonly touched: number[] = [];

  constructor(graph: Graph, edgeFrom: Uint8Array, edgeStart: Float32Array, edgeDur: Float32Array, unfurlStart: Float32Array, densityGain = 1) {
    const m = graph.edges.length;
    const isSpoke = (i: number): boolean => {
      const e = graph.edges[i]!;
      const ka = graph.nodes[e.a]!.kind;
      const kb = graph.nodes[e.b]!.kind;
      return !e.hero && (ka === 2 || kb === 2) && ka !== 0 && kb !== 0;
    };
    let segCount = 0;
    for (let i = 0; i < m; i++) segCount += isSpoke(i) ? SPOKE_SEGMENTS : 1;
    const vCount = segCount * 4;

    const posA = new Float32Array(vCount * 3);
    const posB = new Float32Array(vCount * 3);
    const anchorA = new Float32Array(vCount * 3);
    const anchorB = new Float32Array(vCount * 3);
    const startAB = new Float32Array(vCount * 2);
    const sideT = new Float32Array(vCount * 2);
    const tAB = new Float32Array(vCount * 2);
    const meta = new Float32Array(vCount * 4);
    const color = new Float32Array(vCount * 3);
    const timing = new Float32Array(vCount * 2);
    const index = new Uint32Array(segCount * 6);
    this.orientation = new Int8Array(m);

    const pos = graph.positions;
    const anchorOf = (id: number): number => {
      const nd = graph.nodes[id]!;
      const parent = graph.parent[id]!;
      return parent >= 0 && nd.kind !== 1 && nd.kind !== 2 ? parent : id;
    };
    const field = (id: number) => haloColor(graph, { ...graph.nodes[id]!, kind: 0 });
    const up = new Vector3(0, 1, 0);
    const pf = new Vector3();
    const pt = new Vector3();
    const ctrl = new Vector3();
    const tmpA = new Vector3();
    const tmpB = new Vector3();
    const finite = (v: number): number => (Number.isFinite(v) ? v : v > 0 ? 1e9 : -1e9);

    let seg = 0;
    graph.edges.forEach((e, i) => {
      const from = edgeFrom[i] === 0 ? e.a : e.b;
      const to = edgeFrom[i] === 0 ? e.b : e.a;
      this.orientation[i] = edgeFrom[i] === 0 ? 1 : -1;
      pf.set(pos[from * 3]!, pos[from * 3 + 1]!, pos[from * 3 + 2]!);
      pt.set(pos[to * 3]!, pos[to * 3 + 1]!, pos[to * 3 + 2]!);
      const c = field(e.a);
      const c2 = field(e.b);
      const col = [(c.r + c2.r) / 2, (c.g + c2.g) / 2, (c.b + c2.b) / 2];
      const segs = isSpoke(i) ? SPOKE_SEGMENTS : 1;
      const root = graph.clusters[graph.nodes[from]!.cluster]!.center;
      ctrl.copy(pf).lerp(pt, 0.5);
      if (segs > 1) {
        tmpA.copy(pt).sub(pf);
        ctrl.add(tmpB.crossVectors(tmpA, up).normalize().multiplyScalar(tmpA.length() * 0.07));
      }
      const at = (u: number, out: Vector3): Vector3 => {
        const w = 1 - u;
        return out.set(
          w * w * pf.x + 2 * w * u * ctrl.x + u * u * pt.x,
          w * w * pf.y + 2 * w * u * ctrl.y + u * u * pt.y,
          w * w * pf.z + 2 * w * u * ctrl.z + u * u * pt.z,
        );
      };
      const aFrom = anchorOf(from);
      const aTo = anchorOf(to);
      const sFrom = finite(unfurlStart[from]!);
      const sTo = finite(unfurlStart[to]!);
      const eStart = finite(edgeStart[i]!);
      const eDur = edgeDur[i]!;

      for (let k = 0; k < segs; k++) {
        const u0 = k / segs;
        const u1 = (k + 1) / segs;
        at(u0, tmpA);
        at(u1, tmpB);
        const endA = k === 0;
        const endB = k === segs - 1;
        const aa = endA ? [pos[aFrom * 3]!, pos[aFrom * 3 + 1]!, pos[aFrom * 3 + 2]!] : [tmpA.x, tmpA.y, tmpA.z];
        const ab = endB ? [pos[aTo * 3]!, pos[aTo * 3 + 1]!, pos[aTo * 3 + 2]!] : [tmpB.x, tmpB.y, tmpB.z];
        const stA = endA ? sFrom : -1e9;
        const stB = endB ? sTo : -1e9;
        const distMid = Math.hypot((tmpA.x + tmpB.x) / 2 - root[0], (tmpA.y + tmpB.y) / 2 - root[1], (tmpA.z + tmpB.z) / 2 - root[2]);
        for (let v = 0; v < 4; v++) {
          const vi = seg * 4 + v;
          const side = v % 2 === 0 ? -1 : 1;
          const end = v < 2 ? 0 : 1;
          posA.set([tmpA.x, tmpA.y, tmpA.z], vi * 3);
          posB.set([tmpB.x, tmpB.y, tmpB.z], vi * 3);
          anchorA.set(aa, vi * 3);
          anchorB.set(ab, vi * 3);
          startAB.set([stA, stB], vi * 2);
          sideT.set([side, end], vi * 2);
          tAB.set([u0, u1], vi * 2);
          meta.set([i, e.hero ? 1 : 0, e.weight, distMid], vi * 4);
          color.set(col, vi * 3);
          timing.set([eStart, eDur], vi * 2);
        }
        const b = seg * 4;
        index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], seg * 6);
        seg++;
      }
    });

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(posA, 3));
    geo.setAttribute('aPosA', new BufferAttribute(posA, 3));
    geo.setAttribute('aPosB', new BufferAttribute(posB, 3));
    geo.setAttribute('aAnchorA', new BufferAttribute(anchorA, 3));
    geo.setAttribute('aAnchorB', new BufferAttribute(anchorB, 3));
    geo.setAttribute('aStartAB', new BufferAttribute(startAB, 2));
    geo.setAttribute('aSideT', new BufferAttribute(sideT, 2));
    geo.setAttribute('aTAB', new BufferAttribute(tAB, 2));
    geo.setAttribute('aMeta', new BufferAttribute(meta, 4));
    geo.setAttribute('aColor', new BufferAttribute(color, 3));
    geo.setAttribute('aTiming', new BufferAttribute(timing, 2));
    geo.setIndex(new BufferAttribute(index, 1));
    geo.boundingSphere = null;

    const texH = Math.max(1, Math.ceil(m / TEX_W));
    this.dynamicData = new Float32Array(TEX_W * texH * 4);
    for (let i = 0; i < TEX_W * texH; i++) this.dynamicData[i * 4 + 1] = -1;
    this.dynamic = new DataTexture(this.dynamicData, TEX_W, texH, RGBAFormat, FloatType);
    this.dynamic.needsUpdate = true;

    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uSteel: { value: PALETTE.steel },
        uBlue: { value: PALETTE.cyberBlue },
        uGreen: { value: PALETTE.electricGreen },
        uLoopT: { value: 0 },
        uHeartAge: { value: -1 },
        uHeartStrength: { value: 0 },
        uViewport: { value: new Vector2(1, 1) },
        uPixelRatio: { value: 1 },
        uDensityGain: { value: densityGain },
        uDynamic: { value: this.dynamic },
        uDynamicSize: { value: new Vector2(TEX_W, texH) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Clear last frame's dynamic overrides. Call once per frame before setBoost/setPulse. */
  begin(): void {
    for (const i of this.touched) {
      this.dynamicData[i * 4] = 0;
      this.dynamicData[i * 4 + 1] = -1;
    }
    this.touched.length = 0;
  }

  setBoost(i: number, boost: number): void {
    this.dynamicData[i * 4] = Math.max(this.dynamicData[i * 4]!, boost);
    this.touched.push(i);
  }

  setPulse(i: number, pulse: number): void {
    this.dynamicData[i * 4 + 1] = pulse;
    this.touched.push(i);
  }

  commit(loopT: number, heartAge: number, heartStrength: number, viewportW: number, viewportH: number, pixelRatio: number): void {
    this.dynamic.needsUpdate = true;
    const u = this.material.uniforms;
    u.uLoopT!.value = loopT;
    u.uHeartAge!.value = heartAge;
    u.uHeartStrength!.value = heartStrength;
    (u.uViewport!.value as Vector2).set(viewportW * pixelRatio, viewportH * pixelRatio);
    u.uPixelRatio!.value = pixelRatio;
  }
}
