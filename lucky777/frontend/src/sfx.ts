/* The casino's sound: everything synthesized on a WebAudio context, no
 * assets. Quiet by design — clicks and chimes, not noise. */

let _ctx: AudioContext | null = null;
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

function tone(freq: number, dur: number, vol = 0.08,
              type: OscillatorType = "sine", glideTo?: number, when = 0) {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.06, when = 0, low = false) {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = low ? "lowpass" : "highpass";
  f.frequency.value = low ? 400 : 2500;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  isMuted: () => _muted,
  toggle(): boolean {
    _muted = !_muted;
    try { localStorage.setItem("l777_muted", _muted ? "1" : "0"); } catch { /* ok */ }
    return _muted;
  },
  /** a reel or counter tick */
  tick() { tone(1500, 0.03, 0.03, "square"); },
  /** the reels starting up: a rising whirr */
  spin() { tone(150, 0.35, 0.05, "sawtooth", 420); },
  /** one reel slamming home */
  land() { tone(180, 0.09, 0.09, "sine", 90); noise(0.04, 0.03); },
  /** a card leaving the shoe */
  deal() { noise(0.05, 0.05); },
  /** a chip or coin landing */
  chip() { tone(1800, 0.06, 0.05); tone(2400, 0.05, 0.04, "sine", undefined, 0.04); },
  /** the win chime: a quick major arpeggio */
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 0.07, "triangle", undefined, i * 0.07)); },
  /** the big one */
  bigwin() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, 0.08, "triangle", undefined, i * 0.09)); },
  /** the house takes it: a soft slide down */
  lose() { tone(300, 0.22, 0.045, "sine", 150); },
  /** cashing out: two bright coins */
  cashout() { tone(988, 0.1, 0.07, "triangle"); tone(1319, 0.16, 0.07, "triangle", undefined, 0.09); },
  /** the mine going off */
  boom() { noise(0.35, 0.12, 0, true); tone(90, 0.3, 0.12, "sine", 40); },
  /** the ball rattling a peg */
  peg() { tone(2100 + Math.random() * 500, 0.025, 0.025, "square"); },
};
