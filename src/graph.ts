import { Random } from './random';

/** 0 leaf, 1 category hub, 2 root, 3 bridge endpoint (stakes) */
export type NodeKind = 0 | 1 | 2 | 3;

export interface GraphNode {
  id: number;
  cluster: number;
  kind: NodeKind;
  size: number;
  seed: number;
  /** position within its flower, 0..1 (inner to outer); used for bloom ordering */
  rank: number;
}

export interface GraphEdge {
  id: number;
  a: number;
  b: number;
  hero: boolean;
  intra: boolean;
  /** 1 = spoke/bridge, 0 = fine webbing between leaves of one flower */
  weight: number;
}

/** A system: one root with a fan of hubs (each carrying a flower) or a single long-tail disc. */
export interface Cluster {
  id: number;
  center: [number, number, number];
  hub: number;
  /** 0 = core (green tint), 1 = blue field, 2 = violet field */
  tint: 0 | 1 | 2;
  hubs: number[];
  shape: 'fan' | 'disc';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  positions: Float32Array;
  incident: number[][];
  /** parent node in the hierarchy, -1 for roots */
  parent: Int32Array;
  /** edge to parent, -1 for roots */
  parentEdge: Int32Array;
  coreHub: number;
  /** cross-system edges (hero bridge first) */
  bridges: number[];
}

const LAYOUT_VERSION = 8;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

interface HubSpec {
  dir: [number, number, number];
  radius: number;
  leaves: number;
}

function distSq(p: number[], i: number, j: number): number {
  const dx = p[i * 3]! - p[j * 3]!;
  const dy = p[i * 3 + 1]! - p[j * 3 + 1]!;
  const dz = p[i * 3 + 2]! - p[j * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function fibonacciDir(i: number, n: number, rng: Random): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * GOLDEN + rng.range(-0.12, 0.12);
  return normalize([Math.cos(phi) * r, y * 0.9, Math.sin(phi) * r * 0.55]);
}

/** Radial fan of hubs with light repulsion so flowers do not overlap. */
function settleHubs(specs: HubSpec[], rng: Random): Array<[number, number, number]> {
  const pos = specs.map((s) => [s.dir[0] * s.radius, s.dir[1] * s.radius, s.dir[2] * s.radius] as [number, number, number]);
  const flowerR = specs.map((s) => 0.42 * Math.sqrt(s.leaves) + 1.6);
  for (let iter = 0; iter < 90; iter++) {
    for (let i = 0; i < pos.length; i++) {
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let j = 0; j < pos.length; j++) {
        if (i === j) continue;
        const dx = pos[i]![0] - pos[j]![0];
        const dy = pos[i]![1] - pos[j]![1];
        const dz = pos[i]![2] - pos[j]![2];
        const d = Math.hypot(dx, dy, dz) + 1e-4;
        const min = flowerR[i]! + flowerR[j]!;
        if (d < min) {
          const f = ((min - d) / min) * 0.35;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
          fz += (dz / d) * f;
        }
      }
      // Hold radius: stay on the shell so the fan keeps its dandelion silhouette.
      const p = pos[i]!;
      const r = Math.hypot(p[0], p[1], p[2]);
      const target = specs[i]!.radius;
      const k = ((target - r) / target) * 0.2;
      fx += (p[0] / r) * k * target;
      fy += (p[1] / r) * k * target;
      fz += (p[2] / r) * k * target;
      p[0] += fx + rng.range(-0.01, 0.01);
      p[1] += fy;
      p[2] += fz;
    }
  }
  return pos;
}

/** 1 ≈ 2k nodes (legible), 2 ≈ 8k, 3 ≈ 20k. */
export type Density = 1 | 2 | 3;

