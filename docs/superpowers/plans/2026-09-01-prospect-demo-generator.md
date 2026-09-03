# Prospect Demo Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pnpm generate-demo --url <prospect-url> --company "<name>"`, a CLI that turns any
company's public website into a personalized knowledge-graph demo (scraped brand color + logo,
grounded Q&A, algorithmically-derived palette, structurally-randomized graph, rendered video, and
an un-aliased Vercel preview) with no source-file editing per company.

**Architecture:** The existing Three.js scene becomes data-driven: a `BrandKit` JSON (palette,
logo path, Q&A, category labels, locale, structure seed) loaded at runtime via `?kit=<slug>`
replaces today's hardcoded `palette.ts`/`queries.ts`/inline-Spanish-strings. A separate
`tools/generate-demo/` CLI produces that JSON by scraping a prospect site, adapting reference
logic from `design-system/packages/animator` (vendored, not imported live — no changes to that
repo), then drives a headless render and preview deploy.

**Tech Stack:** TypeScript, Vite, Three.js (existing). New: Vitest (unit tests — nothing in this
repo has a test runner yet), Playwright (headless render driver), the Anthropic SDK (Q&A
generation, vendored call pattern), Vercel CLI (already used manually this session).

**Spec:** `docs/superpowers/specs/2026-09-01-prospect-demo-generator-design.md`

## Global Constraints

- No changes to `design-system` in this plan — reference logic is read once and adapted/vendored
  into `tools/generate-demo/vendor/`, with a header comment naming the source file and commit.
- Output is always a **draft**: `generate-demo` deploys an un-aliased Vercel preview only; a
  separate `promote-demo` command is required to move anything to a stable alias.
- Content below grounding confidence 0.6 is dropped; if fewer than 8 Q&A pairs or 5 categories
  survive, the pipeline **fails** loudly rather than shipping thin output.
- Achromatic or extreme-lightness brand colors (`s < 0.08`, or `l < 0.10` / `l > 0.90`) trip a
  palette fallback branch and set `usedFallback: true` — never silently rotate an undefined hue.
- `--locale` (default `auto`) generates in the requested locale, translating from the detected
  source language if they differ; it never refuses on a mismatch.
- `seed = hash(company)` by default; `--seed-variant <n>` (default 0) salts it for an intentional
  do-over without touching the company slug.

---

### Task 1: Test runner + palette algorithm

**Files:**
- Modify: `package.json` (add `vitest` devDependency + `"test": "vitest run"` script)
- Create: `vitest.config.ts`
- Create: `src/generator/palette-algorithm.ts`
- Test: `src/generator/palette-algorithm.test.ts`

**Interfaces:**
- Produces: `deriveGraphPalette(brandHex: string): GraphPalette` and
  `interface GraphPalette { brand: string; clusterA: string; clusterB: string; stakes: string; answer: string; background: string; steel: string; usedFallback: boolean }`
  (all values as `#rrggbb` hex strings). Later tasks (BrandKit contract, CLI) consume this exact
  shape and function name.

- [ ] **Step 1: Add Vitest**

```bash
cd /Users/james/Projects/reshape/knowledge-graph-animation-lanes/feat-prospect-demo-generator
pnpm add -D vitest
```

- [ ] **Step 2: Add the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 4: Write the failing tests**

```ts
// src/generator/palette-algorithm.test.ts
import { describe, expect, it } from 'vitest';
import { deriveGraphPalette } from './palette-algorithm';

describe('deriveGraphPalette', () => {
  it('uses the brand color as-is for the root/CTA role', () => {
    const p = deriveGraphPalette('#E30613');
    expect(p.brand.toLowerCase()).toBe('#e30613');
    expect(p.usedFallback).toBe(false);
  });

  it('derives clusterA and clusterB at different hues from the brand color', () => {
    const p = deriveGraphPalette('#2A6DF0'); // a blue B2B SaaS color
    expect(p.clusterA).not.toBe(p.clusterB);
    expect(p.clusterA).not.toBe(p.brand);
    expect(p.clusterB).not.toBe(p.brand);
  });

  it('keeps the answer accent light and saturated regardless of input hue', () => {
    for (const hex of ['#E30613', '#2A6DF0', '#1E8E3E']) {
      const p = deriveGraphPalette(hex);
      const [, , l] = hexToHsl(p.answer);
      expect(l).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('the answer accent has meaningfully higher relative luminance than the background', () => {
    const p = deriveGraphPalette('#2A6DF0');
    expect(relativeLuminance(p.answer)).toBeGreaterThan(relativeLuminance(p.background) + 0.3);
  });

  it('falls back for an achromatic brand color instead of producing an undefined hue', () => {
    const p = deriveGraphPalette('#808080'); // s = 0
    expect(p.usedFallback).toBe(true);
    expect(p.brand).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('falls back for a near-black brand color', () => {
    const p = deriveGraphPalette('#0A0A0A'); // l ≈ 0.04
    expect(p.usedFallback).toBe(true);
  });

  it('falls back for a near-white brand color', () => {
    const p = deriveGraphPalette('#FAFAFA'); // l ≈ 0.98
    expect(p.usedFallback).toBe(true);
  });

  it('is deterministic', () => {
    expect(deriveGraphPalette('#E30613')).toEqual(deriveGraphPalette('#E30613'));
  });
});

// --- test-only helpers, duplicated deliberately so the test doesn't trust the
// implementation's own color-math to grade itself ---
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function relativeLuminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './palette-algorithm'`

- [ ] **Step 6: Implement the palette algorithm**

