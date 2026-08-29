# Catalog Routing Game Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sixty-second, single-wave prototype that answers whether routing an under-specified catalog query under a clock is fun, and instrument it well enough to answer whether anyone cares.

**Architecture:** A standalone Vite page with its own entry point that imports the existing renderer modules but does not modify `main.ts`. All game logic is pure and Three.js-free behind a hard boundary, so it is unit-testable in Node. The scene is lit entirely through the renderers' existing runtime-writable channels (`NodeField.boost`, `EdgeField.setBoost/setPulse`), which means no shader or buffer changes are required.

**Tech Stack:** TypeScript, Vite, Three.js, postprocessing, Vitest (added by Task 1), pnpm.

**Spec:** `docs/superpowers/specs/2026-08-29-routing-game-design.md`

## Global Constraints

- **No file under `src/game/` above the boundary may import `three`.** The boundary is: `catalog.ts`, `catalog-fixture.ts`, `query.ts`, `state.ts` are Three-free. Only `bridge.ts`, `input.ts`, `hud.ts`, `main.ts` may import Three.
- **Do not modify `src/main.ts`.** It is ~1000 lines of module-level singletons with no teardown; refactoring it is explicitly out of scope for this prototype.
- **Do not modify any existing file under `src/` except where a task says so explicitly.** The prototype consumes the renderers as they are.
- **The word "hallucination" must not appear in any user-facing string.** A wrong chain is a "bad callout".
- **No customer names, real part numbers, or attributable figures.** All catalog content is synthetic industrial end-of-arm-tooling vocabulary.
- **Economy values, exact:** correct answer `+100 * N`; wrong answer `-100`; escalate `+50` flat; 2 check charges per session.
- **Clock, exact:** 20 seconds for query 1, 12 seconds for queries 2-6.
- **Session, exact:** 6 queries, one at a time.
- **Determinism:** all randomness goes through `Random` from `src/random.ts`. Never call `Math.random()`.
- **Run `pnpm build` before every commit.** It runs `tsc --noEmit` then `vite build`; both must pass.

---

### Task 1: Test harness and the catalog model

**Files:**
- Modify: `package.json` (add vitest dev dependency and `test` script)
- Create: `src/game/catalog.ts`
- Create: `src/game/catalog-fixture.ts`
- Test: `src/game/catalog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SlotId`, `Band`, `Category`, `Catalog`, `CatalogSource`, `QuerySpec` types; `FixtureCatalogSource` class with `load(): Promise<Catalog>`.

- [ ] **Step 1: Add Vitest**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `src/game/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FixtureCatalogSource } from './catalog-fixture';

describe('fixture catalog', () => {
  it('loads three categories, one per slot, each with three bands', async () => {
    const catalog = await new FixtureCatalogSource().load();
    expect(catalog.categories.map((c) => c.slot)).toEqual(['toolChanger', 'gripper', 'adapter']);
    for (const category of catalog.categories) {
      expect(category.bands).toHaveLength(3);
    }
  });

  it('gives every band a stable id and a human label', async () => {
    const catalog = await new FixtureCatalogSource().load();
    const ids = catalog.categories.flatMap((c) => c.bands.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of catalog.categories) {
      for (const band of category.bands) {
        expect(band.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('orders bands explicitly so the renderer never infers order from geometry', async () => {
    const catalog = await new FixtureCatalogSource().load();
    for (const category of catalog.categories) {
      expect(category.bands.map((b) => b.order)).toEqual([0, 1, 2]);
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./catalog-fixture`.

- [ ] **Step 5: Write the catalog model**

Create `src/game/catalog.ts`:

```ts
/** Which position in the answer chain a category fills. */
export type SlotId = 'toolChanger' | 'gripper' | 'adapter';

/** One selectable band on a category arm. */
export interface Band {
  id: string;
  label: string;
  /** Explicit position on the arm. The renderer must not infer order from geometry. */
  order: number;
  /** Payload window in kg, for categories rated by payload. */
  payloadMin?: number;
  payloadMax?: number;
  /** Applications this band suits. */
  applications?: string[];
  /** Robot families this band mates with. */
  robots?: string[];
}

export interface Category {
  slot: SlotId;
  label: string;
  bands: Band[];
}

export interface Catalog {
  categories: Category[];
}

/**
 * The seam a future Neo4j-backed catalog plugs into. Async because a graph query is.
 * Everything downstream depends on this interface, never on a concrete implementation.
 */
export interface CatalogSource {
  load(): Promise<Catalog>;
}

/** What the customer told us. Absent fields are genuinely unknown, not defaults. */
export interface QuerySpec {
  robot?: string;
  /** An exact payload figure, when the customer gave one. */
  payloadExact?: number;
  /** A lower bound, when the customer was vague ("at least this heavy"). */
  payloadAtLeast?: number;
  application?: string;
}
```

- [ ] **Step 6: Write the fixture**

Create `src/game/catalog-fixture.ts`:

```ts
import type { Catalog, CatalogSource } from './catalog';

/**
 * Synthetic end-of-arm-tooling catalog. Generic category vocabulary, invented ids.
 * Band payload windows and application lists are chosen so that omitting one spec
 * attribute yields exactly three candidates and a range hint yields exactly two.
 */
const CATALOG: Catalog = {
  categories: [
    {
      slot: 'toolChanger',
      label: 'Tool changers',
      bands: [
        { id: 'TC-A', label: '5–10 kg', order: 0, payloadMin: 5, payloadMax: 10 },
        { id: 'TC-B', label: '10–16 kg', order: 1, payloadMin: 10, payloadMax: 16 },
        { id: 'TC-C', label: '16–30 kg', order: 2, payloadMin: 16, payloadMax: 30 },
      ],
    },
    {
      slot: 'gripper',
      label: 'Grippers',
      bands: [
        { id: 'GR-VAC', label: 'Vacuum', order: 0, applications: ['palletizing', 'packaging'] },
        { id: 'GR-2JAW', label: 'Two-jaw', order: 1, applications: ['assembly', 'machine tending'] },
        { id: 'GR-3JAW', label: 'Three-jaw', order: 2, applications: ['machine tending', 'welding'] },
      ],
    },
    {
      slot: 'adapter',
      label: 'Robot-side adapters',
      bands: [
        { id: 'RA-U', label: 'U-series flange', order: 0, robots: ['UR10e', 'UR5e'] },
        { id: 'RA-K', label: 'K-series flange', order: 1, robots: ['KR10', 'KR16'] },
        { id: 'RA-F', label: 'F-series flange', order: 2, robots: ['CRX-10iA', 'LR-Mate'] },
      ],
    },
  ],
};

export class FixtureCatalogSource implements CatalogSource {
  load(): Promise<Catalog> {
    // Structured-clone so callers cannot mutate the module-level fixture.
    return Promise.resolve(structuredClone(CATALOG));
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 3 tests.

- [ ] **Step 8: Verify the build still passes**

Run: `pnpm build`
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml src/game/catalog.ts src/game/catalog-fixture.ts src/game/catalog.test.ts
git commit -m "feat: catalog model, synthetic fixture, and test harness"
```

---

### Task 2: Compatibility and candidate counting

This is the mechanical heart of the prototype: N is what the player bets against, so it must be exactly right.

**Files:**
- Modify: `src/game/catalog.ts` (append functions)
- Test: `src/game/candidates.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `Band`, `QuerySpec`, `SlotId` from Task 1.
- Produces: `bandMatches(band: Band, spec: QuerySpec): boolean`; `candidatesForSlot(catalog: Catalog, slot: SlotId, spec: QuerySpec): Band[]`; `candidateCount(catalog: Catalog, spec: QuerySpec): number`; `isChainCorrect(catalog: Catalog, spec: QuerySpec, chain: Record<SlotId, string>): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/game/candidates.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { candidateCount, candidatesForSlot, isChainCorrect } from './catalog';
import type { Catalog, QuerySpec } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
});

const complete: QuerySpec = { robot: 'UR10e', payloadExact: 12.5, application: 'palletizing' };

