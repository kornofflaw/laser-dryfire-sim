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
- [ ] 3D range next: life-size option (camera FOV from screen width + viewing
      distance); movers and the flip grid in 3D; more stages (hard cover,
      swingers, a stage builder).
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
- 3D assets are from the three.js examples (Ready Player Me avatar, Mixamo
  clips, CC BY car, CC0 sky); see web/assets/3d/CREDITS.md. Fine for a
  personal trainer; revisit licences before any commercial use.
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
