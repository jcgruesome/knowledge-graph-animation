// Adapted from design-system/packages/animator/src/lib/scrape.ts
// (commit 8dd57c7adb89a5cbe1b421961c98add6a9d81529).
// Ported: HTML fetch + unblock-tier + Wayback fallback, and brand-color scoring
// (derivePalette()'s theme-color > CTA-fill > CTA-border > link-color priority).
// Not ported: product/catalog image crawl (not needed here), Puppeteer/browser
// automation (see "Simplified" note below), full BrandPalette (only the primary
// hex is needed here — Task 8's deriveGraphPalette takes it from there).
//
// Simplified vs. upstream:
// - Upstream launches a real (SSRF-guarded, IP-pinned) headless Chromium via
//   Puppeteer and reads *computed* CSS from the live DOM (getComputedStyle on
//   CTAs, links, the theme-color meta, etc.), which is how it sees colors that
//   only exist in an external stylesheet. This adapter has no headless browser
//   dependency, so it works on the raw HTML text: the theme-color meta tag and
//   inline `style="..."` attributes on CTA-like elements/links. A color that
//   only exists in a linked CSS file is invisible to this adapter — an honest
//   trade for not vendoring Puppeteer + the SSRF-guard machinery into a video
//   generator CLI. The scoring weights (theme-color 5, CTA background 3, CTA
//   border 1, link color 1) and the "brand-like" saturation/lightness filter
//   are ported as-is from `derivePalette()`.
// - Upstream's unblock ladder (`unblock.ts`) walks Puppeteer through several
//   posture tiers (direct, identified-browser headers, a replayed human
//   session, then Wayback) with page-level block classification (status code +
//   login-wall/captcha markup). This adapter ports the *shape* of that ladder
//   with plain `fetch()`: a direct request, then a request with browser-like
//   headers, then a Wayback Machine snapshot. The `session` tier (replaying a
//   captured human login) is not ported — it depends on a session-capture
//   store (`site-session.ts`) that has no equivalent here and isn't needed for
//   a public marketing site's brand/logo signals.

const DEFAULT_BRAND_COLOR = '#2563EB';

const FETCH_TIMEOUT_MS = 10_000;

const IDENTIFIED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IDENTIFIED_HEADERS: Record<string, string> = {
  'user-agent': IDENTIFIED_USER_AGENT,
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

export interface ScrapeResult {
  html: string;
  pages: { url: string; text: string }[];
  brandColorHex: string;
  logoUrl: string | null;
  detectedLocale: string;
}

// ---------------------------------------------------------------------------
// Brand-color scoring (ported from derivePalette() in the upstream scrape.ts)
// ---------------------------------------------------------------------------

/** Parse a `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` or `rgb()`/`rgba()` CSS color into a 6-digit hex, or null. */
function parseCssColorToHex(value: string): string | null {
  const trimmed = value.trim();

  const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(trimmed);
  if (hexMatch) {
    let hex = hexMatch[1]!;
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('');
    } else {
      hex = hex.slice(0, 6);
    }
    return `#${hex.toUpperCase()}`;
  }

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(trimmed);
  if (rgbMatch) {
    const alpha = rgbMatch[4] !== undefined ? Number.parseFloat(rgbMatch[4]) : 1;
    if (alpha === 0) return null; // fully transparent — not a brand signal
    const [r, g, b] = [rgbMatch[1]!, rgbMatch[2]!, rgbMatch[3]!].map((n) => Number.parseInt(n, 10));
    return rgbToHex(r!, g!, b!);
  }

  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsl(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}

/**
 * A color reads as a "brand" color when it's saturated enough and neither
 * near-white nor near-black — i.e. an intentional accent, not a neutral.
 * Ported thresholds from upstream's `isBrandColor()`.
 */
function isBrandColorHex(hex: string): boolean {
  const [, s, l] = hexToHsl(hex);
  return s >= 18 && l >= 12 && l <= 90;
}

/** CTA-like elements: buttons, `.btn`/`.button`/`.cta` classes, submit inputs, `role="button"`. */
const CTA_TAG_RE = /<(button|input)\b[^>]*>|<a\b[^>]*(?:class="[^"]*(?:btn|button|cta)[^"]*"|role="button")[^>]*>/gi;
const STYLE_ATTR_RE = /style="([^"]*)"/i;
const THEME_COLOR_RE = /<meta\s+name="theme-color"\s+content="([^"]+)"/i;
const ANCHOR_TAG_RE = /<a\b[^>]*>/gi;

