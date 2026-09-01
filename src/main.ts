import {
  AdditiveBlending,
  HalfFloatType,
  Timer,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  GodRaysEffect,
  KernelSize,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { buildGraph, type Density } from './graph';
import { getDictionary } from './i18n';
import { ANSWER, buildSchedule, LAND, LOOP, edgeState, envelope, ignition, nodeActivation } from './schedule';
import { NodeField } from './nodes';
import { EdgeField } from './edges';
import { AgentSearch } from './agentSearch';
import { SignalField } from './signals';
import { ClusterFields, createBackdrop, createDust } from './atmosphere';
import { CameraRig } from './cameraRig';
import { haloColor, PALETTE, VIOLET_HALO } from './palette';
import { LoopExporter } from './export';
import { DEFAULT_TINT } from './signals';
import { unfurl } from './motion';
import { SoundDesign } from './audio';
import { VolumetricHazeEffect } from './volumetrics';
import { OVERLAY_LAYER, TRAIL_LAYER, TrailAccumulator } from './trails';

const SEED = 20260828;

// ---------------------------------------------------------------- scene
const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#scene canvas missing');

const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(PALETTE.deepSpace, 1);

const scene = new Scene();
const rig = new CameraRig(window.innerWidth / window.innerHeight);
rig.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const camera = rig.camera;

// ?density=1|2|3 → ~2k / ~8k / ~20k nodes. The GPU evaluates the choreography, so this scales.
const densityParam = Number(new URLSearchParams(location.search).get('density') ?? '1');
const density: Density = densityParam === 2 ? 2 : densityParam === 3 ? 3 : 1;
const graph = buildGraph(SEED, density);
// `en` is the default dictionary until Task 3 wires kit-driven locale selection.
const dict = getDictionary('en');
const schedule = buildSchedule(graph, SEED, dict);

// Flowers unfurl: leaves start as a bud inside their hub and spring out as the hub wakes.
// Hubs and roots are fixed (-Infinity); leaves of hubs that never wake stay buds (Infinity).
const unfurlStart = new Float32Array(graph.nodes.length);
for (const nd of graph.nodes) {
  if (nd.kind === 1 || nd.kind === 2) {
    unfurlStart[nd.id] = -Infinity;
    continue;
  }
  const parent = graph.parent[nd.id]!;
  const hubStart = schedule.nodeStart[parent]!;
  if (!Number.isFinite(hubStart)) {
    unfurlStart[nd.id] = Infinity;
    continue;
  }
  const own = schedule.nodeStart[nd.id]!;
  const disc = graph.clusters[nd.cluster]!.shape === 'disc';
  unfurlStart[nd.id] = disc && Number.isFinite(own) ? own - 0.35 : hubStart + 0.06 + nd.rank * 0.5;
}

const sound = new SoundDesign(graph, schedule);
const nodes = new NodeField(graph, schedule.nodeStart);
nodes.setUnfurl(unfurlStart);
const edges = new EdgeField(graph, schedule.edgeFrom, schedule.edgeStart, schedule.edgeDur, unfurlStart, [1, 0.6, 0.38][density - 1]!);
rig.pathScale = [1, 1.25, 1.5][density - 1]!;
const signals = new SignalField(96);
const fields = new ClusterFields(graph);
const backdrop = createBackdrop();
const dust = createDust(SEED, 420);
scene.add(backdrop, dust, fields.points, edges.mesh, nodes.mesh, signals.points);

/** World position of a node at loop time t, accounting for unfurl. */
const anchorTmp = new Vector3();
function nodeWorldPos(id: number, t: number, out: Vector3): Vector3 {
  nodes.positionOf(graph, id, out);
  const f = unfurl(unfurlStart[id]!, t);
  if (f >= 1) return out;
  const nd = graph.nodes[id]!;
  const parent = graph.parent[id]!;
  const a = parent >= 0 && nd.kind !== 1 && nd.kind !== 2 ? parent : id;
  nodes.positionOf(graph, a, anchorTmp);
  anchorTmp.lerp(out, 0.32); // bud
  return out.copy(anchorTmp.lerp(out, f));
}

// Heartbeats: waves from the root through the awake structure. The answer is the big one.
const HEARTBEATS: Array<{ t: number; s: number }> = [
  { t: 13.4, s: 0.55 },
  { t: 15.0, s: 0.55 },
  { t: ANSWER, s: 1.0 },
];
function heartbeatAt(t: number): { age: number; strength: number } {
  let best = { age: -1, strength: 0 };
  for (const hb of HEARTBEATS) {
    const age = t - hb.t;
    if (age >= 0 && age < 3 && (best.age < 0 || age < best.age)) best = { age, strength: hb.s };
  }
  return best;
}

// Light source for god rays: a small emissive sphere at the root, scaled with its activation.
const sun = new Mesh(new SphereGeometry(0.45, 24, 16), new MeshBasicMaterial({ color: PALETTE.cyberBlue.clone().lerp(PALETTE.white, 0.45), depthWrite: false, transparent: true, opacity: 0.9 }));
sun.position.set(graph.positions[graph.coreHub * 3]!, graph.positions[graph.coreHub * 3 + 1]!, graph.positions[graph.coreHub * 3 + 2]!);
sun.scale.setScalar(0.001);
scene.add(sun);

// Anamorphic streak: a horizontal lens flare that rides the two brightest events.
function makeStreak(): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: { uColor: { value: PALETTE.white.clone() }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
        void main(){
          vec2 c = vUv * 2.0 - 1.0;
          float a = exp(-c.x * c.x * 3.0) * exp(-c.y * c.y * 60.0) * (1.0 - abs(c.x) * 0.6);
          gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.5) * a * uAlpha, a * uAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    }),
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
const streakIn = makeStreak();
const streakOut = makeStreak();

