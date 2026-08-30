/**
 * Firebreak — a spike.
 *
 * A bad fact ignites in the knowledge graph and spreads along the edges. You drag
 * through the strands to sever them before the fire reaches a root. Scored on how
 * long you hold it.
 *
 * The question this spike exists to answer: can a person reliably cut the strand
 * they meant to cut, in 3D, under time pressure? Simulation cannot answer that.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments,
  PerspectiveCamera, Points, PointsMaterial, Scene, Vector3, WebGLRenderer,
} from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { buildGraph } from '../graph';
import { PALETTE, haloColor } from '../palette';

const SEED = 20260829;
const graph = buildGraph(SEED, 1);
const N = graph.nodes.length;
const E = graph.edges.length;
const POS = graph.positions;

/** seconds for fire to cross one edge, by class */
const TRAVEL = new Float32Array(E);
for (let i = 0; i < E; i++) {
  const e = graph.edges[i]!;
  const ka = graph.nodes[e.a]!.kind, kb = graph.nodes[e.b]!.kind;
  TRAVEL[i] = ka === 2 || kb === 2 ? 6.0 : e.weight === 0 ? 1.1 : 2.6;
}

// ---------------------------------------------------------------- renderer
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const blade = document.createElement('canvas');
blade.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
document.body.appendChild(blade);
const bctx = blade.getContext('2d')!;

const scene = new Scene();
const camera = new PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 600);

const nodeGeo = new BufferGeometry();
nodeGeo.setAttribute('position', new BufferAttribute(POS.slice(), 3));
const nodeCol = new Float32Array(N * 3);
nodeGeo.setAttribute('color', new BufferAttribute(nodeCol, 3));
const nodes = new Points(nodeGeo, new PointsMaterial({
  size: 0.62, sizeAttenuation: true, vertexColors: true,
  transparent: true, depthWrite: false, blending: AdditiveBlending,
}));
scene.add(nodes);

const edgeGeo = new BufferGeometry();
const edgePos = new Float32Array(E * 6);
for (let i = 0; i < E; i++) {
  const e = graph.edges[i]!;
  for (let k = 0; k < 3; k++) { edgePos[i * 6 + k] = POS[e.a * 3 + k]!; edgePos[i * 6 + 3 + k] = POS[e.b * 3 + k]!; }
}
edgeGeo.setAttribute('position', new BufferAttribute(edgePos, 3));
const edgeCol = new Float32Array(E * 6);
edgeGeo.setAttribute('color', new BufferAttribute(edgeCol, 3));
const edges = new LineSegments(edgeGeo, new LineBasicMaterial({
  vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.95,
}));
scene.add(edges);

const composer = new EffectComposer(renderer, { frameBufferType: undefined });
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera,
  new BloomEffect({ intensity: 1.5, luminanceThreshold: 0.18, luminanceSmoothing: 0.3, mipmapBlur: true, radius: 0.72 }),
  new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })));

// base colors
const BASE = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const c = haloColor(graph, graph.nodes[i]!).clone();
  const k = graph.nodes[i]!.kind;
  c.multiplyScalar(k === 2 ? 2.4 : k === 1 ? 0.42 : 0.2);
  BASE[i * 3] = c.r; BASE[i * 3 + 1] = c.g; BASE[i * 3 + 2] = c.b;
}
const FIRE = PALETTE.hotMagenta, HOT = PALETTE.voltYellow, ASH = new Color('#2A1520');

// ---------------------------------------------------------------- audio
let ac: AudioContext | null = null;
function sound(kind: 'cut' | 'ignite' | 'flare' | 'lost') {
  if (!ac) return;
  const t = ac.currentTime, g = ac.createGain(), o = ac.createOscillator();
  o.connect(g); g.connect(ac.destination);
  if (kind === 'cut') { o.type = 'triangle'; o.frequency.setValueAtTime(1750, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.07);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09); o.start(t); o.stop(t + 0.1); return; }
  if (kind === 'ignite') { o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.28);
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3); o.start(t); o.stop(t + 0.32); return; }
  if (kind === 'flare') { o.type = 'sawtooth'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.18);
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2); o.start(t); o.stop(t + 0.22); return; }
  o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(38, t + 1.4);
  g.gain.setValueAtTime(0.24, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5); o.start(t); o.stop(t + 1.55);
}

