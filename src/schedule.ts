import type { Graph } from './graph';
import { Random } from './random';

/** Stretches the whole choreography for legibility; individual flash/pulse physics stay real-time. */
export const TIME_SCALE = 3;
const BASE_LOOP = 20;
const BASE_LAND = 4.0; // inbound query lands on the catalog root
const BASE_ANSWER = 16.2; // one answer leaves the root
export const LOOP = BASE_LOOP * TIME_SCALE;
export const LAND = BASE_LAND * TIME_SCALE;
export const ANSWER = BASE_ANSWER * TIME_SCALE;

export interface Signal {
  edge: number;
  t0: number;
  dur: number;
  /** +1 travels a -> b, -1 travels b -> a */
  dir: 1 | -1;
  strength: number;
}

export interface LogEvent {
  t: number;
  text: string;
}

export interface Label {
  node: number;
  t: number;
  text: string;
}

export interface Schedule {
  events: LogEvent[];
  labels: Label[];
  nodeStart: Float32Array;
  edgeStart: Float32Array;
  edgeDur: Float32Array;
  /** edge endpoint that draws first (0 = a, 1 = b) */
  edgeFrom: Uint8Array;
  signals: Signal[];
}

/**
 * Every glow has a cause. The query lands on the root; hero spokes draw to the biggest
 * catalog hubs and their flowers bloom; a radial sweep wakes the rest of the fan; bridges
 * carry the signal to the documents system and the long tail; return traffic converges on
 * the root and one answer leaves.
 */
