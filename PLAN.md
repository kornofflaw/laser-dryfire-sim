# PLAN.md — Laser Dry-Fire Simulator

A single static web app (`web/`) on any OS: the webcam finds the IR laser dot,
a 4-point homography maps it to the screen, and the page scores it (USPSA
A/C/D + head zone), times it, and runs drills. The mouse feeds the same shot path.

> 2026-09-25: Moved from Python/OpenCV + Unity (macOS) to a browser-only app.
> The old code is in `archive/` for reference. Repo is public (fine).
> Hosted on Vercel: https://laser-dryfire-sim.vercel.app (see "Hosting" below).

---

## Phase 0 — End-to-end detection  ✅ done (Python/Unity version, live-tested)
- [ ] Re-verify on the rig with the web version (camera → calibrate → shots land
      where aimed).

## Phase 1 — Detection robustness
- [x] Shot timestamps: now one clock (performance.now + camera frame captureTime).
- [ ] Rapid-fire test: can the rig register a fast controlled pair? (pulse length
      vs. camera fps; the Setup panel shows the real fps)
- [ ] Check which browsers expose `captureTime` for the ELP camera (Chrome/Edge expected).

## Phase 1b — Mouse-and-keyboard mode  ✅ done (web)
- [x] Mouse click → same shoot() path as laser shots.

## Phase 2 — Training value
- [x] Zone scoring (A/C/D + head), single scoring path.
- [x] Drills: Free Run, Bill Drill, Mozambique, Par String; hit factor; PASS/FAIL.
- [x] Target ID on every scored shot (`score.targetId`).
- [x] Moving targets (Movers layout: PingPong / Crossing / SineWave) and pop-ups.
- [x] Course picker (D) with categories; Tab cycles courses.
- [x] More drills: Doubles, Head Box, Transitions 1-1-1 / 2-2-2 (left-to-right
      order enforced), El Presidente (dry), Pop-ups, Movers (hits within a
      round limit).
- [x] Texas Star: 5-plate steel spinner with real rigid-body physics (balanced
      until a plate falls, then swings/spins), steel ping, frame-hit sparks.
- [x] Dot Torture (50 rounds, stage by stage, wrong dot = dropped round).
      Sequence used: 1: 5 slow fire / 2: 5 draws x1 / 3-4: 4 draws 1+1 /
      5: 5 strong hand / 6-7: 3 draws 2+2 / 8: 5 weak hand / 9-10: 5 draws 1+1.
      Andrew to confirm it matches the version he shoots.
- [x] Pop-up targets: hinged cardboard targets that flip up from behind a mound,
      stay up for a limited time, drop when hit. Drills: Pop-up Reaction (10 x 1,
      2.5 s), Pop-up Pairs (6 x 2, 3 s), Pop-up Speed (12, 2.0 → 0.8 s). Also a
      free-practice layout (L).
- [x] Flip grid: steel frame with 4x3 square plates that spin about a vertical
      axle (edge-on plates can't be hit). Courses: Flip Grid (15 single
      flashes, 1.6 s), Flip Grid Pairs, Numbered Grid 1–12 (shoot in order,
      par 12 s, wrong number = fail), Called Numbers (spoken call-out via browser
      speech, numbers reshuffle after each hit). Also a free-practice layout (L).
- [x] Adjustable "time up" for flip-grid flash and pop-up courses: [ / ] keys
      or Setup → Current course slider (0.3–6 s), saved per course in the browser.
- [x] Photo-real 3D range for the Fundamentals courses (range3d.js): outdoor bay
      lit by a real HDRI sky, PBR gravel floor and dirt berms with dry grass,
      cardboard USPSA targets on 1x2 stakes in wooden stands, sun shadows. Holes
      are cut through the cardboard (you see the berm through them) with a
      bullet-wipe ring; hits jolt the target and throw paper chips, the round
      carries on into the berm and kicks dirt. Scoring maps the 3D hit back to
      the same USPSA shape (classifyUspsa). Setup → Current course: on/off and
      distance (3–25 yd, default 5). Free practice: L → "3D range" layouts.
- [x] 3D pop-ups and steel on the same range. With the 3D range on, every
      course whose targets exist in 3D uses it: Fundamentals, Transitions (3D
      bay), Pop-ups, Texas Star (range.js TO_3D). Pop-ups hinge up from behind
      a low dirt mound; their timing/state is still the PopupBank, so the drills
      are unchanged. The 3D Texas Star turns with the same star.js physics;
      hit plates fly off and land on the ground. Steel shows grey lead splashes
      where hit; frame hits throw lead fragments.
- [x] New steel courses (3D only): Plate Rack (six 8" plates, 10 yd, falls back
      onto the stop bar) and Poppers (four full-size poppers, 12 yd, tip over).
      Each target kind keeps its own distance (Setup → Current course).
- [x] Stages (3D): USPSA-style mixes of paper, white no-shoots and steel, each
      item at its own distance (courses.js STAGES, stage.js StageRunner):
      Paper and Steel, No-Shoots, Long Course. Mini Poppers (Steel). Stage
      score: best 2 hits per paper, -10 per miss (missing hit or standing
      steel) and per no-shoot hit, floored at 0; hit factor = points / time.
      Ends by itself when everything is engaged.
- [x] Life-size 3D (2026-09-26): Setup -> "Life-size 3D" with the projected
      image width and your distance from the screen; the camera's field of
      view is set so targets and people are their real size (all 3D scenes).
- [x] Movers in 3D (2026-09-26): two targets on stands slide along a timber
      track across the bay (0.9-2.2 m/s, turn at the ends), tip back when hit,
      and a fresh one comes on from a side; own distance slider. The Movers
      course uses it when the 3D range is on.
- [x] Flip grid in 3D (2026-09-26): a steel frame of square plates that spin
      on axles, mirroring the same FlipBoard as 2D (faces drawn by the same
      code, lead splashes, green/red hit flash); all five flip courses use it
      when the 3D range is on; own distance slider (default 5 yd).
