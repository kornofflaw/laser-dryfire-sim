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

  // ---- USPSA stage scoring (stage courses: paper + steel) ---------------------
  // Best `perPaper` hits on each paper count; each missing hit, and each steel
  // left standing, is a miss (missPenalty). No-shoot hits are CONFIG.points.NS.
  // Stage points never go below zero. Hit factor = points / time.
  stage: { perPaper: 2, missPenalty: -10 },

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
    muzzleLight: 5,        // a suspect's muzzle flash lights up the room this much (candela) for a moment
    muzzleLightRange: 5,   // metres
    // Each shot a suspect fires: a puff of gun smoke from the muzzle that
    // drifts up and fades, and a brass case thrown out to the right that
    // bounces and stays on the floor until the next run.
    gunSmoke: { time: 1.8, size: [0.18, 0.95], rise: 0.3, opacity: 0.8 },
    casing: { speed: [1.6, 2.6], up: [1.0, 1.8], bounce: 0.32 },
    // A miss that passes within nearMiss metres of a suspect's chest: behind
    // a cubicle he ducks (and doesn't fire) for duckTime seconds, then comes
    // back up; out in the open he sidesteps away from the round.
    dodge: { nearMiss: 0.8, chance: 0.85, duckDepth: 0.75, duckDown: 0.18, duckTime: [1.0, 1.8], stepDist: 0.8, stepTime: 0.35 },
    ceilingShadowLight: 0.6, // soft top-down light that grounds people indoors
    partitionHeight: 1.15,  // metres; low cubicle walls (people show from the chest up)
    callTime: 6.0,          // seconds outside while the radio call plays
    lookAround: 0.12,       // radians of slow left-right scanning in the office
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
    },
    // A suspect who fires often fires again quickly: that round misses (a
    // ricochet off the wall beside you) and doesn't count as a hit on you.
    // chance per shot; delay s after the first; ricochetAfter s after the report.
    followUp: { chance: 0.5, delay: [0.22, 0.45], ricochetAfter: 0.05 },
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
    checkFrames: 90,        // frames averaged before dropping effects
    slowMs: 30,             // average frame time above this drops AO, then bloom
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
    react: { delay: [0.1, 0.35], cower: [2.5, 4.5], turn: 0.6 },
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
    yards: { paper: 5, popup: 10, star: 10, plates: 10, poppers: 12, movers: 8, grid: 5 },
    yardsRange: { paper: [3, 25], popup: [5, 25], star: [5, 25], plates: [5, 25], poppers: [5, 25], movers: [5, 25], grid: [3, 20] },
    aimY: { paper: 1.4, popup: 1.15, star: 1.5, plates: 1.1, poppers: 0.8, stage: 1.15, movers: 1.3, grid: 1.25 },
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
    },
    cardboardRelief: 0.25,  // strength of the corrugation / fibre normal map
    hazeColor: '#c9d3dc',
    hazeNear: 40,           // metres: haze starts
    hazeFar: 400,           // metres: fully hazed
    dirtTint: [0.66, 0.76, 1.2],   // linear RGB multipliers: turns the dirt photo into brown berm dirt
    gravelTint: [0.9, 0.9, 0.92],
    woodTint: [0.72, 0.64, 0.56],  // pine furring strips, not bleached dowels
    weeds: { back: 900, side: 520, floor: 160, height: [0.2, 0.6], wind: 1 }, // dry grass tufts
    brass: 45,              // spent 9 mm cases lying on the bay floor
    gravelTile: 2.0,        // metres per gravel texture tile
    dirtTile: 3.0,          // metres per berm texture tile
    berm: { width: 44, depth: 9, height: 4.5, backZ: 28, lumps: 0.6, sideX: 7.5, sideLength: 34, sideStartZ: 3 },
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
      popper: { count: 4, spacing: 1.5, height: 1.07, kick: 1.2, fallTo: 1.52 },
      star: { hubY: 1.5 },  // hub height (m); arm and plate sizes and the physics are CONFIG.star
      mini: { height: 0.71 },                         // USPSA mini popper (2/3 scale)
      plateStand: { height: 0.95, paddle: 0.2, fallTo: 1.45 }, // single 8" plate on a post
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
    steelHz: 2350,          // base pitch of the steel "ping"
    // Steel rings by size: steelHz is an 8" plate (ref, metres). A plate r times
    // that size rings at steelHz / r^pitch for r^decay times as long (thicker
    // big steel keeps this gentler than thin-plate physics' r^2). r is clamped
    // to `range`. A popper rings like a plate popperSize x its height.
    steelRing: { ref: 0.2032, pitch: 1, decay: 0.7, range: [0.5, 2.5], popperSize: 0.4 },
    indoorEcho: 0.9,        // seconds of room echo on gunshots indoors (office)
    indoorEchoMix: 0.45,    // echo level relative to the shot
    // Fire alarm horn (office option): the standard evacuation pattern ("temporal
    // three": on/off times in s, repeating), a harsh electronic horn tone.
    // Scales with the Background volume slider.
    alarm: { level: 0.2, hz: 520, pattern: [0.5, 0.5, 0.5, 0.5, 0.5, 1.5] },
    rain: 0.55,             // recorded rain loop in the parking lot (Rain option), x Background volume
    // Recorded sounds (web/assets/sounds, credits in CREDITS.md), layered with
    // or replacing the generated ones; the generated sound plays if a file
    // hasn't loaded. Levels are relative to CONFIG.sound.volume.
    samples: {
      enabled: true,
      steel: 0.55,        // real metal clank at the moment of a steel hit (the ring is generated)
      step: 1.3,          // concrete footsteps (knife attacker)
      glass: 0.9,         // glass impact under the generated shatter
      outdoorTail: 0.5,   // real pistol report + echo under your shot outdoors
      recordedShot: 1.4,  // the real pistol report alone (Sound choices: R), into the gunshot compressor
      ricochet: 0.8,      // a suspect's near miss ricocheting beside you (office), x Gunshot volume
      distantShot: 0.35,  // range ambience: shots from other bays
      rateJitter: 0.08,   // +- playback speed so repeats don't sound identical
    },
    // Background sound per 3D scene (quiet, under the shots): the outdoor
    // range has wind and now and then a distant shot from another bay; the
    // office an air-handling hum; the parking lot distant traffic and wind.
    ambience: {
      level: 0.35,          // overall (x volume)
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
  },
};
