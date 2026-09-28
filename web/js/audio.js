// audio.js — every sound is generated in code (no audio files, by design).
import { CONFIG } from './config.js';

let ctx = null;

// Sound choices (Setup -> Sound choices), so Andrew can compare versions:
//   'rec' recorded only, 'synth' generated only, 'mix' recorded + generated.
// gunTake: which recorded pistol shot (-1 = random). A recording that hasn't
// loaded falls back to the generated sound.
const choice = { gun: 'rec', gunTake: -1, steel: 'rec', step: 'rec', glass: 'rec', distant: 'rec' }; // main.js sets the saved picks
export function setSoundChoices(c = {}) { Object.assign(choice, c); }
const useRec = k => choice[k] !== 'synth';
const useSynth = k => choice[k] !== 'rec';

// Volume sliders (Setup): gunshots and background, 1 = normal.
const mix = { gun: 1, amb: 1, earPro: 'none' };

// Every sound goes to `master`, then through the hearing protection you're
// wearing (Setup -> Sound, CONFIG.sound.earPro) to the speakers: electronic
// muffs clamp loud bangs and lift quiet sounds, passive muffs dull it all.
// (The RO's voice is the browser's speech and isn't affected.)
let master = null, earNodes = [];
const dest = () => master || ctx.destination;
function buildEarPro() {
  if (!ctx) return;
  if (!master) master = ctx.createGain();
  master.disconnect();
  earNodes.forEach(n => n.disconnect());
  earNodes = [];
  const E = CONFIG.sound.earPro[mix.earPro];
  if (!E) { master.connect(ctx.destination); return; }
  let node = master;
  const add = n => { node.connect(n); node = n; earNodes.push(n); };
  if (E.highpass) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = E.highpass; add(f); }
  if (E.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = E.lowpass; add(f); }
  if (E.clamp) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = E.clamp.threshold; c.knee.value = 0; c.ratio.value = 20;
    c.attack.value = E.clamp.attack; c.release.value = E.clamp.release;
    add(c);
  }
  const g = ctx.createGain();
  g.gain.value = E.gain;
  add(g);
  g.connect(ctx.destination);
}
export function setVolumes(v = {}) {
  if (typeof v.gun === 'number') mix.gun = v.gun;
  if (typeof v.amb === 'number') mix.amb = v.amb;
  if (typeof v.earPro === 'string' && v.earPro !== mix.earPro) { mix.earPro = v.earPro; buildEarPro(); }
  if (rain && ctx) rain.gain.gain.setTargetAtTime(CONFIG.sound.rain * CONFIG.sound.volume * mix.amb, ctx.currentTime, 0.05);
  if (alarm && ctx) alarm.gain.gain.setTargetAtTime(CONFIG.sound.alarm.level * CONFIG.sound.volume * mix.amb, ctx.currentTime, 0.05);
  if (amb && ctx) { // follow the slider now
    const g = amb.gain.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(CONFIG.sound.ambience.level * CONFIG.sound.volume * mix.amb, t + 0.1);
  }
}

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

// Browsers only allow audio after a user gesture; main.js calls this on every
// click / tap / key press.
// iPad / iPhone: (1) web audio is treated like ringer sounds and is muted by
// silent mode unless the page asks for 'playback' audio; (2) it only fully
// starts if a sound is played during the tap; (3) it can be left 'interrupted'
// after the screen locks or another app plays sound, so resume every time.
let primed = false;
export function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  if (!navigator.audioSession) keepPlaybackSession();
  primeSpeech();
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    buildEarPro();
  }
  loadSamples();
  const wasRunning = ctx.state === 'running';
  // Start the scene's background sound once audio is actually running.
  const startAmb = () => { if ((amb?.kind ?? null) !== ambWanted) setAmbience(ambWanted); };
  if (!wasRunning) ctx.resume().then(startAmb).catch(() => {});
  else startAmb();
  if (!primed || !wasRunning) { // until a tap has really started it
    primed = true;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); // one silent sample
    src.connect(ctx.destination);
    src.start(0);
  }
}

