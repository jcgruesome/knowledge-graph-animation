import type { Graph } from './graph';
import type { Schedule } from './schedule';
import { ANSWER, LAND, LOOP } from './schedule';

interface Cue {
  t: number;
  fire: (ctx: AudioContext, at: number) => void;
}

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];
const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Synthesized sound design, quantized to the choreography. Everything is a pure function of
 * loop time so it lands exactly on the visuals: whoosh into a chime at landing, plucks as
 * spokes arrive, granular ticks as flowers bloom, a pad that swells into convergence, one
 * clean bell for the answer, then silence into the recede.
 */
export class SoundDesign {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private noise: AudioBuffer | null = null;
  private cues: Cue[] = [];
  private prevT = -1;
  muted = false;

  constructor(
    private readonly graph: Graph,
    private readonly schedule: Schedule,
  ) {}

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get stream(): MediaStream | null {
    return this.dest?.stream ?? null;
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination();
    comp.connect(this.dest);
    this.noise = this.makeNoise(ctx);
    this.roomTone(ctx);
    this.buildCues();
    void ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  /** Fire every cue whose time falls in (prevT, t], handling the loop wrap. */
  update(t: number): void {
    if (!this.ctx) return;
    const prev = this.prevT;
    this.prevT = t;
    if (prev < 0) return;
    const now = this.ctx.currentTime + 0.02;
    const inRange = (c: number): boolean => (t >= prev ? c > prev && c <= t : c > prev || c <= t);
    for (const cue of this.cues) if (inRange(cue.t)) cue.fire(this.ctx, now);
  }

  resetClock(): void {
    this.prevT = -1;
  }

  // ------------------------------------------------------------------ cues
  private buildCues(): void {
    const cues: Cue[] = [];
    const g = this.graph;
    const s = this.schedule;

    cues.push({ t: LAND - 2.0, fire: (ctx, at) => this.whoosh(ctx, at, 2.0, 400, 2600, 0.5) });
    cues.push({ t: LAND, fire: (ctx, at) => { this.chime(ctx, at, midi(76), 2.4, 0.5); this.thump(ctx, at, 0.6); } });

    // Spokes: a pluck per hub arrival, pitch by hub index across a pentatonic ladder.
    const hubs = g.nodes.filter((nd) => nd.kind === 1 && Number.isFinite(s.nodeStart[nd.id]!));
    hubs.forEach((nd, i) => {
      const t = s.nodeStart[nd.id]!;
      const hero = t < 6.8;
      const note = 64 + PENTATONIC[i % PENTATONIC.length]! + (nd.cluster === 1 ? -5 : 0);
      cues.push({ t, fire: (ctx, at) => this.pluck(ctx, at, midi(note), hero ? 0.22 : 0.07) });
    });
    // Flowers: granular ticks, a sparse sample of leaves.
    const leaves = g.nodes.filter((nd) => nd.kind === 0 && Number.isFinite(s.nodeStart[nd.id]!));
    const stride = Math.max(1, Math.round(leaves.length / 260));
    leaves
      .filter((_, i) => i % stride === 0)
      .forEach((nd) => {
        const t = s.nodeStart[nd.id]!;
        cues.push({ t, fire: (ctx, at) => this.tick(ctx, at, 1800 + nd.rank * 2600, 0.035) });
      });
    // Bridges.
    for (const sig of s.signals.filter((x) => g.edges[x.edge]!.hero && x.t0 < 10)) {
      cues.push({ t: sig.t0, fire: (ctx, at) => this.whoosh(ctx, at, sig.dur, 300, 1800, 0.22) });
    }
    // Convergence pad, released by the answer.
    cues.push({ t: 13.4, fire: (ctx, at) => this.pad(ctx, at, ANSWER - 13.4) });
    cues.push({ t: 13.4, fire: (ctx, at) => this.thump(ctx, at, 0.35) });
    cues.push({ t: 15.0, fire: (ctx, at) => this.thump(ctx, at, 0.35) });
    cues.push({ t: ANSWER, fire: (ctx, at) => { this.bell(ctx, at); this.thump(ctx, at, 0.8); } });
    cues.push({ t: ANSWER - 0.02, fire: (ctx, at) => this.whoosh(ctx, at, 1.8, 2400, 500, 0.3) });

    this.cues = cues.sort((a, b) => a.t - b.t);
  }

  // ------------------------------------------------------------------ voices
  private out(ctx: AudioContext): AudioNode {
    if (!this.master) throw new Error('audio not unlocked');
    void ctx;
    return this.master;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish
      d[i] = last * 3.5;
    }
    return buf;
  }

  private roomTone(ctx: AudioContext): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.out(ctx));
    src.start();
    const sub = ctx.createOscillator();
    sub.frequency.value = 55;
    const sg = ctx.createGain();
    sg.gain.value = 0.018;
    sub.connect(sg).connect(this.out(ctx));
    sub.start();
  }

  private env(ctx: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.out(ctx));
    return g;
  }

  private whoosh(ctx: AudioContext, at: number, dur: number, f0: number, f1: number, gain: number): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, at);
    bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = this.env(ctx, at, gain, dur * 0.7, dur * 0.35);
    src.connect(bp).connect(g);
    src.start(at);
    src.stop(at + dur + 0.5);
  }

  private pluck(ctx: AudioContext, at: number, freq: number, gain: number): void {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 6, at);
    lp.frequency.exponentialRampToValueAtTime(freq * 1.5, at + 0.4);
    const g = this.env(ctx, at, gain, 0.005, 0.6);
    o.connect(lp).connect(g);
    o.start(at);
    o.stop(at + 0.8);
  }

  private tick(ctx: AudioContext, at: number, freq: number, gain: number): void {
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.value = freq;
    const g = this.env(ctx, at, gain, 0.002, 0.06);
    src.connect(bp).connect(g);
    src.start(at);
    src.stop(at + 0.1);
  }

  private chime(ctx: AudioContext, at: number, freq: number, decay: number, gain: number): void {
    [1, 2.01, 3.0, 4.2].forEach((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const g = this.env(ctx, at, gain / (i + 1) / 2, 0.01, decay / (i * 0.6 + 1));
      o.connect(g);
      o.start(at);
      o.stop(at + decay + 0.2);
    });
  }

  private bell(ctx: AudioContext, at: number): void {
    this.chime(ctx, at, midi(83), 3.6, 0.55);
    this.chime(ctx, at + 0.02, midi(71), 3.0, 0.3);
  }

  private thump(ctx: AudioContext, at: number, gain: number): void {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.35);
    const g = this.env(ctx, at, gain * 0.6, 0.005, 0.5);
    o.connect(g);
    o.start(at);
    o.stop(at + 0.7);
  }

  private pad(ctx: AudioContext, at: number, swell: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + swell);
    g.gain.exponentialRampToValueAtTime(0.0001, at + swell + 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, at);
    lp.frequency.exponentialRampToValueAtTime(1800, at + swell);
    lp.frequency.exponentialRampToValueAtTime(200, at + swell + 1.6);
    lp.connect(g).connect(this.out(ctx));
    [midi(47), midi(54), midi(59), midi(47) * 1.005, midi(66)].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.2;
      o.connect(og).connect(lp);
      o.start(at);
      o.stop(at + swell + 2);
    });
  }
}

export { LOOP };
