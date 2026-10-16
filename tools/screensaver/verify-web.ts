import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { findDenied } from '../../src/screensaver/denylist';

const ROOT = 'dist-screensaver/web';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const requested = new URL(req.url ?? '/', 'http://x').pathname;
  const path = requested === '/' ? '/index.html' : requested;
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = (server.address() as { port: number }).port;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (['.html', '.js', '.css'].includes(extname(p))) out.push(p);
  }
  return out;
}

function fail(msg: string): never {
  console.error(`verify:screensaver FAILED: ${msg}`);
  process.exit(1);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const labelsBySeed: string[] = [];
for (const seed of [1, 2, 3]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/?seed=${seed}&density=1`);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(2500);
  if (errors.length) fail(`seed ${seed} console errors: ${errors.join(' | ')}`);
  const text = await page.evaluate(() => document.body.innerText);
  const hits = findDenied(text);
  if (hits.length) fail(`seed ${seed} DOM contains denied strings: ${hits.join(', ')}`);
  labelsBySeed.push(text);
  const shown = await page.evaluate(() => getComputedStyle(document.getElementById('search')!).display);
  if (shown !== 'none') fail('search box is visible');
  const logoOk = await page.evaluate(() => { const i = document.querySelector<HTMLImageElement>('.logo'); return !!i && i.naturalWidth > 0 && getComputedStyle(i).display !== 'none'; });
  if (!logoOk) fail(`seed ${seed}: ReshapeX logo is not visible`);
  await page.close();
}
if (new Set(labelsBySeed).size < 3) fail('seeds 1-3 produced identical page text');

const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('pre', { timeout: 15000 });
const msg = await page.innerText('pre');
if (!msg.includes('missing or invalid seed')) fail(`no-seed page did not show the seed error, got: ${msg}`);
await browser.close();
server.close();

for (const file of await walk(ROOT)) {
  const hits = findDenied(await readFile(file, 'utf8'));
  if (hits.length) fail(`${file} contains denied strings: ${hits.join(', ')}`);
}
console.log('verify:screensaver OK');