```ts
// src/generator/palette-algorithm.ts

/** One graph-legible palette, algorithmically derived from a single extracted brand color. */
export interface GraphPalette {
  brand: string;
  clusterA: string;
  clusterB: string;
  stakes: string;
  answer: string;
  background: string;
  steel: string;
  /** true if the input color was achromatic or extreme-lightness and a curated default was used instead */
  usedFallback: boolean;
}

/** ReshapeX's own baseline hue, used when the extracted brand color can't anchor a hue rotation. */
const FALLBACK_HUE = 195; // cyan, matches the original ReshapeX marketing palette

interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const normHue = (h: number): number => ((h % 360) + 360) % 360;

/** Rules-based derivation. See docs/superpowers/specs/2026-09-01-prospect-demo-generator-design.md#palette-algorithm. */
export function deriveGraphPalette(brandHex: string): GraphPalette {
  const raw = hexToHsl(brandHex);
  const usedFallback = raw.s < 0.08 || raw.l < 0.1 || raw.l > 0.9;
  const anchor: Hsl = usedFallback ? { h: FALLBACK_HUE, s: 0.75, l: 0.48 } : raw;

  const brand = usedFallback ? hslToHex(anchor) : brandHex;
  const clusterA = hslToHex({ h: normHue(anchor.h + 25), s: anchor.s, l: anchor.l });
  const clusterB = hslToHex({ h: normHue(anchor.h - 20), s: anchor.s, l: clamp01(anchor.l * 0.65) });
  const stakes = hslToHex({ h: normHue(anchor.h + (330 - anchor.h > 180 ? -30 : 30)), s: Math.max(anchor.s, 0.7), l: anchor.l });
  const answer = hslToHex({ h: normHue(anchor.h + 150), s: Math.max(anchor.s, 0.6), l: Math.max(anchor.l, 0.75) });
  const background = hslToHex({ h: anchor.h, s: 0.15, l: 0.08 });
  const steel = hslToHex({ h: anchor.h, s: 0.08, l: 0.55 });

  return { brand, clusterA, clusterB, stakes, answer, background, steel, usedFallback };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all 8 cases)

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/generator/palette-algorithm.ts src/generator/palette-algorithm.test.ts
git commit -m "feat: add algorithmic palette derivation from a single brand color"
```

---

### Task 2: i18n dictionaries

**Files:**
- Create: `src/i18n/types.ts`
- Create: `src/i18n/es.ts`
- Create: `src/i18n/en.ts`
- Create: `src/i18n/index.ts`
- Test: `src/i18n/i18n.test.ts`
- Modify: `src/schedule.ts` (all hardcoded event/label text becomes dictionary lookups)
- Modify: `src/main.ts` (BEATS/VOICE/HUD copy becomes dictionary lookups; `buildSchedule` call passes the dictionary through)
- Modify: `index.html` (static copy — hint text, search placeholder, title — becomes a small inline bootstrap that reads `?locale=` and swaps `textContent`/`lang` before the module script runs, since this file has no build-time templating)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface Dictionary` (below) and `getDictionary(locale: 'es' | 'en'): Dictionary`.
  Task 3 (BrandKit loader) calls `getDictionary(kit.locale)` and passes the result into
  `buildSchedule` and the HUD bootstrap. Task 4 does not depend on this.

**Note on scope:** this repo currently has ReshapeX's original English copy on `main` (the Spanish
item24 copy lives only on the now-merged-or-separate `feat/item24-es-demo` branch, not on `main`,
since this lane branched from fresh `origin/main`). Port the **English** original copy into `en.ts`
verbatim from the current `schedule.ts`/`main.ts`, and port the **Spanish** item24 copy into `es.ts`
by pulling the strings from `feat/item24-es-demo`'s versions of those two files (`git show
feat/item24-es-demo:src/schedule.ts` etc. — that branch is on `origin` per this session's earlier
push). Do not guess translations; use the exact text already written and reviewed in that branch.

- [ ] **Step 1: Write the failing test**

```ts
// src/i18n/i18n.test.ts
import { describe, expect, it } from 'vitest';
import { getDictionary } from './index';

