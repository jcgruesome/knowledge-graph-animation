import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3 } from 'three';
import type { Graph } from './graph';
import { haloColor, PALETTE } from './palette';
import { UNFURL_GLSL } from './motion';

const SPOKE_SEGMENTS = 10;

const vertex = /* glsl */ `
  attribute float aT;
  attribute vec3 aState; // progress, glow, pulse position (-1 = none)
  attribute float aHero;
  attribute float aWeight;
  attribute vec3 aColor;
  attribute float aStart;
  attribute vec3 aAnchor;
  attribute float aDist;

  uniform float uLoopT;
  uniform float uHeartAge;
  uniform float uHeartStrength;

  varying vec3 vColor;
  varying float vT;
  varying vec3 vState;
  varying float vHero;
  varying float vWeight;
  varying float vDepthFade;
  varying float vBeat;

  ${UNFURL_GLSL}

  void main() {
    vT = aT;
    vWeight = aWeight;
    vColor = aColor;
    vState = aState;
    vHero = aHero;
    vBeat = heartbeat(aDist, uHeartAge, uHeartStrength);
    vec3 p = unfurlPos(position, aAnchor, aStart, uLoopT);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepthFade = smoothstep(320.0, 45.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec3 uSteel;
  uniform vec3 uBlue;
  uniform vec3 uGreen;

  varying vec3 vColor;
  varying float vT;
  varying vec3 vState;
  varying float vHero;
  varying float vWeight;
  varying float vDepthFade;
  varying float vBeat;

  void main() {
    float progress = vState.x;
    float glow = vState.y;
    float pulse = vState.z;

    float dormant = mix(0.012, 0.05, vWeight);
    vec3 col = uSteel * dormant;
    float alpha = dormant;

    float drawn = step(vT, progress);
    float head = exp(-pow((progress - vT) * 22.0, 2.0)) * step(progress, 0.999);
    vec3 lit = vHero > 0.5 ? mix(uBlue, uGreen, 0.35) : vColor;
    float lineA = drawn * glow * (vHero > 0.5 ? 0.4 : mix(0.05, 0.14, vWeight));
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

    alpha *= vDepthFade;
    gl_FragColor = vec4(col * vDepthFade, alpha);
  }
`;

/**
 * Hairline filaments. Root→hub spokes are gently curved (a dandelion stem, not a pin
 * cushion) and split into segments; everything else is a single segment. Leaf endpoints
 * unfurl with their flower in the vertex shader.
 */
export class EdgeField {
  readonly lines: LineSegments;
  private readonly state: BufferAttribute;
  private readonly start: BufferAttribute;
  /** direction sign per edge: +1 means aT runs a->b, -1 means b->a */
  readonly orientation: Int8Array;
  /** first vertex index and vertex count per edge */
  private readonly vOffset: Uint32Array;
  private readonly vCount: Uint32Array;
  private readonly material: ShaderMaterial;