// Motion blur: signals and streaks render through a decaying HDR buffer.
const trails = new TrailAccumulator(window.innerWidth, window.innerHeight);
signals.points.layers.set(TRAIL_LAYER);
streakIn.layers.set(TRAIL_LAYER);
streakOut.layers.set(TRAIL_LAYER);
scene.add(trails.overlay);
camera.layers.enable(OVERLAY_LAYER);
camera.layers.enable(TRAIL_LAYER);
/** widthMul lets a flash grow outward on impact rather than sitting at a fixed size. */
function placeStreak(mesh: Mesh, at: Vector3, alpha: number, color: typeof PALETTE.white, widthMul = 1): void {
  mesh.visible = alpha > 0.01;
  if (!mesh.visible) return;
  const d = camera.position.distanceTo(at);
  mesh.position.copy(at);
  mesh.quaternion.copy(camera.quaternion);
  mesh.scale.set(d * 0.3 * widthMul, d * 0.02 * (0.5 + widthMul * 0.5), 1);
  const mat = mesh.material as ShaderMaterial;
  mat.uniforms.uAlpha!.value = alpha;
  (mat.uniforms.uColor!.value as typeof PALETTE.white).copy(color);
}

// ---------------------------------------------------------------- impact ring
const ring = new Mesh(
  new PlaneGeometry(1, 1),
  new ShaderMaterial({
    uniforms: { uProgress: { value: 1 }, uColor: { value: PALETTE.cyberBlue } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform float uProgress; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float d = length(vUv * 2.0 - 1.0);
        float r = 0.15 + uProgress * 0.8;
        float w = 0.03 + uProgress * 0.06;
        float a = exp(-pow((d - r) / w, 2.0)) * (1.0 - uProgress) * (1.0 - uProgress) * 1.4;
        gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.5) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }),
);
ring.frustumCulled = false;
ring.visible = false;
scene.add(ring);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({
  intensity: 1.35,
  luminanceThreshold: 0.12,
  luminanceSmoothing: 0.5,
  mipmapBlur: true,
  radius: 0.82,
  levels: 7,
});
const vignette = new VignetteEffect({ offset: 0.22, darkness: 0.62 });
const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
noise.blendMode.opacity.value = 0.18;
// Neutral (Khronos PBR) keeps hues where the brand put them; ACES pushed Cyber Blue toward teal.
const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
const godRays = new GodRaysEffect(camera, sun, {
  density: 0.96,
  decay: 0.94,
  weight: 0.32,
  exposure: 0.3,
  samples: 60,
  clampMax: 1.0,
  kernelSize: KernelSize.SMALL,
  blur: true,
});
const haze = new VolumetricHazeEffect();
haze.setStatic(
  new Vector3(graph.positions[graph.coreHub * 3]!, graph.positions[graph.coreHub * 3 + 1]!, graph.positions[graph.coreHub * 3 + 2]!),
  graph.clusters.map((c) => new Vector3(...c.center)),
  [PALETTE.electricGreen, PALETTE.cyberBlue, VIOLET_HALO].map((c) => new Vector3(c.r, c.g, c.b)),
);
composer.addPass(new EffectPass(camera, haze, godRays, bloom, tone, vignette, noise));
composer.addPass(new EffectPass(camera, new SMAAEffect()));

// ---------------------------------------------------------------- paths
const hubPos = new Vector3();
nodes.positionOf(graph, graph.coreHub, hubPos);
const inboundStart = hubPos.clone().add(new Vector3(96, 46, 50));
const inboundC1 = hubPos.clone().add(new Vector3(50, 28, 28));
const inboundC2 = hubPos.clone().add(new Vector3(9, 4, 4));
// One answer leaves the root toward the viewer, opposite side from the inbound stream.
const outboundC1 = hubPos.clone().add(new Vector3(-6, 3, 10));
const outboundC2 = hubPos.clone().add(new Vector3(-30, 14, 60));
const outboundEnd = hubPos.clone().add(new Vector3(-70, 30, 130));
// Volt Yellow: one highlight per screen. Reserved for the single decision.
const ANSWER_TINT = PALETTE.voltYellow.clone().lerp(PALETTE.white, 0.25);

function bezier(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, u: number, out: Vector3): Vector3 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}

/** streak in, decelerate on approach */
const easeArrive = (s: number): number => 1 - Math.pow(1 - s, 2.7);

const pa = new Vector3();
const pb = new Vector3();
function edgePath(edgeId: number, dirSign: number, t: number): (u: number, out: Vector3) => Vector3 {
  const e = graph.edges[edgeId]!;
  nodeWorldPos(e.a, t, pa);
  nodeWorldPos(e.b, t, pb);
  const from = dirSign > 0 ? pa.clone() : pb.clone();
  const to = dirSign > 0 ? pb.clone() : pa.clone();
  return (u, out) => out.copy(from).lerp(to, u);
}

// Rack focus: the camera holds still and focus tells the story.
const heroHubs = schedule.labels
  .filter((l) => graph.nodes[l.node]!.kind === 1 && graph.nodes[l.node]!.cluster === 0)
  .sort((a, b) => a.t - b.t)
  .map((l) => l.node);
const FOCUS: Array<{ t: number; node: number }> = [
  { t: 0, node: graph.coreHub },
  { t: 4.7, node: heroHubs[0] ?? graph.coreHub },
  { t: 6.3, node: heroHubs[2] ?? graph.coreHub },
  { t: 8.3, node: graph.coreHub },
  { t: 9.6, node: graph.clusters[1]!.hub },
  { t: 11.3, node: graph.clusters[2]!.hub },
  { t: 13.3, node: graph.coreHub },
];
let focusDistance = 110;
const focusTmp = new Vector3();
function focusTargetDistance(t: number): number {
  let node = FOCUS[0]!.node;
  for (const f of FOCUS) if (t >= f.t) node = f.node;
  nodeWorldPos(node, t, focusTmp);
  return camera.position.distanceTo(focusTmp);
}