// ---------------------------------------------------------------- game state
interface Pending { at: number; node: number; via: number }
let burnt: Uint8Array, cut: Uint8Array, pending: Pending[], live: number[];
let nextEmber = 0, emberGap = 0, clock = 0, over = false, cutsMade = 0, cleanCount = 0;
const recoil = new Map<number, number>();          // edge -> seconds remaining on the snap flash
const leaves: number[] = [];
for (let i = 0; i < N; i++) if (graph.nodes[i]!.kind === 0) leaves.push(i);

/**
 * Losing the round means losing a hierarchy root. The long-tail disc's hub is also
 * kind 2, but 430 leaves hang straight off it, so treating it as a root made one
 * ember in five an unavoidable death six seconds in. It now burns like anything
 * else: expensive, not fatal.
 */
const FATAL = new Uint8Array(N);
for (let i = 0; i < N; i++) if (graph.nodes[i]!.kind === 2 && graph.incident[i]!.length < 100) FATAL[i] = 1;

function reset() {
  burnt = new Uint8Array(N); cut = new Uint8Array(E); pending = []; live = [];
  clock = 0; over = false; cutsMade = 0; cleanCount = N;
  emberGap = 7.5; nextEmber = 3.5; recoil.clear();
  wantDist = 104;
  overEl.classList.remove('on'); tipEl.style.opacity = '1';
}

function ignite(node: number) {
  if (over || burnt[node]) return;
  burnt[node] = 1; cleanCount--;
  if (FATAL[node]) { lose(); return; }
  sound(graph.nodes[node]!.kind === 1 ? 'flare' : 'ignite');
  for (const ei of graph.incident[node]!) {
    if (cut[ei]) continue;
    const e = graph.edges[ei]!;
    const o = e.a === node ? e.b : e.a;
    if (!burnt[o]) pending.push({ at: clock + TRAVEL[ei]!, node: o, via: ei });
  }
}

/** the fire quickens as the round wears on: 1.0 at the start, 0.55 by ~150s */
function heat(): number { return Math.max(0.55, 1 - clock * 0.003); }

function lose() {
  if (over) return;
  over = true; sound('lost');
  finalEl.textContent = `${clock.toFixed(1)}s`;
  detailEl.textContent = `${cleanCount} of ${N} nodes clean · ${cutsMade} strands cut`;
  overEl.classList.add('on');
}

/** boundary strands: one end burning, one end clean. These are the cuttable ones. */
function refreshLive() {
  live.length = 0;
  for (let i = 0; i < N; i++) {
    if (!burnt[i]) continue;
    for (const ei of graph.incident[i]!) {
      if (cut[ei]) continue;
      const e = graph.edges[ei]!;
      const o = e.a === i ? e.b : e.a;
      if (!burnt[o]) live.push(ei);
    }
  }
}

// ---------------------------------------------------------------- camera
/**
 * Static by design. Dragging is slicing, so the camera must never fight the blade:
 * a view that moves while you aim makes the one thing this spike tests impossible.
 * The player trades context for precision with the wheel, and off-screen fires are
 * called out by arrows rather than by yanking the camera.
 */
const camAt = new Vector3(0, 0, 0);
let camDist = 104, wantDist = 104, camYaw = 0.42;
const tmp = new Vector3();

addEventListener('wheel', (ev) => {
  ev.preventDefault();
  wantDist = Math.min(150, Math.max(20, wantDist * (1 + Math.sign(ev.deltaY) * 0.11)));
}, { passive: false });