// Older iPadOS (before 17) has no audioSession setting. There, a playing
// <audio> element (media, like the speech voice) switches the page to playback
// audio, which silent mode doesn't mute, so loop a silent clip made here in
// code (a WAV header + silence) from the first tap on.
let silentLoop = null;
function keepPlaybackSession() {
  if (!/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return; // iOS / iPadOS only
  if (!silentLoop) {
    const rate = 8000, n = rate / 2; // half a second of 8-bit silence
    const b = new Uint8Array(44 + n);
    const v = new DataView(b.buffer);
    const str = (o, t) => [...t].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    b.fill(128, 44); // 8-bit silence is the midpoint
    silentLoop = document.createElement('audio');
    silentLoop.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    silentLoop.loop = true;
    silentLoop.setAttribute('playsinline', '');
    silentLoop.setAttribute('x-webkit-airplay', 'deny');
  }
  if (silentLoop.paused) silentLoop.play().catch(() => {});
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
  osc.connect(g).connect(dest());
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

// Your shot: the same gunshot as a suspect's, a little quieter.
// opts.indoor: with the room echo (office).
export function shotPop(opts = {}) {
  if (forwarded('shotPop', arguments)) return;
  enemyShot({ ...opts, level: CONFIG.sound.gunshot.yourShot });
}

// Steel "ping": a few inharmonic partials with long, uneven decays, which is
// what makes struck plate steel sound metallic rather than like a beep.
export function steelPing(size, where = {}) {
  if (forwarded('steelPing', arguments)) return;
  if (!ctx) return;
  // Size ratio to an 8" plate: bigger steel rings lower and longer.
  const SR = CONFIG.sound.steelRing;
  const r = Math.min(SR.range[1], Math.max(SR.range[0], (size || SR.ref) / SR.ref));
  // Far steel: the ring arrives late and quieter, from its side.
  const dist = where.dist || 0;
  const delay = dist / SR.speed, level = Math.pow(SR.near / Math.max(SR.near, dist), SR.falloff);
  const pan = Math.max(-1, Math.min(1, (where.pan || 0) * SR.pan));
  const clank = useRec('steel') && playSample('steel', CONFIG.sound.samples.steel * level, { rate: 1 / Math.sqrt(r), delay, pan });
  if (!useSynth('steel') && clank) return;
  const base = CONFIG.sound.steelHz / Math.pow(r, SR.pitch) * (0.96 + Math.random() * 0.08);
  const long = Math.pow(r, SR.decay);
  const partials = [[1, 1.0, 0.9], [2.76, 0.5, 0.6], [5.4, 0.3, 0.35], [8.9, 0.15, 0.2]];
  const t0 = ctx.currentTime + delay;
  let out = dest();
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    out = p;
  }
  for (const [ratio, amp, d] of partials) {
    const decay = d * long;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = base * ratio;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp * 0.5 * level * CONFIG.sound.volume, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g).connect(out);
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
  osc.connect(g).connect(dest());
  osc.start(t0);
  osc.stop(t0 + 0.34);
}

// Mechanical "clack" of a pop-up target lifter.
export function clack() {
  if (forwarded('clack', arguments)) return;
  if (!ctx) return;
  // A recorded heavy metal clunk (Kenney, CC0); generated if it didn't load.
  if (useRec('steel') && playSample('steel_fall', CONFIG.sound.samples.steelFall)) return;
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
  src.connect(g).connect(dest());
  src.start();
}

// A running footstep on asphalt; loudness 0..1 (closer = louder).
export function footstep(loudness) {
  if (forwarded('footstep', arguments)) return;
  if (!ctx) return;
  if (useRec('step') && playSample('step_concrete', Math.min(1, Math.max(0.05, loudness)) * CONFIG.sound.samples.step)) return;
  const n = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    // Heel strike (a thump tablet speakers can play) + shoe scuff on grit.
    const thump = Math.sin(2 * Math.PI * (170 - 60 * t / 0.08) * t) * Math.exp(-t * 55);
    const scuff = (Math.random() * 2 - 1) * Math.exp(-t * 30) * (t > 0.01 ? 0.7 : 0.3);
    d[i] = thump * 0.9 + scuff * 0.6;
  }
  const src = ctx.createBufferSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  const g = ctx.createGain();
  g.gain.value = Math.min(1, Math.max(0.05, loudness)) * CONFIG.sound.volume * 1.4;
  src.buffer = buf;
  src.connect(lp).connect(g).connect(dest());
  src.start();
}