// Signals take the color of the filament they ride (hero bridges stay white-blue).
const edgeTint = graph.edges.map((e) => {
  if (e.hero) return DEFAULT_TINT;
  const field = (id: number) => haloColor(graph, { ...graph.nodes[id]!, kind: 0 });
  return field(e.a).clone().lerp(field(e.b), 0.5).lerp(PALETTE.white, 0.22);
});

// ---------------------------------------------------------------- interaction: routed queries
interface Injection {
  node: number;
  arrive: number; // absolute seconds
  start: Vector3;
  c1: Vector3;
  c2: Vector3;
}
const injections: Injection[] = [];
const INBOUND_FLIGHT = 1.6;

function inject(nodeId: number, now: number): void {
  const target = nodeWorldPos(nodeId, elapsed % LOOP, new Vector3());
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const side = Math.random() < 0.5 ? 1 : -1;
  const start = camera.position
    .clone()
    .addScaledVector(right, 44 * side)
    .addScaledVector(up, 12 + Math.random() * 10)
    .lerp(target, 0.15);
  const c1 = start.clone().lerp(target, 0.45).addScaledVector(up, 6);
  const c2 = start.clone().lerp(target, 0.85).addScaledVector(up, 1.5);
  injections.push({ node: nodeId, arrive: now + INBOUND_FLIGHT, start, c1, c2 });
}

const raycastTmp = new Vector3();
function pickNode(nx: number, ny: number, kinds?: Set<number>): number {
  // Nearest node to the pointer ray in screen space, weighted toward the focal plane.
  let best = -1;
  let bestScore = Infinity;
  for (const nd of graph.nodes) {
    if (kinds && !kinds.has(nd.kind)) continue;
    nodeWorldPos(nd.id, elapsed % LOOP, raycastTmp).project(camera);
    if (raycastTmp.z > 1) continue;
    const dx = raycastTmp.x - nx;
    const dy = raycastTmp.y - ny;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = nd.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------- HUD
function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}
const hud = el('hud');
const beatEl = el('beat');
const voiceEl = el('voice');
const progressEl = el('progress');
const labelsEl = el('labels');
const logEl = el('log');

const BEATS: Array<[number, string]> = [
  [0, dict.beats.dormant],
  [2, dict.beats.customerQuery],
  [4, dict.beats.grounding],
  [6.8, dict.beats.catalogResolves],
  [9.6, dict.beats.crossValidation],
  [11.2, dict.beats.configSpace],
  [13.4, dict.beats.streamsConverge],
  [ANSWER, dict.beats.answerValidated],
  [18, dict.beats.recede],
];
// Module lines on the answer card. Illustrative module ids, not real part numbers.
const ANSWER_MODULES: Array<Array<[string, string]>> = [
  [['Tool changer', 'TC · 046'], ['Gripper', 'GR · 112'], ['Robot-side adapter', 'RA · 207']],
  [['Tool changer', 'TC · 031'], ['Compliance device', 'CD · 088'], ['Utility coupler', 'UC · 014']],
  [['Tool changer', 'TC · 052'], ['Vacuum end-effector', 'VE · 141'], ['Robot-side adapter', 'RA · 219']],
];
const GLYPHS = '0123456789ABCDEFGHKLMNPRSTUVWXYZ·-';
/** Scramble a value toward its final text as decode goes 0 → 1. */
function decodeText(value: string, decode: number, seed: number): string {
  const settled = Math.floor(value.length * decode);
  let out = value.slice(0, settled);
  for (let i = settled; i < value.length; i++) {
    const ch = value[i]!;
    out += ch === ' ' ? ' ' : GLYPHS[Math.floor(((seed * 31 + i * 17 + Math.floor(decode * 600)) * 2654435761) >>> 0) % GLYPHS.length]!;
  }
  return out;
}
const VOICE = dict.voice;
// Quick Consult runs in seven languages; the inbound query rotates through them each loop.
const QUERIES = [
  'customer query · UR10e · 12.5 kg · palletizing',
  'Kundenanfrage · KUKA KR 10 · 8 kg · Schweißen',
  'consulta · FANUC CRX-10iA · 10 kg · carga de máquinas',
  'demande · ABB IRB 1300 · 7 kg · assemblage',
  'richiesta · Yaskawa GP12 · 12 kg · pallettizzazione',
  '問い合わせ · Denso VS-087 · 7 kg · ピッキング',
  '咨询 · UR5e · 5 kg · 包装',
];
let voiceIndex = 0;
let lastBeat = '';

// ---------------------------------------------------------------- region labels + run log
interface LabelEl {
  node: number;
  t: number;
  el: HTMLDivElement;
}
const labelEls: LabelEl[] = schedule.labels.map((l) => {
  const div = document.createElement('div');
  div.className = 'label';
  const [name, count] = l.text.split(' · ');
  div.innerHTML = `${name}<small>${count ?? ''}</small>`;
  labelsEl.appendChild(div);
  return { node: l.node, t: l.t, el: div };
});
const queryEl = el('query');
const cardEl = el('card');
const cardVerified = el('card-verified');
const CARD_ROWS = 6;
const cardRows: Array<{ el: HTMLDivElement; label: HTMLSpanElement; value: HTMLSpanElement }> = [];
for (let i = 0; i < CARD_ROWS; i++) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.className = 'k';
  const value = document.createElement('span');
  value.className = 'v';
  row.append(label, value);
  cardEl.insertBefore(row, cardVerified);
  cardRows.push({ el: row, label, value });
}
const LOG_LINES = 7;
const logLineEls: HTMLDivElement[] = [];
for (let i = 0; i < LOG_LINES; i++) {
  const div = document.createElement('div');
  div.className = 'line';
  logEl.appendChild(div);
  logLineEls.push(div);
}
const labelTmp = new Vector3();

