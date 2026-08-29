import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial } from 'three';
import type { Graph } from './graph';
import { haloColor, PALETTE } from './palette';

const vertex = /* glsl */ `
  attribute float aT;
  attribute vec3 aState; // progress, glow, pulse position (-1 = none)
  attribute float aHero;
  attribute float aWeight;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vT;
  varying vec3 vState;
  varying float vHero;
  varying float vWeight;
  varying float vDepthFade;

  void main() {
    vT = aT;
    vWeight = aWeight;
    vColor = aColor;
    vState = aState;
    vHero = aHero;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
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

  void main() {
    float progress = vState.x;
    float glow = vState.y;
    float pulse = vState.z;

    // Dormant filament: almost invisible.
    float dormant = mix(0.012, 0.05, vWeight);
    vec3 col = uSteel * dormant;
    float alpha = dormant;

    // Drawing head: a bright bead leading the filament, then the line stays lit.
    float drawn = step(vT, progress);
    float head = exp(-pow((progress - vT) * 22.0, 2.0)) * step(progress, 0.999);
    vec3 lit = vHero > 0.5 ? mix(uBlue, uGreen, 0.35) : vColor;
    float lineA = drawn * glow * (vHero > 0.5 ? 0.4 : mix(0.05, 0.14, vWeight));
    float headA = head * glow * mix(0.3, 1.6, vWeight);
    col += lit * lineA + vec3(1.0) * headA;
    alpha += lineA + headA;

    // Traveling pulse (white energy with a short tail).
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

export class EdgeField {
  readonly lines: LineSegments;
  private readonly state: BufferAttribute;
  /** direction sign per edge: +1 means aT runs a->b, -1 means b->a */
  readonly orientation: Int8Array;

  constructor(graph: Graph, edgeFrom: Uint8Array) {
    const m = graph.edges.length;
    const pos = new Float32Array(m * 6);
    const t = new Float32Array(m * 2);
    const hero = new Float32Array(m * 2);
    const color = new Float32Array(m * 6);
    const weight = new Float32Array(m * 2);
    this.orientation = new Int8Array(m);
    graph.edges.forEach((e, i) => {
      // Vertex 0 is the endpoint that draws first.
      const from = edgeFrom[i] === 0 ? e.a : e.b;
      const to = edgeFrom[i] === 0 ? e.b : e.a;
      this.orientation[i] = edgeFrom[i] === 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        pos[i * 6 + k] = graph.positions[from * 3 + k] as number;
        pos[i * 6 + 3 + k] = graph.positions[to * 3 + k] as number;
      }
      t[i * 2] = 0;
      t[i * 2 + 1] = 1;
      hero[i * 2] = hero[i * 2 + 1] = e.hero ? 1 : 0;
      weight[i * 2] = weight[i * 2 + 1] = e.weight;
      // Filament takes the field color of its endpoints; hubs and stakes nodes do not tint edges.
      const field = (id: number) => {
        const nd = graph.nodes[id]!;
        return haloColor(graph, { ...nd, kind: 0 });
      };
      const c = field(e.a).clone().lerp(field(e.b), 0.5);
      color.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aT', new BufferAttribute(t, 1));
    geo.setAttribute('aHero', new BufferAttribute(hero, 1));
    geo.setAttribute('aColor', new BufferAttribute(color, 3));
    geo.setAttribute('aWeight', new BufferAttribute(weight, 1));
    this.state = new BufferAttribute(new Float32Array(m * 6), 3);
    this.state.setUsage(35048);
    geo.setAttribute('aState', this.state);

    const mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uSteel: { value: PALETTE.steel },
        uBlue: { value: PALETTE.cyberBlue },
        uGreen: { value: PALETTE.electricGreen },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.lines = new LineSegments(geo, mat);
    this.lines.frustumCulled = false;
  }

  /** progress/glow/pulse for edge i; pulse in draw-direction parameter space, -1 for none */
  set(i: number, progress: number, glow: number, pulse: number): void {
    const arr = this.state.array as Float32Array;
    arr[i * 6] = progress;
    arr[i * 6 + 1] = glow;
    arr[i * 6 + 2] = pulse;
    arr[i * 6 + 3] = progress;
    arr[i * 6 + 4] = glow;
    arr[i * 6 + 5] = pulse;
  }

  commit(): void {
    this.state.needsUpdate = true;
  }
}