- [ ] 3D range next: more stages (hard cover, swingers, a stage builder).
- [ ] Draw-to-first-shot timing (first shot is measured from the beep today).

## Phase 2b — Judgment (shoot / no-shoot) scenarios, ≤10 s each
Built 2026-09-25 as code-drawn people (no image files) in an indoor room.
- [x] People with poses: back turned / empty hands / gun / phone / wallet /
      hands up. Only a visible gun is a threat; poses change on a timeline.
- [x] 9 templates in scenarios.js, randomized every run: Turn and Reveal, Pick
      the Threat, Crowd, Surrender, Bystander in Front, Moving Threat, All Clear,
      Late Reveal, Two Threats. Plus "Random Scenario".
- [x] ScenarioRunner grades every shot against the pose AT THAT MOMENT:
      no-shoot hit (-10), premature, shot after surrender, threat not stopped;
      reaction time = gun appears → first hit. 2 hits put a threat down.
- [x] Results panel + log columns (type, reaction_s, no_shoot, notes).
- [x] Parking Lot: Knife Attack. Man with a knife 27–33 ft away; after 2.5–7 s
      he charges (4–5 m/s² to 5.8–7 m/s; ~1.8 s to cover 27 ft). True
      perspective, running animation, footsteps. Head hit or 2 body hits stop
      him (momentum carries him a bit). Reaching 0.9 m = STABBED. Firing before
      he charges = premature (fail). Logs charge→first shot and stop distance.
      Open question for Andrew: on-screen size assumes a generic projector
      field of view (config.knife.focalFrac); calibrate to life-size later?
- [x] 3D version (first realistic-3D test, three.js): "Parking Lot: Knife
      Attack (3D)". Lit dusk parking lot (photographic sky lighting, textured
      asphalt with worn paint, lamp spotlights, store front, parked cars with
      real reflections and shadows) and a rigged human with retargeted Mixamo
      idle/run animation holding a knife. Same rules as the 2D version. Hits are
      ray-cast against the animated body; zone from the nearest bone.
      Parked cars 0-16 selectable in Setup (default 6); cars don't cast
      real-time shadows (baked contact shadows) and distant cars drop interior
      parts. ~1.1M triangles / ~370 draw calls at 6 cars, 33k with none.
- [x] 3D hit reactions by body area (head snaps back, chest knock-back + twist,
      gut doubles over, arm flung, leg buckles with hip drop); non-stopping hits
      slow him (legs most). Stopped: knees buckle, then he falls forward.
      Blood: wound stains that ride on the body, droplet spray (exit + back
      spatter) with gravity, red mist, drops on the asphalt. Setup toggle.
      Next if Andrew likes it: better character (casual clothes, a proper
      "charge with knife raised" animation, fall/death clip), varied car models,
      then convert other scenes.