interface LabelPlacement {
  x: number;
  y: number;
  opacity: number;
  name: string;
  count: string;
}
interface LogPlacement {
  text: string;
  opacity: number;
  answer: boolean;
}
interface CardState {
  visible: boolean;
  /** 0..1 decode progress for each line */
  lines: Array<{ label: string; value: string; decode: number }>;
  verified: number; // 0..1 opacity of the verification line
}
interface OverlayState {
  card: CardState;
  query: string; // typed customer query, partial
  queryComplete: boolean;
  queryOpacity: number;
  labels: LabelPlacement[];
  log: LogPlacement[];
  logVisible: boolean;
  beat: string;
  voice: string;
  voiceVisible: boolean;
  progress: number;
}

/** Everything the HUD shows, computed once per frame for a given output size. */
function computeOverlay(t: number, w: number, h: number): OverlayState {
  const env = envelope(t);
  const k = w / 1600; // HUD designed at 1600 wide
  const placed: Array<{ x: number; y: number }> = [];
  const labels: LabelPlacement[] = labelEls.map((l) => {
    const age = t - l.t;
    const [name = '', count = ''] = schedule.labels.find((sl) => sl.node === l.node)!.text.split(' · ');
    const hidden = { x: 0, y: 0, opacity: 0, name, count };
    if (age < 0 || env < 0.05) return hidden;
    nodeWorldPos(l.node, t, labelTmp).project(camera);
    if (labelTmp.z > 1) return hidden;
    const x = (labelTmp.x * 0.5 + 0.5) * w + 14 * k;
    let y = (-labelTmp.y * 0.5 + 0.5) * h - 18 * k;
    for (const other of placed) {
      if (Math.abs(other.x - x) < 190 * k && Math.abs(other.y - y) < 16 * k) y = other.y + 16 * k;
    }
    placed.push({ x, y });
    return { x, y, opacity: Math.min(1, age / 0.7) * env, name, count };
  });
  // A submitted query displaces the rotating sample for as long as it stands.
  const activeQuery = userQuery ?? QUERIES[lastLoop % QUERIES.length]!;
  const shown = schedule.events.filter((e) => e.t <= t).slice(-LOG_LINES);
  const log: LogPlacement[] = shown.map((ev, i) => {
    const rank = shown.length - 1 - i;
    return {
      text: ev.text.replace('{QUERY}', activeQuery),
      opacity: Math.max(0.25, 1 - rank * 0.13) * env * Math.min(1, (t - ev.t) / 0.25),
      answer: ev.t >= ANSWER,
    };
  });
  let beat = BEATS[0]![1];
  for (const [time, label] of BEATS) if (t >= time) beat = label;
  // Customer query types itself in as the signal streaks toward the root.
  const fullQuery = activeQuery;
  const typeAge = t - (LAND - 2.0);
  const typed = typeAge < 0 ? 0 : Math.min(fullQuery.length, Math.floor(typeAge * 24));
  const queryOpacity = t < LAND - 2.0 ? 0 : t < 9.5 ? Math.min(1, typeAge * 3) : Math.max(0, 1 - (t - 9.5) * 1.4);
  // Answer card decodes line by line after the answer leaves.
  const cardAge = t - ANSWER;
  const parts = fullQuery.split(' · ').slice(1);
  const [robot = '', payload = '', application = ''] = parts;
  const modules = ANSWER_MODULES[lastLoop % ANSWER_MODULES.length]!;
  // A sample query carries its own structure; a typed one is shown as asked.
  const head = parts.length >= 3
    ? [
        { label: 'Robot', value: robot, decode: Math.min(1, Math.max(0, (cardAge - 0.35) / 0.5)) },
        { label: 'Payload', value: payload, decode: Math.min(1, Math.max(0, (cardAge - 0.55) / 0.5)) },
        { label: 'Application', value: application, decode: Math.min(1, Math.max(0, (cardAge - 0.75) / 0.5)) },
      ]
    : [{ label: dict.hud.consultaLabel, value: fullQuery, decode: Math.min(1, Math.max(0, (cardAge - 0.35) / 0.6)) }];
  const lines = [
    ...head,
    ...modules.map((m, i) => ({ label: m[0], value: m[1], decode: Math.min(1, Math.max(0, (cardAge - 1.0 - i * 0.28) / 0.7)) })),
  ];
  // The DOM keeps one row per line and never clears the ones it does not touch.
  while (lines.length < CARD_ROWS) lines.push({ label: '', value: '', decode: 0 });
  const card: CardState = {
    visible: cardAge >= 0.35 && env > 0.05,
    lines,
    verified: Math.min(1, Math.max(0, (cardAge - 2.2) / 0.5)) * env,
  };
  return {
    card,
    query: fullQuery.slice(0, typed),
    queryComplete: typed >= fullQuery.length,
    queryOpacity: queryOpacity * env,
    labels,
    log,
    logVisible: t >= LAND - 0.2 && env > 0.05,
    beat: rig.manual ? `${beat} · manual camera` : beat,
    voice: VOICE[voiceIndex] ?? '',
    voiceVisible: t > 17.2 && t < 19.4,
    progress: t / LOOP,
  };
}

