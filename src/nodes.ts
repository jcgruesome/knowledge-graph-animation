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

const vertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aKind;
  attribute float aSeed;
  attribute float aAct;
  attribute vec3 aHalo;

  uniform float uTime;
  uniform float uFocus;
  uniform float uFocusRange;

  varying vec2 vUv;
  varying float vAct;
  varying float vKind;
  varying float vCoc;
  varying float vSeed;
  varying float vDepthFade;
  varying vec3 vHalo;

  void main() {
    vUv = uv;
    vHalo = aHalo;
    vAct = aAct;
    vKind = aKind;
    vSeed = aSeed;

    // Dormant nodes float almost imperceptibly; awake nodes are still.
    vec3 p = aOffset;
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
    float breathe = 1.0 + (0.07 * sin(uTime * 1.3 + aSeed * 6.2831) + flicker) * min(aAct, 1.0);
    float awake = 1.0 + 1.9 * min(aAct, 1.6);
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
  private readonly material: ShaderMaterial;

  constructor(graph: Graph) {
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
    this.act = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.act.setUsage(35048); // DynamicDrawUsage
    geo.setAttribute('aAct', this.act);
    geo.boundingSphere = null;

    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
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

  get activation(): Float32Array {
    return this.act.array as Float32Array;
  }

  commit(time: number, focus: number): void {
    this.act.needsUpdate = true;
    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uFocus!.value = focus;
  }

  positionOf(graph: Graph, id: number, out: Vector3): Vector3 {
    return out.set(
      graph.positions[id * 3] as number,
      graph.positions[id * 3 + 1] as number,
      graph.positions[id * 3 + 2] as number,
    );
  }
}