export function buildSchedule(graph: Graph, seed: number): Schedule {
  const rng = new Random(seed ^ 0x9e3779b9);
  const n = graph.nodes.length;
  const m = graph.edges.length;
  const nodeStart = new Float32Array(n).fill(Infinity);
  const edgeStart = new Float32Array(m).fill(Infinity);
  const edgeDur = new Float32Array(m).fill(0.5);
  const edgeFrom = new Uint8Array(m);
  const signals: Signal[] = [];
  const events: LogEvent[] = [];
  const labels: Label[] = [];
  const p = graph.positions;
  const CATALOG_NAMES = ['Perfiles de aluminio', 'Sistema modular MB', 'Herrajes y conectores', 'Ruedas y rodamientos', 'Automatización lineal', 'Accesorios y CAD', 'Uniones y brocas', 'Documentación técnica'];
  const DOC_NAMES = ['Matriz de compatibilidad', 'Especificaciones técnicas', 'Límites de carga'];
  /** Bakes the scaled, "realistic" elapsed time into log text at construction time. */
  /** mm:ss elapsed since the query landed, unambiguous at a glance (unlike raw seconds). */
  const fmt = (t: number): string => {
    const total = Math.round(t * TIME_SCALE);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const len = (eid: number): number => {
    const e = graph.edges[eid]!;
    return Math.hypot(p[e.a * 3]! - p[e.b * 3]!, p[e.a * 3 + 1]! - p[e.b * 3 + 1]!, p[e.a * 3 + 2]! - p[e.b * 3 + 2]!);
  };
  const leavesOf = (hub: number): number[] =>
    graph.incident[hub]!.map((eid) => graph.edges[eid]!).filter((e) => graph.parent[e.b] === hub && e.a === hub).map((e) => e.b);

  /** Draw the tree edge from parent to child, arriving at `arrive`. */
  const drawTo = (child: number, arrive: number, dur: number): void => {
    const eid = graph.parentEdge[child]!;
    const e = graph.edges[eid]!;
    edgeStart[eid] = arrive - dur;
    edgeDur[eid] = dur;
    edgeFrom[eid] = e.a === graph.parent[child] ? 0 : 1;
    nodeStart[child] = Math.min(nodeStart[child]!, arrive);
  };

  /** Bloom a flower: leaves ignite inner ring first, spiralling outward. */
  const bloom = (hub: number, hubStart: number, spread: number, keep: number): void => {
    for (const leaf of leavesOf(hub)) {
      if (rng.next() > keep) continue;
      const rank = graph.nodes[leaf]!.rank;
      const delay = 0.12 + rank * spread + rng.range(0, 0.08);
      drawTo(leaf, hubStart + delay, Math.max(0.2, delay - 0.05));
    }
  };

  /** Wake a fan system from its root. `heroCount` hubs draw as staged hero spokes. */
  const wakeFan = (
    clusterId: number,
    rootStart: number,
    heroCount: number,
    heroGap: number,
    sweepStart: number,
    sweepDur: number,
    keep: number,
    names: string[],
  ): void => {
    const cluster = graph.clusters[clusterId]!;
    nodeStart[cluster.hub] = Math.min(nodeStart[cluster.hub]!, rootStart);
    const hubs = [...cluster.hubs];
    const leafCount = (h: number): number => leavesOf(h).length;
    const heroes = [...hubs].sort((x, y) => leafCount(y) - leafCount(x)).slice(0, heroCount);
    const heroSet = new Set(heroes);
    heroes
      .sort((x, y) => len(graph.parentEdge[x]!) - len(graph.parentEdge[y]!))
      .forEach((hub, i) => {
        const start = rootStart + 0.25 + i * heroGap + rng.range(-0.05, 0.05);
        const dur = 0.5 + len(graph.parentEdge[hub]!) * 0.03;
        drawTo(hub, start + dur, dur);
        signals.push({ edge: graph.parentEdge[hub]!, t0: start, dur, dir: edgeFrom[graph.parentEdge[hub]!] === 0 ? 1 : -1, strength: 1.3 });
        bloom(hub, start + dur, 0.8, keep);
        const name = names[i] ?? `Hub ${hub}`;
        const count = leafCount(hub);
        labels.push({ node: hub, t: start + dur, text: `${name} · ${count} referencias` });
        events.push({ t: start + dur, text: `${fmt(start + dur)}  Encuentra la familia "${name}": ${count} referencias posibles` });
      });
    // Radial sweep by azimuth around the root.
    const c = cluster.center;
    const rest = hubs
      .filter((h) => !heroSet.has(h))
      .sort((x, y) => Math.atan2(p[x * 3 + 1]! - c[1], p[x * 3]! - c[0]) - Math.atan2(p[y * 3 + 1]! - c[1], p[y * 3]! - c[0]));
    if (rest.length) events.push({ t: sweepStart, text: `${fmt(sweepStart)}  Revisa las otras ${rest.length} familias de producto por si aplican` });
    rest.forEach((hub, i) => {
      const start = sweepStart + (i / Math.max(1, rest.length)) * sweepDur + rng.range(-0.06, 0.06);
      const dur = 0.45 + len(graph.parentEdge[hub]!) * 0.025;
      drawTo(hub, start + dur, dur);
      bloom(hub, start + dur, 0.7, keep);
    });
  };

  // 4-7s: root blooms, six hero spokes draw, their flowers open.
  // 6.8-10.4s: the rest of the catalog wakes in a radial sweep.
  wakeFan(0, BASE_LAND, 6, 0.32, 6.8, 3.6, 0.92, CATALOG_NAMES);
  events.push({ t: BASE_LAND - 2.0, text: `${fmt(BASE_LAND - 2.0)}  El cliente pregunta: "{QUERY}"` });
  events.push({ t: BASE_LAND, text: `${fmt(BASE_LAND)}  La pregunta llega al catálogo completo de item` });
  labels.push({ node: graph.coreHub, t: BASE_LAND, text: `Catálogo item · +4.500 referencias` });

  // 8.4s: hero bridge to the documents system; it wakes 10-12.5s.
  const docsBridge = graph.bridges[0]!;
  const docsRoot = graph.clusters[1]!.hub;
  {
    const start = 8.4;
    const dur = 0.5 + len(docsBridge) * 0.028;
    edgeStart[docsBridge] = start;
    edgeDur[docsBridge] = dur;
    edgeFrom[docsBridge] = graph.edges[docsBridge]!.a === graph.coreHub ? 0 : 1;
    signals.push({ edge: docsBridge, t0: start, dur, dir: edgeFrom[docsBridge] === 0 ? 1 : -1, strength: 1.5 });
    wakeFan(1, start + dur, 3, 0.22, start + dur + 0.6, 1.8, 0.9, DOC_NAMES);
    events.push({ t: start, text: `${fmt(start)}  Cruza la respuesta con la matriz de compatibilidad técnica` });
    events.push({ t: start + dur + 0.3, text: `${fmt(start + dur + 0.3)}  Verifica los datos contra la documentación técnica oficial` });
    labels.push({ node: docsRoot, t: start + dur, text: `Matriz de compatibilidad · ${graph.nodes.filter((nd) => nd.cluster === 1 && nd.kind === 0).length} relaciones` });
  }

  // 9.6s: bridge to the long tail; its disc indexes in a spiral sweep 11.2-14s.
  const tailBridge = graph.bridges[1]!;
  const tail = graph.clusters[2]!;
  {
    const start = 9.6;
    const dur = 0.5 + len(tailBridge) * 0.028;
    edgeStart[tailBridge] = start;
    edgeDur[tailBridge] = dur;
    edgeFrom[tailBridge] = graph.edges[tailBridge]!.a === graph.coreHub ? 0 : 1;
    signals.push({ edge: tailBridge, t0: start, dur, dir: edgeFrom[tailBridge] === 0 ? 1 : -1, strength: 1.5 });
    nodeStart[tail.hub] = start + dur;
    events.push({ t: start, text: `${fmt(start)}  Busca piezas y configuraciones relacionadas` });
    events.push({ t: start + dur + 0.2, text: `${fmt(start + dur + 0.2)}  Explora miles de configuraciones posibles` });
    labels.push({ node: tail.hub, t: start + dur, text: `Configuraciones · ${leavesOf(tail.hub).length} indexadas` });
    for (const leaf of leavesOf(tail.hub)) {
      const rank = graph.nodes[leaf]!.rank;
      const arrive = start + dur + 0.15 + rank * 2.7;
      drawTo(leaf, arrive, 0.28);
    }
  }

  // Webbing lights once both ends are awake.
  for (const e of graph.edges) {
    if (e.weight !== 0) continue;
    const ta = nodeStart[e.a]!;
    const tb = nodeStart[e.b]!;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    edgeStart[e.id] = Math.max(ta, tb) + rng.range(0.05, 0.35);
    edgeDur[e.id] = 0.3;
    edgeFrom[e.id] = ta <= tb ? 0 : 1;
  }

  // Stakes bridges light once both ends are awake.
  const stakesTimes: number[] = [];
  for (const eid of graph.bridges.slice(2)) {
    const e = graph.edges[eid]!;
    const ta = nodeStart[e.a]!;
    const tb = nodeStart[e.b]!;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
    const start = Math.max(ta, tb) + rng.range(0.2, 0.6);
    edgeStart[eid] = start;
    edgeDur[eid] = 0.6 + len(eid) * 0.02;
    edgeFrom[eid] = ta <= tb ? 0 : 1;
    signals.push({ edge: eid, t0: start, dur: edgeDur[eid]!, dir: edgeFrom[eid] === 0 ? 1 : -1, strength: 0.8 });
    stakesTimes.push(start);
  }
  if (stakesTimes.length) {
    const first = Math.min(...stakesTimes);
    events.push({ t: first, text: `${fmt(first)}  ${stakesTimes.length} casos con dudas se envían a un ingeniero item para revisarlos` });
  }

  // 11-18s: return traffic. Leaves answer back to their hub, hubs back to the root: many
  // streams converging on one point.
  const heroHubs = graph.clusters[0]!.hubs.filter((h) => (nodeStart[h] as number) < 7.5);
  const spokes = graph.clusters[0]!.hubs.map((h) => graph.parentEdge[h]!).filter((eid) => Number.isFinite(edgeStart[eid]!));
  rng.shuffle(spokes);
  spokes.slice(0, 14).forEach((eid, i) => {
    const t0 = 11.2 + (i / 14) * 4.6 + rng.range(-0.15, 0.15);
    signals.push({ edge: eid, t0, dur: rng.range(0.9, 1.4), dir: edgeFrom[eid] === 0 ? -1 : 1, strength: rng.range(0.55, 0.9) });
  });
  heroHubs.forEach((hub, i) => {
    const eid = graph.parentEdge[hub]!;
    signals.push({ edge: eid, t0: 13.6 + i * 0.35, dur: 1.2, dir: edgeFrom[eid] === 0 ? -1 : 1, strength: 1.0 });
  });
  signals.push({ edge: docsBridge, t0: 13.2, dur: 1.6, dir: edgeFrom[docsBridge] === 0 ? -1 : 1, strength: 1.1 });
  signals.push({ edge: tailBridge, t0: 14.0, dur: 1.5, dir: edgeFrom[tailBridge] === 0 ? -1 : 1, strength: 1.0 });
  // A few leaf answers inside flowers.
  const leafEdges = graph.edges.filter((e) => graph.nodes[e.b]!.kind === 0 && Number.isFinite(edgeStart[e.id]!) && edgeStart[e.id]! < 10);
  rng.shuffle(leafEdges);
  leafEdges.slice(0, 12).forEach((e, i) => {
    signals.push({ edge: e.id, t0: 11.5 + i * 0.5 + rng.range(-0.1, 0.1), dur: 0.6, dir: edgeFrom[e.id] === 0 ? -1 : 1, strength: 0.6 });
  });

  events.push({ t: 11.2, text: `${fmt(11.2)}  Reúne todo lo que encontró en cada familia de producto` });
  events.push({ t: 13.4, text: `${fmt(13.4)}  Combina toda la información en una sola respuesta` });
  events.push({ t: BASE_ANSWER, text: `${fmt(BASE_ANSWER)}  Entrega una respuesta validada al cliente` });
  events.sort((x, y) => x.t - y.t);

  // Everything above is built in the base (unscaled) timeline; stretch it to TIME_SCALE now,
  // in one place, so choreography, envelope, and log timestamps never drift apart.
  for (const ev of events) ev.t *= TIME_SCALE;
  for (const l of labels) l.t *= TIME_SCALE;
  for (let i = 0; i < nodeStart.length; i++) nodeStart[i]! *= TIME_SCALE;
  for (let i = 0; i < edgeStart.length; i++) {
    edgeStart[i]! *= TIME_SCALE;
    edgeDur[i]! *= TIME_SCALE;
  }
  for (const s of signals) {
    s.t0 *= TIME_SCALE;
    s.dur *= TIME_SCALE;
  }

  return { events, labels, nodeStart, edgeStart, edgeDur, edgeFrom, signals };
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Global brightness envelope; keeps fading into the next loop so the reset is seamless. */
export function envelope(t: number): number {
  const t1 = 17 * TIME_SCALE;
  const t2 = 19.8 * TIME_SCALE;
  const t3 = 23.2 * TIME_SCALE;
  if (t < t1) return 1;
  const a = 1 - smoothstep(t1, t2, t) * 0.65;
  const b = 1 - smoothstep(t2, t3, t);
  return a * b;
}

/** Per-node ignition curve: sharp flare, overshoot, settle to a persistent halo. */
export function ignition(age: number): number {
  if (age <= 0) return 0;
  const attack = 1 - Math.exp(-age * 14);
  const flare = 1 + 1.35 * Math.exp(-age * 3.2);
  return attack * flare;
}

export function nodeActivation(start: number, t: number): number {
  if (!Number.isFinite(start)) return 0;
  const current = ignition(t - start) * envelope(t);
  const residue = ignition(t + LOOP - start) * envelope(t + LOOP);
  return Math.max(current, residue);
}

export interface EdgeState {
  progress: number;
  glow: number;
}

export function edgeState(start: number, dur: number, t: number): EdgeState {
  if (!Number.isFinite(start)) return { progress: 0, glow: 0 };
  const cur = edgeStateAt(start, dur, t);
  const res = edgeStateAt(start, dur, t + LOOP);
  return cur.glow >= res.glow ? cur : res;
}

function edgeStateAt(start: number, dur: number, t: number): EdgeState {
  const age = t - start;
  if (age <= 0) return { progress: 0, glow: 0 };
  const progress = Math.min(1, age / dur);
  const settle = progress >= 1 ? 1 + 0.9 * Math.exp(-(age - dur) * 2.5) : 1;
  return { progress, glow: settle * envelope(t) };
}