function applyOverlayToDom(o: OverlayState): void {
  o.labels.forEach((p, i) => {
    const el = labelEls[i]!.el;
    el.style.opacity = p.opacity.toFixed(3);
    if (p.opacity > 0) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  });
  for (let i = 0; i < LOG_LINES; i++) {
    const div = logLineEls[i]!;
    const line = o.log[i];
    div.textContent = line?.text ?? '';
    div.classList.toggle('answer', line?.answer ?? false);
    div.style.opacity = (line?.opacity ?? 0).toFixed(3);
  }
  logEl.classList.toggle('visible', o.logVisible);
  if (o.beat !== lastBeat) {
    lastBeat = o.beat;
    beatEl.textContent = o.beat;
  }
  voiceEl.classList.toggle('visible', o.voiceVisible);
  progressEl.style.width = `${o.progress * 100}%`;
  queryEl.textContent = o.query;
  queryEl.style.opacity = o.queryOpacity.toFixed(3);
  queryEl.classList.toggle('typing', o.query.length > 0 && !o.queryComplete);
  cardEl.classList.toggle('visible', o.card.visible);
  if (o.card.visible) {
    o.card.lines.forEach((line, i) => {
      const row = cardRows[i];
      if (!row) return;
      row.label.textContent = line.label;
      row.value.textContent = decodeText(line.value, line.decode, i);
      row.el.style.opacity = line.decode > 0 ? '1' : '0';
      row.value.classList.toggle('settled', line.decode >= 1);
    });
    cardVerified.style.opacity = o.card.verified.toFixed(3);
  }
}

const logoImage = new Image();
logoImage.src = '/reshapex-logo.svg';

/** Canvas twin of the DOM HUD, used for video export. */
function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, o: OverlayState): void {
  const k = w / 1600;
  const steel = 'rgba(139,154,173,';
  ctx.save();
  ctx.textBaseline = 'middle';
  // Logo
  if (logoImage.complete && logoImage.naturalWidth > 0) {
    const lh = 22 * k;
    const lw = lh * (logoImage.naturalWidth / logoImage.naturalHeight);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(logoImage, 40 * k, 32 * k, lw, lh);
    ctx.globalAlpha = 1;
  }
  ctx.font = `600 ${12 * k}px "Hanken Grotesk", system-ui, sans-serif`;
  ctx.letterSpacing = `${0.12 * 12 * k}px`;
  ctx.textAlign = 'right';
  ctx.fillStyle = `${steel}0.55)`;
  ctx.fillText(o.beat.toUpperCase(), w - 40 * k, 40 * k);
  // Labels
  ctx.textAlign = 'left';
  for (const l of o.labels) {
    if (l.opacity <= 0) continue;
    ctx.globalAlpha = l.opacity;
    ctx.strokeStyle = `${steel}0.6)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x + 10 * k, l.y);
    ctx.stroke();
    ctx.font = `600 ${10 * k}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.letterSpacing = `${0.12 * 10 * k}px`;
    ctx.fillStyle = 'rgba(229,233,236,0.78)';
    ctx.fillText(l.name.toUpperCase(), l.x + 14 * k, l.y);
    const nameW = ctx.measureText(l.name.toUpperCase()).width;
    ctx.font = `500 ${10 * k}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = `${steel}0.85)`;
    ctx.fillText(l.count.toUpperCase(), l.x + 14 * k + nameW + 6 * k, l.y);
  }
  ctx.globalAlpha = 1;
  // Log
  if (o.logVisible) {
    ctx.textAlign = 'right';
    ctx.font = `500 ${11 * k}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.letterSpacing = `${0.04 * 11 * k}px`;
    const lineH = 11 * 1.7 * k;
    const baseY = h - 132 * k - lineH * (LOG_LINES - 0.5);
    o.log.forEach((line, i) => {
      ctx.globalAlpha = line.opacity;
      ctx.fillStyle = line.answer ? '#ffe500' : `${steel}0.85)`;
      ctx.fillText(line.text, w - 40 * k, baseY + i * lineH);
    });
    ctx.globalAlpha = 1;
  }
  // Typed query
  if (o.queryOpacity > 0.01) {
    ctx.textAlign = 'left';
    ctx.globalAlpha = o.queryOpacity;
    ctx.font = `500 ${13 * k}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.letterSpacing = `${0.04 * 13 * k}px`;
    ctx.fillStyle = 'rgba(229,233,236,0.85)';
    ctx.fillText(o.query, 40 * k, h - 44 * k);
    ctx.globalAlpha = 1;
  }
  // Answer card
  if (o.card.visible) {
    ctx.textAlign = 'left';
    const rowH = 20 * k;
    const x = 40 * k;
    let y = h - 96 * k - rowH * (o.card.lines.length + 1);
    ctx.letterSpacing = `${0.12 * 10 * k}px`;
    o.card.lines.forEach((line, i) => {
      if (line.decode <= 0) return;
      ctx.font = `600 ${10 * k}px "Hanken Grotesk", system-ui, sans-serif`;
      ctx.fillStyle = `${steel}0.85)`;
      ctx.fillText(line.label.toUpperCase(), x, y);
      ctx.font = `500 ${13 * k}px "Hanken Grotesk", system-ui, sans-serif`;
      ctx.fillStyle = line.decode >= 1 ? 'rgba(229,233,236,0.95)' : `${steel}0.7)`;
      ctx.fillText(decodeText(line.value, line.decode, i), x + 150 * k, y);
      y += rowH;
    });
    if (o.card.verified > 0) {
      ctx.globalAlpha = o.card.verified;
      ctx.font = `600 ${10 * k}px "Hanken Grotesk", system-ui, sans-serif`;
      ctx.fillStyle = `#${PALETTE.electricGreen.getHexString()}`;
      ctx.fillText(dict.hud.verified.toUpperCase(), x, y + 4 * k);
      ctx.globalAlpha = 1;
    }
  }
  // Voice
  if (o.voiceVisible) {
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0px';
    ctx.font = `italic 400 ${22 * k}px "Newsreader", Georgia, serif`;
    ctx.fillStyle = 'rgba(229,233,236,0.85)';
    ctx.fillText(o.voice, 40 * k, h - 44 * k);
  }
  // Progress
  ctx.fillStyle = `${steel}0.10)`;
  ctx.fillRect(0, h - 2 * k, w, 2 * k);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, `#${PALETTE.electricGreen.getHexString()}`);
  grad.addColorStop(0.4, `#${PALETTE.cyberBlue.getHexString()}`);
  grad.addColorStop(0.75, `#${VIOLET_HALO.getHexString()}`);
  grad.addColorStop(1, `#${PALETTE.hotMagenta.getHexString()}`);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - 2 * k, w * o.progress, 2 * k);
  ctx.restore();
}

