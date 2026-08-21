/* The casino's sound: everything synthesized on a WebAudio context, no
 * assets. Layered and punchy the way a real machine sounds — a mechanical
 * reel whir while it spins, a chunky stop on each reel, coin cascades on a
 * win and a full fanfare on the big one. Still mute-safe and never harsh:
 * the whole bus runs through a soft limiter so stacked tones don't clip. */

let _ctx: AudioContext | null = null;
let _bus: GainNode | null = null;          // master bus -> limiter -> out
let _muted = false;
try { _muted = localStorage.getItem("l777_muted") === "1"; } catch { /* ok */ }

function ctx(): AudioContext | null {
  try {
    if (!_ctx) _ctx = new (window.AudioContext
      || (window as any).webkitAudioContext)();
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  } catch { return null; }
}

/** master bus: everything routes through here, then a gentle compressor so a
 *  fat stack of oscillators (a big win) rounds off instead of clipping. */
function bus(): GainNode | null {
  const c = ctx();
  if (!c) return null;
  if (!_bus) {
    _bus = c.createGain();
    _bus.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 30;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    _bus.connect(comp).connect(c.destination);
  }
  return _bus;
}

function tone(freq: number, dur: number, vol = 0.08,
              type: OscillatorType = "sine", glideTo?: number, when = 0) {
  if (_muted) return;
  const c = ctx();
  const b = bus();
  if (!c || !b) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(b);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBuffer(c: BaseAudioContext, dur: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)),
                             c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(dur: number, vol = 0.06, when = 0, low = false) {
  if (_muted) return;
  const c = ctx();
  const b = bus();
  if (!c || !b) return;
  const t0 = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = low ? "lowpass" : "highpass";
  f.frequency.value = low ? 400 : 2500;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(b);
  src.start(t0);
}

/** a spread of bright metallic chinks — coins hitting the tray. Count and
 *  spacing scale with the size of the win. */
function coinburst(n = 6, when = 0) {
  if (_muted) return;
  const k = Math.min(22, Math.max(3, Math.round(n)));
  for (let i = 0; i < k; i++) {
    const w = when + i * 0.05 + (i % 3 === 0 ? 0.015 : 0);
    tone(1650 + ((i * 131) % 780), 0.05, 0.05, "triangle", undefined, w);
    tone(2450 + ((i * 173) % 650), 0.04, 0.03, "sine", undefined, w + 0.018);
  }
}

// ---- the reel whir: a managed loop that runs for the length of a spin -------
let _whir: { gain: GainNode; nodes: AudioScheduledSourceNode[]; timer: number } | null = null;

function stopWhir(instant = false) {
  const s = _whir;
  _whir = null;
  if (!s) return;
  try { window.clearTimeout(s.timer); } catch { /* ok */ }
  const c = _ctx;
  if (!c) return;
  const t = c.currentTime;
  const tail = instant ? 0.03 : 0.14;
  try {
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(Math.max(0.0001, s.gain.gain.value), t);
    s.gain.gain.exponentialRampToValueAtTime(0.0001, t + tail);
  } catch { /* ok */ }
  s.nodes.forEach((n) => { try { n.stop(t + tail + 0.02); } catch { /* ok */ } });
}

function startWhir(maxMs = 3000) {
  if (_muted) return;
  const c = ctx();
  const b = bus();
  if (!c || !b) return;
  stopWhir(true);
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.09);
  // the mechanical body of the whir: looping noise pushed through a bandpass
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.5);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 680;
  bp.Q.value = 0.9;
  src.connect(bp).connect(g);
  // a low rotating hum under it so it has weight, not just hiss
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 61;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  const og = c.createGain();
  og.gain.value = 0.5;
  osc.connect(lp).connect(og).connect(g);
  g.connect(b);
  src.start(t);
  osc.start(t);
  const timer = window.setTimeout(() => stopWhir(), maxMs);
  _whir = { gain: g, nodes: [src, osc], timer };
}

export const sfx = {
  isMuted: () => _muted,
  toggle(): boolean {
    _muted = !_muted;
    try { localStorage.setItem("l777_muted", _muted ? "1" : "0"); } catch { /* ok */ }
    if (_muted) stopWhir(true);
    return _muted;
  },
  /** a reel or counter tick */
  tick() { tone(1500, 0.03, 0.03, "square"); },
  /** the reels starting up: a rising whoosh, then the whir loop takes over */
  spin() {
    tone(140, 0.3, 0.05, "sawtooth", 440);
    startWhir();
  },
  /** the reels have all landed — cut the whir cleanly */
  reelsStop() { stopWhir(); },
  /** one reel slamming home: a chunky mechanical ka-chunk */
  land() {
    tone(200, 0.09, 0.10, "sine", 78);       // the body of the thunk
    tone(430, 0.045, 0.05, "square", 300, 0.004);  // the latch click
    noise(0.03, 0.05);                        // a little mechanical grit
  },
  /** the last reel sweating on a bonus: a rising tension riser */
  riser() {
    tone(260, 1.2, 0.05, "sawtooth", 1650);
    tone(140, 1.2, 0.045, "sine", 780);
    [0, 0.16, 0.30, 0.42, 0.52, 0.60, 0.67, 0.73, 0.78].forEach((w, i) =>
      tone(1450 + i * 120, 0.03, 0.032, "square", undefined, w));
  },
  /** a card leaving the shoe */
  deal() { noise(0.05, 0.05); },
  /** a chip or coin landing */
  chip() { tone(1800, 0.06, 0.05); tone(2400, 0.05, 0.04, "sine", undefined, 0.04); },
  /** the win chime: a bass thump, a bright arpeggio and a few coins */
  win() {
    tone(120, 0.18, 0.07, "sine", 92);
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.15, 0.06, "triangle", undefined, i * 0.06));
    coinburst(6, 0.12);
  },
  /** the big one: deep hit, rising run up the scale, a storm of coins */
  bigwin() {
    tone(88, 0.42, 0.11, "sine", 54);
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
      tone(f, 0.24, 0.07, "triangle", undefined, i * 0.08));
    tone(2600, 0.5, 0.03, "sine", 3300, 0.1);
    coinburst(18, 0.18);
  },
  /** a coin cascade sized to the payout — the bigger the win, the longer */
  coins(n = 6, when = 0) { coinburst(n, when); },
  /** the house takes it: a soft slide down */
  lose() { tone(300, 0.22, 0.045, "sine", 150); },
  /** cashing out: two bright coins */
  cashout() { tone(988, 0.1, 0.07, "triangle"); tone(1319, 0.16, 0.07, "triangle", undefined, 0.09); },
  /** the mine going off */
  boom() { noise(0.35, 0.12, 0, true); tone(90, 0.3, 0.12, "sine", 40); },
  /** the ball rattling a peg */
  peg() { tone(2100 + Math.random() * 500, 0.025, 0.025, "square"); },
};