// Spoken call-out (browser speech synthesis; no audio files). Silent if the
// browser has no voices.
// opts: { rate, pitch, volume } (e.g. a weak, slow voice for a wounded man).
// opts.polite: don't interrupt speech already playing (skip this line instead).
// Speech on iPad Safari is fragile: it only works after one utterance was
// started inside a tap/click/key press (primeSpeech, from unlockAudio), it
// drops a sentence queued straight after cancel(), it can be left paused, and
// an utterance that gets garbage-collected is never heard (keep a reference).
let lastUtterance = null;
export function say(text, opts = {}) {
  if (forwarded('say', arguments)) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (opts.polite && synth.speaking) return false;
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = opts.rate ?? 1.15;
    u.pitch = opts.pitch ?? 1;
    u.volume = Math.min(1, CONFIG.sound.volume * (opts.volume ?? 1));
    lastUtterance = u;
    const go = () => { if (synth.paused) synth.resume(); synth.speak(u); };
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(go, 60); // right after cancel() Safari can swallow it
    } else go();
    return true;
  } catch { /* no speech available */ }
}

let speechPrimed = false;
function primeSpeech() {
  if (speechPrimed) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    lastUtterance = u;
    synth.speak(u);
    speechPrimed = true;
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
  src.connect(bp).connect(g).connect(dest());
  src.start();
}

// A suspect's gunshot: louder and heavier than your own shot's pop.
// opts.indoor: add a room echo (office).
// opts.indoor: room echo; opts.outdoor: recorded outdoor echo; opts.level: loudness scale.
export function enemyShot(opts = {}) {
  if (forwarded('enemyShot', arguments)) return;
  if (!ctx) return;
  const G = CONFIG.sound.gunshot, t0 = ctx.currentTime;
  // Shared noise (made once).
  gunNoise ??= (() => {
    const n = Math.floor(ctx.sampleRate * 0.6);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  const out = ctx.createGain();
  out.gain.value = Math.min(2, CONFIG.sound.volume * G.level * (opts.level ?? 1)) * mix.gun;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
  comp.attack.value = 0.001; comp.release.value = 0.12;
  out.connect(comp).connect(dest());
  const synthShot = () => {
    const env = (node, peak, decay) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      node.connect(g).connect(out);
      return g;
    };
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = gunNoise; s.start(t0); s.stop(t0 + 0.6); return s; };
    // Crack: bright, very short.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1500;
    noise().connect(hp);
    env(hp, G.crack, 0.08);
    // Thump: low-passed noise, the body of the report.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(180, t0 + 0.2);
    noise().connect(lp);
    env(lp, G.thump, 0.3);
    // Boom: a falling low tone, saturated so small speakers carry it.
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(G.boomFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(G.boomTo, t0 + G.boomTime);
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(G.drive);
    osc.connect(shaper);
    env(shaper, G.boom, G.boomTime);
    osc.start(t0); osc.stop(t0 + G.boomTime + 0.05);
  };
  // The recorded pistol: under the generated shot outdoors ('mix'), or on
  // its own ('rec', indoors too, where the room echo is added below).
  const recorded = choice.gun === 'rec' || (choice.gun === 'mix' && opts.outdoor);
  const played = recorded && playSample('shot_near', choice.gun === 'rec' ? CONFIG.sound.samples.recordedShot : CONFIG.sound.samples.outdoorTail, { out, take: choice.gunTake });
  if (choice.gun !== 'rec' || !played) synthShot();
  if (opts.indoor) {
    const wet = ctx.createGain();
    wet.gain.value = CONFIG.sound.indoorEchoMix;
    out.connect(roomEcho()).connect(wet).connect(dest());
  }
}
let gunNoise = null;
let curves = {};
function driveCurve(k) {
  if (curves[k]) return curves[k];
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return (curves[k] = c);
}

// A hard-walled room: a convolver with a decaying noise impulse (made once).
let echo = null;
function roomEcho() {
  if (echo) return echo;
  const n = Math.floor(ctx.sampleRate * CONFIG.sound.indoorEcho);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  }
  echo = ctx.createConvolver();
  echo.buffer = ir;
  return echo;
}

// Glass shattering: a bright crack, then a tinkling tail of falling shards.
export function glassBreak() {
  if (forwarded('glassBreak', arguments)) return;
  if (!ctx) return;
  const hit = useRec('glass') && playSample('glass', CONFIG.sound.samples.glass);
  if (!useSynth('glass') && hit) return;
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
  src.connect(hp).connect(g).connect(dest());
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
  o.connect(g).connect(dest());
  o.start(t0);
  o.stop(t0 + 0.2);
}