// ---------------------------------------------------------------- loop
const timer = new Timer();
let elapsed = 0;
let paused = false;
/** The query the viewer asked, if they have asked one. Outlives the loop that ran it. */
let userQuery: string | null = null;
let lastLoop = -1;
const nodeAct = nodes.boost;
// Awake fraction per cluster, from sorted ignition times (no per-node CPU work per frame).
const clusterStarts = graph.clusters.map((c) =>
  Float64Array.from(graph.nodes.filter((nd) => nd.cluster === c.id).map((nd) => schedule.nodeStart[nd.id]!).filter(Number.isFinite)).sort(),
);
function awakeFraction(cluster: number, t: number): number {
  const arr = clusterStarts[cluster]!;
  const total = clusterCount[cluster]!;
  const countLE = (x: number): number => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]! <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const cur = (countLE(t) / total) * envelope(t);
  const res = (countLE(t + LOOP) / total) * envelope(t + LOOP);
  return Math.max(cur, res);
}
const clusterSum = new Float32Array(graph.clusters.length);
const clusterCount = new Float32Array(graph.clusters.length);
for (const nd of graph.nodes) clusterCount[nd.cluster] = (clusterCount[nd.cluster] as number) + 1;
const tmpV = new Vector3();

let lastOverlay: OverlayState | null = null;

