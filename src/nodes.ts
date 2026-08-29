import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Graph } from './graph';
import { haloColor, PALETTE } from './palette';
import { ACTIVATION_GLSL, UNFURL_GLSL } from './motion';

const vertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aKind;
  attribute float aSeed;
  attribute float aBoost;
  attribute float aIgnite;
  attribute vec3 aHalo;
  attribute float aStart;
  attribute vec3 aAnchor;
  attribute float aDist;

  uniform float uTime;
  uniform float uLoopT;
  uniform float uHeartAge;
  uniform float uHeartStrength;
  uniform float uFocus;
  uniform float uFocusRange;

  varying vec2 vUv;
  varying float vAct;
  varying float vKind;
  varying float vCoc;
  varying float vSeed;
  varying float vDepthFade;
  varying vec3 vHalo;

  ${UNFURL_GLSL}
  ${ACTIVATION_GLSL}

  void main() {
    vUv = uv;
    vHalo = aHalo;
    float aAct = max(nodeActivation(aIgnite, uLoopT), aBoost);
    float beat = heartbeat(aDist, uHeartAge, uHeartStrength) * step(0.05, aAct);
    vAct = aAct + beat * 0.9;
    vKind = aKind;
    vSeed = aSeed;

    // Dormant nodes float almost imperceptibly; awake nodes are still.
    vec3 p = unfurlPos(aOffset, aAnchor, aStart, uLoopT);
    float drift = (1.0 - min(aAct, 1.0)) * 0.12;
    p.x += sin(uTime * 0.21 + aSeed * 12.0) * drift;
    p.y += sin(uTime * 0.17 + aSeed * 31.0) * drift;
    p.z += cos(uTime * 0.19 + aSeed * 7.0) * drift;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;

    // Fake depth of field: out-of-focus points grow and dim.
    float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
    vCoc = coc;
    vDepthFade = smoothstep(320.0, 50.0, depth);

    float flicker = aKind < 0.5 ? 0.05 * sin(uTime * 6.0 + aSeed * 80.0) * sin(uTime * 2.3 + aSeed * 17.0) : 0.0;
    float breathe = 1.0 + (0.07 * sin(uTime * 1.3 + aSeed * 6.2831) + flicker) * min(vAct, 1.0);
    float awake = 1.0 + 1.9 * min(vAct, 1.6);
    bool isRoot = aKind > 1.5 && aKind < 2.5;
    float haloKind = isRoot ? 1.9 : (aKind > 0.5 ? 1.2 : 1.0);
    float size = aSize * (0.26 + 0.2 * awake) * breathe * haloKind * (1.0 + coc * 2.2);

    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec3 uSteel;
  uniform vec3 uBlue;
  uniform vec3 uGreen;
  uniform float uTime;

  varying vec2 vUv;
  varying float vAct;
  varying float vKind;
  varying float vCoc;
  varying float vSeed;
  varying float vDepthFade;
  varying vec3 vHalo;

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float d = length(c);
    if (d > 1.0) discard;

    float act = min(vAct, 1.8);
    float a1 = min(act, 1.0);

    // Dormant: a tiny dim steel point.
    float dormantCore = exp(-d * d * 14.0) + 0.35 * exp(-d * d * 3.0);
    vec3 dormant = uSteel * 0.9 * dormantCore;

    // Awake: white-hot core, colored halo, soft outer field.
    vec3 halo = vHalo;
    bool isRoot = vKind > 1.5 && vKind < 2.5;
    float coreK = isRoot ? 0.7 : 0.85;
    float core = exp(-d * d * 34.0) * (coreK + 0.9 * max(act - 1.0, 0.0));
    float ring = exp(-d * d * 6.0) * 1.0;
    float field = exp(-d * 3.0) * 0.38;
    vec3 coreCol = isRoot ? mix(vec3(1.0), uGreen, 0.55) : (vKind > 2.5 ? mix(vec3(1.0), vHalo, 0.35) : vec3(1.0));
    vec3 awake = coreCol * core + halo * (ring + field) * (1.1 + 0.5 * max(act - 1.0, 0.0));

    vec3 col = dormant * (1.0 - a1 * 0.7) + awake * a1;
    float alpha = (dormantCore * 0.8 * (1.0 - a1 * 0.7) + (core + ring + field) * a1);
    alpha *= vDepthFade / (1.0 + vCoc * 3.4);
    alpha *= smoothstep(1.0, 0.75, d);

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export class NodeField {
  readonly mesh: Mesh;
  private readonly act: InstancedBufferAttribute;
  private readonly start: InstancedBufferAttribute;
  private readonly material: ShaderMaterial;

  constructor(graph: Graph, igniteStart: Float32Array) {
    const n = graph.nodes.length;
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = n;

    const size = new Float32Array(n);
    const kind = new Float32Array(n);
    const seed = new Float32Array(n);
    const halo = new Float32Array(n * 3);
    graph.nodes.forEach((nd, i) => {
      const c = haloColor(graph, nd);
      halo[i * 3] = c.r;
      halo[i * 3 + 1] = c.g;
      halo[i * 3 + 2] = c.b;
      size[i] = nd.size;
      kind[i] = nd.kind;
      seed[i] = nd.seed;
    });
    geo.setAttribute('aOffset', new InstancedBufferAttribute(graph.positions, 3));
    geo.setAttribute('aSize', new InstancedBufferAttribute(size, 1));
    geo.setAttribute('aKind', new InstancedBufferAttribute(kind, 1));
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aHalo', new InstancedBufferAttribute(halo, 3));
    const start = new Float32Array(n);
    const anchor = new Float32Array(n * 3);
    const dist = new Float32Array(n);
    graph.nodes.forEach((nd, i) => {
      start[i] = -Infinity; // set later via setUnfurl
      const parent = graph.parent[i]!;
      const a = parent >= 0 && nd.kind !== 1 && nd.kind !== 2 ? parent : i;
      anchor[i * 3] = graph.positions[a * 3]!;
      anchor[i * 3 + 1] = graph.positions[a * 3 + 1]!;
      anchor[i * 3 + 2] = graph.positions[a * 3 + 2]!;
      const root = graph.clusters[nd.cluster]!.center;
      dist[i] = Math.hypot(graph.positions[i * 3]! - root[0], graph.positions[i * 3 + 1]! - root[1], graph.positions[i * 3 + 2]! - root[2]);
    });
    this.start = new InstancedBufferAttribute(start, 1);
    geo.setAttribute('aStart', this.start);
    geo.setAttribute('aAnchor', new InstancedBufferAttribute(anchor, 3));
    geo.setAttribute('aDist', new InstancedBufferAttribute(dist, 1));
    this.act = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.act.setUsage(35048); // DynamicDrawUsage
    geo.setAttribute('aBoost', this.act);
    const ignite = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = igniteStart[i]!;
      ignite[i] = Number.isFinite(v) ? v : 1e9;
    }
    geo.setAttribute('aIgnite', new InstancedBufferAttribute(ignite, 1));
    geo.boundingSphere = null;

    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uLoopT: { value: 0 },
        uHeartAge: { value: -1 },
        uHeartStrength: { value: 0 },
        uFocus: { value: 40 },
        uFocusRange: { value: 26 },
        uSteel: { value: PALETTE.steel },
        uBlue: { value: PALETTE.cyberBlue },
        uGreen: { value: PALETTE.electricGreen },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** CPU-side boosts (interactions, pings). Scheduled activation is computed on the GPU. */
  get boost(): Float32Array {
    return this.act.array as Float32Array;
  }

  /** Per-node unfurl start times (loop seconds). -Infinity = fixed, Infinity = stays a bud. */
  setUnfurl(starts: Float32Array): void {
    (this.start.array as Float32Array).set(starts);
    this.start.needsUpdate = true;
  }

  commit(time: number, loopT: number, focus: number, heartAge: number, heartStrength: number): void {
    this.act.needsUpdate = true;
    const u = this.material.uniforms;
    u.uTime!.value = time;
    u.uLoopT!.value = loopT;
    u.uFocus!.value = focus;
    u.uHeartAge!.value = heartAge;
    u.uHeartStrength!.value = heartStrength;
  }

  positionOf(graph: Graph, id: number, out: Vector3): Vector3 {
    return out.set(
      graph.positions[id * 3] as number,
      graph.positions[id * 3 + 1] as number,
      graph.positions[id * 3 + 2] as number,
    );
  }
}