// ---- Ambience (one bed at a time; generated noise, no files) ---------------------
// setAmbience('range' | 'office' | 'lot' | null). Fades between beds.
let amb = null; // { kind, gain, nodes, timer }
function noiseBuffer(seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function loopSource(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
function lfo(freq, depth, target, offset) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = depth;
  o.connect(g).connect(target); target.value = offset; o.start();
  return o;
}

let ambWanted = null; // started once audio is unlocked
// Not forwarded to the Controller: a bed there would keep playing after the
// Display gets its own audio. It starts here on the Display's first tap.
export function setAmbience(kind) {
  ambWanted = kind ?? null;
  if (ambWanted !== 'office') fireAlarm(false); // left the office
  if (!ctx || ctx.state !== 'running' || ((amb?.kind ?? null) === ambWanted && !amb?.stale)) return;
  const A = CONFIG.sound.ambience, t = ctx.currentTime;
  if (amb) { // fade the old bed out, then stop it
    const old = amb;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + A.fade);
    clearTimeout(old.timer);
    setTimeout(() => old.nodes.forEach(n => { try { n.stop?.(); n.disconnect(); } catch { /* gone */ } }), A.fade * 1000 + 100);
    amb = null;
  }
  if (!kind) return;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(A.level * CONFIG.sound.volume * mix.amb, t + A.fade);
  out.connect(dest());
  const nodes = [out];
  const filtered = (buf, type, f, q, level) => {
    const src = loopSource(buf), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = level;
    src.connect(fl).connect(g).connect(out);
    nodes.push(src, fl, g);
    return { src, fl, g };
  };
  // The range: a recorded outdoor bed (birds, air) when it has loaded.
  const bed = kind === 'range' && samples.range?.[0];
  if (bed) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = bed; src.loop = true;
    g.gain.value = A.rangeBed;
    src.connect(g).connect(out);
    src.start(0, Math.random() * bed.duration);
    nodes.push(src, g);
  } else if (kind === 'range' || kind === 'lot') {
    // Wind: band-passed noise whose level and pitch drift in gusts.
    const w = filtered(noiseBuffer(4, false), 'bandpass', 500, 0.6, 0.6);
    nodes.push(lfo(0.13, 0.4, w.g.gain, 0.6), lfo(0.07, 180, w.fl.frequency, 520));
  }
  if (kind === 'lot') {
    // Distant traffic: low rumble that swells as cars pass.
    const r = filtered(noiseBuffer(6, true), 'lowpass', 260, 0.7, 0.7);
    nodes.push(lfo(0.09, 0.4, r.g.gain, 0.6));
  }
  if (kind === 'office') {
    // Air handling: steady low roar plus a faint 120 Hz ballast hum.
    filtered(noiseBuffer(4, true), 'lowpass', 420, 0.5, 0.7);
    const hum = ctx.createOscillator(), hg = ctx.createGain();
    hum.frequency.value = 120; hg.gain.value = 0.015;
    hum.connect(hg).connect(out); hum.start();
    nodes.push(hum, hg);
  }
  amb = { kind, gain: out, nodes, timer: null, stale: false };
  if (kind === 'range') {
    // A shot from another bay now and then: muffled by distance.
    const next = () => {
      amb.timer = setTimeout(() => {
        if (amb?.kind !== 'range') return;
        distantShot(out);
        next();
      }, (A.distantShots[0] + Math.random() * (A.distantShots[1] - A.distantShots[0])) * 1000);
    };
    next();
  }
}

