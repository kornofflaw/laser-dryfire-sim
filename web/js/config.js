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
    holeRadiusCm: 0.45,     // 9 mm: a hole touching a line scores the higher zone
  },
  // Steel = a Texas Star plate. Tile = a flip-grid plate. Dot = a Dot Torture dot. NS = hitting a
  // no-shoot (bystander) in a scenario: a -10 penalty, as in USPSA.
  points: { A: 5, C: 3, D: 1, Head: 5, Steel: 5, Tile: 5, Dot: 1, NS: -10, Miss: 0 },
  // USPSA power factor (Setup): what C and D hits are worth. Minor (most
  // 9 mm divisions) is the default above; Major (e.g. .40 / .45 in Limited).
  powerFactor: { minor: { C: 3, D: 1 }, major: { C: 4, D: 2 } },

  // ---- USPSA stage scoring (stage courses: paper + steel) ---------------------
  // Best `perPaper` hits on each paper count; each missing hit, and each steel
  // left standing, is a miss (missPenalty). No-shoot hits are CONFIG.points.NS.
  // Stage points never go below zero. Hit factor = points / time.
  // Virginia Count stages (stage.scoring 'virginia'): exactly the round count
  // (hits per paper + one per steel); each extra shot is a procedural.
  // `start`: the start position in the stage briefing unless a stage has its own.
  stage: { perPaper: 2, missPenalty: -10, procedural: -10, start: 'standing in the box, hands relaxed at your sides' },

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
    minDelay: 1.0,          // random start delay after "Standby" (seconds; USPSA: 1-4)
    maxDelay: 4.0,
    // Range officer commands before the delay (Setup): [what's said, seconds
    // until the next]. Shots before the last one don't count as early.
    // `after`: the closing commands, starting afterPause s after a drill or
    // stage ends.
    commands: {
      on: true,
      say: [['Make ready.', 2.6], ['Are you ready?', 1.6], ['Standby.', 0.6]],
      after: [['If you are finished, unload and show clear.', 3.4], ['If clear, hammer down, holster.', 2.8], ['Range is clear.', 0]],
      afterPause: 1.5,
    },
    incompleteGrace: 3.0,   // seconds past par before an unfinished drill ends
    par: { step: 0.1, min: 0.5, max: 60 }, // your own par ([ ] on drills and stages), seconds
    splitGoal: 0,           // Setup: a split slower than this (s) is flagged in the review (0 = off)
    drawGoal: 0,            // Setup: a first shot slower than this (s from the beep) is flagged (0 = off)
    reviewRows: 12,         // shots listed in the timer's review after a run (the last ones)
  },

  // ---- Shot review (V) ------------------------------------------------------------
  // The progress chart: this course's last progressRuns complete runs (run log).
  review: { progressRuns: 20 },

  // ---- Match (course type 'match', main.js) ------------------------------------
  // After a stage's run the next stage loads nextStageAfter s later (once
  // you're back from walking the targets or the review).
  match: { nextStageAfter: 8 },

  // ---- Steel Challenge style (course type 'strings', stage.js) -------------------
  // `strings` strings per run; a string ends on the stop plate, each plate
  // still up then adds platePenalty s; no stop plate in maxString s = maxString.
  // Between strings the steel resets resetAfter s after the stop plate, then
  // (readyAfter s later) the RO's `say` calls and the usual random delay.
  steelChallenge: {
    strings: 5, platePenalty: 3, maxString: 30, resetAfter: 2.5, readyAfter: 1.0,
    say: [['Are you ready?', 1.6], ['Standby.', 0.6]],
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
    flipTime: 0.2,          // seconds for a plate to spin 180 degrees (at speed 1)
    // Setup: "Flip speed" multiplies how fast plates spin and how soon the next
    // one turns (the time a plate stays up is its own setting). "Variable
    // timing" varies each plate's time up and the pause before it by +/- spread.
    speed: { min: 0.5, max: 2, step: 0.25 },
    variableSpread: 0.5,
    // Shape / colour plates (Called Shapes & Colours).
    shapes: ['circle', 'square', 'triangle', 'star'],
    colors: { red: '#d7322b', blue: '#2563d4', green: '#2c9a45', yellow: '#f0c02a' },
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
    // His voice (recorded, CC0): a yell as he charges and again at yellAgainAt
    // metres, a grunt when hit (louder for the stopping hit), a groan as he
    // goes down (not after a head shot). Louder as he closes: nearFull metres.
    voice: { yellAgainAt: 3.2, nearFull: 3, painDelay: 0.12 }, // painDelay: s after the hit (reaction)
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
    runClipSpeed: 3.2,      // m/s the run clip looks right at (sets its playback rate)
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
    defaultCars: 6,         // parked cars (user can pick 0-maxCars in Setup; fewer = faster)
    maxCars: 16,
    strikeFrom: 2.5,        // metres: inside this the knife comes up high for an overhand stab
    // Night (Setup): dark sky, sodium street lights, lit store, one car with
    // its headlights on. Values replace the dusk ones while it's on.
    night: {
      sky: ['#04060b', '#0b0f1a', '#231d27'],  // top, mid, horizon
      env: 0.05, hemi: 0.1, sun: 0, exposure: 1.15,
      lamp: 150, lampColor: '#ffae55',          // high-pressure sodium orange
      store: 2.6, fog: '#0e1016',
      headlight: 40, headlightRange: 28,
    },
    carDetailDist: 14,      // metres: cars further than this use the low-detail model (car_lod.glb)
    glassChips: 14,         // glass flakes thrown off a windshield hit (a third for a lamp lens)
    // Your muzzle flash lighting the lot for `time` s (shows at night): peak
    // intensity, reach (m), and where the gun is from your eyes (right, down, forward m).
    muzzle: { light: 90, time: 0.06, range: 22, at: [0.2, -0.3, 0.6] },
    // Your spent brass (as CONFIG.office3d.myBrass), bouncing on asphalt.
    myBrass: { at: [0.16, -0.22, -0.45], right: [2.0, 3.0], up: [1.6, 2.4], back: 0.6, bounce: 0.35 },
    // Rain (Setup): wet asphalt (roughness x wet, colour x darken, glassy
    // puddles where the ground dips), falling streaks around the camera, and
    // by day an overcast sky. drops: streak count in a box `area` (x, depth,
    // height, m) in front of the camera; speed m/s; length m.
    rain: {
      drops: 4000, area: [34, 40, 14], speed: 9, length: 0.4, wind: 0.8, opacity: 0.32, color: '#b8c2cc',
      wet: 0.3, darken: 0.62, puddles: 0.12, puddleScale: 14, // metres per puddle-texture tile
      wetBumps: 0.3,        // asphalt bump strength when wet (dry 0.6): water fills the texture
      nightFog: 0.014,      // fog density in the rain at night (by day: day.fogDensity)
      // Lamp reflections on the wet ground: a streak where each lamp mirrors
      // in the water (between you and the lamp), stretched toward you.
      glint: { width: 0.7, length: 11, night: 0.9, day: 0.2 },
      day: { sky: ['#5f6670', '#7c838c', '#9aa0a6'], env: 0.3, hemi: 0.45, sun: 0.25, fog: '#7d838a', fogDensity: 0.02 },
    },
  },

  // ---- 3D office active-shooter scenario (office3d.js) ------------------------------
  // ---- 3D people's body language (char3d.js) ------------------------------------
  people: {
    tremble: 0.012,         // metres of hand shake with hands up (fear)
    struggle: 0.16,         // radians a hostage twists and leans against the hold
    // Nobody holds a gun perfectly still: the muzzle wanders in a slow
    // figure-eight (sway, radians) with a fine tremor on top. Rifles (shoulder
    // + two hands) wander less; a gun held to a hostage's head only trembles.
    aimSway: { sway: 0.014, tremor: 0.0025, rifle: 0.55, hostage: 0.3 },
    // Startled by a shot: head and shoulders jerk down for `time` s (radians).
    flinch: { time: 0.35, head: 0.3, spine: 0.12 },
    // Cowering: hunched forward, head down, hands up over the head
    // (metres from the head bone), trembling (tremble).
    cower: { hunch: 0.35, duck: 0.35, handsFwd: 0.17, handsApart: 0.09, handsUp: 0.07 },
  },

  // ---- 3D people's faces (char3d.js, Rocketbox face bones) ------------------------
  face: {
    blinkEvery: [2, 6],     // seconds between blinks
    blinkTime: 0.16,        // seconds for a blink
    lidDrop: 0.011,         // metres the upper lid travels to close
    eyeMax: 0.45,           // radians the eyes turn to follow you
    browMove: 0.004,        // metres the brows move (angry: down, afraid: up)
    jawAfraid: 0.08,        // radians the mouth hangs open when afraid
    jawTalk: 0.2,           // radians the jaw opens while talking
  },

  office3d: {
    exposure: 1.0,
    envIntensity: 0.55,     // image-based light from the city sky
    hemiIntensity: 0.45,
    sunIntensity: 2.2,      // outside
    roomLight: 9,          // indoor point lights (candela)
    muzzleLight: 30,       // a suspect's muzzle flash lights up the room this much (candela) for a moment
    muzzleLightRange: 6,   // metres
    signGlow: 0.3,          // the building's name sign by day (night: night.sign)
    // Your patrol car's light bar behind you while you're outside: red and
    // blue lights `spread` m either side of `at`, candela at night (x day by
    // day), range m, quad-flash cycles per second.
    police: { light: 320, day: 0.35, range: 45, at: [0, 1.55, 17.5], spread: 0.5, rate: 1.1 },
    // Night (option): sky colours (top, horizon); sun left (moonlight share);
    // fill light / reflections / exposure factors outside and inside (the
    // office lights stay on unless the power is cut too); the sign's glow;
    // the entrance downlight (candela, range m, position).
    night: {
      sky: ['#03050a', '#151b27'], sun: 0.04, sign: 2.5,
      outside: { hemi: 0.1, env: 0.05, exposure: 1.35 },
      inside: { hemi: 0.55, env: 0.8, exposure: 1 },
      canopy: { light: 30, range: 16, at: [0, 3.0, 2.0] },
    },
    // Your own muzzle flash lighting the room for `time` s: peak intensity
    // (candela), range m, offset from your eye (right, down, forward) m.
    myMuzzle: { light: 25, time: 0.06, range: 12, at: [0.2, -0.3, 0.6] },
    // Power cut (option lightsOut): the room lights become battery emergency
    // lights at `units` (x, y, z, facing wall), `out` m in front of the unit,
    // `light` candela, `color`; lamp = glow of the lamp heads. Inside, the
    // fill lights scale by env / hemi / top / sun (it leaks onto the back
    // offices) and the exposure by `exposure`
    // (your eyes adjust a little).
    power: { light: 3.5, out: 0.6, color: '#f3f1ff', lamp: 6, env: 0.25, hemi: 0.25, top: 0.1, sun: 0.3, exposure: 1.2,
      units: [[-5.86, 2.55, -3.5, 'x'], [1.06, 2.45, -12.5, '-x'], [-11.86, 2.55, -27, 'x'], [-0.575, 2.6, -36.52, 'z'], [5.425, 2.6, -36.52, 'z']] },
    // Each shot a suspect fires: a puff of gun smoke from the muzzle that
    // drifts up and fades, and a brass case thrown out to the right that
    // bounces and stays on the floor until the next run.
    gunSmoke: { time: 1.8, size: [0.18, 0.95], rise: 0.3, opacity: 0.8 },
    casing: { speed: [1.6, 2.6], up: [1.0, 1.8], bounce: 0.32 },
    // Your own brass on every shot: from the ejection port `at` (right, up,
    // back from your eyes, m; -z = ahead), thrown right / up (m/s ranges) and
    // a little back past you.
    myBrass: { at: [0.16, -0.22, -0.45], right: [2.0, 3.0], up: [1.6, 2.4], back: 0.6 },
    // A miss that passes within nearMiss metres of a suspect's chest: behind
    // a cubicle he ducks (and doesn't fire) for duckTime seconds, then comes
    // back up; out in the open he sidesteps away from the round.
    dodge: { nearMiss: 0.8, chance: 0.85, duckDepth: 0.75, duckDown: 0.18, duckTime: [1.0, 1.8], stepDist: 0.8, stepTime: 0.35 },
    ceilingShadowLight: 0.6, // soft top-down light that grounds people indoors
    partitionHeight: 1.15,  // metres; low cubicle walls (people show from the chest up)
    callTime: 6.0,          // seconds outside while the radio call plays
    lookAround: 0.12,       // radians of slow left-right scanning in the office
    lookAroundFade: 0.8,    // seconds the scanning takes to settle once someone appears
    // Everyone appears where their body (0.9-1.8 m up, 0.3 m either side)
    // is on screen from where you stop, this far in from the edges (fraction
    // of half the screen). A suspect who is off screen anyway holds his fire.
    onScreenMargin: 0.04,
    // A suspect behind waist-high cover (the file cabinets in the aisle, or a
    // cubicle wall): crouched out of sight (sunk `down` m), he rises in `rise`
    // s until his head, shoulders and gun clear the top (sunk `up` m), aims
    // for the Setup fire delay x aimK x aim (random), fires `shots` rounds
    // `refire` s apart, ducks `after` s after the last one (in `duck` s),
    // stays down `downTime` s while he moves along behind the cover
    // (shiftSpeed m/s) and comes up somewhere else. podChance: share of the
    // other cubicle suspects who fight like this.
    peek: { down: 0.95, up: 0.12, rise: 0.25, duck: 0.2, aimK: 0.4, aim: [0.9, 1.3], shots: [1, 2], refire: [0.35, 0.6], after: 0.25, downTime: [1.2, 2.4], shiftSpeed: 1.2, podChance: 0.35 },
    // Your cover: the file cabinets just ahead of where you stop (height m).
    // Hold X, the right mouse button or the Controller's Cover button to
    // crouch behind them (eyes at `eye` m, `time` s to get down or up). Once
    // you're more than `safe` of the way down, a suspect's round hits the
    // cabinets (clang = steel sound for a plate this size, inches).
    cover: { height: 1.1, eye: 0.85, time: 0.3, safe: 0.6, clang: 20 },
    riseTime: 0.35,         // seconds to pop up from behind a cubicle wall
    stepOutTime: 0.9,       // seconds to step out of an office door
    fireDelay: [3.0, 4.5],  // seconds a suspect aims at you (once fully in view) before he fires
    gunmanGap: [2.5, 4.5],  // seconds between suspects appearing
    hostageTime: 10.0,      // seconds before the hostage-taker shoots the hostage
    refireDelay: [1.6, 2.6], // seconds between a suspect's shots once he's firing at you
    fleeSpeed: 3.6,         // m/s an innocent runs for the exit
    advanceSpeed: 0.7,      // m/s a suspect walks toward you while aiming
    // Scenario options (Setup -> Current course overrides these, per browser).
    options: {
      gunmen: 0,            // 0 = random (2-3), else 1-4 (plus the hostage-taker)
      innocents: -1,        // -1 = random (1-2), else 0-3
      fireDelay: 3.0,       // seconds a suspect aims before firing (random up to x1.5)
      lives: 3,             // hits you can take; at this many you're down
      rifle: true,          // one suspect carries a rifle
      armor: true,          // one suspect wears body armour (chest hits don't stop him)
      hostage: true,        // the hostage scene at the end
      fleeing: true,        // some innocents run for the exit instead of raising their hands
      victimVoice: true,    // the wounded man in the lobby asks for help
      alarm: false,         // fire alarm going: wall strobes flash and the horn sounds (stress)
      lightsOut: false,     // power cut: ceiling lights and monitors off, battery emergency lights only
      night: false,         // night: dark outside, the city lit up through the windows
      peeker: true,         // one suspect crouches behind cover and pops up to shoot (some behind cubicle walls too)
    },
    // A suspect who fires often fires again quickly: that round misses (a
    // ricochet off the wall beside you) and doesn't count as a hit on you.
    // chance per shot; delay s after the first; ricochetAfter s after the report.
    followUp: { chance: 0.5, delay: [0.22, 0.45], ricochetAfter: 0.05 },
    // Workers standing with raised hands at the cubicles duck behind the
    // cubicle wall `after` s after a shot (yours or a suspect's), hands over
    // their heads, sunk `depth` m; every `peekEvery` s they peek over (sunk
    // `peek` m) for `peekTime` s; `quiet` s after the last shot they stand up
    // with their hands raised again.
    hide: { after: [0.15, 0.4], quiet: [3, 5], depth: 0.85, peek: 0.3, peekEvery: [2, 4], peekTime: 0.8 },
    // Fire alarm horn-strobes on the walls: synchronised flashes `rate` per
    // second, each `flash` s long; light = intensity of the two flash lights
    // (range m); lens = emissive glow of the strobe lens while it flashes.
    alarm: { rate: 1, flash: 0.1, light: 12, range: 15, lens: 12,
      strobes: [[-5.88, 2.3, -6.5, 'x'], [1.08, 2.25, -17, '-x'], [-3.5, 2.4, -39.88, 'z'], [5.5, 2.4, -39.88, 'z'], [-11.88, 2.4, -29, 'x']],
      lights: [[-4.9, 2.1, -6.5], [1, 2.1, -38.2]] }, // strobes: x, y, z, facing; lights: in front of the lobby and back-wall strobes
    doorOpenAngle: 1.7,     // radians an office door swings open
    doorSpeed: 6,           // how fast doors swing (1/s)
    doorLead: 0.45,         // seconds the door opens before the suspect steps out
    windowLight: 0.6,       // daylight through the windows
    envInside: 0.22,        // reflections / fill light inside the building
    hostageAisleX: 1.0,     // metres from centre where the hostage pair stops in the aisle
    walkSpeed: 1.3,         // m/s the hostage pair walks
    takerOffset: 0.27,      // metres the hostage-taker stands to the side of the hostage
    hostageSag: 0.1,        // metres the hostage sags in his grip (exposes his head a little)
    hostageLatest: 16,      // seconds into the room phase the hostage scene starts at the latest
    stopHits: 2,            // body hits to stop a suspect (a head hit stops him at once)
    fallTime: 0.6,          // seconds for a stopped suspect to go down
    drawTime: 0.6,          // seconds for a person to draw a pistol from the hip to aim (all 3D people)
  },

  // ---- Screen-space effects for 3D interiors (post3d.js) ------------------------
  post: {
    enabled: true,
    aoRadius: 0.6,          // metres: how far ambient occlusion reaches
    aoIntensity: 1.0,       // 0..1 blend
    bloomStrength: 0.18,    // glow around bright lights
    bloomThreshold: 2.0,    // only light sources (troffers, windows) glow
    checkFrames: 60,        // frames averaged before stepping down (Auto)
    slowMs: 24,             // Auto: an average frame slower than this steps down a level
    // Quality levels, best first: ambient occlusion, bloom, highest pixel
    // ratio (render resolution on high-DPI screens), shadow map size (px).
    steps: [
      { name: 'high', ao: true, bloom: true, dpr: 2, shadow: 2048 },
      { name: 'high, 1.5x resolution', ao: true, bloom: true, dpr: 1.5, shadow: 2048 },
      { name: 'medium', ao: true, bloom: true, dpr: 1, shadow: 1024 },
      { name: 'medium, no AO', ao: false, bloom: true, dpr: 1, shadow: 1024 },
      { name: 'low', ao: false, bloom: false, dpr: 1, shadow: 1024 },
      { name: 'lowest', ao: false, bloom: false, dpr: 0.75, shadow: 1024 },
    ],
    // Setup -> 3D graphics: the level each choice uses (Auto starts at the top).
    modes: { auto: 0, high: 0, medium: 2, low: 4 },
    quality: 'auto',        // the current choice (main.js sets it from Setup)
  },

  // ---- Judgment scenarios in 3D (judge3d.js) ------------------------------------
  // The 2D scenario scripts played by realistic people in the 3D parking lot.
  judge3d: {
    distance: 7,            // metres from the shooter to where people stand (~23 ft)
    spread: 11,             // metres across the scene for the scripts' x = 0..1
    frontStep: 0.9,         // metres a person standing in front of another is closer
    turnRate: 8,            // rad/s people turn (turning around ~0.4 s)
    aimJitter: 0.3,         // metres: where each armed person aims around the shooter
    // Bystanders react to gunfire: after `delay` s they flinch; people just
    // standing, turned away or on the phone then cower for `cower` s (after
    // the last shot), turned `turn` rad away from you. Someone showing a gun,
    // a wallet or surrendering keeps showing it (that's what you judge);
    // walkers flinch and keep walking.
    react: { delay: [0.1, 0.35], cower: [2.5, 4.5], turn: 0.6,
      // Some of those bystanders (chance) run for cover instead: after `after`
      // s they sprint sideways out of the scene at `speed` m/s and are gone
      // `offBy` m past its edge. Never anyone the script still has plans for.
      flee: { chance: 0.5, after: [0.3, 0.8], speed: [3.5, 5], offBy: 4,
        // Cover: a parked car within `max` m: they run round its near end to
        // the far side (in line with you), crouch (sunk `crouch` m; the car
        // hides the rest) and now and then peek over it for `peekTime` s.
        cover: { max: 14, gap: 0.6, crouch: 0.6, peek: 0.15, peekEvery: [2, 4], peekTime: 1.0 } } },
  },

  // ---- Photo-realistic 3D range for the fundamentals (range3d.js) ------------------
  // ---- Bullet holes in 3D scenes (holes3d.js) ---------------------------------------
  holes: {
    sizeCm: 2.2,            // decal size: 9 mm hole plus the damaged ring around it
    max: 80,                // oldest holes are recycled past this
    windshield: 9,          // a windshield's spiderweb crack, x sizeCm
  },

  // ---- Life-size 3D (Setup) --------------------------------------------------------
  // The 3D camera's field of view matched to the screen: things look their
  // real size from where you stand. Vertical FOV = 2 atan(screen height / 2 /
  // your distance); screen height comes from its width and the page's shape.
  lifeSize: {
    screenWidthIn: { min: 30, max: 200, step: 1, default: 100 },  // projected image width (inches)
    distanceFt: { min: 4, max: 30, step: 1, default: 12 },         // your eyes to the screen (feet)
  },

  range3d: {
    // Distance to the targets in yards, per kind of target (Setup slider), the
    // slider's limits, and the height (m) the fixed camera looks at.
    yards: { paper: 5, popup: 10, star: 10, plates: 10, poppers: 12, movers: 8, grid: 5, tree: 10, dots: 3 },
    yardsRange: { paper: [3, 25], popup: [5, 25], star: [5, 25], plates: [5, 25], poppers: [5, 25], movers: [5, 25], grid: [3, 20], tree: [5, 25], dots: [2, 10] },
    aimY: { paper: 1.4, popup: 1.15, star: 1.5, plates: 1.1, poppers: 0.8, stage: 1.15, movers: 1.3, grid: 1.25, tree: 1.2, dots: 1.42 },
    // Flip grid in 3D: plate size (m, square) and the frame's centre height;
    // columns, rows, spin and faces come from CONFIG.flip and the FlipBoard.
    flipGrid: { plate: 0.25, centerY: 1.25 },
    // Movers: targets on stands sliding along a track across the bay; a hit
    // one tips back, and a fresh one comes on from a side after `respawn` s.
    movers: { count: 2, track: 8, speed: [0.9, 2.2], respawn: 0.9, fallTime: 0.3 },
    stageLookYards: 10,     // stages: items have their own distances; the camera looks this far out
    targetCenterY: 1.35,    // metres: height of the target's centre on its stand
    bayGap: 1.5,            // metres between targets in the 3-target bay
    holeRadiusCm: 0.45,     // 9 mm bullet hole
    // Between runs the holes are pasted over (Setup): pasters sizeCm square
    // in these tans; a fresh target once `limit` pasters are on it.
    // Stage targets start as found at a match: `earlier` [min, max] pasters
    // from the shooters before you (x earlierNoShoot on a no-shoot), spread
    // spreadCm [x, y] around a point spreadCm[2] cm above the centre.
    paste: { on: true, sizeCm: 1.9, limit: 60, colors: ['#a97d48', '#a2773f', '#b0844f'], earlier: [8, 34], earlierNoShoot: 0.15, spreadCm: [7, 9, 3] },
    // A hit rocks the target on its stand (a damped spring, radians). A hit
    // off to one side twists it more (twist x offset from centre, -1..1); a
    // high hit pushes the top back more (push + tilt x height, -1..1). A round
    // through a stake rocks it by `stake`. freq rad/s, damping 1/s.
    jolt: { twist: 0.07, push: 0.012, tilt: 0.014, stake: 0.05, freq: 38, damping: 7 },
    exposure: 0.95,
    envIntensity: 1.0,      // light from the HDRI sky
    bgIntensity: 1.0,       // brightness of the sky backdrop
    skyRotation: 0,         // radians: turns the sky (and its sun) around the range
    sunIntensity: 2.4,
    sunDir: [-0.85, 0.75, 0.35], // from the left and a little behind: side light gives shape
    // Time of day (Setup). Each has its own sky photo (the light and what you
    // see); morning / evening put the sunlight where the sun is in their photo
    // (sunDir; low sun = long shadows). 'day' is the settings above.
    times: {
      morning: { hdr: 'morning.hdr', sunDir: [0.8, 0.14, 0.58], sun: 1.9, sunColor: '#ffd6a8', env: 0.9, bg: 0.9, exposure: 1.0, haze: '#d9cdbf' },
      // Evening's photo has a city skyline except behind the sun: turned 90° (rotate) to keep it out of view.
      evening: { hdr: 'evening.hdr', sunDir: [-0.93, 0.14, -0.34], rotate: 1.571, sun: 1.7, sunColor: '#ffc48e', env: 0.85, bg: 0.85, exposure: 1.0, haze: '#d6c9bd' },
      // Night (a low-light match): the day sky nearly black, no sun; a
      // floodlight (candela, from pos aimed at aim, cone angle rad, soft
      // edge penumbra) behind and above you lights the bay.
      night: { hdr: null, sunDir: [-0.85, 0.75, 0.35], sun: 0, sunColor: '#9fb3d6', env: 0.035, bg: 0.012, exposure: 1.0, haze: '#07090d',
        flood: { intensity: 260, color: '#fff2dc', pos: [1.5, 7, 3], aim: [0, 0.8, -12], angle: 0.5, penumbra: 0.6 },
        // Your muzzle flash: the sky light jumps by `flash` and dies away (flashTime s).
        flash: 0.4, flashTime: 0.03 },
    },
    cardboardRelief: 0.25,  // strength of the corrugation / fibre normal map
    hazeColor: '#c9d3dc',
    hazeNear: 40,           // metres: haze starts
    hazeFar: 400,           // metres: fully hazed
    dirtTint: [0.66, 0.76, 1.2],   // linear RGB multipliers: turns the dirt photo into brown berm dirt
    gravelTint: [0.9, 0.9, 0.92],
    woodTint: [0.72, 0.64, 0.56],  // pine furring strips, not bleached dowels
    // Rain (Setup -> 3D range -> Weather): overcast (sun / sky light / sky
    // backdrop x sun / env / bg; a grey `sky` backdrop by day), haze mixed toward `haze` and closing in to
    // hazeNear..hazeFar m, gravel darkened (x darken), and streaks as the
    // parking lot's (drops, area, speed, length, wind, opacity, colour).
    rain: {
      sun: 0.15, env: 0.45, bg: 1, haze: '#8a9098', hazeMix: 0.8, hazeNear: 10, hazeFar: 120, darken: 0.72,
      cardDarken: 0.78, cardRoughness: 0.8, // soaked cardboard
      steelDarken: 0.8, steelRoughness: 0.35, // wet painted steel
      // A round into wet ground: water droplets (colour, count, speed m/s, size m,
      // life s) and a thin mist instead of dust.
      splash: { color: '#c9d2da', drops: 26, speed: [1.5, 4], size: 0.009, life: 0.8, mist: '#aab4bc', mistSize: 0.45 },
      // Puddles: count flat ellipses (size m) scattered over area [x, depth] m.
      puddles: { count: 11, size: [0.3, 1.0], area: [11, 22], color: '#2e3134', roughness: 0.15, opacity: 0.7, reflect: 0.35 },
      sky: ['#5c636c', '#7a8189', '#a2a8ae'], // overcast backdrop, top to horizon (not at night)
      drops: 3500, area: [30, 36, 12], speed: 9, length: 0.4, wind: 0.6, opacity: 0.28, color: '#b8c2cc',
    },
    // Dot Torture sheet (3D): texture detail, and how far above the target's
    // centre it's stapled (m).
    dotSheet: { pxPerCm: 24, lift: 0.03 },
    // Wind (Setup -> 3D range): grass sway and paper flutter multipliers.
    winds: { calm: { grass: 0.3, flutter: 0.3 }, breezy: { grass: 1, flutter: 1 }, windy: { grass: 2.6, flutter: 4 } },
    weeds: { back: 900, side: 520, floor: 160, height: [0.2, 0.6], wind: 1 }, // dry grass tufts
    brass: 45,              // spent 9 mm cases lying on the bay floor
    gravelTile: 2.0,        // metres per gravel texture tile
    dirtTile: 3.0,          // metres per berm texture tile
    berm: { width: 44, depth: 9, height: 4.5, backZ: 28, lumps: 0.6, sideX: 7.5, sideLength: 34, sideStartZ: 3 },
    // Yardage markers down both sides of the bay (stake height m, sign w x h
    // m, x from the centre line, turn radians toward the shooter).
    markers: { yards: [5, 10, 15, 20, 25], x: 6.7, height: 0.6, sign: [0.3, 0.2], turn: 0.35 },
    // Stage props: plywood walls (w x h m, raised `lift` off the ground,
    // `thick` m, colour tint on the wood photo) and 55-gallon plastic barrels.
    // Swinger (stage paper with swing: { by }): hangs from a beam pivotY m up
    // (beam m wide), held `rest` radians to one side until its activator
    // falls, then a damped pendulum (period s, damping 1/s).
    swinger: { pivotY: 2.95, beam: 1.9, rest: 1.0, period: 2.5, damping: 0.16 },
    // Drop turner (stage paper with turn: { by }): edge-on until its activator
    // falls, then turns face-on in `time` s, stays `show` s and turns away
    // (a disappearing target: misses on it aren't penalised once it's been
    // activated). box = the turner's steel housing, w x h x d m. Turned more
    // than ~75 degrees from you (face . line of fire < edge) it can't be hit.
    turner: { time: 0.3, show: 1.0, box: [0.26, 0.22, 0.26], edge: 0.26 },
    // Activated mover (stage paper with run: { by, to }): its stand rides a
    // trolley on a timber rail (h x d m), up to `speed` m/s after `accel` s.
    trolley: { speed: 1.8, accel: 0.4, rail: [0.06, 0.1] },
    // Bobber (stage paper with bob: { by }): sunk `drop` m out of sight
    // behind low cover; once released it rises in `rise` s, stays `up` s,
    // sinks and waits `down` s, `times` times, then stays down.
    bobber: { drop: 1.0, rise: 0.25, up: 0.9, down: 0.8, times: 3 },
    // Activated pop-up (stage paper with pop: { by }): lies back `down` rad on
    // its hinge until released, then springs up in `rise` s (bounce: overshoot).
    popUp: { down: 1.5, rise: 0.3, bounce: 0.06 },
    // Activators (a popper for a swinger or turner) release it by a cable as
    // they fall: this many seconds after the hit.
    activateDelay: 0.3,
    // Stages with shooting positions: you run between them at `speed` m/s
    // (at least `min` s).
    move: { speed: 3.5, min: 0.8 },
    // Walk the targets (I, after a run): the camera takes `time` s to walk up
    // to each paper, framing `frame` x the target's height, standing `raise`
    // x that frame higher (so the target sits below the label at the top).
    inspect: { time: 1.2, frame: 1.5, raise: 0.05 },
    // Clamshell (drop-down cover): a plywood panel w x h m on a steel hinge
    // bar at its foot (`lift` m up), standing in front of a target; its
    // activator drops it flat toward you in `fall` s (bounce: rebound).
    props: {
      wall: { w: 1.22, h: 1.83, lift: 0.08, thick: 0.018, tint: [0.8, 0.78, 0.75] },
      barrel: { r: 0.29, h: 0.88, color: '#24569e' },
      clamshell: { w: 0.8, h: 1.85, lift: 0.05, fall: 0.7, bounce: 0.05 },
    },
    maxPixelRatio: 2,
    shadowIdleInterval: 0.25, // seconds between shadow redraws when nothing is moving
    // Slow frames (average over `frames`) above slowMs lower the render
    // resolution by `step`, down to minPixelRatio.
    adapt: { frames: 90, slowMs: 24, step: 0.25, minPixelRatio: 1 },
    farPxPerCm: 8,          // cardboard texture detail for targets past 7 yards (close ones: 12)
    // Pop-ups: lanes from CONFIG.popup.lanes spread over `spread` metres, hinged
    // at hingeY behind a dirt mound whose crest is crestAhead in front of them.
    popup: { spread: 8, hingeY: 0.55, moundHeight: 0.7, moundDepth: 1.2, crestAhead: 0.25, downAngle: 1.75, pxPerCm: 8 },
    steel: {
      paint: '#e9e6dc',     // target paint
      frame: '#64615c',     // weathered steel frames and stands
      splashCm: 6,          // lead splash left on the paint by a hit
      resetDelay: 2.5,      // free practice: seconds after the last one falls before it all resets
      // 8" plates on 12" centres; paddle = hinge to plate centre (m); kick = rad/s a hit gives;
      // fallTo = angle (rad) where it lands on the stop bar / ground.
      rack: { plates: 6, spacing: 0.3048, plateRadius: 0.1016, beamY: 0.95, paddle: 0.22, kick: 3.0, fallTo: 1.3 },
      // Dueling tree: `paddles` square paddles (paddle m) on arms `arm` m long,
      // hinged `gap` m apart down a post `height` m tall (the first `top` m
      // below its top); each rests `rest` rad from vertical, swings over in
      // `swing` s and bounces `bounce` rad off the stop.
      tree: { paddles: 6, paddle: 0.15, arm: 0.42, gap: 0.24, height: 1.9, top: 0.12, post: 0.07, rest: 1.0, swing: 0.32, bounce: 0.07 },
      // holdBelow: a hit on the bottom this share of a popper's height doesn't
      // knock it over (below the calibration zone: it rocks, rings, stays up,
      // scores a miss); wobble: that rock (radians, s, rad/s, 1/s).
      popper: { count: 4, spacing: 1.5, height: 1.07, kick: 1.2, fallTo: 1.52, holdBelow: 0.3,
        wobble: { angle: 0.05, time: 0.9, freq: 22, damping: 5 } },
      star: { hubY: 1.5 },  // hub height (m); arm and plate sizes and the physics are CONFIG.star
      mini: { height: 0.71 },                         // USPSA mini popper (2/3 scale)
      // A single plate on a post (8" unless a stage item sets in: inches); a
      // stop plate has a red pole (stopPole m tall, stopPoleX m to its right).
      plateStand: { height: 0.95, paddle: 0.2, fallTo: 1.45, stopPole: 1.8, stopPoleX: 0.3, stopColor: '#b3261e' },
    },
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
    // Setup sliders: gunshot and background volume, as a multiple of normal.
    mix: { min: 0, max: 2, step: 0.05 },
    // Hearing protection (Setup -> Sound): what you hear through it. Electronic
    // muffs: a narrow band (highpass / lowpass Hz), loud bangs clamped by a
    // fast limiter (clamp: threshold dB, attack / release s; the browser adds
    // its own make-up gain, so `gain` brings it back: a shot ~4 dB under no
    // protection, quiet sounds ~6 dB up). Passive muffs or plugs: muffled
    // and quieter.
    earPro: {
      electronic: { highpass: 140, lowpass: 6500, clamp: { threshold: -18, attack: 0.0005, release: 0.12 }, gain: 0.65 },
      passive: { lowpass: 900, gain: 0.5 },
    },
    steelHz: 2350,          // base pitch of the steel "ping"
    // Steel rings by size: steelHz is an 8" plate (ref, metres). A plate r times
    // that size rings at steelHz / r^pitch for r^decay times as long (thicker
    // big steel keeps this gentler than thin-plate physics' r^2). r is clamped
    // to `range`. A popper rings like a plate popperSize x its height.
    // On the 3D range the ring comes from where the steel is: it arrives
    // distance / speed s late (sound at ~343 m/s: 25 yd is ~70 ms), is
    // quieter past `near` m ((near / distance)^falloff), and is panned left
    // or right by where the plate is on screen (pan = the far edge).
    steelRing: { ref: 0.2032, pitch: 1, decay: 0.7, range: [0.5, 2.5], popperSize: 0.4, speed: 343, near: 7, falloff: 0.5, pan: 0.7 },
    indoorEcho: 0.9,        // seconds of room echo on gunshots indoors (office)
    indoorEchoMix: 0.45,    // echo level relative to the shot
    // Fire alarm horn (office option): the standard evacuation pattern ("temporal
    // three": on/off times in s, repeating), a harsh electronic horn tone.
    // Scales with the Background volume slider.
    alarm: { level: 0.2, hz: 520, pattern: [0.5, 0.5, 0.5, 0.5, 0.5, 1.5] },
    rain: 0.55,             // recorded rain loop in the parking lot (Rain option), x Background volume
    // People in the office and judgment scenes cry out when hit (recorded CC0
    // voices, a woman's set for women) and groan as they go down: delay s
    // after the hit; full loudness within nearFull metres.
    hitCry: { delay: 0.12, nearFull: 4, downDelay: 0.45 }, // downDelay: s after the fall starts (groan)
    // Recorded sounds (web/assets/sounds, credits in CREDITS.md), layered with
    // or replacing the generated ones; the generated sound plays if a file
    // hasn't loaded. Levels are relative to CONFIG.sound.volume.
    samples: {
      enabled: true,
      steel: 0.55,        // real metal clank at the moment of a steel hit (the ring is generated)
      steelFall: 0.7,     // heavy metal clunk as falling steel hits its stop or the ground
      step: 1.3,          // concrete footsteps (knife attacker)
      glass: 0.9,         // glass impact under the generated shatter
      outdoorTail: 0.5,   // real pistol report + echo under your shot outdoors
      recordedShot: 1.4,  // the real pistol report alone (Sound choices: R), into the gunshot compressor
      ricochet: 0.8,      // a suspect's near miss ricocheting beside you (office), x Gunshot volume
      voice: 1.1,         // the knife attacker's yells and grunts
      distantShot: 0.35,  // range ambience: shots from other bays
      rateJitter: 0.08,   // +- playback speed so repeats don't sound identical
    },
    // Background sound per 3D scene (quiet, under the shots): the outdoor
    // range has a recorded early-morning field recording (birds, air;
    // generated wind until it loads) and now and then a distant shot from
    // another bay; the office an air-handling hum; the parking lot distant
    // traffic and wind.
    ambience: {
      level: 0.35,          // overall (x volume)
      rangeBed: 0.8,        // the range recording, x level
      fade: 1.5,            // seconds to fade in / out when the scene changes
      distantShots: [3, 14], // seconds between distant shots at the range
    },
    // Gunshots (suspects firing): a crack, a low thump and a deep falling boom,
    // compressed for punch. Saturation adds harmonics so tablet and laptop
    // speakers can reproduce the low end.
    gunshot: {
      level: 2.6,           // overall loudness (x volume)
      yourShot: 0.75,       // your own shots, relative to a suspect's
      crack: 2.2,           // sharp high crack
      thump: 1.3,           // muffled low noise body
      boom: 1.2,            // deep tone sweeping boomFrom -> boomTo Hz
      boomFrom: 120, boomTo: 42, boomTime: 0.45,
      drive: 3,             // saturation of the boom
    },
  },

  // ---- Storage keys (browser localStorage) --------------------------------
  storage: {
    settings: 'ldfs.settings.v1',
    calibration: 'ldfs.calibration.v1',
    log: 'ldfs.log.v1',
    stages: 'ldfs.stages.v1', // your own stages (builder.js)
    bests: 'ldfs.bests.v1',   // personal best per course (hit factor or time)
  },

  // ---- Stage builder (builder.js) ------------------------------------------------
  // New stages start from `starter`; x across (m, left negative) up to maxX,
  // distance within `yards`; maxShots = 2 per paper + steel + spareRounds.
  builder: {
    par: 10, maxX: 5, yards: [3, 30], spareRounds: 8, maxRun: 10, // a position row: up to maxRun yd forward
    // Start positions offered (the stage briefing's "Start" line).
    starts: [
      'standing in the box, hands relaxed at your sides',
      'standing in the box, wrists above your shoulders (surrender)',
      'standing in the box, gun held at low ready, finger off the trigger',
      'standing in the box, loaded gun on the table, hands at your sides',
      'seated on the chair, hands flat on your thighs',
    ],
    starter: [{ type: 'paper', x: -2, yd: 7 }, { type: 'paper', x: 2, yd: 7 }, { type: 'popper', x: 0, yd: 12 }],
  },
};