- [x] Active Shooter: Office Building (3D). Radio call outside a glass office
      building, walk-in on a camera path (sliding doors, lobby with a wounded man
      in a blood pool = no-shoot, hallway), cubicle office with private offices.
      2-3 gunmen pop up from cubicles or step out of offices and fire after
      1.6-2.4 s if not stopped (you're shot = fail); 1-2 office workers with
      hands up (no-shoots); then a hostage-taker walks a hostage into the aisle,
      pistol to the head, 7 s to make the shot. Randomized every run.
      Characters: reusable char3d.js (retargeted clips, IK poses: aim, hands up,
      hostage hold; reactions, falls, blood, pistol with muzzle flash).
      Limitation: one character model (the RPM man) for every role, varied by
      clothing colour; the Mixamo woman model didn't retarget cleanly.
- [ ] Ideas: threat that shoots back after N seconds (time pressure), cover /
      partial exposure, verbal-command audio cues, more rooms.

- [x] Realistic people (2026-09-25): Microsoft Rocketbox avatars (MIT) with
      motion-captured clips, converted with Blender by tools/rocketbox_to_glb.py
      (people3d.js). Judgment scenarios in 3D (judge3d.js): with the 3D option
      on, every 2D scenario script (Turn and Reveal, Crowd, Surrender, ...) is
      played by real-looking people in the 3D parking lot (turned away, phone
      call, wallet held out, pistol aimed, hands up, walking; hit reactions,
      blood, falls). Same scripts and grading as 2D. The office scenario uses
      the same people (gunmen in street clothes, office staff, hostage).
- [x] Knife attacker in the 3D lot is a realistic person too (Character:
      angry idle, sprint, world-space hit reactions, falls forward when
      stopped). The old Ready Player Me / Mixamo files are removed.
- [x] Office realism pass 1: interior kit (interior3d.js: carpet tiles,
      acoustic ceiling + troffers, drywall, fabric cubicles, workstations with
      live screens and task chairs, real framed doors with vision panels and
      lever handles that swing open, glass office fronts with a frosted band,
      windows with blinds and a city view, whiteboard, clock, copier,
      extinguisher, plants); ambient occlusion + bloom + SMAA (post3d.js);
      interior reflections (RoomEnvironment). Suspects now aim 3-4.5 s
      (counted from fully in view) before firing.
- [x] Office pass 2 (Andrew's list, 2026-09-25): breakable glass office
      fronts (shards fall and stay; the round carries on through); more
      plants; suspects and staff at random spots each run, some staff flee,
      some suspects walk toward you while aiming; one suspect with a rifle,
      one in a plate carrier (chest hits stop, flinch + thud, go for the
      head or pelvis); suspects keep firing every 1.6-2.6 s and you survive
      up to 3 hits ("HIT 1 OF 3" flash, red edges, "YOU'RE DOWN"); the man
      in the lobby is alive, reaching up and calling for help (spoken); Setup
      -> Office scenario options (gunmen, staff, time before they fire,
      hits you can take, rifle, armour, hostage, fleeing, victim voice).
- [x] Flip grid pass (Andrew, 2026-09-25): nicer plates (bevelled steel,
      painted faces, visible plate edge and shading while spinning, axle caps);
      new course Called Shapes & Colours (a voice calls "Blue", "Star" or
      "Red triangle"; shoot a matching plate); Setup -> Flip speed (0.5x-2x:
      spin and pace) and Variable timing (each time up and pause varies).
- [ ] More realism: post-processing (ambient occlusion, bloom), more
      environments (street, store interior). (Done: pistol draw from the hip,
      faces: blinks, eyes follow you, angry / afraid brows, talking jaw.)

## Phase 3 — Review & analytics
- [x] Per-run log (points, zones, splits, hit factor, pass, early shots) with CSV export.
- [x] Shot review (V) after any course: all shots numbered on the final frame,
      or shot by shot on the frame at that moment (2D: captured at the instant
      of the shot; 3D: right after the next render), list with time (from the
      beep / charge / start), split, zone, points, and a timeline. Last 5 runs
      kept in memory (not saved across page reloads).
- [ ] Post-session summary screen from the log.
- [ ] Trend view across sessions.

## Phase 4 — Hosting / packaging
- [x] iPad study (docs/IPAD.md): runs in Safari as is (iPadOS 17+ supports the
      USB camera via getUserMedia). Touch fixes done: audio unlock on tap end,
      Start button doubles as Stop, screen wake lock, Add to Home Screen manifest.
- [x] iPad as remote control (Andrew's design): Controller window
      (controller.html) on the iPad screen, Display window (index.html?display)
      full screen on the projector/TV via Stage Manager, linked by a
      BroadcastChannel (remote.js). Display does everything; Controller sends
      commands, mirrors timer/results/Setup, and plays the Display's sounds.
- [ ] Test the two-window setup on the real iPad + hub + projector (steps in
      docs/IPAD.md). Plan B if Safari windowing is a problem: native wrapper
      app with a true external-display window.
- [ ] Offline support (service worker) if the range PC / iPad has no internet.
- [x] Hosting: Vercel project `laser-dryfire-sim` (root directory `web/`, no build),
      production deploys from `main`.
- [ ] Test on a clean machine: camera permission prompt, fullscreen on the projector.

---

## Hosting
- **Vercel**, project `laser-dryfire-sim` (Hobby plan, account kornofflaw), linked to
  this GitHub repo. Root directory `web/`, no framework, no build command.
- Production URL: https://laser-dryfire-sim.vercel.app. Pushing to `main`
  deploys production; other branches get preview URLs.
- Vercel Authentication is ON (the default): only people logged in to the
  kornofflaw Vercel account can open the site. To share it with anyone else,
  turn it off in Vercel → project → Settings → Deployment Protection.
- Why not GitHub Pages: the repo stays private (Pages would need GitHub Pro), and
  the account's user site has the custom domain kornofflaw.com, so Pages would
  put the simulator at kornofflaw.com/laser-dryfire-sim.

---

## Audit findings — 2026-09-24 (status after the web port)
1. ~~Flat-points hits skip `ShotScored`.~~ Gone: every target uses zone scoring.
2. ~~Early shots are silently dropped.~~ Fixed: counted and shown as
   "Jumped the beep", and logged as `early_shots`.
3. ~~SessionLogger logs too little.~~ Fixed: new log has points, zones, splits, HF.
4. ~~Frame jitter / two clocks.~~ Fixed: one clock.
5. ~~Duplicate reset handling (GameHUD).~~ Gone with Unity.
6. ~~Target reaction for scenario people.~~ Done: threats drop after 2 hits.

## Open questions / risks
- 3D assets: Rocketbox people and clips (MIT), the car (CC BY 4.0, credit
  required), Poly Haven skies (CC0), Babylon.js range textures (CC BY 4.0);
  see web/assets/3d/CREDITS.md. Fine for a personal trainer; revisit before
  any commercial use (keep the CC BY credits visible).
- 3D performance: Andrew's live test (2026-09-25) of the 3D range, pop-ups and
  steel ran smoothly. Headless software rendering is not representative (the
  3D range runs about 1-2 s/frame there). Still to check: iPad.
- Laser pulse duration vs. camera fps (gates rapid-fire detection). Browsers
  typically give 30–60 fps.
- Camera auto-exposure/gain can't be locked from the browser on every OS; if the
  dot is washed out, set exposure with the OS's camera settings tool.
- Lens distortion: the homography fixes perspective, not barrel distortion.
- Reflections on a glossy screen can look like shots (maxBlobArea helps).
- Browser log/settings/calibration are per-browser; download the CSV to keep it.

## Sounds Andrew rejected as unrealistic (2026-09-27)
Heard with the recordings switched off (generated sounds only). Don't use these
as the only sound; the recordings (web/assets/sounds) stay on. They remain only
as the fallback CLAUDE.md rule 7 requires if a file fails to load.
- Your gunshot outdoors without the recorded report/echo (crack + thump + boom only).
- Steel: the generated ring alone, without the recorded clank.
- Footsteps: the generated heel-thump + scuff (knife attacker).
- Glass: the generated crack + tinkle alone.
- Range distant shots: low-passed noise bursts.
Still liked: the deeper gunshot synth underneath (Andrew: "gunshots are deeper").
Direction (confirmed 2026-09-27: recorded versions all preferred): realism comes from recordings; new sounds should start from a free
recording (with credits) rather than pure synthesis.

## Range & drills realism queue (hourly pass takes the top item; focus since 2026-09-27)
Andrew: "shift focus to the drills and shooting range type stuff, we want that
all to be refined... more realism". Office / knife / judgment scenes only when
he reports a problem.
2. Steel: plates and poppers get fresh paint (white) when reset, lead splashes build up during a run; a popper that's hit low on the base doesn't fall (calibration zone).
3. Bay props for stages: wooden walls / barricades with ports, barrels, a fault line and shooting box where you'd see them.
4. Target marking: printed perforation-slit zone lines and the small USPSA logo on the cardboard; slight weathering on older targets.
5. Range sounds from recordings only: steel ring on far plates, bullet hitting the berm (thud) - check the CC0 sets first.

## Realism queue (office / lot / judgment - paused; hourly pass takes the range queue first)
1. Office fire alarm: swap the generated horn for a free recording if Andrew doesn't like it.
2. 3D range: sharper morning/evening skies (2k gain-map HDR JPGs need the gain-map decoder library vendored) and a sun-ahead glare option (needs a sky photo with no buildings on the sun side).
3. Parking lot: saloon cars with side windows that shatter (tempered glass) - the parked cars are open roadsters (windshield only).
4. Judgment scenes: a real crouch animation (Rocketbox / mocap clip) instead of sinking behind the car.
5. Office sounds: your car door, radio chatter while you walk in, sirens arriving during the fight - blocked: no realistic free recordings found yet (the CC0 sets have only arcade-style sirens; Andrew rejected generated sounds).
6. Office: photo-scanned textures (CC0, Poly Haven / ambientCG) - those sites are blocked in this cloud environment; possible once Andrew allows dl.polyhaven.org / ambientcg.com in the environment's network settings.
7. Office: a suspect who leans out around a door frame or pillar to shoot (needs a lean/crouch animation clip; the current peeker pops up over waist-high cover).

---

## Changelog
- Phase 0 complete (Python/Unity) — live tests passed, shots land where aimed.
- Phase 1: shot timestamps wired end-to-end.
- Phase 2: zone scoring, DrillRunner + drill HUD, head zone → Mozambique.
- 2026-09-24: PLAN.md rebuilt. Audit → findings above. Judgment scenarios designed.
- 2026-09-24: Complete code set consolidated (7 Python + 11 Unity scripts).
- 2026-09-25: Moved to a git repo for Claude Code. Added CLAUDE.md, README.md, .gitignore.
- 2026-09-25: Rebuilt as a browser app in `web/` (any OS, no install): mouse +
  webcam laser input through one shoot() path, in-browser detection with
  threshold tuning preview, guided 4-point calibration with validation, bay /
  pop-up / mover layouts, shot timer, 4 drills, PASS/FAIL + hit factor, early-shot
  flag, CSV run log. Python + Unity code moved to `archive/`.
- 2026-09-25: Deployed to Vercel (laser-dryfire-sim.vercel.app), auto-deploys from main.
- 2026-09-25: Office realism pass 1 (interior3d.js, post3d.js), fairer fire timing.
- 2026-09-25: Office pass 2: breakable glass, rifle + body-armour suspects,
  survive 3 hits, random positions, fleeing staff, living victim, Setup options.
- 2026-09-25: Flip grid: nicer plates, Called Shapes & Colours course, flip
  speed and variable timing options.
- 2026-09-25 (hourly review): 3D people draw the pistol from the hip instead
  of snapping to aim; fixed arms staying stuck in a pose (the animation mixer
  skips bones whose clip value didn't change, so IK leftovers stuck); the
  lobby victim no longer talks over the dispatch call; cancelling the office
  run stops any speech.
- 2026-09-25 (hourly review): office gunfire is more real: a suspect's muzzle
  flash briefly lights the room around him, and shots echo off the walls
  (WebAudio convolver). The wounded man's first line waits for the radio.
- 2026-09-26 (hourly review): faces on 3D people (Rocketbox face bones): they
  blink, their eyes follow you, armed people frown, hostages / hands-up /
  the wounded man look afraid (brows up, mouth open), and the wounded man's
  jaw moves while he talks. Checked the iPad Controller mirrors the new flip
  and office settings.
- 2026-09-26 (hourly review): office speed-up: everything that never moves is
  merged into one mesh per material (interior3d.js mergeStatic; door leaves
  merged inside their swinging pivot). Draw calls per frame 3519 -> 247
  (6059 -> 441 with ambient occlusion); the picture is unchanged.
- 2026-09-26 (hourly review): parking lot speed-up: lighter car models made in
  Blender (tools/car_lods.py): car_mid.glb (170k triangles, interior kept)
  for the nearer cars, car_lod.glb (62k, no interior) beyond 14 m; the
  359k-triangle source is no longer loaded. 16 cars: 3.4M -> 1.1M triangles
  per frame, same look. Removed a duplicated config key (carDetailDist).
- 2026-09-26 (hourly review): smoke test of every course. Fixed: in the 3D
  Surrender scenario the page threw every frame once the person surrendered
  (copying the pistol to drop it also copied a link back to the person,
  which can't be serialized), so the scene froze. The gun now drops.
- 2026-09-26 (hourly review): smoke test of every course in 2D, fake-camera
  start/stop and calibration maths: all fine. Realism: hitting a person no
  longer plays the range "ding" (the person's reaction is the feedback; the
  no-shoot buzz stays); your own shots echo in the office.
- 2026-09-26 (hourly review): long sessions: GPU memory no longer grows run
  after run in the 3D scenes. People now free what they own when removed
  (skeleton textures, gun, vest, props, wound stains); the office frees its
  blood pool, glass shards and dust (one shared dust texture). Office
  textures level off instead of +10 per run; knife attack flat.
- 2026-09-26 (hourly review): Life-size 3D option (Setup): field of view from
  the projected image width and your distance, so a target or person is its
  real size (checked: 10 cm at 5 yd = 30.1 px vs 30.2 expected). Also on the
  iPad Controller. Updated the licence note (Rocketbox, not RPM/Mixamo).
- 2026-09-26 (hourly review): 3D movers (range3d.js buildMovers /
  updateMovers, CONFIG.range3d.movers, layout 'range3d-movers').
- 2026-09-26 (hourly review): 3D flip grid (steel3d.js FlipGrid3D, layout
  'range3d-grid'). Only the painted face of a face-on plate counts; edge-on
  plates let rounds past, like 2D.
- 2026-09-26: iPad sound fix (Andrew: no gunshots on iPad): ask Safari for
  'playback' audio (navigator.audioSession) so silent mode doesn't mute it,
  play a silent sample on the tap that starts audio, and resume after the
  screen locks / another app interrupts. Older iPadOS (no audioSession): a silent
  looping <audio> clip made in code switches the page to playback audio.
  (Andrew: the flip-grid voice was audible, the effects weren't: speech is
  media playback, web audio was ringer-class and muted by silent mode.)
  Audio also starts on any click or key press (iPad + Magic Keyboard trackpad).
  Then the flip-grid voice went quiet on iPad: speech is now primed with a
  silent utterance on the first gesture, not cancelled unless something is
  speaking (and spoken 60 ms after a cancel), resumed if paused, and the
  utterance is kept referenced. Needs Andrew's iPad test.
- 2026-09-26: Deeper gunshots (Andrew: tinny). New synth: crack + low-passed
  thump + saturated falling boom (120->42 Hz), compressed (CONFIG.sound.gunshot).
  Energy moved from <100 Hz (inaudible on iPad speakers) + hiss into 100-300 Hz;
  no more clipping. Your own shots use it too (75% level) instead of the pop.
- 2026-09-26 (realism pass): bullet holes stay where rounds hit walls, desks,
  door frames, windows, cars, the store and the ground in the office, parking
  lot and judgment scenes (holes3d.js; plaster / metal / glass-crack / ground
  looks, max 80, cleared each run). Fixed: shooting office glass before the
  first run threw (shards list not created yet).
- 2026-09-26 (realism pass): suspects' shots leave gun smoke at the muzzle and
  throw a brass case that bounces and stays on the floor (CONFIG.office3d
  gunSmoke / casing). Fixed: the ambient-occlusion pass drew see-through
  things (smoke, dust, decals) as dark squares; it now skips them (post3d.js).
- 2026-09-26 (realism pass): near misses make office suspects react: behind a
  cubicle they duck (and can't fire) for 1-1.8 s, in the open they sidestep
  away from the round (CONFIG.office3d.dodge). Fixed: suspects meant to
  advance on you barely moved (the walk-in lerp undid each step).
- 2026-09-26 (realism pass): the knife attacker charges with the blade up and
  ready (char3d 'knife' pose), raised by his head in the last 2.5 m
  (CONFIG.knife3d.strikeFrom). Footsteps now have a heel thump tablet
  speakers can play plus a shoe scuff (were a 90 Hz thud).
- 2026-09-26 (realism pass): hands-up people raise their hands apart (they were
  crossed over the head: the pose used the wrong side) and tremble; the
  office hostage pulls at the gunman's arm with both hands and twists
  against the hold (char3d 'held' pose, CONFIG.people).
- 2026-09-26 (realism pass): parking lot at night (Setup -> Night; knife attack
  and 3D judgment scenes): dark sky, sodium-orange street lights, lit store
  front, the nearest parked car with its headlights on (CONFIG.knife3d.night).
- 2026-09-26 (realism pass): Background sound per 3D scene (audio.js setAmbience, CONFIG.sound.ambience): range = gusting wind + a muffled shot from another bay every 3–14 s; office = air-handling roar + faint light hum; parking lot = wind + distant traffic rumble. Fades between scenes, silent on 2D courses, starts on the first tap (not forwarded to the Controller). Measured well below a gunshot (bed rms 0.008–0.044 vs shot 0.21).
- 2026-09-26 (realism pass): 3D range paper targets rock by where they're hit (CONFIG.range3d.jolt): off-centre hits twist the target, high hits push the top back more, a second hit adds to the swing, and a round through a stake rocks the whole target. Fixed: side hits used to swing the hit side toward the shooter (wrong sign).
- 2026-09-26: Real recorded sounds (Andrew approved audio files; CLAUDE.md rule 7 updated). web/assets/sounds (404 KB, CREDITS.md): ShotSpotter CC BY 4.0 real 9mm/.40/.45 shots with street echo -> under your shot outside the office and as the range's distant shots; Kenney CC0 metal clank on steel hits (generated ring kept), concrete footsteps for the knife attacker, glass impact under the shatter. Loaded after the first tap; generated sounds play if a file is missing (CONFIG.sound.samples). Still wanted: a close-range pistol shot from the shooter's position (Andrew's own range recording).
- 2026-09-26 (realism pass): steel rings by its size (CONFIG.sound.steelRing): 8" plates / Texas Star ~2.35 kHz, flip-grid plates ~1.9 kHz, mini poppers ~1.7 kHz, full poppers ~1.15 kHz, bigger ones ringing longer; the recorded clank is slowed to match. Size comes from the 3D steel's geometry (steel3d.js addItem size) via the shot's score.size.
- 2026-09-26: Sound sliders (Andrew): Setup -> Sound -> Gunshot volume and Background volume, 0-200% (CONFIG.sound.mix), saved in the browser, mirrored on the iPad Controller (which also plays forwarded sounds at these levels). Gunshots = every shot, yours and suspects', incl. the recorded echo; Background = wind / traffic / office hum / distant range shots, changes live. Andrew confirmed working (2026-09-27).
- 2026-09-27: Andrew: flip-grid voice works on iPad; gunshots deeper (good); didn't like the recorded sounds, so they are off (CONFIG.sound.samples.enabled = false; files kept in web/assets/sounds, nothing downloads). All sounds are generated again. Then: "It doesn't sound as good now, revert" -> recordings back on (enabled = true).
- 2026-09-27: Setup -> Sound choices (compare), Andrew's idea: each sound has labelled versions (R = recorded, G = generated, R+G = both) for gunshot (+ which recording: Take 1 .40 / Take 2 9mm / Take 3-4 .45), steel, footsteps, glass, distant shots, each with a Test button; saved per browser, mirrored on the Controller (audio.js setSoundChoices / distantShot). Defaults = the current mix. Waiting for Andrew to name the versions he likes; then make those the defaults.
- 2026-09-27: Andrew: "the recorded sounds are all better" -> every sound defaults to R (recorded only): gunshot (random take; indoors adds the room echo), steel clank, footsteps, glass, distant shots. Picks saved under a new key (soundPicks) so earlier test picks don't override; the Controller gets the picks in the state message. G versions stay as the fallback and in Setup to compare.
- 2026-09-27 (realism pass): office option "Fire alarm going" (Setup, also on the Controller; off by default): red horn-strobes on the lobby, hall, back and side walls flash together once a second (bright lens + a soft flash on the walls; the two flash lights are only created when the alarm is first used), and the horn sounds the standard evacuation pattern (3 blasts, pause) for the whole run, stopping on finish / cancel / leaving the office. Horn is generated (an electronic tone), scaled by the Background slider. CONFIG.office3d.alarm, CONFIG.sound.alarm.
- 2026-09-27 (realism pass): armed people's guns wander like a real hold (char3d.js updateAimPoint / swayOffset, CONFIG.people.aimSway): slow figure-eight sway + fine tremor, measured ~6 mrad mean / ~12 mrad max for pistols, rifles steadier, a gun held to a hostage's head only trembles. (Breathing, weight shifts and blinks were already there: the mocap idle clip plays under every pose, faces blink.) Test note: t22b's final hostage-taker head shot is timing-flaky in headless (misses ~half the time with or without this change: it aims from the last rendered frame); not a game bug.
- 2026-09-27 (realism pass): parking lot Rain option (Setup, next to Night; also on the Controller; knife attack + 3D judgment scenes): wet darker asphalt with glassy puddles (puddle roughness texture, flatter bumps), 4000 falling streaks around the camera, overcast sky by day (lighter fog at night), rippled lamp reflections on the wet ground between you and each lamp (knife3d.js setRain / updateRain, CONFIG.knife3d.rain), and a recorded CC0 heavy-rain loop (web/assets/sounds/rain_0.wav, 1.3 MB, loaded only when rain is on; CONFIG.sound.rain, follows the Background slider). Also: sound decoding no longer leaves an uncaught page error when a file can't be decoded (audio.js decode()).
- 2026-09-27 (realism pass): judgment-scene bystanders react to gunfire (judge3d.js startle, char3d.js 'cower' pose + flinchT; CONFIG.judge3d.react, CONFIG.people.flinch / cower): every shot (hit or miss) makes each standing person flinch after their own reaction time (0.1-0.35 s); people just standing, turned away or on the phone then cower (hunched, head down, arms over the head, trembling, afraid face, turned partly away) until 2.5-4.5 s after the last shot. Anyone showing a gun or wallet, or surrendering, keeps showing it (that's what's judged); walkers flinch and keep walking (the script moves them). Scoring unchanged (j3). Test note: screenshot these with a frozen performance.now and stepped renders (real-time waits in headless overshoot by seconds).
- 2026-09-27 (realism pass): 3D range Time of day (Setup -> Time of day, also on the Controller): Day (unchanged), Morning (Poly Haven spruit_sunrise sky: low warm sun behind you, long shadows) and Evening (Poly Haven blouberg_sunrise_2 sky, turned 90° so its city skyline stays out of view: low sun behind you, soft overcast). Sunlight direction is taken from where the sun is in each photo (brightest pixel; convention checked by rendering toward it). Sky photos load on first use. range3d.js setTime, CONFIG.range3d.times; credits in assets/3d/CREDITS.md.
- 2026-09-27 (realism pass): office near misses: after a suspect's shot (still counted as a hit on you, as before), half the time he fires a quick second round 0.22-0.45 s later that misses: muzzle flash + report, then a recorded ricochet (Warfork CC0, ricochet_0-1.wav) off the wall to your left or right (stereo pan). Follow-ups never count as hits, so difficulty is unchanged (CONFIG.office3d.followUp, CONFIG.sound.samples.ricochet; audio.js nearMiss with a generated crack fallback; playSample opts.pan).
- 2026-09-27 (realism pass): parked-car glass (knife attack + judgment scenes): a round through a windshield leaves a laminated-glass spiderweb (hole + radial cracks + rings, ~20 cm, holes3d 'windshield' kind, CONFIG.holes.windshield), throws glinting chips that tumble to the ground (CONFIG.knife3d.glassChips), and plays the glass sound (recorded glass hit); lamp lenses crack smaller. Before, car glass got a bare-metal bullet hole (its material isn't transparent, so it was treated as paint). Glass crack texture doubled to 128 px (sharper, also the office windows).
- 2026-09-27 (realism pass): the knife attacker has a voice (2D and 3D; knife.js, audio.js voice(), CONFIG.knife.voice, CONFIG.sound.samples.voice): a yell as he starts his charge and another at 3.2 m, a grunt 0.12 s after each body hit (light for the first, hard for the stopping hit), a groan as he goes down; a head shot drops him silently. Louder as he closes (full within 3 m). Recorded CC0 male voice from Warfork (voice_*.wav, 174 KB).
- 2026-09-27 (realism pass): people in the office and judgment scenes cry out when hit (audio.js hitCry; CONFIG.sound.hitCry): a grunt 0.12 s after the hit, harder with each hit on that person, a light one on body armour, none for a head shot; men and women get their own recorded CC0 voice (Warfork male / female sets; Character.sex from people3d CAST); loudness falls off beyond 4 m. Suspects, bystanders and hostages alike. Scoring unchanged (j3).
- 2026-09-27 (realism pass): ...and groan as they go down (audio.js downCry, CONFIG.sound.hitCry.downDelay 0.45 s): office suspects stopped by body hits, a hostage you hit, judgment-scene people the script drops; silent after a head shot; woman's groan for women (voice_f_death_0.wav). Fix: a judgment-scene person marked down by the script now always gets their fall - before, if no 3D frame was drawn within the script's 0.25 s fall time (a very slow machine), they vanished instead of falling.
- 2026-09-27 (realism pass): judgment-scene bystanders run for cover (judge3d.js runAway, CONFIG.judge3d.react.flee): after a shot, half of the people just standing / turned away / on the phone sprint sideways out of the scene (run clip, 3.5-5 m/s) instead of cowering, then are gone (unhittable). Never anyone the script still has plans for: ScenarioRunner marks each actor's moreScript (a later pose change pending), so a 'bystander' who reveals a gun later never runs off. Someone shot while running falls. Scoring unchanged (j3).
- 2026-09-27 (realism pass): ...to a parked car when one is within 14 m (judge3d.js coverPath / inCover, CONFIG.judge3d.react.flee.cover): they run round its near end to the far side, in line with you so the car hides them, crouch (sunk 0.6 m into the ground - the car hides the legs; there's no crouch clip) with hands over the head, and every 2-4 s rise to peek over it for a second, facing you. Cover you can see is preferred; one runner per car; none within reach -> they run off as before.
- 2026-09-27 (realism pass): office workers standing with raised hands at the cubicles duck behind the cubicle wall 0.15-0.4 s after any shot (yours or a suspect's), hands over their heads (cower pose, sunk 0.85 m), peek over every 2-4 s, and stand up with raised hands again 3-5 s after the last shot (office3d.js applyHide, CONFIG.office3d.hide). Grading unchanged (still no-shoots).
- 2026-09-27 (realism pass): your muzzle flash lights the parking lot (knife attack + 3D judgment scenes; knife3d.js flashMuzzle / updateMuzzle, CONFIG.knife3d.muzzle): every shot, hit or miss, a warm point light at your gun (0.2 m right, 0.3 m down, 0.6 m forward of your eyes) flashes for 60 ms. At night it briefly lights the attacker and the ground in front of you; by day it's lost in the daylight. Office queue item 'fleeing workers take cover' dropped: they already escape through the exit, the realistic outcome.
- 2026-09-25 (hourly review): Start is refused while a 3D range/scene is still
  loading (the run used to begin with no targets or people shown).
- 2026-09-25: Realistic people (Rocketbox, MIT) in the 3D judgment scenes
  (judge3d.js, people3d.js), the knife attack and the office scenario; Blender
  asset tool. Props held in hands at true size (attachProp). Fixed a
  duplicate knife3d.maxCars (the Setup max is 16).
- 2026-09-25: iPad remote control: Controller + Display windows (remote.js,
  controller.html/js/css), sound forwarding to the Controller (audio.js).
- 2026-09-25: Flip Grid Pairs is strict: a plate that spins back unhit ends
  the run as a FAIL (course field failOnMiss).
- 2026-09-25: Stages + Mini Poppers (stage.js). Efficiency pass on the 3D
  range: target textures 12 px/cm (was 22; ~3x less memory and upload per
  hit), batched fibre drawing, old layouts freed on course change, shared
  strike marks, shadows redrawn only while something moves, automatic
  resolution drop if frames are slow. iPad readiness (docs/IPAD.md).
  Hourly automated review scheduled.
- 2026-09-25: Live test passed: 3D pop-ups and steel all work, performance fine.
- 2026-09-25: 3D pop-ups, 3D Texas Star, Plate Rack and Poppers (steel3d.js);
  Transitions use the 3D bay; per-target-kind distances.
- 2026-09-25: Photo-real 3D range for Fundamentals (range3d.js, assets/3d/range).
- 2026-09-25: Shot review screen (review.js).
- 2026-09-25: 3D office active-shooter scenario (office3d.js, char3d.js).
- 2026-09-25: 3D hit reactions, knee-buckle fall, blood (wounds/spray/mist/drops).
- 2026-09-25: First 3D scene: parking-lot knife attack in three.js (vendored),
  on-demand loading. Rules updated: asset files allowed with credits.
- 2026-09-25: Flip grid target + 4 flip-grid courses.
- 2026-09-25: Adjustable time-up per course ([ ] keys, Setup slider).
- 2026-09-25: Real pop-up targets + 3 pop-up drills; parking-lot knife attack
  scenario with perspective, sprint physics and stab fail.
- 2026-09-25: Courses: picker + 23 courses (drills, Texas Star, Dot Torture, 9
  judgment scenarios). Realism pass: outdoor range bay backdrop, real USPSA
  metric target shape on stakes with cardboard texture (scoring now uses the
  same shape), torn bullet holes, dust strikes on misses, Dot Torture sheet on a
  backer, shaded people with clothing/faces in an indoor room.
- 2026-09-27 (hourly realism): Office "Power cut" option (Setup -> Current
  course, also on the Controller): the ceiling lights and monitors go dark,
  the room lights become battery emergency lights (twin-head units on the
  lobby and hall walls, the office's left wall and the pillars between the
  back offices), the fill light drops and your eyes adjust a little. Daylight
  through the windows and the exit sign stay. Your own muzzle flash now
  lights the office for a moment on every shot (CONFIG.office3d.myMuzzle,
  CONFIG.office3d.power). Office regression (t22c) passes.
- 2026-09-27 (Andrew's office report: slow once the first enemy appears,
  enemies off screen, wants better textures, a suspect who crouches and
  peeks while shooting, and a way to take cover):
  - Speed. The freeze was every suspect's muzzle flash carrying its own
    light: when it came on, the scene's light count changed and every
    shader recompiled (31 s in the headless test at the first enemy shot,
    ~1 s on a real GPU, again whenever a new number of flashes was lit).
    The flash has no light now (the view's one muzzle light follows the
    shooter). Also: the office glass no longer uses "transmission" (that drew
    the whole room twice a frame: frames ~34% faster); everything that can
    appear mid-run (people, guns, smoke, casings, blood, holes, shards) is
    drawn once at load and kept, and each run's cast once during the radio
    call, so nothing compiles mid-run (verified: 0 new shader programs from
    walking in to the last shot); hit tests use a cheap bounding sphere
    instead of skinning every vertex on the CPU (office, lot, judgment);
    the sun's shadow map stops updating once you're inside; the effects
    fallback no longer switches to direct rendering (that recompiled every
    shader). New Setup -> 3D graphics: Auto / High / Medium / Low with a live
    frame-rate readout (CONFIG.post.steps: AO, bloom, resolution, shadow size).
  - On screen. People only appear where their whole upper body is on screen
    from where you stop, computed from the actual camera (screen shape, life
    size); the look-around sway settles as soon as anyone appears; a suspect
    who is off screen anyway holds his fire.
  - Crouch-and-peek suspect (Setup option, on by default): behind two new
    rows of steel file cabinets in the centre aisle (or a cubicle wall) he
    rises until head, shoulders, gun and upper chest clear the top, aims
    ~1.2 s, fires 1-2 rounds, ducks, moves along behind the cover and comes up
    somewhere else; a close miss makes him duck (CONFIG.office3d.peek).
  - Your cover: file cabinets just ahead of where you stop. Hold X, the right
    mouse button, or the Controller's new "Take cover (hold)" button to
    crouch behind them; rounds then hit the cabinets (clang, ricochet, holes)
    instead of you; "IN COVER" shows on screen (CONFIG.office3d.cover).
  - Textures: new generated textures from tileable noise at ~1 mm a pixel:
    quarter-turned loop-pile carpet tiles, fissured ceiling tiles with the
    T-grid, painted drywall with roller texture, woven heathered cubicle
    fabric, wood grain, marble lobby tiles, vinyl hall tiles, concrete;
    walls/floors/panels get world-scale UVs (no more one texture stretched
    over a 24 m wall); anisotropic filtering 16x. Photo textures need the
    texture sites allowed (Realism queue 6).
  - Tests: office regression t22c, knife k10, judgment j3 pass; cheap and
    exact hit bounds give identical results.
- 2026-09-27 (hourly realism): Office "Night" option (Setup -> Current
  course, also on the Controller): dark sky, the city lit up through the
  office windows (lit windows, red roof beacons), the building's sign glows,
  a downlight under the entrance canopy, no sun or daylight; outside the fill
  light drops and your eyes adjust a little; inside the office lights stay
  on. With "Power cut" too, the office is lit only by the emergency lights
  and muzzle flashes. At night the glass no longer reflects the daytime
  sky's sun (it showed as a glare). CONFIG.office3d.night. No new shaders
  compile mid-run; office regression (t22c) passes.
- 2026-09-27 (hourly realism): Office: your patrol car's light bar flashes
  behind you while you're outside (radio call and walk-in): red and blue
  quad-flash washing over the building, glass and ground; strong at night,
  faint by day; off once you're inside or the run ends
  (CONFIG.office3d.police). Two lights always in the scene, so no shader
  recompiles. Office regression (t22c) passes.
- 2026-09-27 (hourly realism): Office: your own spent brass on every shot:
  thrown out to the right from your gun, it tumbles through the bottom-right
  corner of the picture and lands on the floor beside you, where it stays
  until the next run (CONFIG.office3d.myBrass). Office regression passes.
  The queued sound item (car door, radio, sirens) is blocked on realistic
  free recordings.
- 2026-09-27 (hourly realism): Your own spent brass in the parking-lot knife
  attack and the 3D judgment scenes too (as in the office): out to the right
  on every shot, bouncing on the asphalt, left lying until the next run
  (CONFIG.knife3d.myBrass). brassCase moved to char3d.js (shared). Office,
  knife (k10) and judgment (j3) regressions pass.
- 2026-09-27 (Andrew: focus on drills and the range, more realism):
  - Range officer commands before the beep (Setup, on by default): "Make
    ready." ... "Are you ready?" ... "Standby." then the random 1-4 s delay
    to the beep, as at a USPSA match. Shots while making ready don't count
    as early; after "Standby" they do. Drills and stages (CONFIG.timer.commands).
  - Scoring by the whole 9 mm hole: a hole that touches a scoring line scores
    the higher zone, and one that breaks the edge of the target counts
    (USPSA rule; CONFIG.uspsa.holeRadiusCm), 2D and 3D targets alike.
  - 3D range: between runs the holes are pasted over with tan pasters (white
    on no-shoots) instead of the target going back to new; a fresh target
    once it carries 60 pasters (Setup "Paste the holes between runs";
    CONFIG.range3d.paste).
  - The hourly routine now works through the new "Range & drills realism
    queue".
- 2026-09-27 (range & drills): Shot timer review like a real timer: after a
  drill or stage the timer panel shows the last shot's time big, the shot
  count, first shot and par, then every shot with its time from the beep,
  the split and what it hit (A / C / D / H / S, misses in red); the last
  12 shots if there are more (CONFIG.timer.reviewRows). Also on the Controller.
- 2026-09-27 (range & drills): Standard drills with the par times shooters
  use: 5x5 Drill (5 A hits in 5 s), FAST (2 head, reload, 4 body; under 5 s
  = Advanced), 1-Reload-1 (A, reload, A in 3 s) and the Blake Drill (2 A hits
  on each of 3 targets, left to right, 2.5 s). New drill field `sequence`
  checks what each shot in turn must hit (courses.js, run.js).
- 2026-09-27 (range & drills, cycle of up to 20): Stage score sheet like the
  RO's: one row per target (paper: its best two hits as letters, M for a
  missing hit; steel: down or M) with its points, then A / C / D / M / NS
  totals of the hits that count, points, time and hit factor.
- Power factor (Setup -> Targets): Minor (A 5, C 3, D 1) or Major (A 5, C 4,
  D 2) for every drill and stage; the stage sheet says which
  (CONFIG.powerFactor).
- Popper calibration: a hit on the bottom 30% of a popper (below its
  calibration zone) rings and rocks it on its hinge, leaves a lead splash,
  but it stays up and scores a miss, as at a match (full-size and mini
  poppers; CONFIG.range3d.steel.popper.holdBelow / wobble).
- More standard drills: Rhythm Drill (6 body hits, every split within 0.08 s
  of the others: new drill field evenSplits), and two 3D stages at real
  distances: Accelerator (15, 10, 5 yd, far to near) and Doubles 3-7-15.
- 3D range: yardage markers down both sides of the bay (5, 10, 15, 20, 25
  yd): wooden stakes with weathered white signs, turned toward the firing
  line (CONFIG.range3d.markers).
- Hard cover: stage paper can be partly painted flat black (hard: { side,
  cm }); hits there stop and can't score (a miss, a hole in the paint). New
  stage "Hard Cover" (3 paper with hard cover + a popper).
