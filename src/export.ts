import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { EffectComposer } from 'postprocessing';
import { LOOP } from './schedule';

export const EXPORT_W = 1920;
export const EXPORT_H = 1080;
const FPS = 60;

export interface ExporterHooks {
  /** advance the simulation by dt and render one frame */
  step: (dt: number) => void;
  /** draw HUD (labels, log, marks) onto the composite canvas */
  drawOverlay: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** reset the loop clock to 0 and clear transient interactions */
  begin: () => void;
  onStatus: (text: string) => void;
  /** optional audio to mux into the recording */
  audioStream?: () => MediaStream | null;
}

/**
 * Records exactly one loop (20 s at 60 fps, 1920x1080) to a WebM file. The WebGL frame and
 * the HUD are composited onto an offscreen canvas because MediaRecorder cannot see DOM.
 */
export class LoopExporter {
  active = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly composer: EffectComposer,
    private readonly camera: PerspectiveCamera,
    private readonly glCanvas: HTMLCanvasElement,
    private readonly hooks: ExporterHooks,
  ) {}

  start(): void {
    if (this.active) return;
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not available in this browser');
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('No supported WebM encoder');

    this.active = true;
    const prevRatio = this.renderer.getPixelRatio();
    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(EXPORT_W, EXPORT_H, false);
    this.composer.setSize(EXPORT_W, EXPORT_H);
    this.camera.aspect = EXPORT_W / EXPORT_H;
    this.camera.updateProjectionMatrix();

    const compose = document.createElement('canvas');
    compose.width = EXPORT_W;
    compose.height = EXPORT_H;
    const ctx = compose.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for export compositing');

    const stream = compose.captureStream(FPS);
    const audio = this.hooks.audioStream?.();
    if (audio) for (const track of audio.getAudioTracks()) stream.addTrack(track);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 28_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    const restore = (): void => {
      this.renderer.setPixelRatio(prevRatio);
      this.renderer.setSize(prevW, prevH);
      this.composer.setSize(prevW, prevH);
      this.camera.aspect = prevW / prevH;
      this.camera.updateProjectionMatrix();
      this.active = false;
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quick-consult-loop.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      restore();
      this.hooks.onStatus(`exported ${(blob.size / 1e6).toFixed(1)} MB`);
      setTimeout(() => this.hooks.onStatus(''), 4000);
    };

    this.hooks.begin();
    recorder.start();
    const total = LOOP * FPS;
    let frames = 0;
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      if (now - last >= 1000 / FPS - 2) {
        last = now;
        this.hooks.step(1 / FPS);
        ctx.drawImage(this.glCanvas, 0, 0, EXPORT_W, EXPORT_H);
        this.hooks.drawOverlay(ctx, EXPORT_W, EXPORT_H);
        frames++;
        this.hooks.onStatus(`recording ${Math.round((frames / total) * 100)}%`);
      }
      if (frames < total) requestAnimationFrame(tick);
      else recorder.stop();
    };
    requestAnimationFrame(tick);
  }
}
