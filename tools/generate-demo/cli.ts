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