  constructor(graph: Graph, edgeFrom: Uint8Array) {
    const m = graph.edges.length;
    const isSpoke = (i: number): boolean => {
      const e = graph.edges[i]!;
      return !e.hero && (graph.nodes[e.a]!.kind === 2 || graph.nodes[e.b]!.kind === 2) && graph.nodes[e.a]!.kind !== 0 && graph.nodes[e.b]!.kind !== 0;
    };
    let totalVerts = 0;
    this.vOffset = new Uint32Array(m);
    this.vCount = new Uint32Array(m);
    for (let i = 0; i < m; i++) {
      this.vOffset[i] = totalVerts;
      this.vCount[i] = (isSpoke(i) ? SPOKE_SEGMENTS : 1) * 2;
      totalVerts += this.vCount[i]!;
    }

    const pos = new Float32Array(totalVerts * 3);
    const t = new Float32Array(totalVerts);
    const hero = new Float32Array(totalVerts);
    const weight = new Float32Array(totalVerts);
    const color = new Float32Array(totalVerts * 3);
    const startArr = new Float32Array(totalVerts).fill(-Infinity);
    const anchor = new Float32Array(totalVerts * 3);
    const dist = new Float32Array(totalVerts);
    this.orientation = new Int8Array(m);

    const P = (id: number): Vector3 => new Vector3(graph.positions[id * 3]!, graph.positions[id * 3 + 1]!, graph.positions[id * 3 + 2]!);
    const anchorOf = (id: number): number => {
      const nd = graph.nodes[id]!;
      const parent = graph.parent[id]!;
      return parent >= 0 && nd.kind !== 1 && nd.kind !== 2 ? parent : id;
    };
    const field = (id: number): { r: number; g: number; b: number } => haloColor(graph, { ...graph.nodes[id]!, kind: 0 });
    const tmp = new Vector3();
    const up = new Vector3(0, 1, 0);

    graph.edges.forEach((e, i) => {
      const from = edgeFrom[i] === 0 ? e.a : e.b;
      const to = edgeFrom[i] === 0 ? e.b : e.a;
      this.orientation[i] = edgeFrom[i] === 0 ? 1 : -1;
      const pf = P(from);
      const pt = P(to);
      const c = field(e.a);
      const c2 = field(e.b);
      const cr = (c.r + c2.r) / 2;
      const cg = (c.g + c2.g) / 2;
      const cb = (c.b + c2.b) / 2;
      const segs = this.vCount[i]! / 2;
      const rootCenter = graph.clusters[graph.nodes[from]!.cluster]!.center;

      // Quadratic control point for curved spokes: midpoint pushed sideways, consistently
      // around the root so the fan reads as a gentle swirl.
      const ctrl = pf.clone().lerp(pt, 0.5);
      if (segs > 1) {
        const v = tmp.copy(pt).sub(pf);
        const lateral = new Vector3().crossVectors(v, up).normalize().multiplyScalar(v.length() * 0.07);
        ctrl.add(lateral);
      }
      const at = (u: number, out: Vector3): Vector3 => {
        const w = 1 - u;
        return out.set(
          w * w * pf.x + 2 * w * u * ctrl.x + u * u * pt.x,
          w * w * pf.y + 2 * w * u * ctrl.y + u * u * pt.y,
          w * w * pf.z + 2 * w * u * ctrl.z + u * u * pt.z,
        );
      };
      const a0 = anchorOf(from);
      const a1 = anchorOf(to);
      for (let sIdx = 0; sIdx < segs; sIdx++) {
        for (let k = 0; k < 2; k++) {
          const vi = this.vOffset[i]! + sIdx * 2 + k;
          const u = (sIdx + k) / segs;
          at(u, tmp);
          pos.set([tmp.x, tmp.y, tmp.z], vi * 3);
          t[vi] = u;
          hero[vi] = e.hero ? 1 : 0;
          weight[vi] = e.weight;
          color.set([cr, cg, cb], vi * 3);
          // Endpoint vertices inherit their node's anchor so leaf ends move with the flower.
          const node = u < 0.5 ? from : to;
          const anc = u < 0.5 ? a0 : a1;
          anchor.set([graph.positions[anc * 3]!, graph.positions[anc * 3 + 1]!, graph.positions[anc * 3 + 2]!], vi * 3);
          dist[vi] = Math.hypot(tmp.x - rootCenter[0], tmp.y - rootCenter[1], tmp.z - rootCenter[2]);
          void node;
        }
      }
    });

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aT', new BufferAttribute(t, 1));
    geo.setAttribute('aHero', new BufferAttribute(hero, 1));
    geo.setAttribute('aWeight', new BufferAttribute(weight, 1));
    geo.setAttribute('aColor', new BufferAttribute(color, 3));
    geo.setAttribute('aAnchor', new BufferAttribute(anchor, 3));
    geo.setAttribute('aDist', new BufferAttribute(dist, 1));
    this.start = new BufferAttribute(startArr, 1);
    geo.setAttribute('aStart', this.start);
    this.state = new BufferAttribute(new Float32Array(totalVerts * 3), 3);
    this.state.setUsage(35048);
    geo.setAttribute('aState', this.state);

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
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.lines = new LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
  }

  /** Per-node unfurl starts → per-vertex, by which node each vertex belongs to. */
  setUnfurl(graph: Graph, edgeFrom: Uint8Array, starts: Float32Array): void {
    const arr = this.start.array as Float32Array;
    graph.edges.forEach((e, i) => {
      const from = edgeFrom[i] === 0 ? e.a : e.b;
      const to = edgeFrom[i] === 0 ? e.b : e.a;
      const n = this.vCount[i]!;
      for (let k = 0; k < n; k++) {
        const u = (Math.floor(k / 2) + (k % 2)) / (n / 2);
        arr[this.vOffset[i]! + k] = starts[u < 0.5 ? from : to]!;
      }
    });
    this.start.needsUpdate = true;
  }

  set(i: number, progress: number, glow: number, pulse: number): void {
    const arr = this.state.array as Float32Array;
    const o = this.vOffset[i]!;
    const n = this.vCount[i]!;
    for (let k = 0; k < n; k++) {
      arr[(o + k) * 3] = progress;
      arr[(o + k) * 3 + 1] = glow;
      arr[(o + k) * 3 + 2] = pulse;
    }
  }

  commit(loopT: number, heartAge: number, heartStrength: number): void {
    this.state.needsUpdate = true;
    const u = this.material.uniforms;
    u.uLoopT!.value = loopT;
    u.uHeartAge!.value = heartAge;
    u.uHeartStrength!.value = heartStrength;
  }
}
