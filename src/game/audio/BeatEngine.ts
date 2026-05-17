// WebAudio-based beat engine. Plays a procedural kick + hi-hat pattern at a
// given BPM and fires a "beat" callback per quarter-note so visuals can sync.
//
// No audio files needed. The synth voice is tiny so this stays cheap even on
// low-end mobile.

type BeatListener = (beatIndex: number) => void;

export class BeatEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bpm: number;
  private running = false;
  private beatIndex = 0;
  private nextBeatTime = 0;
  private intervalId: number | null = null;
  private listeners: BeatListener[] = [];
  private muted = false;

  // Scheduler look-ahead. We schedule audio events 0.15s in advance and run
  // the scheduler every 25ms so the timing stays tight even if the JS thread
  // hiccups briefly.
  private readonly LOOK_AHEAD = 0.15;
  private readonly TICK_MS = 25;

  // Cached noise buffers — recreating these on every beat caused ~2-3 ms
  // GC stutter per second. Created once at start().
  private hatNoise: AudioBuffer | null = null;
  private snareNoise: AudioBuffer | null = null;

  constructor(bpm = 130) {
    this.bpm = bpm;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        m ? 0 : 0.35,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  isMuted() {
    return this.muted;
  }

  onBeat(fn: BeatListener) {
    this.listeners.push(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.beatIndex = 0;

    try {
      const Ctor =
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext ?? window.AudioContext;
      this.ctx = new Ctor();
    } catch {
      // No audio context — degrade to silent ticker so visuals still sync.
      this.ctx = null;
    }

    if (this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.35;
      this.masterGain.connect(this.ctx.destination);
      this.nextBeatTime = this.ctx.currentTime + 0.05;
      this.buildNoiseBuffers();
    }

    this.intervalId = window.setInterval(() => this.scheduler(), this.TICK_MS);
  }

  stop() {
    this.running = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    try {
      this.ctx?.close();
    } catch {
      // Ignore — some Safari versions throw on close.
    }
    this.ctx = null;
    this.masterGain = null;
  }

  private scheduler() {
    if (!this.running) return;
    const beatDur = 60 / this.bpm;

    if (this.ctx && this.masterGain) {
      while (this.nextBeatTime < this.ctx.currentTime + this.LOOK_AHEAD) {
        this.scheduleVoice(this.nextBeatTime, this.beatIndex);
        this.fireListeners(this.beatIndex);
        this.beatIndex++;
        this.nextBeatTime += beatDur;
      }
    } else {
      // Headless fallback — beat at performance.now() granularity.
      // (Not super-precise; only used if WebAudio failed to init.)
      this.fireListeners(this.beatIndex);
      this.beatIndex++;
    }
  }

  private fireListeners(index: number) {
    for (const fn of this.listeners) {
      try {
        fn(index);
      } catch (e) {
        console.error("Beat listener error:", e);
      }
    }
  }

  // ─── Voices ─────────────────────────────────────────────────────────────

  private scheduleVoice(when: number, beatIndex: number) {
    if (!this.ctx || !this.masterGain) return;
    const beatInBar = beatIndex % 4;
    // Kick on 1 and 3, hat on every beat, snare-ish on 2 and 4.
    this.hat(when, beatInBar % 2 === 1 ? 0.4 : 0.25);
    if (beatInBar === 0 || beatInBar === 2) {
      this.kick(when);
    }
    if (beatInBar === 1 || beatInBar === 3) {
      this.snare(when);
    }
  }

  private buildNoiseBuffers() {
    if (!this.ctx) return;
    const hatSize = Math.floor(this.ctx.sampleRate * 0.05);
    this.hatNoise = this.ctx.createBuffer(1, hatSize, this.ctx.sampleRate);
    const hd = this.hatNoise.getChannelData(0);
    for (let i = 0; i < hatSize; i++) hd[i] = (Math.random() * 2 - 1) * 0.7;

    const snareSize = Math.floor(this.ctx.sampleRate * 0.15);
    this.snareNoise = this.ctx.createBuffer(
      1,
      snareSize,
      this.ctx.sampleRate
    );
    const sd = this.snareNoise.getChannelData(0);
    for (let i = 0; i < snareSize; i++) sd[i] = (Math.random() * 2 - 1) * 0.7;
  }

  private kick(when: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(48, when + 0.18);
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.exponentialRampToValueAtTime(1.0, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
    osc.connect(gain).connect(this.masterGain);
    osc.start(when);
    osc.stop(when + 0.3);
  }

  private hat(when: number, velocity: number) {
    if (!this.ctx || !this.masterGain || !this.hatNoise) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.hatNoise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.exponentialRampToValueAtTime(velocity, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    noise.connect(hp).connect(gain).connect(this.masterGain);
    noise.start(when);
    noise.stop(when + 0.08);
  }

  private snare(when: number) {
    if (!this.ctx || !this.masterGain || !this.snareNoise) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.snareNoise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.exponentialRampToValueAtTime(0.55, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
    noise.connect(bp).connect(gain).connect(this.masterGain);
    noise.start(when);
    noise.stop(when + 0.2);
  }
}