describe('candidate counting', () => {
  it('a fully specified query resolves to exactly one chain', () => {
    expect(candidateCount(catalog, complete)).toBe(1);
  });

  it('an exact payload selects the single band whose window contains it', () => {
    const bands = candidatesForSlot(catalog, 'toolChanger', complete);
    expect(bands.map((b) => b.id)).toEqual(['TC-B']);
  });

  it('a lower-bound payload hint leaves exactly two tool changers', () => {
    const spec: QuerySpec = { ...complete, payloadExact: undefined, payloadAtLeast: 12 };
    expect(candidatesForSlot(catalog, 'toolChanger', spec).map((b) => b.id)).toEqual(['TC-B', 'TC-C']);
    expect(candidateCount(catalog, spec)).toBe(2);
  });

  it('an omitted attribute leaves all three bands in that slot', () => {
    const spec: QuerySpec = { ...complete, payloadExact: undefined };
    expect(candidatesForSlot(catalog, 'toolChanger', spec)).toHaveLength(3);
    expect(candidateCount(catalog, spec)).toBe(3);
  });

  it('an application shared by two grippers leaves two candidates', () => {
    const spec: QuerySpec = { ...complete, application: 'machine tending' };
    expect(candidatesForSlot(catalog, 'gripper', spec).map((b) => b.id)).toEqual(['GR-2JAW', 'GR-3JAW']);
  });

  it('an unknown robot matches nothing rather than everything', () => {
    const spec: QuerySpec = { ...complete, robot: 'NOT-A-ROBOT' };
    expect(candidatesForSlot(catalog, 'adapter', spec)).toHaveLength(0);
  });

  it('accepts a chain that satisfies every slot', () => {
    const chain = { toolChanger: 'TC-B', gripper: 'GR-VAC', adapter: 'RA-U' } as const;
    expect(isChainCorrect(catalog, complete, chain)).toBe(true);
  });

  it('rejects a chain with any wrong slot', () => {
    const chain = { toolChanger: 'TC-A', gripper: 'GR-VAC', adapter: 'RA-U' } as const;
    expect(isChainCorrect(catalog, complete, chain)).toBe(false);
  });

  it('rejects a chain naming a band that does not exist', () => {
    const chain = { toolChanger: 'NOPE', gripper: 'GR-VAC', adapter: 'RA-U' } as const;
    expect(isChainCorrect(catalog, complete, chain)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `candidateCount` is not exported.

- [ ] **Step 3: Implement the functions**

Append to `src/game/catalog.ts`:

```ts
/** Does this band satisfy everything the customer actually told us? */
export function bandMatches(band: Band, spec: QuerySpec): boolean {
  if (band.payloadMin !== undefined && band.payloadMax !== undefined) {
    if (spec.payloadExact !== undefined) {
      if (spec.payloadExact < band.payloadMin || spec.payloadExact > band.payloadMax) return false;
    } else if (spec.payloadAtLeast !== undefined) {
      // The band must be able to carry at least the stated floor.
      if (band.payloadMax < spec.payloadAtLeast) return false;
    }
    // Neither figure given: every payload band remains possible.
  }
  if (band.applications !== undefined && spec.application !== undefined) {
    if (!band.applications.includes(spec.application)) return false;
  }
  if (band.robots !== undefined && spec.robot !== undefined) {
    if (!band.robots.includes(spec.robot)) return false;
  }
  return true;
}

function categoryFor(catalog: Catalog, slot: SlotId): Category {
  const category = catalog.categories.find((c) => c.slot === slot);
  if (!category) throw new Error(`unknown slot: ${slot}`);
  return category;
}

/** Every band in this slot still consistent with the spec, in explicit band order. */
export function candidatesForSlot(catalog: Catalog, slot: SlotId, spec: QuerySpec): Band[] {
  return categoryFor(catalog, slot)
    .bands.filter((band) => bandMatches(band, spec))
    .sort((a, b) => a.order - b.order);
}

/** N: how many complete chains the spec leaves open. This is what the player bets against. */
export function candidateCount(catalog: Catalog, spec: QuerySpec): number {
  return catalog.categories.reduce(
    (total, category) => total * candidatesForSlot(catalog, category.slot, spec).length,
    1,
  );
}

/** A chain is correct when every named band satisfies the spec. */
export function isChainCorrect(
  catalog: Catalog,
  spec: QuerySpec,
  chain: Record<SlotId, string>,
): boolean {
  return catalog.categories.every((category) => {
    const band = category.bands.find((b) => b.id === chain[category.slot]);
    return band !== undefined && bandMatches(band, spec);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 12 tests total.

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/game/catalog.ts src/game/candidates.test.ts
git commit -m "feat: compatibility matching and candidate counting"
```

---

### Task 3: Seeded query generation

**Files:**
- Create: `src/game/query.ts`
- Test: `src/game/query.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `QuerySpec`, `SlotId`, `candidateCount`, `isChainCorrect` from Tasks 1-2; `Random` from `src/random.ts`.
- Produces: `interface Query { spec: QuerySpec; answer: Record<SlotId, string>; n: number; clockSeconds: number }`; `generateSession(catalog: Catalog, seed: number): Query[]`.

- [ ] **Step 1: Write the failing test**

Create `src/game/query.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import { candidateCount, isChainCorrect } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';
import { generateSession } from './query';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
});

describe('session generation', () => {
  it('produces exactly six queries', () => {
    expect(generateSession(catalog, 1)).toHaveLength(6);
  });

  it('is deterministic for a given seed', () => {
    expect(generateSession(catalog, 42)).toEqual(generateSession(catalog, 42));
  });

  it('differs between seeds', () => {
    expect(generateSession(catalog, 1)).not.toEqual(generateSession(catalog, 2));
  });

  it('teaches in order: first two are certain, then ambiguity appears', () => {
    const session = generateSession(catalog, 7);
    expect(session[0]!.n).toBe(1);
    expect(session[1]!.n).toBe(1);
    expect(session[2]!.n).toBe(2);
  });

  it('covers all three ambiguity levels across a session', () => {
    const levels = new Set(generateSession(catalog, 7).map((q) => q.n));
    expect(levels).toEqual(new Set([1, 2, 3]));
  });

  it("every query's stated n matches what the catalog actually resolves", () => {
    for (const query of generateSession(catalog, 99)) {
      expect(candidateCount(catalog, query.spec)).toBe(query.n);
    }
  });

  it('the recorded answer is always a correct chain for its spec', () => {
    for (const query of generateSession(catalog, 99)) {
      expect(isChainCorrect(catalog, query.spec, query.answer)).toBe(true);
    }
  });

  it('gives query one a 20 second clock and the rest 12', () => {
    const session = generateSession(catalog, 3);
    expect(session[0]!.clockSeconds).toBe(20);
    expect(session.slice(1).every((q) => q.clockSeconds === 12)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./query`.

- [ ] **Step 3: Implement generation**

Create `src/game/query.ts`:

```ts
import { Random } from '../random';
import type { Band, Catalog, QuerySpec, SlotId } from './catalog';
import { candidateCount, isChainCorrect } from './catalog';

export interface Query {
  spec: QuerySpec;
  /** The chain the customer actually needs. Used to score, never shown before commit. */
  answer: Record<SlotId, string>;
  /** How many chains the spec leaves open. Shown to the player. */
  n: number;
  clockSeconds: number;
}

/**
 * Ambiguity level per query position. The first two are certain so the player learns the
 * verb before they are asked to judge odds; the rest mix so a session covers 1, 2 and 3.
 */
const AMBIGUITY_BY_POSITION: ReadonlyArray<1 | 2 | 3> = [1, 1, 2, 3, 2, 3];

function bandById(catalog: Catalog, slot: SlotId, id: string): Band {
  const band = catalog.categories.find((c) => c.slot === slot)?.bands.find((b) => b.id === id);
  if (!band) throw new Error(`unknown band ${id} in ${slot}`);
  return band;
}

/** A spec that names every attribute, so exactly one chain survives. */
function completeSpec(catalog: Catalog, answer: Record<SlotId, string>): QuerySpec {
  const tool = bandById(catalog, 'toolChanger', answer.toolChanger);
  const gripper = bandById(catalog, 'gripper', answer.gripper);
  const adapter = bandById(catalog, 'adapter', answer.adapter);
  // Pick an application unique to this gripper so the gripper slot is unambiguous.
  const unique = (gripper.applications ?? []).find(
    (app) =>
      catalog.categories
        .find((c) => c.slot === 'gripper')!
        .bands.filter((b) => (b.applications ?? []).includes(app)).length === 1,
  );
  return {
    robot: (adapter.robots ?? [])[0],
    payloadExact: (tool.payloadMin! + tool.payloadMax!) / 2,
    application: unique ?? (gripper.applications ?? [])[0],
  };
}

/** Widen a complete spec until it leaves exactly `target` chains open. */
function degrade(catalog: Catalog, spec: QuerySpec, target: 2 | 3, rng: Random): QuerySpec {
  if (target === 3) {
    // Drop one attribute entirely: that slot falls back to all three bands.
    const which = rng.int(3);
    if (which === 0) return { ...spec, payloadExact: undefined };
    if (which === 1) return { ...spec, application: undefined };
    return { ...spec, robot: undefined };
  }
  // target === 2: replace the exact payload with a floor that two bands can carry.
  return { ...spec, payloadExact: undefined, payloadAtLeast: 12 };
}

export function generateSession(catalog: Catalog, seed: number): Query[] {
  const rng = new Random(seed);
  const queries: Query[] = [];

  for (const level of AMBIGUITY_BY_POSITION) {
    let query: Query | null = null;
    // Retry until the degraded spec lands on exactly the intended N. The fixture is
    // built so this succeeds quickly, but the loop keeps generation honest if it changes.
    for (let attempt = 0; attempt < 50 && query === null; attempt++) {
      const answer: Record<SlotId, string> = {
        toolChanger: rng.pick(catalog.categories[0]!.bands).id,
        gripper: rng.pick(catalog.categories[1]!.bands).id,
        adapter: rng.pick(catalog.categories[2]!.bands).id,
      };
      const base = completeSpec(catalog, answer);
      const spec = level === 1 ? base : degrade(catalog, base, level, rng);
      if (candidateCount(catalog, spec) !== level) continue;
      // Degrading can invalidate the answer we picked: a lower-bound payload hint
      // excludes the lightest tool changer. Reject and redraw rather than shipping
      // a query whose own recorded answer would score as wrong.
      if (!isChainCorrect(catalog, spec, answer)) continue;
      query = {
        spec,
        answer,
        n: level,
        clockSeconds: queries.length === 0 ? 20 : 12,
      };
    }
    if (query === null) throw new Error(`could not generate a query with n=${level}`);
    queries.push(query);
  }

  return queries;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 20 tests total.

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/game/query.ts src/game/query.test.ts
git commit -m "feat: seeded session generation with controlled ambiguity"
```

---

### Task 4: The game state reducer

The economy from the spec, as a pure function. This is what the whole prototype exists to test, so it gets the heaviest tests.

**Files:**
- Create: `src/game/state.ts`
- Test: `src/game/state.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `SlotId`, `candidatesForSlot`, `isChainCorrect` from Tasks 1-2; `Query` from Task 3.
- Produces: `GameState`, `GameAction`, `CheckResult`, `QueryOutcome`; `createInitialState(queries: Query[]): GameState`; `reduce(catalog: Catalog, state: GameState, action: GameAction): GameState`.

- [ ] **Step 1: Write the failing test**

Create `src/game/state.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';
import { generateSession } from './query';
import { createInitialState, reduce } from './state';
import type { GameState } from './state';

let catalog: Catalog;
let fresh: () => GameState;

beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
  fresh = () => createInitialState(generateSession(catalog, 5));
});

/** Fill all three slots with the query's known-correct answer. */
function selectCorrect(state: GameState): GameState {
  const query = state.queries[state.index]!;
  let next = state;
  for (const slot of ['toolChanger', 'gripper', 'adapter'] as const) {
    next = reduce(catalog, next, { type: 'select', slot, bandId: query.answer[slot] });
  }
  return next;
}

describe('economy', () => {
  it('starts at zero score with two check charges on query one', () => {
    const state = fresh();
    expect(state.score).toBe(0);
    expect(state.checkCharges).toBe(2);
    expect(state.index).toBe(0);
  });

  it('pays 100 x n for a correct answer', () => {
    const state = selectCorrect(fresh());
    const n = state.queries[0]!.n;
    const after = reduce(catalog, state, { type: 'answer' });
    expect(after.score).toBe(100 * n);
    expect(after.lastOutcome).toMatchObject({ kind: 'correct' });
  });

  it('costs a flat 100 for a wrong answer, regardless of n', () => {
    let state = fresh();
    const query = state.queries[0]!;
    const wrong = catalog.categories[0]!.bands.find((b) => b.id !== query.answer.toolChanger)!;
    state = reduce(catalog, state, { type: 'select', slot: 'toolChanger', bandId: wrong.id });
    state = reduce(catalog, state, { type: 'select', slot: 'gripper', bandId: query.answer.gripper });
    state = reduce(catalog, state, { type: 'select', slot: 'adapter', bandId: query.answer.adapter });
    const after = reduce(catalog, state, { type: 'answer' });
    expect(after.score).toBe(-100);
  });

  it('names the wrong slots so failure teaches', () => {
    let state = fresh();
    const query = state.queries[0]!;
    const wrong = catalog.categories[0]!.bands.find((b) => b.id !== query.answer.toolChanger)!;
    state = reduce(catalog, state, { type: 'select', slot: 'toolChanger', bandId: wrong.id });
    state = reduce(catalog, state, { type: 'select', slot: 'gripper', bandId: query.answer.gripper });
    state = reduce(catalog, state, { type: 'select', slot: 'adapter', bandId: query.answer.adapter });
    const after = reduce(catalog, state, { type: 'answer' });
    expect(after.lastOutcome).toMatchObject({ kind: 'wrong', wrongSlots: ['toolChanger'] });
  });

  it('refuses to answer before every slot is filled', () => {
    const state = fresh();
    const after = reduce(catalog, state, { type: 'answer' });
    expect(after).toBe(state);
  });

  it('pays a flat 50 to escalate and needs no slots filled', () => {
    const after = reduce(catalog, fresh(), { type: 'escalate' });
    expect(after.score).toBe(50);
    expect(after.lastOutcome).toMatchObject({ kind: 'escalated' });
  });

  it('makes answering and escalating exactly even at n=2', () => {
    // The knife edge the design is built on: 100*2*(1/2) - 100*(1/2) === 50.
    const expectedValueOfAnswering = 100 * 2 * 0.5 - 100 * 0.5;
    expect(expectedValueOfAnswering).toBe(50);
  });
});

describe('checking', () => {
  it('reports sufficiency, never which candidate is right', () => {
    const state = fresh();
    const query = state.queries[0]!;
    const after = reduce(catalog, state, { type: 'check', slot: 'toolChanger' });
    expect(after.checkCharges).toBe(1);
    expect(after.lastCheck).toEqual({ slot: 'toolChanger', candidates: 1 });
    expect(JSON.stringify(after.lastCheck)).not.toContain(query.answer.toolChanger);
  });

  it('refuses to check with no charges left', () => {
    let state = fresh();
    state = reduce(catalog, state, { type: 'check', slot: 'toolChanger' });
    state = reduce(catalog, state, { type: 'check', slot: 'gripper' });
    const exhausted = reduce(catalog, state, { type: 'check', slot: 'adapter' });
    expect(exhausted).toBe(state);
  });
});

describe('session flow', () => {
  it('advances to the next query and clears the slots', () => {
    const after = reduce(catalog, selectCorrect(fresh()), { type: 'answer' });
    expect(after.index).toBe(1);
    expect(after.chain).toEqual({});
  });

  it('carries check charges across queries rather than refreshing them', () => {
    let state = fresh();
    state = reduce(catalog, state, { type: 'check', slot: 'toolChanger' });
    state = reduce(catalog, selectCorrect(state), { type: 'answer' });
    expect(state.checkCharges).toBe(1);
  });

  it('ends after the sixth query', () => {
    let state = fresh();
    for (let i = 0; i < 6; i++) state = reduce(catalog, state, { type: 'escalate' });
    expect(state.finished).toBe(true);
    expect(state.score).toBe(300);
  });

  it('ignores actions once finished', () => {
    let state = fresh();
    for (let i = 0; i < 6; i++) state = reduce(catalog, state, { type: 'escalate' });
    expect(reduce(catalog, state, { type: 'escalate' })).toBe(state);
  });

  it('records the choice made for each query so the funnel can be measured', () => {
    let state = fresh();
    state = reduce(catalog, selectCorrect(state), { type: 'answer' });
    state = reduce(catalog, state, { type: 'escalate' });
    expect(state.history).toHaveLength(2);
    expect(state.history[0]).toMatchObject({ choice: 'answer', n: state.queries[0]!.n });
    expect(state.history[1]).toMatchObject({ choice: 'escalate' });
  });

  it('never mutates the state passed in', () => {
    const state = fresh();
    const snapshot = JSON.stringify(state);
    reduce(catalog, state, { type: 'escalate' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./state`.

- [ ] **Step 3: Implement the reducer**

Create `src/game/state.ts`:

```ts
import type { Catalog, SlotId } from './catalog';
import { candidatesForSlot, isChainCorrect } from './catalog';
import type { Query } from './query';

export const CHECK_CHARGES = 2;
export const CORRECT_PER_CANDIDATE = 100;
export const WRONG_PENALTY = -100;
export const ESCALATE_REWARD = 50;

export type PlayerChoice = 'answer' | 'escalate';

export interface CheckResult {
  slot: SlotId;
  /** How many bands remain possible. Never says which one is right. */
  candidates: number;
}

export type QueryOutcome =
  | { kind: 'correct'; points: number }
  | { kind: 'wrong'; points: number; wrongSlots: SlotId[]; answer: Record<SlotId, string> }
  | { kind: 'escalated'; points: number };

export interface HistoryEntry {
  n: number;
  choice: PlayerChoice;
  correct: boolean;
  checksUsed: number;
}

export interface GameState {
  queries: Query[];
  index: number;
  chain: Partial<Record<SlotId, string>>;
  score: number;
  checkCharges: number;
  lastCheck: CheckResult | null;
  lastOutcome: QueryOutcome | null;
  history: HistoryEntry[];
  finished: boolean;
  /** Checks spent on the current query, for the history entry. */
  checksThisQuery: number;
}

export type GameAction =
  | { type: 'select'; slot: SlotId; bandId: string }
  | { type: 'check'; slot: SlotId }
  | { type: 'answer' }
  | { type: 'escalate' };

const SLOTS: readonly SlotId[] = ['toolChanger', 'gripper', 'adapter'];

export function createInitialState(queries: Query[]): GameState {
  return {
    queries,
    index: 0,
    chain: {},
    score: 0,
    checkCharges: CHECK_CHARGES,
    lastCheck: null,
    lastOutcome: null,
    history: [],
    finished: false,
    checksThisQuery: 0,
  };
}

/** Close the current query with an outcome and move on. */
function advance(state: GameState, outcome: QueryOutcome, choice: PlayerChoice): GameState {
  const nextIndex = state.index + 1;
  return {
    ...state,
    chain: {},
    score: state.score + outcome.points,
    lastCheck: null,
    lastOutcome: outcome,
    checksThisQuery: 0,
    history: [
      ...state.history,
      {
        n: state.queries[state.index]!.n,
        choice,
        correct: outcome.kind === 'correct',
        checksUsed: state.checksThisQuery,
      },
    ],
    index: nextIndex,
    finished: nextIndex >= state.queries.length,
  };
}

export function reduce(catalog: Catalog, state: GameState, action: GameAction): GameState {
  if (state.finished) return state;
  const query = state.queries[state.index];
  if (!query) return state;

  switch (action.type) {
    case 'select':
      return { ...state, chain: { ...state.chain, [action.slot]: action.bandId } };

    case 'check': {
      if (state.checkCharges <= 0) return state;
      return {
        ...state,
        checkCharges: state.checkCharges - 1,
        checksThisQuery: state.checksThisQuery + 1,
        lastCheck: {
          slot: action.slot,
          candidates: candidatesForSlot(catalog, action.slot, query.spec).length,
        },
      };
    }

    case 'answer': {
      const filled = SLOTS.every((slot) => state.chain[slot] !== undefined);
      if (!filled) return state;
      const chain = state.chain as Record<SlotId, string>;
      if (isChainCorrect(catalog, query.spec, chain)) {
        return advance(
          state,
          { kind: 'correct', points: CORRECT_PER_CANDIDATE * query.n },
          'answer',
        );
      }
      const wrongSlots = SLOTS.filter((slot) => {
        const band = catalog.categories
          .find((c) => c.slot === slot)!
          .bands.find((b) => b.id === chain[slot]);
        return band === undefined || !candidatesForSlot(catalog, slot, query.spec).includes(band);
      });
      return advance(
        state,
        { kind: 'wrong', points: WRONG_PENALTY, wrongSlots, answer: query.answer },
        'answer',
      );
    }

    case 'escalate':
      return advance(state, { kind: 'escalated', points: ESCALATE_REWARD }, 'escalate');
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 34 tests total.

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/game/state.ts src/game/state.test.ts
git commit -m "feat: game state reducer implementing the solved economy"
```

---

### Task 5: Standalone scene scaffold

A second Vite page with its own entry point. Renders the graph fully dormant under a fixed camera. No interaction yet.

**Files:**
- Create: `game.html`
- Create: `src/game/scene.ts`
- Create: `src/game/main.ts`
- Modify: `vite.config.ts` (create if absent — the repo currently has none)

**Interfaces:**
- Consumes: `buildGraph` from `src/graph.ts`; `NodeField` from `src/nodes.ts`; `EdgeField` from `src/edges.ts`; `createBackdrop` from `src/atmosphere.ts`; `PALETTE` from `src/palette.ts`.
- Produces: `class Scene` with `constructor(canvas: HTMLCanvasElement, graph: Graph)`, `readonly graph: Graph`, `readonly camera: PerspectiveCamera`, `lightNode(id: number, amount: number): void`, `lightEdge(id: number, amount: number): void`, `clearLighting(): void`, `render(): void`, `resize(): void`.

- [ ] **Step 1: Create the Vite multi-page config**

Create `vite.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
      },
    },
  },
});
```

- [ ] **Step 2: Create the page**

Create `game.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ReshapeX · Routing prototype</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;600&display=swap" rel="stylesheet" />
    <style>
      html, body { margin: 0; height: 100%; background: #0d1117; overflow: hidden; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <script type="module" src="/src/game/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the scene**

Create `src/game/scene.ts`:

```ts
import { PerspectiveCamera, Scene as ThreeScene, Vector3, WebGLRenderer } from 'three';
import type { Graph } from '../graph';
import { createBackdrop } from '../atmosphere';
import { EdgeField } from '../edges';
import { NodeField } from '../nodes';
import { PALETTE } from '../palette';

/**
 * The prototype's view. Everything is dormant by default and lit only through the
 * renderers' runtime-writable channels, so no shader or buffer changes are needed:
 * passing Infinity start times means nothing animates on its own.
 */
export class Scene {
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new ThreeScene();
  private readonly nodes: NodeField;
  private readonly edges: EdgeField;
  private readonly backdrop = createBackdrop();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly graph: Graph,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(PALETTE.deepSpace, 1);

    // Never auto-ignite and never auto-draw: the game drives everything explicitly.
    const dormant = new Float32Array(graph.nodes.length).fill(Infinity);
    const fixed = new Float32Array(graph.nodes.length).fill(-Infinity);
    const edgeStart = new Float32Array(graph.edges.length).fill(Infinity);
    const edgeDur = new Float32Array(graph.edges.length).fill(1);
    const edgeFrom = new Uint8Array(graph.edges.length);

    this.nodes = new NodeField(graph, dormant);
    this.nodes.setUnfurl(fixed);
    this.edges = new EdgeField(graph, edgeFrom, edgeStart, edgeDur, fixed);

    // Locked framing. No CameraRig: its path is loop-parameterized and it applies
    // pointer parallax and micro-drift, all of which would break spatial memory.
    this.camera = new PerspectiveCamera(36, 1, 0.1, 600);
    this.camera.position.set(0, 4, 96);
    this.camera.lookAt(new Vector3(0, 0, -6));

    this.scene.add(this.backdrop, this.edges.mesh, this.nodes.mesh);
    this.resize();
  }

  /** 0 = dormant, 1 = lit, above 1 = flare. */
  lightNode(id: number, amount: number): void {
    this.nodes.boost[id] = amount;
  }

  lightEdge(id: number, amount: number): void {
    this.edges.setBoost(id, amount);
  }

  clearLighting(): void {
    this.nodes.boost.fill(0);
    this.edges.begin();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.renderer.getPixelRatio();
    // loopT 0 with fixed unfurl leaves every node at its final position.
    this.nodes.commit(performance.now() / 1000, 0, 90, -1, 0);
    this.edges.commit(0, -1, 0, w, h, pr);
    this.backdrop.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
```

- [ ] **Step 4: Write the entry point**

Create `src/game/main.ts`:

```ts
import { buildGraph } from '../graph';
import { Scene } from './scene';

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#scene canvas missing');

const graph = buildGraph(20260829, 1);
const scene = new Scene(canvas, graph);

window.addEventListener('resize', () => scene.resize());

function frame(): void {
  scene.render();
  requestAnimationFrame(frame);
}
frame();
```

- [ ] **Step 5: Verify it renders**

Run: `pnpm dev`, open `http://localhost:5173/game.html`.
Expected: a dim, dormant graph on the deep-space background, nothing animating, no console errors.

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: passes, and `dist/` contains both `index.html` and `game.html`.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts game.html src/game/scene.ts src/game/main.ts
git commit -m "feat: standalone prototype page with a locked-camera dormant scene"
```

---

### Task 6: Band mapping and hit testing

Maps catalog bands onto real graph nodes, and answers "which band did the player click?".

**Files:**
- Create: `src/game/bands.ts`
- Test: `src/game/bands.test.ts`
- Modify: `src/game/scene.ts` (add `project()`)

**Interfaces:**
- Consumes: `Catalog`, `SlotId` from Task 1; `Graph` from `src/graph.ts`; `Scene` from Task 5.
- Produces: `interface BandPlacement { slot: SlotId; bandId: string; hubId: number; nodeIds: number[] }`; `mapBands(catalog: Catalog, graph: Graph): BandPlacement[]`; `class BandPicker` with `constructor(placements: BandPlacement[], project: (nodeId: number) => { x: number; y: number } | null)`, `refresh(): void`, `pick(x: number, y: number): BandPlacement | null`, `screenPositionOf(bandId: string): { x: number; y: number } | null`.

- [ ] **Step 1: Write the failing test**

Create `src/game/bands.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import type { Graph } from '../graph';
import type { Catalog } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';
import { BandPicker, mapBands } from './bands';

let catalog: Catalog;
let graph: Graph;

beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
  graph = buildGraph(20260829, 1);
});

describe('band mapping', () => {
  it('places every band in the catalog', () => {
    const placements = mapBands(catalog, graph);
    expect(placements).toHaveLength(9);
  });

  it('is deterministic for the same graph', () => {
    expect(mapBands(catalog, graph)).toEqual(mapBands(catalog, graph));
  });

  it('gives each band at least one node and never shares nodes between bands', () => {
    const placements = mapBands(catalog, graph);
    const seen = new Set<number>();
    for (const placement of placements) {
      expect(placement.nodeIds.length).toBeGreaterThan(0);
      for (const id of placement.nodeIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('puts the three bands of a slot on the same hub', () => {
    const placements = mapBands(catalog, graph);
    for (const slot of ['toolChanger', 'gripper', 'adapter'] as const) {
      const hubs = new Set(placements.filter((p) => p.slot === slot).map((p) => p.hubId));
      expect(hubs.size).toBe(1);
    }
  });

  it('uses a different hub for each slot', () => {
    const placements = mapBands(catalog, graph);
    expect(new Set(placements.map((p) => p.hubId)).size).toBe(3);
  });
});

describe('picking', () => {
  const placements = () => mapBands(catalog, graph);

  it('returns the nearest band within the hit radius', () => {
    const maps = placements();
    // Stub projection: band k sits at x = k * 100, y = 0.
    const index = new Map<number, number>();
    maps.forEach((placement, k) => {
      for (const id of placement.nodeIds) index.set(id, k);
    });
    const picker = new BandPicker(maps, (nodeId) => {
      const k = index.get(nodeId);
      return k === undefined ? null : { x: k * 100, y: 0 };
    });
    picker.refresh();
    expect(picker.pick(0, 0)?.bandId).toBe(maps[0]!.bandId);
    expect(picker.pick(205, 5)?.bandId).toBe(maps[2]!.bandId);
  });

  it('returns null when the click is nowhere near a band', () => {
    const maps = placements();
    const picker = new BandPicker(maps, () => ({ x: 0, y: 0 }));
    picker.refresh();
    expect(picker.pick(9999, 9999)).toBeNull();
  });

  it('ignores bands that project off screen', () => {
    const maps = placements();
    const picker = new BandPicker(maps, () => null);
    picker.refresh();
    expect(picker.pick(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./bands`.

- [ ] **Step 3: Implement mapping and picking**

Create `src/game/bands.ts`:

```ts
import type { Graph } from '../graph';
import type { Catalog, SlotId } from './catalog';

export interface BandPlacement {
  slot: SlotId;
  bandId: string;
  /** The category hub this band hangs from. */
  hubId: number;
  /** Leaf nodes belonging to this band. */
  nodeIds: number[];
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Clicks within this many CSS pixels of a band's centre select it. */
export const HIT_RADIUS = 56;

/**
 * Assign catalog bands to real graph geometry: one hub per slot, its leaves split into
 * three contiguous groups in band order. Deterministic given the same graph.
 */
export function mapBands(catalog: Catalog, graph: Graph): BandPlacement[] {
  const hubs = graph.nodes
    .filter((node) => node.kind === 1 && node.cluster === 0)
    .map((node) => ({
      id: node.id,
      leaves: graph.nodes.filter((leaf) => graph.parent[leaf.id] === node.id).map((leaf) => leaf.id),
    }))
    .filter((hub) => hub.leaves.length >= 3)
    // Most-populated first, then by id, so the choice never depends on iteration order.
    .sort((a, b) => b.leaves.length - a.leaves.length || a.id - b.id);

  if (hubs.length < catalog.categories.length) {
    throw new Error('graph does not have enough populated hubs for the catalog');
  }

  const placements: BandPlacement[] = [];
  catalog.categories.forEach((category, categoryIndex) => {
    const hub = hubs[categoryIndex]!;
    const bands = [...category.bands].sort((a, b) => a.order - b.order);
    const per = Math.floor(hub.leaves.length / bands.length);
    bands.forEach((band, bandIndex) => {
      const start = bandIndex * per;
      const end = bandIndex === bands.length - 1 ? hub.leaves.length : start + per;
      placements.push({
        slot: category.slot,
        bandId: band.id,
        hubId: hub.id,
        nodeIds: hub.leaves.slice(start, end),
      });
    });
  });
  return placements;
}

/**
 * Screen-space hit testing against band centroids. Safe to cache because the prototype's
 * camera is locked and nothing unfurls — call refresh() after any resize.
 */
export class BandPicker {
  private centres = new Map<string, ScreenPoint>();

  constructor(
    private readonly placements: BandPlacement[],
    private readonly project: (nodeId: number) => ScreenPoint | null,
  ) {}

  refresh(): void {
    this.centres.clear();
    for (const placement of this.placements) {
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const id of placement.nodeIds) {
        const point = this.project(id);
        if (!point) continue;
        sx += point.x;
        sy += point.y;
        count++;
      }
      if (count > 0) this.centres.set(placement.bandId, { x: sx / count, y: sy / count });
    }
  }

  screenPositionOf(bandId: string): ScreenPoint | null {
    return this.centres.get(bandId) ?? null;
  }

  pick(x: number, y: number): BandPlacement | null {
    let best: BandPlacement | null = null;
    let bestDistance = HIT_RADIUS;
    for (const placement of this.placements) {
      const centre = this.centres.get(placement.bandId);
      if (!centre) continue;
      const distance = Math.hypot(centre.x - x, centre.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = placement;
      }
    }
    return best;
  }
}
```

- [ ] **Step 4: Add projection to the scene**

In `src/game/scene.ts`, add this method to the `Scene` class, after `lightEdge`:

```ts
  /**
   * Project a node to CSS pixel coordinates, or null if it is behind the camera.
   * Correct by construction here: the camera is locked and nothing unfurls or drifts.
   */
  project(nodeId: number): { x: number; y: number } | null {
    const v = new Vector3(
      this.graph.positions[nodeId * 3]!,
      this.graph.positions[nodeId * 3 + 1]!,
      this.graph.positions[nodeId * 3 + 2]!,
    ).project(this.camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 42 tests total.

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/game/bands.ts src/game/bands.test.ts src/game/scene.ts
git commit -m "feat: map catalog bands onto graph geometry with screen-space picking"
```

---

### Task 7: HUD and the three actions

**Files:**
- Create: `src/game/hud.ts`
- Modify: `game.html` (add HUD markup and styles)
- Modify: `src/game/main.ts` (wire input, state, HUD and lighting together)

**Interfaces:**
- Consumes: `GameState`, `GameAction`, `reduce`, `createInitialState` from Task 4; `BandPlacement`, `BandPicker`, `mapBands` from Task 6; `Scene` from Task 5.
- Produces: `class Hud` with `constructor(onAction: (action: GameAction) => void)`, `render(state: GameState, secondsLeft: number): void`, `showEndCard(state: GameState, onReplay: () => void): void`.

- [ ] **Step 1: Add the HUD markup**

In `game.html`, replace the `<style>` block's closing `</style>` and the `<canvas>` line so the body reads:

```html
    <style>
      html, body { margin: 0; height: 100%; background: #0d1117; overflow: hidden; }
      canvas { display: block; width: 100vw; height: 100vh; }
      .hud {
        position: fixed; inset: 0; pointer-events: none; padding: 28px 32px;
        box-sizing: border-box; display: flex; flex-direction: column;
        justify-content: space-between;
        font-family: 'Hanken Grotesk', system-ui, sans-serif; color: #e5e9ec;
      }
      .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
      .card { font-size: 20px; font-weight: 600; letter-spacing: 0.01em; }
      .odds { font-size: 13px; font-weight: 500; color: #00d9ff; margin-top: 6px; }
      .meta { text-align: right; font-size: 13px; font-weight: 600; letter-spacing: 0.08em;
              text-transform: uppercase; color: #8b9aad; }
      .clock { font-size: 26px; color: #e5e9ec; font-variant-numeric: tabular-nums; }
      .slots { display: flex; gap: 10px; margin-top: 14px; }
      .slot { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
              padding: 7px 12px; border: 1px solid rgba(139,154,173,0.35); border-radius: 6px;
              color: #8b9aad; }
      .slot.filled { color: #e5e9ec; border-color: #00d9ff; }
      .slot.wrong { color: #ff006e; border-color: #ff006e; }
      .actions { display: flex; gap: 10px; pointer-events: auto; }
      button {
        font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.06em;
        text-transform: uppercase; padding: 11px 18px; border-radius: 6px; cursor: pointer;
        border: 1px solid rgba(139,154,173,0.4); background: rgba(28,33,40,0.9); color: #e5e9ec;
      }
      button:disabled { opacity: 0.35; cursor: default; }
      button.primary { border-color: #73b400; color: #73b400; }
      .note { font-size: 13px; font-weight: 500; color: #8b9aad; min-height: 1.3em; margin-top: 10px; }
      .end { position: fixed; inset: 0; display: none; flex-direction: column; gap: 18px;
             align-items: center; justify-content: center; background: rgba(13,17,23,0.92);
             pointer-events: auto; font-family: 'Hanken Grotesk', system-ui, sans-serif;
             color: #e5e9ec; }
      .end.visible { display: flex; }
      .end .score { font-size: 52px; font-weight: 600; }
      .bands { position: fixed; inset: 0; pointer-events: none; }
      .band {
        position: absolute; transform: translate(-50%, -50%);
        font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
        color: #8b9aad; white-space: nowrap; text-shadow: 0 0 8px #0d1117;
      }
      .band.selected { color: #00d9ff; }
      .band.dim { opacity: 0.18; }
    </style>
  </head>
  <body>
    <canvas id="scene"></canvas>
    <div class="bands" id="bands"></div>
    <div class="hud">
      <div class="row">
        <div>
          <div class="card" id="query">&nbsp;</div>
          <div class="odds" id="odds">&nbsp;</div>
          <div class="slots" id="slots"></div>
          <div class="note" id="note">&nbsp;</div>
        </div>
        <div class="meta">
          <div class="clock" id="clock">&nbsp;</div>
          <div id="progress">&nbsp;</div>
          <div id="score">&nbsp;</div>
        </div>
      </div>
      <div class="row">
        <div class="actions">
          <button id="answer" class="primary">Answer</button>
          <button id="check">Check a slot</button>
          <button id="escalate">Escalate to a specialist</button>
        </div>
      </div>
    </div>
    <div class="end" id="end">
      <div class="score" id="end-score">0</div>
      <div id="end-detail"></div>
      <button id="replay" class="primary">Play again</button>
    </div>
    <script type="module" src="/src/game/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the HUD**

Create `src/game/hud.ts`:

```ts
import type { BandPicker, BandPlacement } from './bands';
import type { SlotId } from './catalog';
import type { GameAction, GameState } from './state';

const SLOTS: readonly SlotId[] = ['toolChanger', 'gripper', 'adapter'];
const SLOT_LABELS: Record<SlotId, string> = {
  toolChanger: 'Tool changer',
  gripper: 'Gripper',
  adapter: 'Adapter',
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

/** Plain-language rendering of what the customer told us. */
function describe(state: GameState): string {
  const spec = state.queries[state.index]?.spec;
  if (!spec) return '';
  const parts: string[] = [];
  parts.push(spec.robot ?? 'robot not stated');
  if (spec.payloadExact !== undefined) parts.push(`${spec.payloadExact} kg`);
  else if (spec.payloadAtLeast !== undefined) parts.push(`at least ${spec.payloadAtLeast} kg`);
  else parts.push('payload not stated');
  parts.push(spec.application ?? 'application not stated');
  return parts.join('  ·  ');
}

export class Hud {
  private readonly query = el('query');
  private readonly odds = el('odds');
  private readonly slots = el('slots');
  private readonly note = el('note');
  private readonly clock = el('clock');
  private readonly progress = el('progress');
  private readonly score = el('score');
  private readonly answer = el<HTMLButtonElement>('answer');
  private readonly check = el<HTMLButtonElement>('check');
  private readonly escalate = el<HTMLButtonElement>('escalate');
  private readonly end = el('end');
  private readonly endScore = el('end-score');
  private readonly endDetail = el('end-detail');
  private readonly replay = el<HTMLButtonElement>('replay');
  private readonly bands = el('bands');
  /** Which slot a Check click applies to: the first still empty. */
  private nextEmptySlot: SlotId = 'toolChanger';

  constructor(onAction: (action: GameAction) => void) {
    this.answer.addEventListener('click', () => onAction({ type: 'answer' }));
    this.escalate.addEventListener('click', () => onAction({ type: 'escalate' }));
    this.check.addEventListener('click', () => onAction({ type: 'check', slot: this.nextEmptySlot }));
  }

  render(state: GameState, secondsLeft: number): void {
    this.query.textContent = describe(state);
    const n = state.queries[state.index]?.n ?? 1;
    this.odds.textContent =
      n === 1 ? 'This spec determines one chain.' : `This spec leaves ${n} chains open.`;

    this.nextEmptySlot = SLOTS.find((slot) => state.chain[slot] === undefined) ?? 'toolChanger';

    const wrong = state.lastOutcome?.kind === 'wrong' ? state.lastOutcome.wrongSlots : [];
    this.slots.replaceChildren(
      ...SLOTS.map((slot) => {
        const div = document.createElement('div');
        div.className = 'slot';
        if (state.chain[slot] !== undefined) div.classList.add('filled');
        if (wrong.includes(slot)) div.classList.add('wrong');
        div.textContent = `${SLOT_LABELS[slot]}: ${state.chain[slot] ?? '—'}`;
        return div;
      }),
    );

    if (state.lastCheck) {
      const { slot, candidates } = state.lastCheck;
      this.note.textContent =
        candidates === 1
          ? `The spec determines ${SLOT_LABELS[slot].toLowerCase()}.`
          : `The spec does not determine ${SLOT_LABELS[slot].toLowerCase()} — ${candidates} remain possible.`;
    } else if (state.lastOutcome?.kind === 'wrong') {
      this.note.textContent = 'Bad callout. The highlighted slots were wrong.';
    } else {
      this.note.textContent = ' ';
    }

    this.clock.textContent = `${Math.max(0, Math.ceil(secondsLeft))}s`;
    this.progress.textContent = `Query ${Math.min(state.index + 1, state.queries.length)} of ${state.queries.length}`;
    this.score.textContent = `${state.score} pts`;
    this.answer.disabled = !SLOTS.every((slot) => state.chain[slot] !== undefined);
    this.check.disabled = state.checkCharges <= 0;
    this.check.textContent = `Check a slot (${state.checkCharges})`;
  }

  /**
   * Draw a label at each band's screen position. Bands are labelled throughout the
   * prototype: unlabelled bands are a mastery mechanic for a game that runs longer
   * than a minute, and memorization is not what a sixty-second session measures.
   */
  renderBands(
    placements: BandPlacement[],
    picker: BandPicker,
    state: GameState,
    dimmedBandIds: Set<string>,
  ): void {
    this.bands.replaceChildren(
      ...placements.flatMap((placement) => {
        const point = picker.screenPositionOf(placement.bandId);
        if (!point) return [];
        const div = document.createElement('div');
        div.className = 'band';
        if (state.chain[placement.slot] === placement.bandId) div.classList.add('selected');
        if (dimmedBandIds.has(placement.bandId)) div.classList.add('dim');
        div.style.left = `${point.x}px`;
        div.style.top = `${point.y}px`;
        div.textContent = placement.bandId;
        return [div];
      }),
    );
  }

  showEndCard(state: GameState, onReplay: () => void): void {
    const escalations = state.history.filter((h) => h.choice === 'escalate').length;
    const correct = state.history.filter((h) => h.correct).length;
    this.endScore.textContent = `${state.score} pts`;
    this.endDetail.textContent = `${correct} answered correctly · ${escalations} escalated`;
    this.end.classList.add('visible');
    this.replay.addEventListener('click', onReplay, { once: true });
  }
}
```

- [ ] **Step 3: Wire it together**

Replace `src/game/main.ts` with:

```ts
import { buildGraph } from '../graph';
import { BandPicker, mapBands } from './bands';
import { FixtureCatalogSource } from './catalog-fixture';
import { Hud } from './hud';
import { generateSession } from './query';
import { Scene } from './scene';
import { createInitialState, reduce } from './state';
import type { GameAction, GameState } from './state';

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#scene canvas missing');

const catalog = await new FixtureCatalogSource().load();
const graph = buildGraph(20260829, 1);
const scene = new Scene(canvas, graph);
const placements = mapBands(catalog, graph);
const picker = new BandPicker(placements, (nodeId) => scene.project(nodeId));
picker.refresh();

// ?seed=123 fixes the session, which the manual determinism check depends on.
const seedParam = new URLSearchParams(location.search).get('seed');
const seed = seedParam === null ? Date.now() % 100000 : Number(seedParam);
let state: GameState = createInitialState(generateSession(catalog, seed));
let queryStarted = performance.now();

const hud = new Hud((action) => apply(action));

function apply(action: GameAction): void {
  const before = state.index;
  state = reduce(catalog, state, action);
  if (state.index !== before) queryStarted = performance.now();
  if (state.finished) hud.showEndCard(state, () => window.location.reload());
}

canvas.addEventListener('pointerdown', (event) => {
  const hit = picker.pick(event.clientX, event.clientY);
  if (hit) apply({ type: 'select', slot: hit.slot, bandId: hit.bandId });
});

window.addEventListener('resize', () => {
  scene.resize();
  picker.refresh();
});

function secondsLeft(): number {
  const query = state.queries[state.index];
  if (!query || state.finished) return 0;
  return query.clockSeconds - (performance.now() - queryStarted) / 1000;
}

function frame(): void {
  // Light the hubs always, and any selected band brightly.
  scene.clearLighting();
  for (const placement of placements) {
    const selected = state.chain[placement.slot] === placement.bandId;
    scene.lightNode(placement.hubId, 0.8);
    for (const id of placement.nodeIds) scene.lightNode(id, selected ? 1.6 : 0.25);
  }
  if (!state.finished && secondsLeft() <= 0) apply({ type: 'escalate' });
  hud.render(state, secondsLeft());
  scene.render();
  requestAnimationFrame(frame);
}
frame();
```

- [ ] **Step 4: Verify it plays**

Run: `pnpm dev`, open `http://localhost:5173/game.html`.
Expected: a query line, an odds line, three slot chips, a counting-down clock. Clicking near a band fills its slot and lights it. Answer enables once all three are filled. Check reports sufficiency without naming a band. Escalate advances. After six queries the end card appears and Play again restarts.

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add game.html src/game/hud.ts src/game/main.ts
git commit -m "feat: playable prototype loop with HUD, selection and the three actions"
```

---

### Task 8: Onboarding

Query 1 must be unloseable, and the verb must be taught before the vocabulary.

**Files:**
- Create: `src/game/onboarding.ts`
- Test: `src/game/onboarding.test.ts`
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes: `GameState` from Task 4; `BandPlacement` from Task 6.
- Produces: `interface Coaching { dimUnselectable: boolean; allowedBandIds: string[] | null; message: string | null; clockRunning: boolean }`; `coachingFor(state: GameState, placements: BandPlacement[]): Coaching`.

- [ ] **Step 1: Write the failing test**

Create `src/game/onboarding.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import type { Catalog } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';
import { mapBands } from './bands';
import type { BandPlacement } from './bands';
import { generateSession } from './query';
import { coachingFor } from './onboarding';
import { createInitialState } from './state';
import type { GameState } from './state';

let catalog: Catalog;
let placements: BandPlacement[];
let base: GameState;

beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
  const graph = buildGraph(20260829, 1);
  placements = mapBands(catalog, graph);
  base = createInitialState(generateSession(catalog, 11));
});

describe('coaching', () => {
  it('runs query one with no clock so it cannot be lost', () => {
    expect(coachingFor(base, placements).clockRunning).toBe(false);
  });

  it('restricts query one to the correct bands only', () => {
    const coaching = coachingFor(base, placements);
    expect(coaching.dimUnselectable).toBe(true);
    expect(coaching.allowedBandIds).toEqual(
      expect.arrayContaining(Object.values(base.queries[0]!.answer)),
    );
    expect(coaching.allowedBandIds).toHaveLength(3);
  });

  it('teaches the verb on query one', () => {
    expect(coachingFor(base, placements).message).toMatch(/click/i);
  });

  it('turns the clock on from query two', () => {
    const coaching = coachingFor({ ...base, index: 1 }, placements);
    expect(coaching.clockRunning).toBe(true);
    expect(coaching.dimUnselectable).toBe(false);
    expect(coaching.allowedBandIds).toBeNull();
  });

  it('introduces ambiguity and escalation on query three', () => {
    expect(coachingFor({ ...base, index: 2 }, placements).message).toMatch(/escalate/i);
  });

  it('introduces checking on query four', () => {
    expect(coachingFor({ ...base, index: 3 }, placements).message).toMatch(/check/i);
  });

  it('says nothing from query five onward', () => {
    expect(coachingFor({ ...base, index: 4 }, placements).message).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./onboarding`.

- [ ] **Step 3: Implement coaching**

Create `src/game/onboarding.ts`:

```ts
import type { BandPlacement } from './bands';
import type { GameState } from './state';

export interface Coaching {
  /** Dim every band the player must not click yet. */
  dimUnselectable: boolean;
  /** Bands the player may click, or null for all of them. */
  allowedBandIds: string[] | null;
  message: string | null;
  clockRunning: boolean;
}

/**
 * Teach the verb, then the geometry, then the vocabulary. Query one is unloseable by
 * construction: no clock, and only the correct bands are clickable.
 */
export function coachingFor(state: GameState, placements: BandPlacement[]): Coaching {
  void placements;
  const query = state.queries[state.index];
  switch (state.index) {
    case 0:
      return {
        dimUnselectable: true,
        allowedBandIds: query ? Object.values(query.answer) : null,
        message: 'Click the three highlighted bands to build the chain.',
        clockRunning: false,
      };
    case 1:
      return {
        dimUnselectable: false,
        allowedBandIds: null,
        message: 'Now against the clock. Pick the chain that matches the spec.',
        clockRunning: true,
      };
    case 2:
      return {
        dimUnselectable: false,
        allowedBandIds: null,
        message: 'This spec leaves more than one chain open. Answer and take the odds, or escalate to a specialist for a flat 50.',
        clockRunning: true,
      };
    case 3:
      return {
        dimUnselectable: false,
        allowedBandIds: null,
        message: 'Check a slot to learn whether the spec determines it. It never tells you which band is right.',
        clockRunning: true,
      };
    default:
      return { dimUnselectable: false, allowedBandIds: null, message: null, clockRunning: true };
  }
}
```

- [ ] **Step 4: Apply coaching in the loop**

In `src/game/main.ts`, add the import:

```ts
import { coachingFor } from './onboarding';
```

Replace `secondsLeft` and the body of `frame` with:

```ts
function secondsLeft(): number {
  const query = state.queries[state.index];
  if (!query || state.finished) return 0;
  if (!coachingFor(state, placements).clockRunning) return query.clockSeconds;
  return query.clockSeconds - (performance.now() - queryStarted) / 1000;
}

/** How long the correct chain stays lit after a bad callout. */
const CORRECTION_MS = 1500;

function frame(): void {
  const coaching = coachingFor(state, placements);
  scene.clearLighting();

  // Failure teaches: after a bad callout, show the chain that was right, once.
  const outcome = state.lastOutcome;
  const correcting =
    outcome?.kind === 'wrong' && performance.now() - outcomeAt < CORRECTION_MS
      ? new Set(Object.values(outcome.answer))
      : null;

  const dimmedBandIds = new Set<string>();
  for (const placement of placements) {
    const allowed = coaching.allowedBandIds === null || coaching.allowedBandIds.includes(placement.bandId);
    const dimmed = coaching.dimUnselectable && !allowed;
    if (dimmed) dimmedBandIds.add(placement.bandId);
    const selected = state.chain[placement.slot] === placement.bandId;
    const corrected = correcting?.has(placement.bandId) ?? false;
    scene.lightNode(placement.hubId, dimmed ? 0.15 : 0.8);
    for (const id of placement.nodeIds) {
      scene.lightNode(id, corrected ? 2.0 : selected ? 1.6 : dimmed ? 0.04 : 0.25);
    }
  }

  if (!state.finished && coaching.clockRunning && secondsLeft() <= 0) apply({ type: 'escalate' });
  hud.render(state, secondsLeft(), coaching.message);
  hud.renderBands(placements, picker, state, dimmedBandIds);
  scene.render();
  requestAnimationFrame(frame);
}
```

And in the `pointerdown` handler, respect the allow-list:

```ts
canvas.addEventListener('pointerdown', (event) => {
  const coaching = coachingFor(state, placements);
  const hit = picker.pick(event.clientX, event.clientY);
  if (!hit) return;
  if (coaching.allowedBandIds !== null && !coaching.allowedBandIds.includes(hit.bandId)) return;
  apply({ type: 'select', slot: hit.slot, bandId: hit.bandId });
});
```

- [ ] **Step 5: Accept a coaching message in the HUD**

In `src/game/hud.ts`, change the `render` signature and the note logic:

```ts
  render(state: GameState, secondsLeft: number, coachingMessage: string | null = null): void {
```

and replace the final `else` branch of the note block with:

```ts
    } else if (coachingMessage) {
      this.note.textContent = coachingMessage;
    } else {
      this.note.textContent = ' ';
    }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS, 49 tests total.

- [ ] **Step 7: Verify it plays**

Run: `pnpm dev`, open `http://localhost:5173/game.html`.
Expected: query 1 has no clock and only three clickable bands, everything else dimmed; query 2 starts the clock; queries 3 and 4 introduce escalation and checking.

- [ ] **Step 8: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add src/game/onboarding.ts src/game/onboarding.test.ts src/game/main.ts src/game/hud.ts
git commit -m "feat: no-fail onboarding that teaches the verb before the vocabulary"
```

---

### Task 9: Instrumentation and the kill-criteria readout

Without this the prototype cannot answer the question it exists to answer.

**Files:**
- Create: `src/game/telemetry.ts`
- Test: `src/game/telemetry.test.ts`
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes: `GameState` from Task 4.
- Produces: `type TelemetryEvent`; `class Telemetry` with `constructor(sink: (event: TelemetryEvent) => void)`, `mark(name: TelemetryEvent['name'], detail?: Record<string, unknown>): void`, `summarize(state: GameState): KillCriteriaReadout`; `interface KillCriteriaReadout { escalationRateOnAmbiguous: number; withinHealthyBand: boolean; completed: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `src/game/telemetry.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Catalog } from './catalog';
import { FixtureCatalogSource } from './catalog-fixture';
import { generateSession } from './query';
import { createInitialState } from './state';
import type { GameState, HistoryEntry } from './state';
import { Telemetry } from './telemetry';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await new FixtureCatalogSource().load();
});

function stateWith(history: HistoryEntry[]): GameState {
  return { ...createInitialState(generateSession(catalog, 1)), history, finished: true };
}

const answered = (n: number): HistoryEntry => ({ n, choice: 'answer', correct: true, checksUsed: 0 });
const escalated = (n: number): HistoryEntry => ({ n, choice: 'escalate', correct: false, checksUsed: 0 });

describe('telemetry', () => {
  it('emits marks to the sink with a monotonic timestamp', () => {
    const sink = vi.fn();
    const telemetry = new Telemetry(sink);
    telemetry.mark('landed');
    telemetry.mark('first_interaction');
    expect(sink).toHaveBeenCalledTimes(2);
    const [first, second] = sink.mock.calls.map((call) => call[0]);
    expect(first.name).toBe('landed');
    expect(second.msSinceLanded).toBeGreaterThanOrEqual(first.msSinceLanded);
  });

  it('never emits personal data, only the named fields', () => {
    const sink = vi.fn();
    new Telemetry(sink).mark('landed');
    expect(Object.keys(sink.mock.calls[0]![0]).sort()).toEqual(['detail', 'msSinceLanded', 'name']);
  });

  it('measures escalation rate on ambiguous queries only', () => {
    const telemetry = new Telemetry(() => {});
    // n=1 choices must not count toward the rate.
    const readout = telemetry.summarize(
      stateWith([answered(1), answered(2), escalated(2), escalated(3), answered(3)]),
    );
    expect(readout.escalationRateOnAmbiguous).toBeCloseTo(0.5);
  });

  it('flags a dead button: nobody ever escalates', () => {
    const telemetry = new Telemetry(() => {});
    const readout = telemetry.summarize(stateWith([answered(2), answered(3), answered(2)]));
    expect(readout.escalationRateOnAmbiguous).toBe(0);
    expect(readout.withinHealthyBand).toBe(false);
  });

  it('flags a dominant strategy: everyone always escalates', () => {
    const telemetry = new Telemetry(() => {});
    const readout = telemetry.summarize(stateWith([escalated(2), escalated(3), escalated(2)]));
    expect(readout.withinHealthyBand).toBe(false);
  });

  it('passes when the dial is genuinely used', () => {
    const telemetry = new Telemetry(() => {});
    const readout = telemetry.summarize(stateWith([answered(2), escalated(3), answered(2), escalated(2)]));
    expect(readout.withinHealthyBand).toBe(true);
  });

  it('reports no healthy band when there were no ambiguous queries at all', () => {
    const telemetry = new Telemetry(() => {});
    const readout = telemetry.summarize(stateWith([answered(1), answered(1)]));
    expect(readout.withinHealthyBand).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./telemetry`.

- [ ] **Step 3: Implement telemetry**

Create `src/game/telemetry.ts`:

```ts
import type { GameState } from './state';

export interface TelemetryEvent {
  name:
    | 'landed'
    | 'first_interaction'
    | 'query_one_completed'
    | 'session_completed'
    | 'replay_pressed';
  msSinceLanded: number;
  detail: Record<string, unknown>;
}

/** Kill criterion 3 from the spec: outside this band the dial is broken. */
export const HEALTHY_ESCALATION_MIN = 0.2;
export const HEALTHY_ESCALATION_MAX = 0.8;

export interface KillCriteriaReadout {
  /** Share of n >= 2 queries closed by escalating. */
  escalationRateOnAmbiguous: number;
  withinHealthyBand: boolean;
  completed: boolean;
}

export class Telemetry {
  private readonly landedAt = performance.now();

  constructor(private readonly sink: (event: TelemetryEvent) => void) {}

  mark(name: TelemetryEvent['name'], detail: Record<string, unknown> = {}): void {
    this.sink({ name, msSinceLanded: performance.now() - this.landedAt, detail });
  }

  summarize(state: GameState): KillCriteriaReadout {
    const ambiguous = state.history.filter((entry) => entry.n >= 2);
    const escalated = ambiguous.filter((entry) => entry.choice === 'escalate').length;
    const rate = ambiguous.length === 0 ? 0 : escalated / ambiguous.length;
    return {
      escalationRateOnAmbiguous: rate,
      withinHealthyBand:
        ambiguous.length > 0 && rate >= HEALTHY_ESCALATION_MIN && rate <= HEALTHY_ESCALATION_MAX,
      completed: state.finished,
    };
  }
}
```

- [ ] **Step 4: Wire telemetry into the loop**

In `src/game/main.ts`, add the import:

```ts
import { Telemetry } from './telemetry';
```

After the `hud` is constructed, add:

```ts
// Console sink for the prototype. Swap for a real endpoint before any public test.
const telemetry = new Telemetry((event) => console.info('[telemetry]', event));
telemetry.mark('landed', { seed });
let firstInteractionMarked = false;
/** When the current outcome was produced, for the correction flash. */
let outcomeAt = 0;
```

Replace `apply` with:

```ts
function apply(action: GameAction): void {
  if (!firstInteractionMarked) {
    firstInteractionMarked = true;
    telemetry.mark('first_interaction');
  }
  const before = state.index;
  state = reduce(catalog, state, action);
  if (state.index !== before) {
    queryStarted = performance.now();
    outcomeAt = performance.now();
    if (before === 0) telemetry.mark('query_one_completed');
  }
  if (state.finished) {
    const readout = telemetry.summarize(state);
    telemetry.mark('session_completed', { score: state.score, ...readout });
    hud.showEndCard(state, () => {
      telemetry.mark('replay_pressed');
      window.location.reload();
    });
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS, 56 tests total.

- [ ] **Step 6: Verify telemetry fires**

Run: `pnpm dev`, open `http://localhost:5173/game.html` with the console visible, and play a full session.
Expected: `landed`, `first_interaction`, `query_one_completed`, then `session_completed` carrying the score and `escalationRateOnAmbiguous`.

- [ ] **Step 7: Verify the build**

Run: `pnpm build`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/game/telemetry.ts src/game/telemetry.test.ts src/game/main.ts
git commit -m "feat: telemetry funnel and kill-criteria readout"
```

---

## Manual verification before testing with people

These are the spec's kill criteria that no automated test can cover. Run them before booking sessions.

- [ ] **Legibility (kill criterion 4).** With a band selected, confirm the selection reads unambiguously against its neighbours. If bloom or the trail accumulator smears it, the gameplay view needs its own reduced post chain — note it and stop rather than shipping an ambiguous board to testers.
- [ ] **Touch targets (kill criterion 5).** In device emulation at 390 px wide, measure the on-screen distance between adjacent band centres. It must be at least 44 CSS px. If it is not, mobile is not real yet regardless of the verb.
- [ ] **Clock honesty.** Time yourself reading a query aloud. If 12 seconds does not leave room to read and then act, raise it — the spec says these numbers are measurements to take, not numbers to trust.
- [ ] **Determinism.** Load with a fixed seed twice and confirm the same six queries appear in the same order.