function updateCamera(dt: number) {
  camDist += (wantDist - camDist) * (1 - Math.exp(-dt * 7));
  camYaw += dt * 0.014;                       // barely moving: alive, but never disruptive
  camera.position.set(
    camAt.x + Math.sin(camYaw) * camDist * 0.55,
    camAt.y + camDist * 0.26,
    camAt.z + Math.cos(camYaw) * camDist * 0.80,
  );
  camera.lookAt(camAt);
}

// ---------------------------------------------------------------- slicing
const trail: { x: number; y: number; t: number }[] = [];
let down = false;
const pa = new Vector3(), pb = new Vector3();

function toScreen(i: number, out: Vector3): boolean {
  out.set(POS[i * 3]!, POS[i * 3 + 1]!, POS[i * 3 + 2]!).project(camera);
  if (out.z > 1) return false;
  out.x = (out.x * 0.5 + 0.5) * innerWidth;
  out.y = (-out.y * 0.5 + 0.5) * innerHeight;
  return true;
}
function segHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function slice(x0: number, y0: number, x1: number, y1: number) {
  if (over) return;
  for (const ei of live) {
    if (cut[ei]) continue;
    const e = graph.edges[ei]!;
    if (!toScreen(e.a, pa) || !toScreen(e.b, pb)) continue;
    if (!segHit(x0, y0, x1, y1, pa.x, pa.y, pb.x, pb.y)) continue;
    cut[ei] = 1; cutsMade++; recoil.set(ei, 0.34); sound('cut');
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.via === ei) pending.splice(i, 1);
  }
}

addEventListener('pointerdown', (ev) => {
  if (!ac) { ac = new AudioContext(); void ac.resume(); }
  down = true; trail.length = 0; trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
  tipEl.style.opacity = '0';
});
addEventListener('pointermove', (ev) => {
  if (!down) return;
  const last = trail[trail.length - 1];
  if (last) slice(last.x, last.y, ev.clientX, ev.clientY);
  trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
  if (trail.length > 24) trail.shift();
});
addEventListener('pointerup', () => { down = false; });
addEventListener('keydown', (ev) => { if (ev.key === 'r' || ev.key === 'R') reset(); });

// ---------------------------------------------------------------- HUD
const clockEl = document.getElementById('clock')!;
const aliveEl = document.getElementById('alive')!;
const tipEl = document.getElementById('tip') as HTMLElement;
const overEl = document.getElementById('over')!;
const finalEl = document.getElementById('final')!;
const detailEl = document.getElementById('detail')!;

// ---------------------------------------------------------------- loop
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  blade.width = innerWidth * devicePixelRatio; blade.height = innerHeight * devicePixelRatio;
  blade.style.width = `${innerWidth}px`; blade.style.height = `${innerHeight}px`;
  bctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener('resize', resize);