function step(dt: number, outW = window.innerWidth, outH = window.innerHeight): void {
  if (!paused) elapsed += dt;
  const t = elapsed % LOOP;
  const loopIndex = Math.floor(elapsed / LOOP);
  if (loopIndex !== lastLoop) {
    lastLoop = loopIndex;
    voiceIndex = loopIndex % VOICE.length;
    voiceEl.textContent = VOICE[voiceIndex] ?? '';
  }
  if (exporter.active) voiceEl.textContent = '';
  search.setHidden(exporter.active);

  applyHeldKeys(dt, shiftHeld);
  rig.update(t, elapsed, dt);
  if (!paused) sound.update(t);

  // --- nodes: scheduled activation runs on the GPU; the CPU only writes sparse boosts.
  nodeAct.fill(0);
  for (const inj of injections) {
    const age = elapsed - inj.arrive;
    if (age > 0) nodeAct[inj.node] = Math.max(nodeAct[inj.node]!, ignition(age) * Math.exp(-age * 0.45) * 1.25);
  }
  if (hoverHub >= 0) {
    nodeAct[hoverHub] = Math.max(nodeAct[hoverHub]!, 1.2);
    for (const eid of graph.incident[hoverHub]!) {
      const e = graph.edges[eid]!;
      const other = e.a === hoverHub ? e.b : e.a;
      if (graph.parent[other] === hoverHub) nodeAct[other] = Math.max(nodeAct[other]!, 1.0);
    }
  }
  for (const c of graph.clusters) clusterSum[c.id] = awakeFraction(c.id, t) * (clusterCount[c.id] as number);
  const rootAct = Math.max(nodeActivation(schedule.nodeStart[graph.coreHub]!, t), nodeAct[graph.coreHub]!);

  // Ambient life: single-leaf verification pings while the network is settled.
  if (t > 12 && t < 17.4) {
    const slot = Math.floor(t * 3);
    const frac = t * 3 - slot;
    const hash = ((slot * 2654435761) >>> 0) % graph.nodes.length;
    const leaf = graph.nodes[hash]!;
    if (leaf.kind === 0 && Number.isFinite(schedule.nodeStart[leaf.id]!) && schedule.nodeStart[leaf.id]! < t) {
      nodeAct[leaf.id] = Math.max(nodeAct[leaf.id]!, 1 + 1.4 * Math.sin(frac * Math.PI));
    }
  }

  // --- injections: flight, impact, and a one-hop ripple to neighbors
  edges.begin();
  signals.begin();
  let ringProgress = -1;
  for (let i = injections.length - 1; i >= 0; i--) {
    const inj = injections[i]!;
    const age = elapsed - inj.arrive;
    if (age > 5) {
      injections.splice(i, 1);
      continue;
    }
    const target = nodeWorldPos(inj.node, t, new Vector3());
    if (age < 0) {
      const s = 1 + age / INBOUND_FLIGHT;
      const u = easeArrive(s);
      signals.emit((uu, out) => bezier(inj.start, inj.c1, inj.c2, target, uu, out), u, 1.6, 0.16);
    } else {
      if (age < 0.9) {
        ringProgress = age / 0.9;
        ring.position.copy(target);
      }
      for (const eid of graph.incident[inj.node] as number[]) {
        const e = graph.edges[eid]!;
        const other = e.a === inj.node ? e.b : e.a;
        const hop = 0.55;
        if (age < hop) {
          const u = age / hop;
          // pulse position in the edge's own draw-direction parameter space
          const fromA = edges.orientation[eid] === 1;
          const startsAtA = e.a === inj.node;
          edges.setPulse(eid, fromA === startsAtA ? u : 1 - u);
        }
        edges.setBoost(eid, Math.exp(-age * 0.8));
        const nAge = age - hop;
        if (nAge > 0) {
          nodeAct[other] = Math.max(nodeAct[other] as number, ignition(nAge) * Math.exp(-nAge * 0.6) * 0.9);
        }
      }
    }
  }

  // --- scheduled inbound particle: a clean traveling signal, no flat streak in transit.
  const inboundAge = t - (LAND - 2.0);
  if (inboundAge >= 0 && inboundAge < 2.0) {
    const u = easeArrive(inboundAge / 2.0);
    signals.emit((uu, out) => bezier(inboundStart, inboundC1, inboundC2, hubPos, uu, out), u, 1.8, 0.18);
  }
  // One answer out: many streams converged, one decision leaves.
  const answerAge = t - ANSWER;
  if (answerAge >= 0 && answerAge < 1.8) {
    const u = Math.pow(answerAge / 1.8, 1.9); // slow release, then it streaks away
    signals.emit((uu, out) => bezier(hubPos, outboundC1, outboundC2, outboundEnd, uu, out), u, 2.2, 0.14, ANSWER_TINT);
    bezier(hubPos, outboundC1, outboundC2, outboundEnd, u, tmpV);
    placeStreak(streakOut, tmpV, 0.9 * (1 - u) + 0.1, PALETTE.voltYellow);
    // The root flares as it releases the decision.
    nodeAct[graph.coreHub] = Math.max(nodeAct[graph.coreHub]!, ignition(answerAge) * 1.1 * envelope(t));
  } else {
    streakOut.visible = false;
  }
  const landAge = t - LAND;
  if (landAge >= 0 && landAge < 0.9) {
    ringProgress = landAge / 0.9;
    ring.position.copy(hubPos);
  }
  // Impact flash: the flat streak now only exists as the burst on landing, expanding
  // outward from the hit point and fading, in lockstep with the ring.
  if (landAge >= -0.04 && landAge < 0.55) {
    const flashU = Math.max(0, landAge) / 0.55;
    const widthMul = 0.15 + flashU * 1.3;
    const alpha = (1 - flashU) * (1 - flashU) * 1.1;
    placeStreak(streakIn, hubPos, alpha, PALETTE.cyberBlue, widthMul);
  } else {
    streakIn.visible = false;
  }
  ring.visible = ringProgress >= 0;
  if (ring.visible) {
    (ring.material as ShaderMaterial).uniforms.uProgress!.value = ringProgress;
    ring.quaternion.copy(camera.quaternion);
    const s = 2.2 + ringProgress * 7;
    ring.scale.set(s, s, 1);
  }

  // --- scheduled signals along edges
  for (const sig of schedule.signals) {
    for (const shift of [0, LOOP]) {
      const age = t + shift - sig.t0;
      if (age < 0 || age > sig.dur + 0.3) continue;
      const u = Math.min(1, age / sig.dur);
      const env = envelope(t + shift);
      signals.emit(edgePath(sig.edge, sig.dir, t), u, sig.strength * env, 0.22, edgeTint[sig.edge]);
      const fromA = edges.orientation[sig.edge] === 1;
      edges.setPulse(sig.edge, (sig.dir === 1) === fromA ? u : 1 - u);
    }
  }

  // --- cluster atmosphere
  for (const c of graph.clusters) {
    fields.set(c.id, 0.12 + ((clusterSum[c.id] as number) / (clusterCount[c.id] as number)) * 1.1);
  }

  const pr = renderer.getPixelRatio();
  focusDistance += (focusTargetDistance(t) - focusDistance) * (1 - Math.exp(-dt * 2.2));
  const hb = heartbeatAt(t);
  nodes.commit(elapsed, t, focusDistance, hb.age, hb.strength);
  edges.commit(t, hb.age, hb.strength, outW, outH, pr);
  signals.commit(pr, focusDistance);
  sun.scale.setScalar(0.12 + 0.55 * Math.min(rootAct, 1.6));
  fields.commit(pr);
  (dust.material as ShaderMaterial).uniforms.uTime!.value = elapsed;
  (dust.material as ShaderMaterial).uniforms.uPixelRatio!.value = pr;
  (backdrop.material as ShaderMaterial).uniforms.uTime!.value = elapsed;
  backdrop.position.copy(camera.position);

  // --- HUD
  lastOverlay = computeOverlay(t, outW, outH);
  applyOverlayToDom(lastOverlay);

  haze.updateFrame(
    camera,
    elapsed,
    0.25 + 1.6 * Math.min(rootAct, 1.6),
    graph.clusters.map((c) => (clusterSum[c.id] as number) / (clusterCount[c.id] as number)),
  );
  trails.update(renderer, scene, camera, dt);
  composer.render(dt);
}