// Fire alarm horn (office option), looping the temporal-three pattern until
// turned off. The pattern is rendered once into a looping buffer.
let alarm = null, alarmBuf = null;
export function fireAlarm(on) {
  if (on && forwarded('fireAlarm', arguments)) return;
  if (!on && forwarder) forwarder('fireAlarm', [false]); // the Controller may be playing it
  if (!on) {
    if (alarm) { try { alarm.src.stop(); alarm.gain.disconnect(); } catch { /* gone */ } alarm = null; }
    return;
  }
  if (!ctx || alarm) return;
  const S = CONFIG.sound.alarm;
  if (!alarmBuf || alarmBuf.sampleRate !== ctx.sampleRate) {
    const sr = ctx.sampleRate, cycle = S.pattern.reduce((a, b) => a + b, 0);
    alarmBuf = ctx.createBuffer(1, Math.floor(sr * cycle), sr);
    const d = alarmBuf.getChannelData(0);
    let t0 = 0;
    S.pattern.forEach((len, k) => {
      if (k % 2 === 0) { // horn on: buzzy square plus the piezo's high tone, soft edges
        const a = Math.floor(t0 * sr), n = Math.floor(len * sr);
        for (let i = 0; i < n; i++) {
          const t = i / sr, edge = Math.min(1, i / (0.01 * sr), (n - i) / (0.01 * sr));
          const sq = Math.sign(Math.sin(2 * Math.PI * S.hz * t)) * 0.6 + Math.sin(2 * Math.PI * S.hz * 5.9 * t) * 0.4;
          d[a + i] = sq * (0.85 + 0.15 * Math.sin(2 * Math.PI * 60 * t)) * edge;
        }
      }
      t0 += len;
    });
  }
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = alarmBuf; src.loop = true;
  lp.type = 'lowpass'; lp.frequency.value = 5000;
  g.gain.value = S.level * CONFIG.sound.volume * mix.amb;
  src.connect(lp).connect(g).connect(dest());
  src.start();
  alarm = { src, gain: g };
}

// Rain in the parking lot (Rain option): a recorded rain loop (CC0, see
// CREDITS.md), fetched the first time it's wanted. Follows the Background slider.
let rain = null, rainBuf = null, rainWanted = false, rainLoading = false;
export function setRain(on) {
  rainWanted = !!on;
  if (!on) {
    if (rain) { const r = rain; rain = null; r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { r.src.stop(); } catch { /* gone */ } }, 2000); }
    return;
  }
  if (!ctx || rain) return;
  if (!rainBuf) {
    if (rainLoading) return;
    rainLoading = true;
    fetch(new URL('../assets/sounds/rain_0.wav', import.meta.url))
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(decode)
      .then(buf => { rainBuf = buf; })
      .catch(() => { /* no rain sound */ })
      .finally(() => { rainLoading = false; if (rainBuf && rainWanted) setRain(true); });
    return;
  }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = rainBuf; src.loop = true;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.setTargetAtTime(CONFIG.sound.rain * CONFIG.sound.volume * mix.amb, ctx.currentTime, 0.5);
  src.connect(g).connect(dest());
  src.start(0, Math.random() * rainBuf.duration);
  rain = { src, gain: g };
}