const c = new Color();
let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (!over) {
    clock += dt;
    if (clock >= nextEmber) {
      ignite(leaves[(Math.random() * leaves.length) | 0]!);
      emberGap = Math.max(0.55, emberGap * 0.86);
      nextEmber = clock + emberGap;
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]!;
      if (p.at > clock) continue;
      pending.splice(i, 1);
      if (cut[p.via]) continue;
      ignite(p.node);
    }
    refreshLive();
  }
  for (const [ei, t] of recoil) { const r = t - dt; if (r <= 0) recoil.delete(ei); else recoil.set(ei, r); }

  // node colors
  for (let i = 0; i < N; i++) {
    if (burnt[i]) { c.copy(FIRE).multiplyScalar(1.5); }
    else { c.setRGB(BASE[i * 3]!, BASE[i * 3 + 1]!, BASE[i * 3 + 2]!); }
    nodeCol[i * 3] = c.r; nodeCol[i * 3 + 1] = c.g; nodeCol[i * 3 + 2] = c.b;
  }
  nodeGeo.getAttribute('color').needsUpdate = true;

  // edge colors
  for (let i = 0; i < E; i++) {
    const e = graph.edges[i]!;
    const rc = recoil.get(i);
    if (rc !== undefined) c.copy(PALETTE.white).multiplyScalar(rc * 5);
    else if (cut[i]) c.setRGB(0, 0, 0);
    else if (burnt[e.a] && burnt[e.b]) c.copy(ASH);
    else if (burnt[e.a] || burnt[e.b]) c.copy(HOT).multiplyScalar(1.9);
    else c.setRGB(BASE[e.a * 3]! * 0.5, BASE[e.a * 3 + 1]! * 0.5, BASE[e.a * 3 + 2]! * 0.5);
    for (let k = 0; k < 3; k++) {
      edgeCol[i * 6 + k] = k === 0 ? c.r : k === 1 ? c.g : c.b;
      edgeCol[i * 6 + 3 + k] = k === 0 ? c.r : k === 1 ? c.g : c.b;
    }
  }
  edgeGeo.getAttribute('color').needsUpdate = true;

  updateCamera(dt);
  composer.render(dt);

  // blade trail
  bctx.clearRect(0, 0, innerWidth, innerHeight);
  const cutoff = now - 130;
  while (trail.length && trail[0]!.t < cutoff) trail.shift();
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]!, b = trail[i]!;
      const age = 1 - (now - b.t) / 130;
      bctx.strokeStyle = `rgba(255,255,255,${(age * 0.85).toFixed(3)})`;
      bctx.lineWidth = 1 + age * 4.5; bctx.lineCap = 'round';
      bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(b.x, b.y); bctx.stroke();
    }
  }

  // off-screen fires get an arrow, so zooming in never hides a threat
  if (!over) {
    const cx = innerWidth / 2, cy = innerHeight / 2, m = 54;
    const seenBlob = new Set<number>();
    for (const ei of live) {
      const e = graph.edges[ei]!;
      const src = burnt[e.a] ? e.a : e.b;
      if (seenBlob.has(src)) continue;
      seenBlob.add(src);
      tmp.set(POS[src * 3]!, POS[src * 3 + 1]!, POS[src * 3 + 2]!).project(camera);
      const behind = tmp.z > 1;
      const sx = (tmp.x * 0.5 + 0.5) * innerWidth, sy = (-tmp.y * 0.5 + 0.5) * innerHeight;
      if (!behind && sx > m && sx < innerWidth - m && sy > m && sy < innerHeight - m) continue;
      let dx = sx - cx, dy = sy - cy;
      if (behind) { dx = -dx; dy = -dy; }
      const len = Math.hypot(dx, dy) || 1;
      const r = Math.min(cx - m, cy - m);
      const ax = cx + (dx / len) * r, ay = cy + (dy / len) * r;
      const ang = Math.atan2(dy, dx);
      bctx.save();
      bctx.translate(ax, ay); bctx.rotate(ang);
      bctx.fillStyle = 'rgba(255,0,110,.92)';
      bctx.beginPath(); bctx.moveTo(11, 0); bctx.lineTo(-7, 7); bctx.lineTo(-7, -7); bctx.closePath(); bctx.fill();
      bctx.restore();
    }
  }

  if (!over) { clockEl.textContent = `${clock.toFixed(1)}s`; aliveEl.textContent = String(cleanCount); }
  requestAnimationFrame(frame);
}

/** debug surface for automated play-testing */
(window as unknown as { fb: unknown }).fb = {
  get cuts() { return cutsMade; },
  get clock() { return clock; },
  get live() { return live.length; },
  get clean() { return cleanCount; },
  get over() { return over; },
  /** screen positions of every cuttable strand, for a scripted blade */
  strands() {
    const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const a = new Vector3(), b = new Vector3();
    for (const ei of live) {
      const e = graph.edges[ei]!;
      if (!toScreen(e.a, a) || !toScreen(e.b, b)) continue;
      out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
    return out;
  },
  reset,
};

reset();
resize();
requestAnimationFrame(frame);