export function buildGraph(seed: number, density: Density = 1): Graph {
  const rng = new Random(seed ^ (density * 0x45d9f3b));
  const D = { hubs: [58, 110, 180][density - 1]!, leafScale: [1, 1.7, 3.0][density - 1]!, docsHubs: [15, 28, 42][density - 1]!, tail: [430, 1400, 4000][density - 1]!, radius: [1, 1.25, 1.5][density - 1]! };
  const nodes: GraphNode[] = [];
  const positions: number[] = [];
  const edges: GraphEdge[] = [];
  const clusters: Cluster[] = [];
  const parent: number[] = [];
  const parentEdge: number[] = [];
  const bridges: number[] = [];

  const addNode = (cluster: number, kind: NodeKind, size: number, p: [number, number, number], rank = 0): number => {
    const id = nodes.length;
    nodes.push({ id, cluster, kind, size, seed: rng.next(), rank });
    positions.push(p[0], p[1], p[2]);
    parent.push(-1);
    parentEdge.push(-1);
    return id;
  };
  const addEdge = (a: number, b: number, hero: boolean, treeChild = -1, weight = 1): number => {
    const id = edges.length;
    edges.push({ id, a, b, hero, intra: nodes[a]!.cluster === nodes[b]!.cluster, weight });
    if (treeChild >= 0) {
      parent[treeChild] = treeChild === a ? b : a;
      parentEdge[treeChild] = id;
    }
    return id;
  };

  /** Place a flower: hub at the stem, phyllotaxis disc of leaves fanning outward along `dir`. */
  const addFlower = (cluster: number, hubId: number, hubPos: [number, number, number], dir: [number, number, number], leaves: number, discOffset = 1.2): number[] => {
    const u = normalize(dir);
    const helper: [number, number, number] = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = normalize([
      u[1] * helper[2] - u[2] * helper[1],
      u[2] * helper[0] - u[0] * helper[2],
      u[0] * helper[1] - u[1] * helper[0],
    ]);
    const e2 = normalize([
      u[1] * e1[2] - u[2] * e1[1],
      u[2] * e1[0] - u[0] * e1[2],
      u[0] * e1[1] - u[1] * e1[0],
    ]);
    const rf = 0.42 * Math.sqrt(leaves) + 0.4;
    const center: [number, number, number] = [
      hubPos[0] + u[0] * (rf + discOffset),
      hubPos[1] + u[1] * (rf + discOffset),
      hubPos[2] + u[2] * (rf + discOffset),
    ];
    const spin = rng.range(0, Math.PI * 2);
    const ids: number[] = [];
    for (let i = 0; i < leaves; i++) {
      const r = rf * Math.sqrt((i + 0.5) / leaves);
      const th = i * GOLDEN + spin;
      const wobble = rng.range(-0.18, 0.18);
      const p: [number, number, number] = [
        center[0] + e1[0] * r * Math.cos(th) + e2[0] * r * Math.sin(th) + u[0] * wobble,
        center[1] + e1[1] * r * Math.cos(th) + e2[1] * r * Math.sin(th) + u[1] * wobble,
        center[2] + e1[2] * r * Math.cos(th) + e2[2] * r * Math.sin(th) + u[2] * wobble,
      ];
      const id = addNode(cluster, 0, 0.5 + rng.next() * 0.35, p, i / leaves);
      addEdge(hubId, id, false, id);
      ids.push(id);
    }
    // Fine webbing: each leaf to its two nearest siblings. Gives regions a woven texture.
    if (leaves <= 200) {
      const seen = new Set<string>();
      for (const i of ids) {
        const near = ids
          .filter((j) => j !== i)
          .sort((x, y) => distSq(positions, i, x) - distSq(positions, i, y))
          .slice(0, 2);
        for (const j of near) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          addEdge(i, j, false, -1, 0);
        }
      }
    }
    return ids;
  };

  /** A root with a radial fan of hubs, each carrying a flower. */
  const addFan = (
    clusterId: number,
    tint: 0 | 1 | 2,
    origin: [number, number, number],
    hubCount: number,
    radius: [number, number],
    rootSize: number,
  ): Cluster => {
    const root = addNode(clusterId, 2, rootSize, origin);
    const specs: HubSpec[] = [];
    for (let i = 0; i < hubCount; i++) {
      specs.push({
        dir: fibonacciDir(i, hubCount, rng),
        radius: radius[0] + (radius[1] - radius[0]) * Math.pow(rng.next(), 1.4),
        leaves: Math.floor((6 + 54 * Math.pow(rng.next(), 2.2)) * D.leafScale),
      });
    }
    const hubPos = settleHubs(specs, rng);
    const hubs: number[] = [];
    specs.forEach((spec, i) => {
      const local = hubPos[i]!;
      const p: [number, number, number] = [origin[0] + local[0], origin[1] + local[1], origin[2] + local[2]];
      const hub = addNode(clusterId, 1, 1.0 + Math.sqrt(spec.leaves) * 0.05, p);
      addEdge(root, hub, false, hub);
      addFlower(clusterId, hub, p, local, spec.leaves);
      hubs.push(hub);
    });
    const cluster: Cluster = { id: clusterId, center: origin, hub: root, tint, hubs, shape: 'fan' };
    clusters.push(cluster);
    return cluster;
  };

  // --- Main catalog: the dandelion.
  const main = addFan(0, 0, [0, 0, 0], D.hubs, [13 * D.radius, 26 * D.radius], 2.3);

  // --- Documents / specs system: violet, joined by bridges.
  const docsOrigin: [number, number, number] = [-40 * D.radius, -16 * D.radius, -14];
  const docs = addFan(1, 2, docsOrigin, D.docsHubs, [7 * D.radius, 13 * D.radius], 1.7);

  // --- Long tail: one hub at the rim of a large sunflower disc.
  const tailRoot: [number, number, number] = [34 * D.radius, 12 * D.radius, -36];
  const tailId = clusters.length;
  const tailHub = addNode(tailId, 2, 1.5, tailRoot);
  const tailDir: [number, number, number] = normalize([0.55, 0.25, -0.8]);
  addFlower(tailId, tailHub, tailRoot, tailDir, D.tail, 2.5);
  clusters.push({ id: tailId, center: tailRoot, hub: tailHub, tint: 1, hubs: [], shape: 'disc' });

  // --- Bridges. Hero: root to root. Then a handful of hub-to-hub links whose main-side
  // endpoints are stakes nodes.
  bridges.push(addEdge(main.hub, docs.hub, true));
  bridges.push(addEdge(main.hub, tailHub, true));
  const mainHubsByDocs = [...main.hubs].sort((x, y) => {
    const d = (id: number): number => {
      const i = id * 3;
      return Math.hypot(positions[i]! - docsOrigin[0], positions[i + 1]! - docsOrigin[1], positions[i + 2]! - docsOrigin[2]);
    };
    return d(x) - d(y);
  });
  for (let i = 0; i < 5; i++) {
    const hub = mainHubsByDocs[i * 2]!;
    const leafCandidates = edges.filter((e) => e.a === hub && nodes[e.b]!.kind === 0).map((e) => e.b);
    const leaf = rng.pick(leafCandidates);
    nodes[leaf]!.kind = 3;
    nodes[leaf]!.size = 1.0;
    bridges.push(addEdge(leaf, rng.pick(docs.hubs), false));
  }

  const n = nodes.length;
  const incident: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    incident[e.a]!.push(e.id);
    incident[e.b]!.push(e.id);
  }

  const pos = new Float32Array(positions);
  const settled = loadCachedLayout(seed * 10 + density, n) ?? saveCachedLayout(seed * 10 + density, pos);

  return {
    nodes,
    edges,
    clusters,
    positions: settled,
    incident,
    parent: new Int32Array(parent),
    parentEdge: new Int32Array(parentEdge),
    coreHub: main.hub,
    bridges,
  };
}

function cacheKey(seed: number): string {
  return `rx-kg-layout:v${LAYOUT_VERSION}:${seed}`;
}

function loadCachedLayout(seed: number, n: number): Float32Array | null {
  try {
    const raw = localStorage.getItem(cacheKey(seed));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== n * 3) {
      localStorage.removeItem(cacheKey(seed));
      return null;
    }
    return new Float32Array(parsed as number[]);
  } catch {
    return null;
  }
}

function saveCachedLayout(seed: number, pos: Float32Array): Float32Array {
  try {
    localStorage.setItem(cacheKey(seed), JSON.stringify(Array.from(pos)));
  } catch {
    // Storage unavailable (private mode): layout is deterministic, recompute next load.
  }
  return pos;
}
