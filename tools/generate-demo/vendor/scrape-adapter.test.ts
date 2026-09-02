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
    // Matches upstream derivePalette()'s scoring: theme-color carries weight 5,
    // the highest of any signal, so it wins even when a CTA fill agrees with it.
    expect(extractBrandColorFromHtml(FIXTURE_HTML).toLowerCase()).toBe('#2a6df0');
  });

  it('falls back to a CTA background color when no theme-color meta is present', () => {
    const html = `<html><body><a class="cta-button" style="background-color:#FF6600">Buy</a></body></html>`;
    expect(extractBrandColorFromHtml(html).toLowerCase()).toBe('#ff6600');
  });

  it('ignores near-white/near-black/unsaturated colors as non-brand', () => {
    const html = `<html><body>
      <a class="cta-button" style="background-color:#FFFFFF">Ghost button</a>
      <a class="cta-button" style="background-color:#111111">Almost black</a>
      <a class="cta-button" style="background-color:#00AA88">Real accent</a>
    </body></html>`;
    expect(extractBrandColorFromHtml(html).toLowerCase()).toBe('#00aa88');
  });

  it('returns a sensible default when no brand-like color is found', () => {
    const html = `<html><body><p>No colors here</p></body></html>`;
    expect(extractBrandColorFromHtml(html)).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('does not double-count a CTA that sets both background-color and shorthand background', () => {
    // A single element should only ever contribute one CTA-background score
    // (mirroring upstream's single resolved getComputedStyle().backgroundColor
    // per element): background-color wins when present, and the shorthand
    // background is never also scored for that same element.
    //
    // The first CTA declares both properties with different colors; the
    // second CTA declares only background-color, agreeing with the first
    // CTA's shorthand color. This is what makes the two behaviors diverge:
    //   - Buggy (double-counts the shorthand): #FF6600 gets 3 (tag 1's
    //     shorthand) + 3 (tag 2's background-color) = 6, beating #2A6DF0's 3.
    //     -> winner is #FF6600.
    //   - Fixed (background-color only, shorthand ignored when present):
    //     #2A6DF0 gets 3 (tag 1's background-color), #FF6600 gets 3 (tag 2's
    //     background-color) — tied, and #2A6DF0 was tallied first.
    //     -> winner is #2A6DF0.
    const html = `<html><body>
      <a class="cta-button" style="background:#FF6600;background-color:#2A6DF0">Get started</a>
      <a class="cta-button" style="background-color:#FF6600">Also here</a>
    </body></html>`;
    expect(extractBrandColorFromHtml(html).toLowerCase()).toBe('#2a6df0');
  });

  it('falls back to the shorthand background only when background-color is absent on that element', () => {
    const html = `<html><body>
      <a class="cta-button" style="background:#FF6600">Buy now</a>
    </body></html>`;
    expect(extractBrandColorFromHtml(html).toLowerCase()).toBe('#ff6600');
  });
});

describe('extractLogoUrlFromHtml', () => {
  it('finds a header image whose alt/class mentions "logo"', () => {
    expect(extractLogoUrlFromHtml(FIXTURE_HTML, 'https://acme.example.com')).toBe(
      'https://acme.example.com/logo.svg',
    );
  });

  it('falls back to og:image when no logo-hinted image is present', () => {
    const html = `<html><head><meta property="og:image" content="/social-card.png"></head><body></body></html>`;
    expect(extractLogoUrlFromHtml(html, 'https://acme.example.com')).toBe(
      'https://acme.example.com/social-card.png',
    );
  });

  it('falls back to the favicon when nothing else is present', () => {
    const html = `<html><head><link rel="icon" href="/favicon.svg"></head><body></body></html>`;
    expect(extractLogoUrlFromHtml(html, 'https://acme.example.com')).toBe(
      'https://acme.example.com/favicon.svg',
    );
  });

  it('returns null when there is no logo, og:image, or favicon', () => {
    const html = `<html><head></head><body><p>Nothing here</p></body></html>`;
    expect(extractLogoUrlFromHtml(html, 'https://acme.example.com')).toBeNull();
  });
});