function frame(): void {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  if (!exporter.active) step(dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- export (E)
const statusEl = el('status');
const soundHint = el('sound-hint');
const exporter = new LoopExporter(renderer, composer, camera, canvas, {
  step: (dt) => step(dt, 1920, 1080),
  drawOverlay: (ctx, w, h) => {
    if (lastOverlay) drawOverlay(ctx, w, h, lastOverlay);
  },
  begin: () => {
    // Start on the second loop so the previous loop's embers exist at t=0: seamless seam.
    elapsed = LOOP;
    injections.length = 0;
    userQuery = null; // the export is the canonical loop, never a viewer's question

    paused = false;
    rig.release();
    sound.resetClock();
  },
  audioStream: () => sound.stream,
  onStatus: (text) => {
    statusEl.textContent = text;
  },
});

// ---------------------------------------------------------------- agent search
/**
 * Where the thrown point of light should be aimed: the screen position the inbound
 * query signal departs from, so the hand-off between DOM and scene is continuous.
 */
function handoffPoint(): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const p = inboundStart.clone().project(camera);
  // Anything behind the camera projects mirrored; send the point off the top instead.
  if (p.z > 1) return { x: w * 0.5, y: -70 };
  const x = (p.x * 0.5 + 0.5) * w;
  const y = (-p.y * 0.5 + 0.5) * h;
  return { x: Math.max(-90, Math.min(w + 90, x)), y: Math.max(-90, Math.min(h + 90, y)) };
}

const search = new AgentSearch({
  handoff: handoffPoint,
  flightSeconds: 2.0, // matches the scheduled inbound signal, LAND - 2.0 → LAND
  captions: { default: dict.hud.caption, sending: dict.hud.captionSending },
  launch: (query) => {
    if (exporter.active) return;
    userQuery = query;
    injections.length = 0;
    // Land on the beat the inbound signal departs, one loop on, so the search runs whole.
    elapsed = (Math.floor(elapsed / LOOP) + 1) * LOOP + (LAND - 2.0);
    paused = false;
    rig.release();
    sound.resetClock();
  },
});

// ---------------------------------------------------------------- events
// Camera: drag or arrow keys orbit, shift+drag / shift+arrows pan, wheel dollies. Any input
// takes the camera over; a few idle seconds hand it back to the cinematic path.
let dragging = false;
let dragMoved = 0;
let lastX = 0;
let lastY = 0;
const held = new Set<string>();
let hoverHub = -1;
let lastHoverCheck = 0;
const HUB_KINDS = new Set([1, 2]);
window.addEventListener('pointermove', (ev) => {
  const nx = (ev.clientX / window.innerWidth) * 2 - 1;
  const ny = -((ev.clientY / window.innerHeight) * 2 - 1);
  rig.setPointer(nx, ny);
  if (!dragging && performance.now() - lastHoverCheck > 80) {
    lastHoverCheck = performance.now();
    const id = pickNode(nx, ny, HUB_KINDS);
    // Only count as hover when the pointer is actually near the hub on screen.
    if (id >= 0) {
      nodeWorldPos(id, elapsed % LOOP, raycastTmp).project(camera);
      const d = Math.hypot((raycastTmp.x - nx) * window.innerWidth, (raycastTmp.y - ny) * window.innerHeight) / 2;
      hoverHub = d < 40 ? id : -1;
    } else hoverHub = -1;
  }
  if (dragging) {
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (ev.shiftKey || ev.buttons === 2) rig.pan(dx, dy, elapsed);
    else rig.orbit(-dx * 0.0045, -dy * 0.0035, elapsed);
  }
  lastX = ev.clientX;
  lastY = ev.clientY;
});
function unlockAudio(): void {
  if (sound.unlocked) return;
  sound.unlock();
  soundHint.textContent = dict.hud.soundHintOn;
}
window.addEventListener('pointerdown', (ev) => {
  unlockAudio();
  dragging = true;
  dragMoved = 0;
  lastX = ev.clientX;
  lastY = ev.clientY;
});
window.addEventListener('pointerup', (ev) => {
  dragging = false;
  if (dragMoved < 6 && ev.button === 0) {
    const nx = (ev.clientX / window.innerWidth) * 2 - 1;
    const ny = -((ev.clientY / window.innerHeight) * 2 - 1);
    const id = pickNode(nx, ny);
    if (id >= 0) inject(id, elapsed);
  }
});
window.addEventListener('contextmenu', (ev) => ev.preventDefault());
window.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    rig.dolly(Math.exp(ev.deltaY * 0.0012), elapsed);
  },
  { passive: false },
);
window.addEventListener('keydown', (ev) => {
  unlockAudio();
  if (search.typing) return;
  if (ev.key === 'm') {
    sound.setMuted(!sound.muted);
    soundHint.textContent = sound.muted ? dict.hud.soundHintMuted : dict.hud.soundHintOn;
  }
  if (ev.code.startsWith('Arrow')) {
    ev.preventDefault();
    held.add(ev.code);
    return;
  }
  if (ev.code === 'Space') {
    ev.preventDefault();
    paused = !paused;
  } else if (ev.key === 'r') {
    elapsed = 0;
    injections.length = 0;
  } else if (ev.key === 'h') {
    hud.classList.toggle('visible');
  } else if (ev.key === 'c') {
    rig.release();
  } else if (ev.key === 'e') {
    exporter.start();
  }
});
window.addEventListener('keyup', (ev) => held.delete(ev.code));
window.addEventListener('blur', () => held.clear());

/** Held arrow keys move the camera continuously and smoothly. */
function applyHeldKeys(dt: number, shift: boolean): void {
  if (held.size === 0) return;
  const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const y = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
  if (x === 0 && y === 0) return;
  if (shift) rig.pan(-x * 260 * dt, y * 260 * dt, elapsed);
  else rig.orbit(-x * 1.2 * dt, y * 0.9 * dt, elapsed);
}
let shiftHeld = false;
window.addEventListener('keydown', (ev) => {
  if (!search.typing && ev.key === 'Shift') shiftHeld = true;
});
window.addEventListener('keyup', (ev) => {
  if (ev.key === 'Shift') shiftHeld = false;
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Debug / capture hooks: seek the loop clock and pause.
declare global {
  interface Window {
    kg: { seek: (t: number) => void; pause: (p: boolean) => void; debug: { renderer: WebGLRenderer; edges: Mesh } };
  }
}
window.kg = {
  seek: (t: number) => {
    elapsed = t;
  },
  pause: (p: boolean) => {
    paused = p;
  },
  debug: { renderer, edges: edges.mesh },
};

requestAnimationFrame(() => hud.classList.add('visible'));
frame();
