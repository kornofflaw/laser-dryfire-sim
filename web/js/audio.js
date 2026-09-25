// audio.js — every sound is generated in code (no audio files, by design).
import { CONFIG } from './config.js';

let ctx = null;

// Remote control (remote.js): a display window nobody has tapped can't start
// audio on a tablet, so while this window's audio isn't running, sounds are
// forwarded to the controller window, which plays them (same speakers/HDMI).
let forwarder = null;
export function setAudioForwarder(fn) { forwarder = fn; }
const forwarded = (name, args) => {
  if (!forwarder || (ctx && ctx.state === 'running')) return false;
  forwarder(name, [...args]);
  return true;
};

// Browsers only allow audio after a user gesture; main.js calls this on the
// first click / key press.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, seconds, gain, decay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const peak = gain * CONFIG.sound.volume;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.002);
  if (decay > 0) {
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  } else {
    g.gain.setValueAtTime(peak, t0 + seconds - 0.003);
    g.gain.linearRampToValueAtTime(0, t0 + seconds);
  }
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.01);
}

export function startBeep() {
  if (forwarded('startBeep', arguments)) return;
  tone(CONFIG.sound.startBeepHz, CONFIG.sound.beepSeconds, 1.0);
}

export function parBeep() {
  if (forwarded('parBeep', arguments)) return;
  tone(CONFIG.sound.parBeepHz, CONFIG.sound.beepSeconds, 1.0);
}

export function hitDing() {
  if (forwarded('hitDing', arguments)) return;
  tone(CONFIG.sound.hitHz, 0.18, 0.6, 1);
}

// Short burst of decaying noise: a percussive "pop" for every shot.
export function shotPop() {
  if (forwarded('shotPop', arguments)) return;
  if (!ctx) return;
  const dur = 0.09;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 45) * 0.8;
  }
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = CONFIG.sound.volume;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// Steel "ping": a few inharmonic partials with long, uneven decays, which is
// what makes struck plate steel sound metallic rather than like a beep.
export function steelPing() {
  if (forwarded('steelPing', arguments)) return;
  if (!ctx) return;
  const base = CONFIG.sound.steelHz * (0.96 + Math.random() * 0.08);
  const partials = [[1, 1.0, 0.9], [2.76, 0.5, 0.6], [5.4, 0.3, 0.35], [8.9, 0.15, 0.2]];
  const t0 = ctx.currentTime;
  for (const [ratio, amp, decay] of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = base * ratio;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp * 0.5 * CONFIG.sound.volume, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + decay + 0.02);
  }
}

// Low buzz for a penalty (no-shoot hit, wrong dot).
export function penaltyBuzz() {
  if (forwarded('penaltyBuzz', arguments)) return;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 140;
  g.gain.setValueAtTime(0.25 * CONFIG.sound.volume, t0);
  g.gain.setValueAtTime(0.25 * CONFIG.sound.volume, t0 + 0.28);
  g.gain.linearRampToValueAtTime(0, t0 + 0.32);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.34);
}

// Mechanical "clack" of a pop-up target lifter.
export function clack() {
  if (forwarded('clack', arguments)) return;
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    d[i] = ((Math.random() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 180 * t)) * Math.exp(-t * 70) * 0.5;
  }
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = CONFIG.sound.volume;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// A running footstep on asphalt; loudness 0..1 (closer = louder).
export function footstep(loudness) {
  if (forwarded('footstep', arguments)) return;
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    d[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 90 * t)) * Math.exp(-t * 45);
  }
  const src = ctx.createBufferSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.value = Math.min(1, Math.max(0.05, loudness)) * CONFIG.sound.volume;
  src.buffer = buf;
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start();
}

// Spoken call-out (browser speech synthesis; no audio files). Silent if the
// browser has no voices.
// opts: { rate, pitch, volume } (e.g. a weak, slow voice for a wounded man).
// opts.polite: don't interrupt speech already playing (skip this line instead).
export function say(text, opts = {}) {
  if (forwarded('say', arguments)) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (opts.polite && synth.speaking) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = opts.rate ?? 1.15;
    u.pitch = opts.pitch ?? 1;
    u.volume = CONFIG.sound.volume * (opts.volume ?? 1);
    synth.speak(u);
  } catch { /* no speech available */ }
}

// Stop any speech (a run was cancelled mid-sentence).
export function hush() {
  if (forwarded('hush', arguments)) return;
  try { window.speechSynthesis?.cancel(); } catch { /* no speech available */ }
}

// Radio squelch: a short burst of band-limited static.
export function radioStatic() {
  if (forwarded('radioStatic', arguments)) return;
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (i < n * 0.1 ? i / (n * 0.1) : 1) * 0.6;
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = 0.5 * CONFIG.sound.volume;
  src.buffer = buf;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start();
}

// A suspect's gunshot: louder and heavier than your own shot's pop.
export function enemyShot() {
  if (forwarded('enemyShot', arguments)) return;
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    d[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 18) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 12) * 0.8);
  }
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = Math.min(1, CONFIG.sound.volume * 1.4);
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// Glass shattering: a bright crack, then a tinkling tail of falling shards.
export function glassBreak() {
  if (forwarded('glassBreak', arguments)) return;
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * 0.9);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    const crack = (Math.random() * 2 - 1) * Math.exp(-t * 40);
    const tinkle = Math.random() < 0.004 * Math.exp(-t * 3) ? (Math.random() * 2 - 1) * 0.8 : 0;
    d[i] = crack + tinkle + (i > 0 ? d[i - 1] * 0.3 * Math.exp(-t * 6) : 0);
  }
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.value = 0.7 * CONFIG.sound.volume;
  src.buffer = buf;
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start();
}

// A round striking body armour: a dull, heavy smack.
export function armorThud() {
  if (forwarded('armorThud', arguments)) return;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
  g.gain.setValueAtTime(0.6 * CONFIG.sound.volume, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + 0.2);
}
