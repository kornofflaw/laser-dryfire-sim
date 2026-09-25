// audio.js — every sound is generated in code (no audio files, by design).
import { CONFIG } from './config.js';

let ctx = null;

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
  tone(CONFIG.sound.startBeepHz, CONFIG.sound.beepSeconds, 1.0);
}

export function parBeep() {
  tone(CONFIG.sound.parBeepHz, CONFIG.sound.beepSeconds, 1.0);
}

export function hitDing() {
  tone(CONFIG.sound.hitHz, 0.18, 0.6, 1);
}

// Short burst of decaying noise: a percussive "pop" for every shot.
export function shotPop() {
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
export function say(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.15;
    u.volume = CONFIG.sound.volume;
    synth.speak(u);
  } catch { /* no speech available */ }
}

// Radio squelch: a short burst of band-limited static.
export function radioStatic() {
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