function extractStyleColor(tagHtml: string, property: 'background-color' | 'background' | 'border-color' | 'color'): string | null {
  const styleMatch = STYLE_ATTR_RE.exec(tagHtml);
  if (!styleMatch) return null;
  const style = styleMatch[1]!;
  const propRe = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
  const propMatch = propRe.exec(style);
  if (!propMatch) return null;
  return propMatch[1]!.trim();
}

export function extractBrandColorFromHtml(html: string): string {
  const tally = new Map<string, number>();
  const add = (raw: string | null, weight: number) => {
    if (!raw) return;
    const hex = parseCssColorToHex(raw);
    if (!hex || !isBrandColorHex(hex)) return;
    tally.set(hex, (tally.get(hex) ?? 0) + weight);
  };

  // Explicit brand signal from the site author — strongest weight, as upstream.
  const themeColorMatch = THEME_COLOR_RE.exec(html);
  add(themeColorMatch?.[1] ?? null, 5);

  for (const ctaTag of html.match(CTA_TAG_RE) ?? []) {
    add(extractStyleColor(ctaTag, 'background-color'), 3);
    add(extractStyleColor(ctaTag, 'background'), 3);
    add(extractStyleColor(ctaTag, 'border-color'), 1);
  }

  for (const anchorTag of html.match(ANCHOR_TAG_RE) ?? []) {
    add(extractStyleColor(anchorTag, 'color'), 1);
  }

  let best: string | null = null;
  let bestScore = -1;
  for (const [hex, score] of tally) {
    if (score > bestScore) {
      best = hex;
      bestScore = score;
    }
  }
  return best ?? DEFAULT_BRAND_COLOR;
}

// ---------------------------------------------------------------------------
// Logo detection (new heuristic — no upstream equivalent; upstream reads a
// live DOM's `currentSrc`/header lookup, this adapter works from static HTML)
// ---------------------------------------------------------------------------

function resolveUrl(candidate: string, baseUrl: string): string | null {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractAttr(tagHtml: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  return re.exec(tagHtml)?.[1] ?? null;
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const HEADER_BLOCK_RE = /<header\b[^>]*>[\s\S]*?<\/header>/i;
const OG_IMAGE_RE = /<meta\s+property="og:image"\s+content="([^"]+)"/i;
const FAVICON_RE = /<link\s+rel="(?:icon|shortcut icon)"\s+href="([^"]+)"/i;

function looksLikeLogo(imgTag: string): boolean {
  const src = extractAttr(imgTag, 'src') ?? '';
  const alt = extractAttr(imgTag, 'alt') ?? '';
  const cls = extractAttr(imgTag, 'class') ?? '';
  return /logo/i.test(src) || /logo/i.test(alt) || /logo|brand/i.test(cls);
}

/**
 * Best-effort logo URL: a logo-hinted `<img>` (src/alt/class mentions "logo",
 * or class mentions "brand") anywhere in the page, preferring one inside
 * `<header>`; else `og:image`; else the favicon; else null.
 */
export function extractLogoUrlFromHtml(html: string, baseUrl: string): string | null {
  const headerBlock = HEADER_BLOCK_RE.exec(html)?.[0] ?? '';
  const headerImgs = headerBlock.match(IMG_TAG_RE) ?? [];
  const allImgs = html.match(IMG_TAG_RE) ?? [];

  const hinted = headerImgs.find(looksLikeLogo) ?? allImgs.find(looksLikeLogo);
  if (hinted) {
    const src = extractAttr(hinted, 'src');
    const resolved = src ? resolveUrl(src, baseUrl) : null;
    if (resolved) return resolved;
  }

  // No logo-hinted image; a plain header <img> is still more likely to be a
  // logo than a coin-flip, but only within <header> — falling back to the
  // first image anywhere in the body risks picking up hero/marketing art.
  const headerImg = headerImgs[0];
  if (headerImg) {
    const src = extractAttr(headerImg, 'src');
    const resolved = src ? resolveUrl(src, baseUrl) : null;
    if (resolved) return resolved;
  }

  const ogImageMatch = OG_IMAGE_RE.exec(html);
  if (ogImageMatch) {
    const resolved = resolveUrl(ogImageMatch[1]!, baseUrl);
    if (resolved) return resolved;
  }

  const faviconMatch = FAVICON_RE.exec(html);
  if (faviconMatch) {
    const resolved = resolveUrl(faviconMatch[1]!, baseUrl);
    if (resolved) return resolved;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

const HTML_LANG_RE = /<html\b[^>]*\blang="([^"]+)"/i;

function extractDetectedLocale(html: string): string {
  return HTML_LANG_RE.exec(html)?.[1]?.trim() || 'en';
}

