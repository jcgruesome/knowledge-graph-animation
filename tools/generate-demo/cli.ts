import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'node:fs';
import { scrapeProspect } from './vendor/scrape-adapter';
import { generateContent } from './vendor/qa-adapter';
import { applyGroundingGate } from './grounding-gate';
import { deriveGraphPalette } from '../../src/generator/palette-algorithm';
import { parseBrandKit, type BrandKit } from '../../src/brandkit';
import { companyToSlug, companyToSeed } from './slug';
import { renderKit } from './render';

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

async function main(): Promise<void> {
  const slug = companyToSlug(opts.company);
  const seed = companyToSeed(opts.company, Number(opts.seedVariant));

  console.log(`[1/7] Scraping ${opts.url}...`);
  const scraped = await scrapeProspect(opts.url);
  const locale = opts.locale === 'auto' ? (scraped.detectedLocale.startsWith('es') ? 'es' : 'en') : (opts.locale as 'es' | 'en');

  console.log('[2/7] Generating grounded content...');
  const generated = await generateContent(scraped.pages, { locale, company: opts.company });

  console.log('[3/7] Applying grounding gate...');
  const queries = applyGroundingGate(
    generated.queries.map((r) => ({ item: r.item, confidence: r.confidence })),
    { minSurvivors: 8 },
  ).map((q, i) => ({ ...q, confidence: generated.queries[i]!.confidence }));
  const catalogNames = applyGroundingGate(
    generated.categories.map((r) => ({ item: r.item, confidence: r.confidence })),
    { minSurvivors: 5 },
  );

  console.log('[4/7] Deriving palette...');
  const palette = deriveGraphPalette(scraped.brandColorHex);
  if (palette.usedFallback) console.warn(`  ⚠ brand color ${scraped.brandColorHex} needed the fallback hue — consider reviewing manually.`);

  console.log('[5/7] Assembling BrandKit...');
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

  console.log('[6/7] Writing BrandKit and downloading logo...');
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

  console.log(`[7/7] Rendering demo video against ${opts.baseUrl} (replays a full ~20s animation loop; usually finishes in under a minute. If it's taking much longer, GPU acceleration may have failed to engage in headless Chromium)...`);
  mkdirSync('dist-demos', { recursive: true });
  const outPath = `dist-demos/${slug}.mp4`;
  await renderKit({ baseUrl: opts.baseUrl, slug, outPath });

  console.log(`\nDemo video written: ${outPath}`);
  console.log(`Draft kit written: public/kits/${slug}.json`);
  console.log('Deploy steps are added in a later task of this plan.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
