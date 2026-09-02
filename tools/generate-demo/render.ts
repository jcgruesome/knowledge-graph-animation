import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Drives a headless Chromium instance to load the generated kit, record one full animation
 * loop via `window.kg.exportLoop()` (Task 9), and transcode the resulting WebM to an MP4 at
 * `outPath`.
 *
 * The Task 10 spike found `canvas.captureStream` + `MediaRecorder` work headlessly with no
 * extra flags, but the *recording itself* is real-time-paced: it records exactly as many
 * wall-clock seconds as the browser takes to render one animation loop, not a fixed 20s.
 * Default headless Chromium on this machine falls back to software WebGL (swiftshader) at
 * ~3fps, which stretched a 20s loop into an 8+ minute video. These GPU launch args (verified
 * against a live `pnpm dev` server) get headless Chromium onto real GPU-accelerated WebGL
 * (~53fps here, vs. ~72fps headed) so the recording runs close to real time.
 */
const GPU_LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

export async function renderKit(opts: { baseUrl: string; slug: string; outPath: string }): Promise<void> {
  // Fail fast on a missing ffmpeg before paying for the ~20-25s browser recording: this check
  // is milliseconds, the recording is not.
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(`renderKit: ffmpeg is not available on PATH (required to transcode WebM to MP4). ${(err as Error).message}`);
  }

  const browser = await chromium.launch({ args: GPU_LAUNCH_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${opts.baseUrl}/?kit=${opts.slug}`);
    await page.waitForSelector('.hud.visible', { timeout: 15_000 });

    // Encoded in-browser via FileReader (not Node's Buffer, which doesn't exist in this
    // page.evaluate context) and decoded back to bytes on the Node side below.
    const base64 = await page.evaluate(async () => {
      const blob: Blob = await (window as any).kg.exportLoop();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // Can't split on the first comma: MediaRecorder's mimeType (e.g.
          // "video/webm;codecs=vp9,opus") itself contains a comma before the real
          // "base64," separator, so search for that literal marker instead.
          const dataUrl = reader.result as string;
          const marker = 'base64,';
          const idx = dataUrl.indexOf(marker);
          if (idx === -1) {
            reject(new Error(`exported blob did not produce a base64 data URL: ${dataUrl.slice(0, 64)}...`));
            return;
          }
          resolve(dataUrl.slice(idx + marker.length));
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed to read exported blob'));
        reader.readAsDataURL(blob);
      });
    });

    const webmPath = opts.outPath.replace(/\.mp4$/, '.webm');
    writeFileSync(webmPath, Buffer.from(base64, 'base64'));

    try {
      execFileSync('ffmpeg', ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', opts.outPath], {
        stdio: 'pipe',
      });
    } catch (err) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
      throw new Error(`renderKit: ffmpeg transcode of ${webmPath} to ${opts.outPath} failed.\n${stderr}`);
    }
  } finally {
    await browser.close();
  }
}