// A shot from another bay: a real far-off pistol ('rec') or low-passed noise
// ('synth'). into: the ambience bed (default: the speakers, for the Test button).
export function distantShot(into) {
  if (forwarded('distantShot', arguments)) return;
  if (!ctx) return;
  const A = CONFIG.sound.ambience;
  const bed = into ? A.level * CONFIG.sound.volume : 1; // the bed's own gain
  if (useRec('distant') && playSample(Math.random() < 0.6 ? 'shot_far' : 'shot_near', CONFIG.sound.samples.distantShot * (0.5 + Math.random() * 0.5) / bed, { out: into || null, lowpass: 2500 })) return;
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime;
  src.buffer = noiseBuffer(0.5, false);
  lp.type = 'lowpass'; lp.frequency.value = 700;
  const lvl = into ? 1 : A.level * CONFIG.sound.volume * mix.amb;
  g.gain.setValueAtTime((0.5 + Math.random() * 0.4) * lvl, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
  src.connect(lp).connect(g).connect(into || dest());
  src.start(t0);
}

// A person's voice (recorded, CC0): 'charge' (a yell), 'pain' (severity
// 0..3 = light grunt .. hard hit) or 'death' (a groan). sex 'f' uses the
// woman's set (pain, death). loudness 0..1 (distance). No generated stand-in:
// silent if not loaded.
export function voice(kind, loudness = 1, severity, sex = 'm') {
  if (forwarded('voice', arguments)) return;
  if (!ctx) return;
  const set = (sex === 'f' ? 'voice_f_' : 'voice_') + kind;
  playSample(set, CONFIG.sound.samples.voice * Math.min(1, Math.max(0.1, loudness)), { take: severity });
}

// Someone in a 3D scene cries out when hit (office, judgment scenes): a grunt
// a moment later, harder with each hit; lighter on body armour; none for a
// head shot. char: a Character (sex, voiceHits); from: the camera position.
export function hitCry(char, point, from, { head = false, armor = false } = {}) {
  if (char) char.lastHitHead = head;
  if (head || !char) return;
  const V = CONFIG.sound.hitCry;
  char.voiceHits = (char.voiceHits || 0) + 1;
  const sev = armor ? 0 : Math.min(3, char.voiceHits);
  const loud = Math.min(1, V.nearFull / Math.max(0.5, point.distanceTo(from)));
  setTimeout(() => voice('pain', loud, sev, char.sex), V.delay * 1000);
}

// ...and groans as they go down (not after a head shot: pass head, or it's
// taken from their last hit via hitCry).
export function downCry(char, from, head = char?.lastHitHead) {
  if (head || !char || char.groaned) return;
  char.groaned = true;
  const V = CONFIG.sound.hitCry;
  const loud = Math.min(1, V.nearFull / Math.max(0.5, char.obj.position.distanceTo(from)));
  setTimeout(() => voice('death', loud, 0, char.sex), V.downDelay * 1000);
}

// A round passing close and ricocheting off the wall beside you (office near
// misses): a recorded ricochet (CC0, CREDITS.md) to your left or right,
// following the Gunshot slider. If it isn't loaded: a sharp generated crack.
export function nearMiss() {
  if (forwarded('nearMiss', arguments)) return;
  if (!ctx) return;
  const side = Math.random() < 0.5 ? -1 : 1, pan = side * (0.4 + Math.random() * 0.5);
  if (playSample('ricochet', CONFIG.sound.samples.ricochet * mix.gun, { pan })) return;
  const n = Math.floor(ctx.sampleRate * 0.004), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = i < n / 2 ? 1 - (4 * i) / n : -1 + (4 * (i - n / 2)) / n; // N-wave
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = b; g.gain.value = 0.8 * CONFIG.sound.volume * mix.gun;
  src.connect(g).connect(dest());
  src.start();
}

// Decode a sound file. Newer browsers also return a promise, which rejects
// alongside the error callback; swallow that one so a bad file isn't a page error.
function decode(bytes) {
  return new Promise((res, rej) => { ctx.decodeAudioData(bytes, res, rej)?.catch?.(() => {}); });
}

// ---- Recorded sounds -------------------------------------------------------------
// Small WAV files in web/assets/sounds (sources and licences in CREDITS.md):
// real pistol reports with street echo (ShotSpotter, CC BY 4.0) and Kenney
// impacts / footsteps (CC0), and the outdoor range's background (CC0 field
// recording). Loaded after the first tap; until a set has
// loaded (or if it fails), playSample returns false and the generated sound
// is used instead.
const SAMPLE_SETS = { range: 1, steel_fall: 5, shot_near: 4, shot_far: 3, steel: 5, step_concrete: 5, glass: 3, ricochet: 2, voice_charge: 2, voice_pain: 4, voice_death: 1, voice_f_pain: 4, voice_f_death: 1 };
const samples = {};
let samplesLoading = false;
function loadSamples() {
  if (samplesLoading || !CONFIG.sound.samples?.enabled || !ctx) return;
  samplesLoading = true;
  const base = new URL('../assets/sounds/', import.meta.url);
  for (const [name, n] of Object.entries(SAMPLE_SETS)) {
    samples[name] = [];
    for (let i = 0; i < n; i++) {
      fetch(new URL(`${name}_${i}.wav`, base))
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then(decode)
        .then(buf => {
          samples[name][i] = buf;
          // The range bed arrived while the generated wind plays: swap it in.
          if (name === 'range' && amb?.kind === 'range') { amb.stale = true; setAmbience('range'); }
        })
        .catch(() => { /* keep the generated sound */ });
    }
  }
}
// Play a random take from a set; opts.out: node to play into (default the
// speakers); opts.lowpass: Hz; opts.pan: -1 left .. 1 right; opts.rate: playback speed; opts.take: a
// particular file (else random). Returns false if
// nothing is loaded.
function playSample(name, level, opts = {}) {
  const takes = (samples[name] || []).filter(Boolean);
  if (!ctx || !takes.length) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = samples[name][opts.take] || takes[Math.floor(Math.random() * takes.length)];
  src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * CONFIG.sound.samples.rateJitter);
  g.gain.value = level * (opts.out ? 1 : CONFIG.sound.volume);
  let node = src;
  if (opts.pan != null && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan;
    node = node.connect(p);
  }
  if (opts.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = opts.lowpass;
    node = node.connect(lp);
  }
  node.connect(g).connect(opts.out || dest());
  src.start(ctx.currentTime + (opts.delay || 0));
  return true;
}
