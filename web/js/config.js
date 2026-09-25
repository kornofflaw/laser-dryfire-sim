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

  // ---- USPSA target geometry (centimetres, origin = target centre, y UP) --
  // Drawn and scored from the same shapes, so what you see is what scores.
  // Outline = D zone; inner octagon = C; body rectangle = A (15 x 28 cm, as
  // on the real target); the whole head box = Head.
  uspsa: {
    width: 46, height: 76,
    outline: [[-7.5, 38], [7.5, 38], [7.5, 23], [15, 23], [23, 15], [23, -30], [15, -38],
              [-15, -38], [-23, -30], [-23, 15], [-15, 23], [-7.5, 23]],
    cZone: [[-11, 19], [11, 19], [17, 13], [17, -26], [11, -32], [-11, -32], [-17, -26], [-17, 13]],
    aZone: { x0: -7.5, x1: 7.5, y0: -12, y1: 16 },
    head: { x0: -7.5, x1: 7.5, y0: 23, y1: 38 },
  },
  // Steel = a Texas Star plate. Tile = a flip-grid plate. Dot = a Dot Torture dot. NS = hitting a
  // no-shoot (bystander) in a scenario: a -10 penalty, as in USPSA.
  points: { A: 5, C: 3, D: 1, Head: 5, Steel: 5, Tile: 5, Dot: 1, NS: -10, Miss: 0 },

  // ---- Targets -------------------------------------------------------------
  targets: {
    heightFrac: 0.42,       // target height as a fraction of viewport height
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

  // Drill, dot torture and scenario definitions live in courses.js and
  // scenarios.js (content, not tunables).

  // ---- Texas Star (steel spinner) -------------------------------------------
  // Real-world units so the physics behaves like the real thing: a balanced
  // 5-arm wheel stays still until a plate is shot off, then gravity on the
  // remaining plates swings/spins it.
  star: {
    heightFrac: 0.70,       // whole star (plate to plate) as a fraction of viewport height
    armLength: 0.75,        // metres, hub centre to plate centre
    plateRadius: 0.1016,    // metres (8-inch plates)
    plateMass: 4.0,         // kg per plate
    hubInertia: 1.6,        // kg*m^2 of the hub and arms without plates
    gravity: 9.81,          // m/s^2
    damping: 0.12,          // 1/s, bearing friction (higher = settles sooner)
    resetDelay: 2.5,        // seconds after the last plate falls before a free-practice reset
  },

  // ---- Pop-up targets (hinged cardboard targets behind a dirt mound) ------------
  popup: {
    lanes: [0.14, 0.32, 0.5, 0.68, 0.86], // target centres across the range
    heightFrac: 0.36,       // target height as a fraction of viewport height
    hingeY: 0.8,            // hinge line (fraction of height), hidden behind the mound
    moundY: 0.745,          // top of the mound in front of the targets
    riseTime: 0.22,         // seconds to flip up
    fallTime: 0.25,         // seconds to fall when hit or timed out
    hittableAbove: 0.35,    // fraction raised before a target can be hit
    // Free practice: random exposures.
    freeExposure: [1.8, 3.2],
    freeGap: [0.4, 1.4],
    freeMaxUp: 2,
  },

  // ---- Flip-tile grid (steel frame of square plates that spin around) -----------
  flip: {
    cols: 4,
    rows: 3,
    boardWidthFrac: 0.62,   // frame width as a fraction of viewport width (max)
    boardHeightFrac: 0.56,  // frame height as a fraction of viewport height (max)
    centreY: 0.44,          // frame centre, fraction of viewport height
    flipTime: 0.2,          // seconds for a plate to spin 180 degrees
    hittableAbove: 0.45,    // plate must be at least this face-on to be hit
    // Free practice: random target faces.
    freeExposure: [1.2, 2.4],
    freeGap: [0.3, 1.1],
    freeMaxUp: 2,
  },

  // ---- Parking-lot knife attack ----------------------------------------------------
  // Real-world units. Perspective: a person d metres away is
  // focal * heightM / d px tall, feet at horizon + focal * eyeHeight / d.
  knife: {
    startFeet: [27, 33],    // starting distance range
    waitTime: [2.5, 7.0],   // seconds standing before he charges
    accel: [4.0, 5.0],      // m/s^2 from a standstill
    topSpeed: [5.8, 7.0],   // m/s sprint
    reach: 0.9,             // metres: at this distance he can stab you
    stopHits: 2,            // body hits to stop him (a head hit stops him at once)
    stumbleDecel: 10,       // m/s^2 as he goes down
    personHeight: 1.78,     // metres
    eyeHeight: 1.6,         // metres, the shooter's eyes
    focalFrac: 1.1,         // focal length as a fraction of viewport height
    horizonY: 0.4,          // horizon as a fraction of viewport height
    strideTime: 0.3,        // seconds per footstep while sprinting
  },

  // ---- 3D parking lot (knife3d.js) -------------------------------------------------
  knife3d: {
    maxPixelRatio: 2,       // cap render resolution on high-DPI screens (performance)
    exposure: 0.95,         // tone-mapping exposure
    envIntensity: 0.45,     // image-based light from the dusk sky
    hemiIntensity: 0.6,     // sky/ground fill light
    sunIntensity: 1.3,      // low sun behind the store (casts the long shadows)
    lampIntensity: 60,      // parking-lot lamp spotlights (candela)
    fogColor: '#6d6474',
    fogDensity: 0.011,
    runClipSpeed: 3.2,      // m/s the run animation was captured at (sets its playback rate)
    // When stopped: knees buckle, then he pitches forward.
    fall: { kneelTime: 0.35, pitchTime: 0.55, thigh: -1.1, knee: 1.9, slump: 0.35, drop: 0.42, pitch: 1.35 },
    // Hit reactions: snap in fast, recover slower (1/s rates).
    react: { snap: 35, recover: 5, duration: 1.2, legDip: 0.12 },
    hitSlow: 0.8,           // speed multiplier after a hit that doesn't stop him
    legHitSlow: 0.55,       // ... after a leg hit
    blood: {
      woundSize: 0.09,      // metres across a wound stain
      woundSpread: 0.6,     // seconds for a stain to spread to full size
      droplets: 110,        // droplets per hit
      dropletSize: [0.0015, 0.005], // droplet radius range (m)
      speed: [1.5, 5.0],    // droplet speed range (m/s)
      backSpatter: 0.3,     // fraction spraying back toward the shooter
    },
    aZoneRadius: 0.1,       // metres from the spine line that count as A zone on the chest
    jacketTint: '#4b4f55',  // multiplies the avatar's jacket texture (dark street jacket)
    pantsTint: '#3c4a63',   // multiplies the trousers texture (dark jeans)
    facingOffset: Math.PI,  // radians: turns the retargeted rig to face the shooter
    defaultCars: 6,         // parked cars (user can pick 0-maxCars in Setup; fewer = faster)
    maxCars: 16,
    carDetailDist: 20,      // metres: cars further than this skip interior parts
    maxCars: 14,            // parked cars (the car model is detailed; more = slower)
    carDetailDist: 20,      // metres: cars further than this skip interior parts
  },

  // ---- Adjustable "time up" for flash courses (flip grid, pop-ups) ----------------
  // [ and ] (or the Setup slider) change it per course; saved in this browser.
  upTime: { min: 0.3, max: 6.0, step: 0.1 },

  // ---- Dot Torture ---------------------------------------------------------------
  dots: {
    radiusFrac: 0.062,      // dot radius as a fraction of the sheet height (~1.4-inch dots on letter paper)
  },

  // ---- Judgment scenarios ----------------------------------------------------------
  scenario: {
    standbyMin: 1.0,        // blank screen before the scene appears (seconds)
    standbyMax: 2.5,
    actorHeightFrac: 0.58,  // actor height as a fraction of viewport height
    neutralizeHits: 2,      // hits on a threat before it goes down
    fallTime: 0.45,         // seconds for a downed actor to drop out of view
    endGrace: 1.5,          // seconds the scene holds after the last event is resolved
    maxDuration: 10,        // hard cap on a scenario's length (seconds)
  },

  // ---- Sound (all generated in code; there are no audio files) ------------
  sound: {
    volume: 0.6,
    startBeepHz: 1000,
    parBeepHz: 700,
    beepSeconds: 0.18,
    hitHz: 1568,            // ~G6 "ding"
    steelHz: 2350,          // base pitch of the steel "ping"
  },

  // ---- Storage keys (browser localStorage) --------------------------------
  storage: {
    settings: 'ldfs.settings.v1',
    calibration: 'ldfs.calibration.v1',
    log: 'ldfs.log.v1',
  },
};
