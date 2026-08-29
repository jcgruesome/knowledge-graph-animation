import {
  AdditiveBlending,
  HalfFloatType,
  Timer,
  Mesh,
  PlaneGeometry,
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
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { buildGraph } from './graph';
import { ANSWER, buildSchedule, LAND, LOOP, edgeState, envelope, ignition, nodeActivation } from './schedule';
import { NodeField } from './nodes';
import { EdgeField } from './edges';
import { SignalField } from './signals';
import { ClusterFields, createBackdrop, createDust } from './atmosphere';
import { CameraRig } from './cameraRig';
import { haloColor, PALETTE } from './palette';
import { LoopExporter } from './export';
import { DEFAULT_TINT } from './signals';

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

const graph = buildGraph(SEED);
const schedule = buildSchedule(graph, SEED);

const nodes = new NodeField(graph);
const edges = new EdgeField(graph, schedule.edgeFrom);
const signals = new SignalField(96);
const fields = new ClusterFields(graph);
const backdrop = createBackdrop();
const dust = createDust(SEED, 420);
scene.add(backdrop, dust, fields.points, edges.lines, nodes.mesh, signals.points);

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
const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
composer.addPass(new EffectPass(camera, bloom, tone, vignette, noise));
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
function edgePath(edgeId: number, dirSign: number): (u: number, out: Vector3) => Vector3 {
  const e = graph.edges[edgeId]!;
  nodes.positionOf(graph, e.a, pa);
  nodes.positionOf(graph, e.b, pb);
  const from = dirSign > 0 ? pa.clone() : pb.clone();
  const to = dirSign > 0 ? pb.clone() : pa.clone();
  return (u, out) => out.copy(from).lerp(to, u);
}

// Signals take the color of the filament they ride (hero bridges stay white-blue).
const edgeTint = graph.edges.map((e) => {
  if (e.hero) return DEFAULT_TINT;
  const field = (id: number) => haloColor(graph, { ...graph.nodes[id]!, kind: 0 });
  return field(e.a).clone().lerp(field(e.b), 0.5).lerp(PALETTE.white, 0.45);
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
  const target = nodes.positionOf(graph, nodeId, new Vector3());
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
function pickNode(nx: number, ny: number): number {
  // Nearest node to the pointer ray in screen space, weighted toward the focal plane.
  let best = -1;
  let bestScore = Infinity;
  for (const nd of graph.nodes) {
    nodes.positionOf(graph, nd.id, raycastTmp).project(camera);
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
  [0, 'Dormant field'],
  [2, 'Customer query'],
  [4, 'Grounding'],
  [6.8, 'Tooling catalog resolves'],
  [9.6, 'Cross-validation'],
  [11.2, '8.2M configurations'],
  [13.4, 'Streams converge'],
  [ANSWER, 'Validated part number'],
  [18, 'Recede'],
];
const VOICE = [
  'Signal becomes intelligence.',
  '8.2 million valid configurations. One validated answer.',
  'Decades of pattern recognition, available to every customer.',
  'Uncertain? It asks an engineer. It never guesses.',
];
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
interface OverlayState {
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
    nodes.positionOf(graph, l.node, labelTmp).project(camera);
    if (labelTmp.z > 1) return hidden;
    const x = (labelTmp.x * 0.5 + 0.5) * w + 14 * k;
    let y = (-labelTmp.y * 0.5 + 0.5) * h - 18 * k;
    for (const other of placed) {
      if (Math.abs(other.x - x) < 190 * k && Math.abs(other.y - y) < 16 * k) y = other.y + 16 * k;
    }
    placed.push({ x, y });
    return { x, y, opacity: Math.min(1, age / 0.7) * env, name, count };
  });
  const shown = schedule.events.filter((e) => e.t <= t).slice(-LOG_LINES);
  const log: LogPlacement[] = shown.map((ev, i) => {
    const rank = shown.length - 1 - i;
    return {
      text: ev.text.replace('{QUERY}', QUERIES[lastLoop % QUERIES.length]!),
      opacity: Math.max(0.25, 1 - rank * 0.13) * env * Math.min(1, (t - ev.t) / 0.25),
      answer: ev.t >= ANSWER,
    };
  });
  let beat = BEATS[0]![1];
  for (const [time, label] of BEATS) if (t >= time) beat = label;
  return {
    labels,
    log,
    logVisible: t >= LAND - 0.2 && env > 0.05,
    beat: rig.manual ? `${beat} · manual camera` : beat,
    voice: VOICE[voiceIndex] ?? '',
    voiceVisible: t > 15.4 && t < 18.8,
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
    const baseY = h - 96 * k - lineH * (LOG_LINES - 0.5);
    o.log.forEach((line, i) => {
      ctx.globalAlpha = line.opacity;
      ctx.fillStyle = line.answer ? '#ffe500' : `${steel}0.85)`;
      ctx.fillText(line.text, w - 40 * k, baseY + i * lineH);
    });
    ctx.globalAlpha = 1;
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
  grad.addColorStop(0, '#73B400');
  grad.addColorStop(0.4, '#00D9FF');
  grad.addColorStop(0.75, '#7a4dff');
  grad.addColorStop(1, '#ff006e');
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - 2 * k, w * o.progress, 2 * k);
  ctx.restore();
}

// ---------------------------------------------------------------- loop
const timer = new Timer();
let elapsed = 0;
let paused = false;
let lastLoop = -1;
const nodeAct = nodes.activation;
const clusterSum = new Float32Array(graph.clusters.length);
const clusterCount = new Float32Array(graph.clusters.length);
for (const nd of graph.nodes) clusterCount[nd.cluster] = (clusterCount[nd.cluster] as number) + 1;
const edgePulse = new Float32Array(graph.edges.length);
const edgeBoost = new Float32Array(graph.edges.length);
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

  applyHeldKeys(dt, shiftHeld);
  rig.update(t, elapsed, dt);

  // --- nodes
  clusterSum.fill(0);
  for (const nd of graph.nodes) {
    let a = nodeActivation(schedule.nodeStart[nd.id] as number, t);
    for (const inj of injections) {
      const age = elapsed - inj.arrive;
      if (age <= 0) continue;
      if (inj.node === nd.id) {
        a = Math.max(a, ignition(age) * Math.exp(-age * 0.45) * 1.25);
      }
    }
    nodeAct[nd.id] = a;
    clusterSum[nd.cluster] = (clusterSum[nd.cluster] as number) + Math.min(a, 1);
  }

  // --- injections: flight, impact, and a one-hop ripple to neighbors
  edgePulse.fill(-1);
  edgeBoost.fill(0);
  signals.begin();
  let ringProgress = -1;
  for (let i = injections.length - 1; i >= 0; i--) {
    const inj = injections[i]!;
    const age = elapsed - inj.arrive;
    if (age > 5) {
      injections.splice(i, 1);
      continue;
    }
    const target = nodes.positionOf(graph, inj.node, new Vector3());
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
          edgePulse[eid] = fromA === startsAtA ? u : 1 - u;
        }
        edgeBoost[eid] = Math.max(edgeBoost[eid] as number, Math.exp(-age * 0.8));
        const nAge = age - hop;
        if (nAge > 0) {
          nodeAct[other] = Math.max(nodeAct[other] as number, ignition(nAge) * Math.exp(-nAge * 0.6) * 0.9);
        }
      }
    }
  }

  // --- scheduled inbound particle
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
    // The root flares as it releases the decision.
    nodeAct[graph.coreHub] = Math.max(nodeAct[graph.coreHub]!, ignition(answerAge) * 1.1 * envelope(t));
  }
  const landAge = t - LAND;
  if (landAge >= 0 && landAge < 0.9) {
    ringProgress = landAge / 0.9;
    ring.position.copy(hubPos);
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
      signals.emit(edgePath(sig.edge, sig.dir), u, sig.strength * env, 0.22, edgeTint[sig.edge]);
      const fromA = edges.orientation[sig.edge] === 1;
      edgePulse[sig.edge] = (sig.dir === 1) === fromA ? u : 1 - u;
    }
  }

  // --- edges
  for (const e of graph.edges) {
    const st = edgeState(schedule.edgeStart[e.id] as number, schedule.edgeDur[e.id] as number, t);
    const boost = edgeBoost[e.id] as number;
    const progress = boost > 0 ? 1 : st.progress;
    edges.set(e.id, progress, Math.max(st.glow, boost * 1.3), edgePulse[e.id] as number);
  }

  // --- cluster atmosphere
  for (const c of graph.clusters) {
    fields.set(c.id, 0.12 + ((clusterSum[c.id] as number) / (clusterCount[c.id] as number)) * 1.1);
  }

  const pr = renderer.getPixelRatio();
  nodes.commit(elapsed, rig.focusDistance);
  edges.commit();
  signals.commit(pr, rig.focusDistance);
  fields.commit(pr);
  (dust.material as ShaderMaterial).uniforms.uTime!.value = elapsed;
  (dust.material as ShaderMaterial).uniforms.uPixelRatio!.value = pr;
  (backdrop.material as ShaderMaterial).uniforms.uTime!.value = elapsed;
  backdrop.position.copy(camera.position);

  // --- HUD
  lastOverlay = computeOverlay(t, outW, outH);
  applyOverlayToDom(lastOverlay);

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
const exporter = new LoopExporter(renderer, composer, camera, canvas, {
  step: (dt) => step(dt, 1920, 1080),
  drawOverlay: (ctx, w, h) => {
    if (lastOverlay) drawOverlay(ctx, w, h, lastOverlay);
  },
  begin: () => {
    elapsed = 0;
    injections.length = 0;
    paused = false;
    rig.release();
  },
  onStatus: (text) => {
    statusEl.textContent = text;
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
window.addEventListener('pointermove', (ev) => {
  const nx = (ev.clientX / window.innerWidth) * 2 - 1;
  const ny = -((ev.clientY / window.innerHeight) * 2 - 1);
  rig.setPointer(nx, ny);
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
window.addEventListener('pointerdown', (ev) => {
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
  if (ev.key === 'Shift') shiftHeld = true;
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
    kg: { seek: (t: number) => void; pause: (p: boolean) => void };
  }
}
window.kg = {
  seek: (t: number) => {
    elapsed = t;
  },
  pause: (p: boolean) => {
    paused = p;
  },
};

requestAnimationFrame(() => hud.classList.add('visible'));
frame();
