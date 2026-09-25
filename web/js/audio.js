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