describe('getDictionary', () => {
  it('returns a complete dictionary for es and en', () => {
    for (const locale of ['es', 'en'] as const) {
      const dict = getDictionary(locale);
      expect(dict.beats.dormant).toBeTruthy();
      expect(dict.voice.length).toBeGreaterThan(0);
      expect(dict.hud.searchPlaceholder).toBeTruthy();
      expect(dict.events.queryLanded).toBeTruthy();
    }
  });

  it('es and en have different text for the same key', () => {
    expect(getDictionary('es').beats.dormant).not.toBe(getDictionary('en').beats.dormant);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Define the `Dictionary` shape**

```ts
// src/i18n/types.ts

/** Every event-log line is `${fmt(t)}  ${text}`; templates use {n}/{name} placeholders. */
export interface Dictionary {
  locale: 'es' | 'en';
  beats: {
    dormant: string;
    customerQuery: string;
    grounding: string;
    catalogResolves: string;
    crossValidation: string;
    configSpace: string;
    streamsConverge: string;
    answerValidated: string;
    recede: string;
  };
  voice: string[];
  hud: {
    title: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    sendAriaLabel: string;
    caption: string;
    captionSending: string;
    soundHint: string;
    soundHintMuted: string;
    verified: string;
    consultaLabel: string;
    respuestaLabel: string;
    fallbackAnswer: string;
  };
  events: {
    /** {name}, {count} */
    familyFound: string;
    /** {count} */
    sweepFamilies: string;
    /** {QUERY} substituted by the caller, not this template */
    customerAsks: string;
    queryLanded: string;
    crossReference: string;
    verifyOfficialDocs: string;
    searchRelatedParts: string;
    exploreConfigurations: string;
    /** {count} */
    uncertainToHuman: string;
    gatherFindings: string;
    combineIntoAnswer: string;
    deliverAnswer: string;
  };
  catalogNames: string[]; // fallback generic category labels when a BrandKit supplies none
}
```

- [ ] **Step 4: Port the English dictionary**

```ts
// src/i18n/en.ts
import type { Dictionary } from './types';

export const en: Dictionary = {
  locale: 'en',
  beats: {
    dormant: 'Dormant field',
    customerQuery: 'Customer query',
    grounding: 'Grounding',
    catalogResolves: 'Catalog resolves',
    crossValidation: 'Cross-validation',
    configSpace: 'Configuration space',
    streamsConverge: 'Streams converge',
    answerValidated: 'Answer validated',
    recede: 'Recede',
  },
  voice: [
    'Signal becomes intelligence.',
    'Millions of valid configurations. One validated answer.',
    'Decades of pattern recognition, available to every customer.',
    'Uncertain? It asks an engineer. It never guesses.',
  ],
  hud: {
    title: 'Signal becomes intelligence',
    searchPlaceholder: 'Ask a question',
    searchAriaLabel: 'Ask a question',
    sendAriaLabel: 'Send query',
    caption: 'Press enter to route the query',
    captionSending: 'Routing…',
    soundHint: 'Click for sound',
    soundHintMuted: 'M unmutes sound',
    verified: '✓ Validated against official reference',
    consultaLabel: 'Query',
    respuestaLabel: 'Answer',
    fallbackAnswer: 'Route validated. No exact match in the demo set.',
  },
  events: {
    familyFound: 'Finds the "{name}" family: {count} possible references',
    sweepFamilies: 'Checks the other {count} product families in case they apply',
    customerAsks: 'The customer asks: "{QUERY}"',
    queryLanded: 'The question reaches the full catalog',
    crossReference: 'Cross-references the answer with the compatibility matrix',
    verifyOfficialDocs: 'Verifies the data against official technical documentation',
    searchRelatedParts: 'Searches for related parts and configurations',
    exploreConfigurations: 'Explores thousands of possible configurations',
    uncertainToHuman: '{count} uncertain cases are sent to a human engineer',
    gatherFindings: 'Gathers everything found in each product family',
    combineIntoAnswer: 'Combines everything into a single answer',
    deliverAnswer: 'Delivers a validated answer to the customer',
  },
  catalogNames: ['Category A', 'Category B', 'Category C', 'Category D', 'Category E', 'Category F', 'Category G', 'Category H'],
};
```

- [ ] **Step 5: Port the Spanish dictionary from `feat/item24-es-demo`**

```bash
git show feat/item24-es-demo:src/schedule.ts > /tmp/item24-schedule.ts
git show feat/item24-es-demo:src/main.ts > /tmp/item24-main.ts
```

Read both files, pull the exact Spanish strings (BEATS labels, VOICE array, event/label templates,
HUD copy from `index.html` on that branch) into `src/i18n/es.ts`, matching the same `Dictionary`
shape as `en.ts`. Use `git show feat/item24-es-demo:index.html` for the HUD-copy strings (search
placeholder, caption, sound hint, verified line).

```ts
// src/i18n/es.ts
import type { Dictionary } from './types';

export const es: Dictionary = {
  locale: 'es',
  // ... fields ported verbatim from feat/item24-es-demo, same shape as en.ts above
};
```

- [ ] **Step 6: Write the dictionary registry**

```ts
// src/i18n/index.ts
import { en } from './en';
import { es } from './es';
import type { Dictionary } from './types';

const DICTIONARIES: Record<Dictionary['locale'], Dictionary> = { en, es };

export function getDictionary(locale: Dictionary['locale']): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary } from './types';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 8: Wire the dictionary into `schedule.ts` and `main.ts`**

Change `buildSchedule(graph: Graph, seed: number)` to `buildSchedule(graph: Graph, seed: number, dict: Dictionary)`.
Replace every hardcoded string literal in the event/label `.push()` calls with the matching
`dict.events.*`/template, using a small local `format(template, vars)` helper:

```ts
// add near the top of schedule.ts
function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}
```

e.g. `events.push({ t: start + dur, text: \`${fmt(start + dur)}  ${format(dict.events.familyFound, { name, count })}\` });`
Do this for every event/label push in the file, and for `CATALOG_NAMES`/`DOC_NAMES` (source them
from `dict.catalogNames` unless a `BrandKit` overrides them — Task 3 wires the override). In
`main.ts`, replace `BEATS`/`VOICE`/hardcoded HUD strings with `dict.beats.*`/`dict.voice`/`dict.hud.*`, threading `dict` from wherever `buildSchedule` is currently called.

- [ ] **Step 9: Build to confirm no regressions**

Run: `pnpm build`
Expected: typecheck + build succeed; the default (no `?kit=`) page still renders in English (`en`
is the default dictionary until Task 3 wires kit-driven locale selection).

- [ ] **Step 10: Commit**

```bash
git add src/i18n src/schedule.ts src/main.ts index.html
git commit -m "feat: extract HUD/log/voice copy into es/en i18n dictionaries"
```

---

### Task 3: BrandKit contract + runtime loader

**Files:**
- Create: `src/brandkit.ts`
- Test: `src/brandkit.test.ts`
- Modify: `src/main.ts` (read `?kit=` from the URL, fetch `/kits/<slug>.json`, apply palette/logo/dictionary/queries before building the scene; fall back to the built-in ReshapeX defaults when no `?kit=` param is present)
- Modify: `src/palette.ts` (accept an optional `GraphPalette` override instead of only exporting hardcoded constants)
- Create: `src/queries.ts` (the `SupportQuery` type + a `DEFAULT_QUERIES: SupportQuery[]` empty/generic array; a kit always supplies its own, this is just the type + safe fallback)
- Create: `public/kits/.gitkeep` (generated kit JSON files are build output, not committed source — add `public/kits/*.json` to `.gitignore`, keep the directory)

**Interfaces:**
- Consumes: `GraphPalette` (Task 1), `Dictionary`/`getDictionary` (Task 2).
- Produces: `interface BrandKit` (below, matches the spec's contract exactly) and
  `async function loadBrandKit(slug: string): Promise<BrandKit>`. Task 8 (CLI orchestrator) writes
  files matching this exact shape to `public/kits/<slug>.json`.

- [ ] **Step 1: Write the failing test**

```ts
// src/brandkit.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseBrandKit } from './brandkit';

const VALID_KIT = {
  company: 'Acme Corp',
  slug: 'acme-corp',
  locale: 'en',
  logoPath: '/kits/acme-corp/logo.svg',
  palette: {
    brand: '#2A6DF0', clusterA: '#2A6DF0', clusterB: '#2A6DF0', stakes: '#2A6DF0',
    answer: '#2A6DF0', background: '#2A6DF0', steel: '#2A6DF0', usedFallback: false,
  },
  catalogNames: ['A', 'B', 'C', 'D', 'E'],
  queries: [{ question: 'Q1', answer: 'A1', confidence: 0.9 }],
  seed: 12345,
  generatedAt: '2026-09-01T00:00:00.000Z',
  sourceUrl: 'https://acme.example.com',
};

describe('parseBrandKit', () => {
  it('accepts a well-formed kit', () => {
    expect(() => parseBrandKit(VALID_KIT)).not.toThrow();
    expect(parseBrandKit(VALID_KIT).slug).toBe('acme-corp');
  });

  it('rejects a kit missing required fields', () => {
    const { palette, ...broken } = VALID_KIT;
    expect(() => parseBrandKit(broken)).toThrow(/palette/);
  });

  it('rejects an unsupported locale', () => {
    expect(() => parseBrandKit({ ...VALID_KIT, locale: 'fr' })).toThrow(/locale/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './brandkit'`

- [ ] **Step 3: Implement the contract, parser, and loader**

```ts
// src/brandkit.ts
import type { GraphPalette } from './generator/palette-algorithm';
import type { Dictionary } from './i18n/types';

export interface SupportQuery {
  question: string;
  answer: string;
  confidence: number;
}

export interface BrandKit {
  company: string;
  slug: string;
  locale: Dictionary['locale'];
  logoPath: string;
  palette: GraphPalette;
  catalogNames: string[];
  queries: SupportQuery[];
  seed: number;
  generatedAt: string;
  sourceUrl: string;
}

/** Throws with a message naming the missing/invalid field; never returns a partial kit. */
export function parseBrandKit(value: unknown): BrandKit {
  if (typeof value !== 'object' || value === null) throw new Error('BrandKit: not an object');
  const v = value as Record<string, unknown>;
  const required = ['company', 'slug', 'locale', 'logoPath', 'palette', 'catalogNames', 'queries', 'seed', 'generatedAt', 'sourceUrl'];
  for (const key of required) {
    if (!(key in v)) throw new Error(`BrandKit: missing required field "${key}"`);
  }
  if (v.locale !== 'es' && v.locale !== 'en') throw new Error(`BrandKit: unsupported locale "${String(v.locale)}"`);
  if (typeof v.palette !== 'object' || v.palette === null) throw new Error('BrandKit: palette must be an object');
  const palette = v.palette as Record<string, unknown>;
  for (const key of ['brand', 'clusterA', 'clusterB', 'stakes', 'answer', 'background', 'steel', 'usedFallback']) {
    if (!(key in palette)) throw new Error(`BrandKit: palette missing "${key}"`);
  }
  return v as unknown as BrandKit;
}

/** Fetches and validates `/kits/<slug>.json`. Throws (does not silently fall back) on any failure. */
export async function loadBrandKit(slug: string): Promise<BrandKit> {
  const res = await fetch(`/kits/${slug}.json`);
  if (!res.ok) throw new Error(`BrandKit: failed to fetch /kits/${slug}.json (${res.status})`);
  return parseBrandKit(await res.json());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Wire `?kit=` into `main.ts` and `palette.ts`**

In `palette.ts`, change the module to export a `buildPalette(override?: GraphPalette)` function
(or equivalent) that maps `GraphPalette` roles onto the existing `PALETTE` constant shape used by
`nodes.ts`/`edges.ts`/`atmosphere.ts`, defaulting to today's hardcoded ReshapeX values when no
override is given. In `main.ts`, near startup, before `buildGraph`/`buildSchedule` are called:

```ts
const kitSlug = new URLSearchParams(location.search).get('kit');
const kit = kitSlug ? await loadBrandKit(kitSlug) : null;
const dict = getDictionary(kit?.locale ?? 'en');
const palette = buildPalette(kit?.palette);
const queries = kit?.queries ?? DEFAULT_QUERIES;
```

Thread `palette`/`dict`/`queries`/`kit?.seed` into the existing scene-construction calls in place
of the current hardcoded imports. If `kit` is set, also swap the `<img class="logo">` src to
`kit.logoPath` and set `<html lang>` to `kit.locale`.

- [ ] **Step 6: Build to confirm no regressions**

Run: `pnpm build`
Expected: succeeds; loading `index.html` with no `?kit=` still renders the default ReshapeX demo.

- [ ] **Step 7: Commit**

```bash
git add src/brandkit.ts src/brandkit.test.ts src/main.ts src/palette.ts src/queries.ts .gitignore public/kits/.gitkeep
git commit -m "feat: load palette/logo/copy/queries from a runtime BrandKit"
```

---

### Task 4: Structural randomization

**Files:**
- Modify: `src/graph.ts:122-124` (the `D` density-tier object)
- Test: `src/graph.test.ts`

**Interfaces:**
- Consumes: `Random` (existing, `src/random.ts`), `buildGraph(seed, density)` (existing signature,
  unchanged — randomization rides the existing `seed` parameter, no new parameter needed).
- Produces: nothing new for later tasks; this task is a self-contained behavior change.

- [ ] **Step 1: Write the failing test**

```ts
// src/graph.test.ts
import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph';

// graph.ts reads localStorage for layout caching; stub it for Node.
(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

function hubCount(seed: number): number {
  return buildGraph(seed, 1).clusters[0]!.hubs.length;
}

describe('buildGraph structural randomization', () => {
  it('two different seeds at the same density produce different hub counts', () => {
    const counts = new Set([hubCount(1), hubCount(2), hubCount(3), hubCount(4), hubCount(5)]);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('the same seed is reproducible', () => {
    expect(hubCount(42)).toBe(hubCount(42));
  });

  it('hub counts stay within a sane range around the density-1 baseline (58)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const count = hubCount(seed);
      expect(count).toBeGreaterThanOrEqual(40);
      expect(count).toBeLessThanOrEqual(80);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — hub counts are always exactly 58 (currently fixed), so `counts.size` is 1.

- [ ] **Step 3: Widen the density-tier constants into seeded ranges**

```ts
// src/graph.ts — replace the existing D object construction (was a plain literal) with:
const jitter = (base: number, spread: number): number => Math.round(base * (1 - spread + rng.next() * spread * 2));
const D = {
  hubs: jitter([58, 110, 180][density - 1]!, 0.24),
  leafScale: [1, 1.7, 3.0][density - 1]!,
  docsHubs: jitter([15, 28, 42][density - 1]!, 0.24),
  tail: jitter([430, 1400, 4000][density - 1]!, 0.24),
  radius: [1, 1.25, 1.5][density - 1]!,
};
```

This must be the first thing that consumes `rng` after its construction (it already is, in the
current file — `D` is built immediately after `const rng = new Random(...)`), so the rest of
`buildGraph`'s determinism-from-seed is unaffected; only the counts widen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Manually verify visually**

Run: `pnpm dev`, load `?seed=1`, `?seed=2`, `?seed=3` if `main.ts` exposes a seed query param
already (check — if not, temporarily hardcode different seeds in `buildGraph(...)` calls, view,
then revert the hardcode before committing). Confirm the three graphs look structurally different,
not just recolored/rotated.

- [ ] **Step 6: Commit**

```bash
git add src/graph.ts src/graph.test.ts
git commit -m "feat: widen graph hub/cluster/tail counts into seeded ranges"
```

---

### Task 5: Content grounding gate

**Files:**
- Create: `tools/generate-demo/grounding-gate.ts`
- Test: `tools/generate-demo/grounding-gate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure data transform).
- Produces: `interface RatedItem<T> { item: T; confidence: number }`,
  `function applyGroundingGate<T>(items: RatedItem<T>[], opts: { threshold?: number; minSurvivors: number }): T[]`
  — throws `GroundingGateError` if fewer than `minSurvivors` clear the threshold. Task 8 (CLI
  orchestrator) calls this once for Q&A pairs (`minSurvivors: 8`) and once for category names
  (`minSurvivors: 5`), per the spec.

- [ ] **Step 1: Write the failing test**

```ts
// tools/generate-demo/grounding-gate.test.ts
import { describe, expect, it } from 'vitest';
import { applyGroundingGate, GroundingGateError } from './grounding-gate';

describe('applyGroundingGate', () => {
  it('keeps items at or above the threshold, drops the rest', () => {
    const items = [
      { item: 'a', confidence: 0.9 },
      { item: 'b', confidence: 0.5 },
      { item: 'c', confidence: 0.61 },
    ];
    expect(applyGroundingGate(items, { minSurvivors: 2 })).toEqual(['a', 'c']);
  });

  it('defaults the threshold to 0.6', () => {
    const items = [{ item: 'a', confidence: 0.6 }, { item: 'b', confidence: 0.59 }];
    expect(applyGroundingGate(items, { minSurvivors: 1 })).toEqual(['a']);
  });

  it('throws GroundingGateError when too few survive', () => {
    const items = [{ item: 'a', confidence: 0.1 }, { item: 'b', confidence: 0.2 }];
    expect(() => applyGroundingGate(items, { minSurvivors: 1 })).toThrow(GroundingGateError);
  });

  it('the thrown error names how many survived vs. required', () => {
    const items = [{ item: 'a', confidence: 0.1 }];
    try {
      applyGroundingGate(items, { minSurvivors: 8 });
      throw new Error('expected applyGroundingGate to throw');
    } catch (e) {
      expect(String(e)).toMatch(/0.*8/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './grounding-gate'`

- [ ] **Step 3: Implement the gate**

```ts
// tools/generate-demo/grounding-gate.ts
export interface RatedItem<T> {
  item: T;
  confidence: number;
}

export class GroundingGateError extends Error {}

export function applyGroundingGate<T>(
  items: RatedItem<T>[],
  opts: { threshold?: number; minSurvivors: number },
): T[] {
  const threshold = opts.threshold ?? 0.6;
  const survivors = items.filter((r) => r.confidence >= threshold).map((r) => r.item);
  if (survivors.length < opts.minSurvivors) {
    throw new GroundingGateError(
      `Content grounding gate: only ${survivors.length} of ${items.length} items cleared confidence ${threshold}, need at least ${opts.minSurvivors}. Supply content manually instead.`,
    );
  }
  return survivors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/generate-demo/grounding-gate.ts tools/generate-demo/grounding-gate.test.ts
git commit -m "feat: add content grounding confidence gate"
```

---

### Task 6: Vendor the scrape + brand/logo extraction adapter

**Files:**
- Create: `tools/generate-demo/vendor/scrape-adapter.ts`
- Test: `tools/generate-demo/vendor/scrape-adapter.test.ts`

**Interfaces:**
- Consumes: `deriveGraphPalette` is NOT called here — this task extracts the raw brand hex only;
  Task 8 calls `deriveGraphPalette` on this task's output.
- Produces:
  `interface ScrapeResult { html: string; pages: { url: string; text: string }[]; brandColorHex: string; logoUrl: string | null; detectedLocale: string }`
  and `async function scrapeProspect(url: string): Promise<ScrapeResult>`. Task 8 calls this
  directly.

- [ ] **Step 1: Read the upstream source before writing anything**

```bash
cat /Users/james/Projects/reshape/design-system/packages/animator/src/lib/scrape.ts
cat /Users/james/Projects/reshape/design-system/packages/animator/src/lib/types.ts
```

List (in the PR description, not committed code) the exact exported functions/types you're
adapting — at minimum the Puppeteer fetch/unblock-tier logic and whatever function computes
`BrandPalette`'s primary color today (per the spec's research, this exists as `derivePalette()`
or equivalent scoring logic; confirm the actual name in the file you just read and use it, don't
guess).

- [ ] **Step 2: Write the failing test using a fixture, not a live network call**

```ts
// tools/generate-demo/vendor/scrape-adapter.test.ts
import { describe, expect, it } from 'vitest';
import { extractBrandColorFromHtml, extractLogoUrlFromHtml } from './scrape-adapter';

const FIXTURE_HTML = `
<html lang="en"><head>
<meta name="theme-color" content="#2A6DF0">
<link rel="icon" href="/favicon.svg">
</head><body>
<header><img src="/logo.svg" alt="Acme Corp logo" class="site-logo"></header>
<a class="cta-button" style="background-color:#2A6DF0">Get started</a>
</body></html>`;

describe('extractBrandColorFromHtml', () => {
  it('prefers the theme-color meta tag when present', () => {
    expect(extractBrandColorFromHtml(FIXTURE_HTML).toLowerCase()).toBe('#2a6df0');
  });
});

describe('extractLogoUrlFromHtml', () => {
  it('finds a header image whose alt/class mentions "logo"', () => {
    expect(extractLogoUrlFromHtml(FIXTURE_HTML, 'https://acme.example.com')).toBe('https://acme.example.com/logo.svg');
  });
});
```

Adjust these two test cases' exact assertions once you've read the real upstream scoring logic in
Step 1 — if `derivePalette()` doesn't prioritize `theme-color` first, match its actual documented
priority order instead of this guess, and update the fixture/expectation accordingly. The shape of
the test (fixture HTML in, deterministic hex/URL out, no network) must not change.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — module does not exist yet.

- [ ] **Step 4: Port the adapter**

Implement `tools/generate-demo/vendor/scrape-adapter.ts` starting from a header comment:

```ts
// Adapted from design-system/packages/animator/src/lib/scrape.ts
// (commit <fill in the commit hash you read in Step 1>).
// Ported: Puppeteer fetch + unblock-tier + Wayback fallback, and brand-color scoring.
// Not ported: product/catalog image crawl (not needed here).
```

Port the HTML-fetch/unblock/Wayback logic wholesale (it's general-purpose), and the brand-color
scoring logic, exposing it as the pure, testable `extractBrandColorFromHtml(html: string): string`
and a new `extractLogoUrlFromHtml(html: string, baseUrl: string): string | null` (favicon /
`og:image` / header-`<img>`-with-"logo" heuristic — this one has no upstream equivalent per the
spec's research, write it fresh). Compose these into:

```ts
export interface ScrapeResult {
  html: string;
  pages: { url: string; text: string }[];
  brandColorHex: string;
  logoUrl: string | null;
  detectedLocale: string;
}

export async function scrapeProspect(url: string): Promise<ScrapeResult> {
  // fetch homepage + FAQ/support/product pages via the ported Puppeteer logic,
  // then: brandColorHex = extractBrandColorFromHtml(html), logoUrl = extractLogoUrlFromHtml(html, url),
  // detectedLocale from <html lang> / hreflang.
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tools/generate-demo/vendor/scrape-adapter.ts tools/generate-demo/vendor/scrape-adapter.test.ts
git commit -m "feat: vendor scrape + brand/logo extraction from design-system's animator"
```

---

### Task 7: Vendor the Q&A content generation adapter

**Files:**
- Create: `tools/generate-demo/vendor/qa-adapter.ts`
- Test: `tools/generate-demo/vendor/qa-adapter.test.ts`

**Interfaces:**
- Consumes: `ScrapeResult['pages']` (Task 6), `RatedItem<T>` (Task 5, for the shape this returns).
- Produces:
  `async function generateContent(pages: { url: string; text: string }[], opts: { locale: string; company: string }): Promise<{ queries: RatedItem<{ question: string; answer: string }>[]; categories: RatedItem<string>[] }>`.
  Task 8 calls this, then passes both arrays through `applyGroundingGate` (Task 5).

- [ ] **Step 1: Read the upstream source before writing anything**

```bash
cat /Users/james/Projects/reshape/design-system/packages/animator/src/lib/qa.ts
```

Confirm the actual Anthropic SDK call shape (model, structured-output method, existing prompt
scaffolding) and note it in the PR description.

- [ ] **Step 2: Write the failing test with a mocked SDK call, not a live API call**

```ts
// tools/generate-demo/vendor/qa-adapter.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            queries: [{ question: 'What sizes do you offer?', answer: 'Sizes S-XL.', confidence: 0.9 }],
            categories: [{ name: 'Apparel', confidence: 0.95 }],
          }),
        }],
      }),
    };
  },
}));

const { generateContent } = await import('./qa-adapter');

describe('generateContent', () => {
  it('parses the model response into rated queries and categories', async () => {
    const result = await generateContent([{ url: 'https://acme.example.com/faq', text: 'We offer sizes S through XL.' }], { locale: 'en', company: 'Acme' });
    expect(result.queries[0]!.item.question).toBe('What sizes do you offer?');
    expect(result.queries[0]!.confidence).toBe(0.9);
    expect(result.categories[0]!.item).toBe('Apparel');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — module does not exist yet.

- [ ] **Step 4: Port the adapter**

Implement `tools/generate-demo/vendor/qa-adapter.ts` with the same vendor header-comment
convention as Task 6. Prompt requirements (bake into the system/user prompt): generate ~15
candidate Q&A pairs and ~8-10 candidate category labels grounded only in the provided page text,
in the requested locale (translating if the source pages are in a different language — per the
spec's locale-conflict handling), with a self-rated `confidence` (0-1) per item defined explicitly
in the prompt as "how directly is this supported by the provided text, not inferred or guessed."
Request structured JSON output matching the test's shape; parse it into `RatedItem<...>[]` for
both arrays.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tools/generate-demo/vendor/qa-adapter.ts tools/generate-demo/vendor/qa-adapter.test.ts
git commit -m "feat: vendor grounded Q&A/category generation from design-system's animator"
```

---

### Task 8: CLI orchestrator

**Files:**
- Create: `tools/generate-demo/cli.ts`
- Create: `tools/generate-demo/slug.ts` (company → slug + seed hash, small enough to isolate and unit-test)
- Test: `tools/generate-demo/slug.test.ts`
- Modify: `package.json` (add `"generate-demo": "tsx tools/generate-demo/cli.ts"` script + `tsx`, `commander` or similar arg-parsing devDependency — pick one lightweight parser, don't hand-roll)

**Interfaces:**
- Consumes: `scrapeProspect` (Task 6), `generateContent` (Task 7), `applyGroundingGate` (Task 5),
  `deriveGraphPalette` (Task 1), `BrandKit`/`parseBrandKit` (Task 3).
- Produces: writes `public/kits/<slug>.json` (validated via `parseBrandKit` before writing — fail
  fast if the assembled object doesn't match the contract) and downloads the logo to
  `public/kits/<slug>/logo.<ext>`. Task 10 (render driver) and Task 11 (preview deploy) are
  invoked by this CLI as the final pipeline stages, added in their own tasks.

- [ ] **Step 1: Write the failing test for slug/seed derivation**

```ts
// tools/generate-demo/slug.test.ts
import { describe, expect, it } from 'vitest';
import { companyToSlug, companyToSeed } from './slug';

describe('companyToSlug', () => {
  it('lowercases, strips punctuation, hyphenates spaces', () => {
    expect(companyToSlug('Acme Corp.')).toBe('acme-corp');
  });
});

describe('companyToSeed', () => {
  it('is deterministic', () => {
    expect(companyToSeed('Acme Corp', 0)).toBe(companyToSeed('Acme Corp', 0));
  });

  it('a nonzero seed-variant changes the seed', () => {
    expect(companyToSeed('Acme Corp', 0)).not.toBe(companyToSeed('Acme Corp', 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement slug/seed derivation**

```ts
// tools/generate-demo/slug.ts
export function companyToSlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** FNV-1a, deterministic, salted by seedVariant for an intentional do-over. */
export function companyToSeed(company: string, seedVariant: number): number {
  let hash = 0x811c9dc5;
  const input = `${company}::${seedVariant}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Add `tsx` and an arg parser, wire the `generate-demo` script**

```bash
pnpm add -D tsx commander
```

```json
// package.json, add to "scripts"
"generate-demo": "tsx tools/generate-demo/cli.ts"
```

- [ ] **Step 6: Implement the orchestrator**

```ts
// tools/generate-demo/cli.ts
import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'node:fs';
import { scrapeProspect } from './vendor/scrape-adapter';
import { generateContent } from './vendor/qa-adapter';
import { applyGroundingGate } from './grounding-gate';
import { deriveGraphPalette } from '../../src/generator/palette-algorithm';
import { parseBrandKit, type BrandKit } from '../../src/brandkit';
import { companyToSlug, companyToSeed } from './slug';

const program = new Command();
program
  .requiredOption('--url <url>', 'prospect website URL')
  .requiredOption('--company <name>', 'company name')
  .option('--locale <locale>', 'es | en | auto', 'auto')
  .option('--density <n>', '1 | 2 | 3', '1')
  .option('--seed-variant <n>', 'salt for a deterministic do-over', '0');
program.parse();
const opts = program.opts<{ url: string; company: string; locale: string; density: string; seedVariant: string }>();

async function main(): Promise<void> {
  const slug = companyToSlug(opts.company);
  const seed = companyToSeed(opts.company, Number(opts.seedVariant));

  console.log(`[1/6] Scraping ${opts.url}...`);
  const scraped = await scrapeProspect(opts.url);
  const locale = opts.locale === 'auto' ? (scraped.detectedLocale.startsWith('es') ? 'es' : 'en') : (opts.locale as 'es' | 'en');

  console.log('[2/6] Generating grounded content...');
  const generated = await generateContent(scraped.pages, { locale, company: opts.company });

  console.log('[3/6] Applying grounding gate...');
  const queries = applyGroundingGate(
    generated.queries.map((r) => ({ item: r.item, confidence: r.confidence })),
    { minSurvivors: 8 },
  ).map((q, i) => ({ ...q, confidence: generated.queries[i]!.confidence }));
  const catalogNames = applyGroundingGate(
    generated.categories.map((r) => ({ item: r.item, confidence: r.confidence })),
    { minSurvivors: 5 },
  );

  console.log('[4/6] Deriving palette...');
  const palette = deriveGraphPalette(scraped.brandColorHex);
  if (palette.usedFallback) console.warn(`  ⚠ brand color ${scraped.brandColorHex} needed the fallback hue — consider reviewing manually.`);

  console.log('[5/6] Downloading logo...');
  mkdirSync(`public/kits/${slug}`, { recursive: true });
  const logoExt = scraped.logoUrl?.split('.').pop() ?? 'svg';
  const logoPath = `/kits/${slug}/logo.${logoExt}`;
  if (scraped.logoUrl) {
    const res = await fetch(scraped.logoUrl);
    writeFileSync(`public${logoPath}`, Buffer.from(await res.arrayBuffer()));
  } else {
    console.warn('  ⚠ no logo found — kit will reference a missing logo path; supply one manually.');
  }

  console.log('[6/6] Writing BrandKit...');
  const kit: BrandKit = {
    company: opts.company,
    slug,
    locale,
    logoPath,
    palette,
    catalogNames,
    queries,
    seed,
    generatedAt: new Date().toISOString(),
    sourceUrl: opts.url,
  };
  parseBrandKit(kit); // throws before writing if the assembled object is malformed
  writeFileSync(`public/kits/${slug}.json`, JSON.stringify(kit, null, 2));

  console.log(`\nDraft kit written: public/kits/${slug}.json`);
  console.log(`Dropped ${generated.queries.length - queries.length} low-confidence Q&A, ${generated.categories.length - catalogNames.length} low-confidence categories.`);
  console.log(`Preview locally: pnpm dev, then open /?kit=${slug}`);
  console.log('Render + deploy steps are added in later tasks of this plan.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Manually verify against a real URL**

Run: `pnpm generate-demo --url https://www.item24.com --company "item24"`
Expected: either a written `public/kits/item24.json` you can load via `pnpm dev` + `/?kit=item24`,
or a clear `GroundingGateError`/scrape failure — not a silent bad result. If it fails, that's
useful signal for whether Task 6/7's ported logic needs adjustment; don't move on until at least
one real prospect URL produces a working kit.

- [ ] **Step 8: Commit**

```bash
git add tools/generate-demo/cli.ts tools/generate-demo/slug.ts tools/generate-demo/slug.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add generate-demo CLI orchestrator"
```

---

### Task 9: Headless export hook

**Files:**
- Modify: `src/export.ts` (or wherever `LoopExporter` is defined — confirm exact location/class
  name by reading the file first; the spec assumed `export.ts`)
- Modify: `src/main.ts` (expose the new hook on `window.kg`)

**Interfaces:**
- Consumes: the existing `LoopExporter` (read its current public API before writing this task's
  code — do not guess method names).
- Produces: `window.kg.exportLoop(): Promise<Blob>`, callable from a headless Playwright script
  (Task 10) without any keyboard event needed.

- [ ] **Step 1: Read the existing export mechanism**

```bash
cat src/export.ts
grep -n "window.kg\|'E'\|KeyE" src/main.ts
```

Confirm: the exact class/function name driving `E`-key export, whether it already returns/exposes
a `Blob` or `ArrayBuffer` internally (even if only used for the `<a download>` flow today), and
where `window.kg` is currently assigned.

- [ ] **Step 2: Add the promise-returning hook**

Using whatever the export mechanism's existing completion signal is (a callback, an event, or a
promise it already returns internally), wrap it:

```ts
// in main.ts, near the existing window.kg assignment
(window as any).kg = {
  ...(window as any).kg,
  exportLoop: (): Promise<Blob> => exporter.startAndAwaitBlob(), // exact method name depends on Step 1's findings — wire to whatever completion signal export.ts actually exposes, adding one if it doesn't yet
};
```

If `LoopExporter` doesn't currently expose a promise/callback for "recording finished, here's the
Blob" (only triggers a browser download), add that as a small, additive change to `export.ts` —
the existing `E`-key/download path must keep working unchanged; this is a new second consumer of
the same underlying recording completion, not a replacement.

- [ ] **Step 3: Manually verify in the browser console**

Run: `pnpm dev`, open the console, run `await kg.exportLoop()`. Expected: resolves with a `Blob`
after one loop's worth of real time (matches today's `E`-key behavior, just promise-based).

- [ ] **Step 4: Commit**

```bash
git add src/export.ts src/main.ts
git commit -m "feat: expose window.kg.exportLoop() for headless automation"
```

---

### Task 10: Headless render driver

**Files:**
- Create: `tools/generate-demo/render.ts`
- Modify: `tools/generate-demo/cli.ts` (call the render step after the BrandKit is written)
- Modify: `package.json` (add `playwright` devDependency)

**Interfaces:**
- Consumes: `window.kg.exportLoop()` (Task 9), a running dev/preview server serving
  `?kit=<slug>`.
- Produces: `async function renderKit(opts: { baseUrl: string; slug: string; outPath: string }): Promise<void>` writing an MP4 to `outPath`. Task 11 (preview deploy) runs after this in the CLI.

- [ ] **Step 1: Spike headless MediaRecorder encoding before writing the real driver**

This is the spec's flagged unverified assumption — resolve it first, standalone, before wiring it
into the pipeline:

```bash
pnpm add -D playwright
pnpm exec playwright install chromium
```

```ts
// tools/generate-demo/render-spike.ts — throwaway, delete after this step
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173'); // requires `pnpm dev` running separately
const result = await page.evaluate(async () => {
  const blob = await (window as any).kg.exportLoop();
  return blob.size;
});
console.log('Recorded blob size:', result);
await browser.close();
```

Run it (`pnpm dev` in one terminal, `pnpm tsx tools/generate-demo/render-spike.ts` in another).
**If `result` is 0 or the call throws**, headless Chromium needs launch flags (commonly
`--use-fake-ui-for-media-stream` or similar for MediaRecorder in headless mode, or
`chromium.launch({ headless: false })` may be required as a fallback) — resolve this here, adding
whatever flags/args are needed to `chromium.launch(...)`, before writing Step 2. Delete
`render-spike.ts` once this is confirmed working.

- [ ] **Step 2: Implement the real render driver**

```ts
// tools/generate-demo/render.ts
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export async function renderKit(opts: { baseUrl: string; slug: string; outPath: string }): Promise<void> {
  const browser = await chromium.launch(/* whatever launch args Task 10 Step 1 found necessary */);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${opts.baseUrl}/?kit=${opts.slug}`);
  await page.waitForSelector('.hud.visible', { timeout: 15_000 });

  const base64 = await page.evaluate(async () => {
    const blob: Blob = await (window as any).kg.exportLoop();
    const buf = await blob.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  });
  await browser.close();

  const webmPath = opts.outPath.replace(/\.mp4$/, '.webm');
  writeFileSync(webmPath, Buffer.from(base64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', opts.outPath]);
}
```

- [ ] **Step 3: Wire into the CLI**

In `cli.ts`, after the BrandKit is written: start `vite preview` (or reuse a running `pnpm dev`)
programmatically, or require the operator to have `pnpm dev` running and pass its URL; call
`renderKit({ baseUrl: 'http://localhost:5173', slug, outPath: \`dist-demos/${slug}.mp4\` })`. Add
console output for this stage matching the existing `[n/6]` convention (renumber the log lines to
`[n/7]` across the file now that render is a stage).

- [ ] **Step 4: Manually verify end-to-end against a real kit**

Run the full `pnpm generate-demo --url ... --company ...` with `pnpm dev` running in another
terminal. Expected: an MP4 file lands at `dist-demos/<slug>.mp4` and plays back correctly (open it).

- [ ] **Step 5: Commit**

```bash
git add tools/generate-demo/render.ts tools/generate-demo/cli.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat: headless Playwright render driver for generated kits"
```

---

### Task 11: Preview deploy + promote command

**Files:**
- Create: `tools/generate-demo/deploy.ts`
- Create: `tools/generate-demo/promote.ts`
- Modify: `tools/generate-demo/cli.ts` (call the preview deploy step as the final pipeline stage)
- Modify: `package.json` (add `"promote-demo": "tsx tools/generate-demo/promote.ts"`)

**Interfaces:**
- Consumes: nothing from earlier tasks except the finished `public/kits/<slug>.json` and built app.
- Produces: `async function deployPreview(): Promise<string>` (returns the preview URL) and a
  `promote-demo <slug> --project <name>` CLI entry point.

- [ ] **Step 1: Implement the preview deploy step**

Per `docs/kg-animation-vercel.md`'s "deploying a lane/branch as its own project" pattern (this
session's own recorded lesson — read it before writing this):

```ts
// tools/generate-demo/deploy.ts
import { execFileSync } from 'node:child_process';

/** Deploys a PREVIEW (never --prod) so nothing is aliased without an explicit promote step. */
export async function deployPreview(): Promise<string> {
  const output = execFileSync('vercel', ['--yes', '--scope', 'reshapex'], { encoding: 'utf8' });
  const match = output.match(/https:\/\/\S+\.vercel\.app/);
  if (!match) throw new Error(`deployPreview: could not find a preview URL in Vercel CLI output:\n${output}`);
  return match[0];
}
```

- [ ] **Step 2: Wire into the CLI as the final stage**

In `cli.ts`, after `renderKit(...)` succeeds:

```ts
console.log('[7/7] Deploying preview...');
const previewUrl = await deployPreview();
console.log(`\nPreview: ${previewUrl}`);
console.log(`MP4: dist-demos/${slug}.mp4`);
console.log(`To promote to a stable URL: pnpm promote-demo ${slug} --project <name>`);
```

- [ ] **Step 3: Implement `promote-demo`**

```ts
// tools/generate-demo/promote.ts
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';

const program = new Command();
program.argument('<slug>').requiredOption('--project <name>');
program.parse();
const [slug] = program.args;
const { project } = program.opts<{ project: string }>();

console.log(`Linking to Vercel project "${project}" under reshapex...`);
execFileSync('vercel', ['project', 'add', project, '--scope', 'reshapex'], { stdio: 'inherit' });
execFileSync('vercel', ['link', '--yes', '--project', project, '--scope', 'reshapex'], { stdio: 'inherit' });
console.log('Deploying to production (stable alias)...');
execFileSync('vercel', ['--prod', '--yes', '--scope', 'reshapex'], { stdio: 'inherit' });
console.log(`\nPromoted "${slug}" — verify at https://${project}.vercel.app`);
```

(`vercel project add` is idempotent-safe to call even if the project already exists from a prior
promote — confirm this in the CLI's actual behavior during manual verification; if it errors on an
existing project, catch and ignore that specific case rather than failing the whole command.)

- [ ] **Step 4: Manually verify against the item24-equivalent flow**

Run `pnpm promote-demo <slug> --project <slug>-demo` against a kit produced by Task 8's manual
verification. Expected: matches the exact manual sequence this session ran for `item-kcs`
(`vercel project add` → `vercel link` → `vercel --prod`), just scripted. Verify the resulting URL
serves the right build (`curl | grep` a string unique to that kit, per this session's own
verification habit).

- [ ] **Step 5: Commit**

```bash
git add tools/generate-demo/deploy.ts tools/generate-demo/promote.ts tools/generate-demo/cli.ts package.json
git commit -m "feat: add preview deploy stage and promote-demo command"
```

---

## Self-review notes (already applied above)

- **Spec coverage:** palette algorithm (Task 1), i18n (Task 2), BrandKit contract/runtime loading
  (Task 3), structural randomization (Task 4), grounding gate (Task 5), scrape/brand/logo vendor
  (Task 6), Q&A vendor (Task 7), CLI orchestration (Task 8), export hook (Task 9), headless render
  incl. the spec's flagged spike (Task 10), preview deploy + promote (Task 11). `--seed-variant`
  and locale-mismatch translation are in Task 8/7 respectively. No DAM/design-system changes
  anywhere in this plan, matching the spec's repo-boundary decision.
- **No placeholders:** Tasks 6, 7, and 10 depend on reading code this plan's author hasn't seen
  (upstream `scrape.ts`/`qa.ts`, and headless Chromium's actual MediaRecorder behavior) — each of
  those tasks' first step is a concrete read/spike action with a defined artifact, and their
  contracts (function names, types, test shapes) are fully specified regardless of what that
  research finds, so no downstream task is blocked on guesswork.
- **Type consistency:** `GraphPalette` (Task 1) → `BrandKit.palette` (Task 3) → CLI output (Task
  8) use the same field names throughout. `Dictionary` (Task 2) is consumed by Task 3's loader
  exactly as produced. `RatedItem<T>` (Task 5) is the exact shape Task 7 produces and Task 8 feeds
  into `applyGroundingGate`.
