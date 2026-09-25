// config.js — ONE place for every tunable.
// ---------------------------------------------------------------------------
// Every other module imports from here. Never hard-code a threshold, time,
// size, or point value anywhere else; add it here and import it.
//
// Coordinates everywhere are NORMALIZED SCREEN coords: (0,0) = top-left of the
// browser viewport, (1,1) = bottom-right. The mouse and the camera both produce
// these, so there is no Y-flip anywhere in the app.

export const CONFIG = {
  // ---- Camera detection (replaces detector_config.py) ----------------------
  camera: {
    width: 640,             // requested capture size; small = fast + low latency
    height: 480,
    fps: 60,                // requested frame rate (camera may give less)
    threshold: 230,         // 0-255 brightness. Raise if noise causes false shots,
                            // lower if real shots are missed. Tunable in Setup.
    minBlobArea: 2,         // px, rejects single hot pixels
    maxBlobArea: 2000,      // px, rejects big bright splashes / reflections
    blobRadius: 24,         // px around the brightest pixel used for the centroid
  },

  // ---- Calibration ---------------------------------------------------------
  calibration: {
    inset: 0.10,            // crosshairs sit 10% in from each edge (not corners)
    accumFrames: 6,         // frames averaged per calibration shot
    cooldownFrames: 8,      // dark frames required between calibration shots
    goodErrorPx: 15,        // validation quality bands (screen pixels)
    okErrorPx: 35,
  },

  // ---- Scoring (USPSA-style, same numbers as the old ScoringTarget.cs) -----
  // Zone extents are fractions of the target's half-width / half-height,
  // measured from the target centre. ny is POSITIVE UPWARD here (like a
  // target face), and the code converts from screen coords.
  zones: {
    aHalfWidth: 0.30, aHalfHeight: 0.55,
    cHalfWidth: 0.65, cHalfHeight: 0.90,
    headHalfWidth: 0.28, headBottom: 0.60, headTop: 1.00,
  },
  points: { A: 5, C: 3, D: 1, Head: 5, Miss: 0 },

  // ---- Targets -------------------------------------------------------------
  targets: {
    heightFrac: 0.42,       // target height as a fraction of viewport height
    aspect: 0.60,           // width / height (USPSA-ish proportions)
    maxWidthFrac: 0.22,     // cap target width as a fraction of viewport width
    holeLifetime: 4.0,      // seconds a bullet hole stays before fading
    holeFade: 0.6,          // seconds spent fading out
    // Pop-up / mover spawner
    maxAlive: 3,
    spawnInterval: 0.9,     // seconds between spawn attempts
    moverSpeed: 0.18,       // normalized screen widths per second
    sineAmplitude: 0.08,    // normalized screen heights
    sineFrequency: 2.0,     // radians per second
    spawnArea: { x: 0.12, y: 0.22, w: 0.76, h: 0.60 }, // where target centres go
  },

  // ---- Shot timer ----------------------------------------------------------
  timer: {
    minDelay: 1.5,          // random start delay (seconds)
    maxDelay: 4.0,
    incompleteGrace: 3.0,   // seconds past par before an unfinished drill ends
  },

  // ---- Drills (same set as the old DrillRunner.cs, plus Free Run) ---------
  // requiredShots 0 = no round count; the run simply ends at the par beep.
  drills: [
    { name: 'Free Run',       requiredShots: 0, parTime: 5.0 },
    { name: 'Bill Drill',     requiredShots: 6, parTime: 2.0 },
    { name: 'Mozambique',     requiredShots: 3, parTime: 2.5, minBodyHits: 2, minHeadHits: 1 },
    { name: 'Par String (5)', requiredShots: 5, parTime: 3.0 },
  ],

  // ---- Sound (all generated in code; there are no audio files) ------------
  sound: {
    volume: 0.6,
    startBeepHz: 1000,
    parBeepHz: 700,
    beepSeconds: 0.18,
    hitHz: 1568,            // ~G6 "ding"
  },

  // ---- Storage keys (browser localStorage) --------------------------------
  storage: {
    settings: 'ldfs.settings.v1',
    calibration: 'ldfs.calibration.v1',
    log: 'ldfs.log.v1',
  },
};
