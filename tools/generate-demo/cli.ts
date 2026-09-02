import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'node:fs';
import { scrapeProspect } from './vendor/scrape-adapter';
import { generateContent } from './vendor/qa-adapter';
import { applyGroundingGate } from './grounding-gate';
import { deriveGraphPalette } from '../../src/generator/palette-algorithm';
import { parseBrandKit, type BrandKit } from '../../src/brandkit';
import { companyToSlug, companyToSeed } from './slug';
import { renderKit } from './render';
import { deployPreview } from './deploy';

const program = new Command();
program
  .requiredOption('--url <url>', 'prospect website URL')
  .requiredOption('--company <name>', 'company name')
  .option('--locale <locale>', 'es | en | auto', 'auto')
  .option('--density <n>', '1 | 2 | 3', '1')
  .option('--seed-variant <n>', 'salt for a deterministic do-over', '0')
  .option('--base-url <url>', 'origin of a running dev/preview server that serves the kit', 'http://localhost:5173');
program.parse();
const opts = program.opts<{ url: string; company: string; locale: string; density: string; seedVariant: string; baseUrl: string }>();

/** Everything checkable from the arguments alone, checked before any network or paid API call. */
function validateOptions(): { seedVariant: number; density: 1 | 2 | 3 } {
  if (opts.locale !== 'auto' && opts.locale !== 'es' && opts.locale !== 'en') {
    throw new Error(`--locale must be one of "es", "en", "auto" (got "${opts.locale}")`);
  }
  const seedVariant = Number(opts.seedVariant);
  if (!Number.isInteger(seedVariant)) {
    throw new Error(`--seed-variant must be an integer (got "${opts.seedVariant}")`);
  }
  const density = Number(opts.density);
  if (density !== 1 && density !== 2 && density !== 3) {
    throw new Error(`--density must be 1, 2 or 3 (got "${opts.density}")`);
  }
  return { seedVariant, density };
}

async function main(): Promise<void> {
  const { seedVariant, density } = validateOptions();
  const slug = companyToSlug(opts.company);
  const seed = companyToSeed(opts.company, seedVariant);

  console.log(`[1/8] Scraping ${opts.url}...`);
  const scraped = await scrapeProspect(opts.url);
  const locale = opts.locale === 'auto' ? (scraped.detectedLocale.startsWith('es') ? 'es' : 'en') : (opts.locale as 'es' | 'en');

  console.log('[2/8] Generating grounded content...');
  const generated = await generateContent(scraped.pages, { locale, company: opts.company });

  console.log('[3/8] Applying grounding gate...');
  // The gate returns the surviving RatedItems, so each survivor carries its own confidence —
  // indexing back into the unfiltered array would mis-pair them as soon as anything is dropped.
  const queries = applyGroundingGate(generated.queries, { minSurvivors: 8 }).map((r) => ({
    ...r.item,
    confidence: r.confidence,
  }));
  const catalogNames = applyGroundingGate(generated.categories, { minSurvivors: 5 }).map((r) => r.item);

  console.log('[4/8] Deriving palette...');
  const palette = deriveGraphPalette(scraped.brandColorHex);
  if (palette.usedFallback) console.warn(`  ⚠ brand color ${scraped.brandColorHex} needed the fallback hue — consider reviewing manually.`);

  console.log('[5/8] Assembling BrandKit...');
  const logoExt = scraped.logoUrl?.split('.').pop() ?? 'svg';
  const logoPath = `/kits/${slug}/logo.${logoExt}`;
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
  parseBrandKit(kit); // throws before any filesystem writes if the assembled object is malformed

  console.log('[6/8] Writing BrandKit and downloading logo...');
  mkdirSync(`public/kits/${slug}`, { recursive: true });
  if (scraped.logoUrl) {
    const res = await fetch(scraped.logoUrl);
    writeFileSync(`public${logoPath}`, Buffer.from(await res.arrayBuffer()));
  } else {
    console.warn('  ⚠ no logo found — kit will reference a missing logo path; supply one manually.');
  }
  writeFileSync(`public/kits/${slug}.json`, JSON.stringify(kit, null, 2));

  console.log(`\nDraft kit written: public/kits/${slug}.json`);
  console.log(`Dropped ${generated.queries.length - queries.length} low-confidence Q&A, ${generated.categories.length - catalogNames.length} low-confidence categories.`);

  console.log(`[7/8] Rendering demo video against ${opts.baseUrl} (replays a full ~20s animation loop; usually finishes in under a minute. If it's taking much longer, GPU acceleration may have failed to engage in headless Chromium)...`);
  mkdirSync('dist-demos', { recursive: true });
  const outPath = `dist-demos/${slug}.mp4`;
  await renderKit({ baseUrl: opts.baseUrl, slug, outPath, density });

  console.log(`\nDemo video written: ${outPath}`);
  console.log(`Draft kit written: public/kits/${slug}.json`);

  console.log('[8/8] Deploying preview...');
  const previewUrl = await deployPreview(slug);
  console.log(`\nPreview: ${previewUrl}`);
  console.log(`MP4: ${outPath}`);
  console.log(`To promote to a stable URL: pnpm promote-demo ${slug} --project <name>`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