// ---------------------------------------------------------------------------
// Fetch + unblock tiers + Wayback fallback (ported shape, plain-fetch based —
// see "Simplified vs. upstream" note at the top of this file)
// ---------------------------------------------------------------------------

interface FetchOutcome {
  html: string;
  finalUrl: string;
  status: number;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    const html = await response.text();
    return { html, finalUrl: response.url || url, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A response reads as blocked when the site refused us outright, or answered
 * 200 with a page that is a wall rather than content (bot-check/captcha
 * markup, or suspiciously little text). Deliberately simpler than upstream's
 * `classifyBlock()` (no login-wall/password-field detection — this adapter
 * only needs brand/logo signals, not authenticated content).
 */
function looksBlocked(outcome: FetchOutcome): boolean {
  if (outcome.status === 403 || outcome.status === 429 || outcome.status >= 500) return true;
  if (/captcha|access denied|are you a human|attention required/i.test(outcome.html)) return true;
  return false;
}

/** Wayback Machine's lookup API for the most recent snapshot of a URL. */
async function fetchViaWayback(url: string): Promise<FetchOutcome | null> {
  try {
    const lookup = await fetchWithTimeout(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { accept: 'application/json' },
    );
    const parsed = JSON.parse(lookup.html) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string } };
    };
    const snapshotUrl = parsed.archived_snapshots?.closest?.url;
    if (!parsed.archived_snapshots?.closest?.available || !snapshotUrl) return null;
    return await fetchWithTimeout(snapshotUrl, IDENTIFIED_HEADERS);
  } catch {
    return null;
  }
}

/**
 * Walk the fetch ladder for one URL: a plain direct request, then one with
 * browser-identifying headers, then a Wayback Machine snapshot. Returns the
 * last (best-effort) outcome even if every rung was blocked, mirroring
 * upstream's "whatever the last rung produced is still returned" behavior.
 */
async function fetchWithUnblockLadder(url: string): Promise<FetchOutcome> {
  let best: FetchOutcome | undefined;
  let firstError: unknown;

  try {
    best = await fetchWithTimeout(url, {});
    if (!looksBlocked(best)) return best;
  } catch (err) {
    firstError = err;
  }

  try {
    const identified = await fetchWithTimeout(url, IDENTIFIED_HEADERS);
    best = identified;
    if (!looksBlocked(identified)) return identified;
  } catch (err) {
    firstError ??= err;
  }

  const archived = await fetchViaWayback(url);
  if (archived) return archived;

  if (best) return best;
  throw firstError instanceof Error ? firstError : new Error(`Failed to fetch ${url}`);
}

/** Same-origin links whose href/text hints at FAQ/support/product content. */
const SECONDARY_PAGE_HINT_RE = /faq|support|product|help|pricing/i;
const MAX_SECONDARY_PAGES = 2;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSecondaryPageUrls(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  for (const anchorTag of html.match(ANCHOR_TAG_RE) ?? []) {
    const href = extractAttr(anchorTag, 'href');
    if (!href || !SECONDARY_PAGE_HINT_RE.test(href)) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved) continue;
    try {
      if (new URL(resolved).hostname !== base.hostname) continue;
    } catch {
      continue;
    }
    found.add(resolved);
    if (found.size >= MAX_SECONDARY_PAGES) break;
  }
  return [...found];
}

/**
 * Scrape a prospect's homepage (plus a couple of FAQ/support/product pages,
 * best-effort) for brand color, logo, plain-text content, and locale.
 *
 * Not unit-tested directly (it's a live-network function) — see
 * `extractBrandColorFromHtml`/`extractLogoUrlFromHtml` for the deterministic,
 * fixture-tested logic this composes.
 */
export async function scrapeProspect(url: string): Promise<ScrapeResult> {
  const homepage = await fetchWithUnblockLadder(url);

  const pages: { url: string; text: string }[] = [
    { url: homepage.finalUrl, text: stripTags(homepage.html) },
  ];

  const secondaryUrls = findSecondaryPageUrls(homepage.html, homepage.finalUrl);
  for (const secondaryUrl of secondaryUrls) {
    try {
      const outcome = await fetchWithTimeout(secondaryUrl, IDENTIFIED_HEADERS);
      if (!looksBlocked(outcome)) {
        pages.push({ url: outcome.finalUrl, text: stripTags(outcome.html) });
      }
    } catch {
      // Best-effort: a slow or broken secondary page costs nothing but itself.
    }
  }

  return {
    html: homepage.html,
    pages,
    brandColorHex: extractBrandColorFromHtml(homepage.html),
    logoUrl: extractLogoUrlFromHtml(homepage.html, homepage.finalUrl),
    detectedLocale: extractDetectedLocale(homepage.html),
  };
}
