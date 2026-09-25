# CLAUDE.md — Laser Dry-Fire Simulator

Claude Code reads this file automatically at the start of every session.
Read PLAN.md next: it holds phase status, open audit findings, and the changelog.

## What this is
A laser dry-fire training simulator for practical shooting (USPSA-style scoring
and structured drills). Long-term aim: something like VirTra, only better.

It is a **static web app** in `web/` (plain HTML/CSS/JS modules, no build step).
It runs in any modern browser on any OS, including Safari on an iPad. Chrome or
Edge give the best camera timing. Most scenes are 2D canvas; realistic scenes
are moving to 3D with three.js (first: the 3D parking-lot knife attack).

Pipeline (all in one browser page):
```
IR laser (laser cartridge / SIRT pistol) -> projected screen (this page, fullscreen)
  -> USB camera (e.g. ELP NoIR UVC) + ~760nm IR-pass filter, used as a webcam
  -> camera.js finds the dot, maps it through the calibration homography
  -> shoot(nx, ny, t)  <- the mouse calls the same function
  -> range.js classifies A/C/D/Head -> game.js registers it -> run.js times the drill
```

The old Python/OpenCV detector and Unity scripts are kept in `archive/` for
reference only. They are not used and should not be edited.

## Owner and how to work with them
- Andrew has limited programming experience. Claude is the architect and does
  all the implementing.
- Andrew doesn't want to push code. Claude commits and pushes to
  **kornofflaw/laser-dryfire-sim** (public repo; that's fine). Push to `main`
  deploys the site on Vercel (see PLAN.md → Hosting).
- No platform assumptions: don't assume macOS, Windows, or a particular machine.
- Cadence: Andrew live-tests, confirms what passed, then names the next priority.
  Keep back-and-forth to a minimum.
- Explanations stay short: what changed, why, and exactly what to click or look
  for when testing. Andrew can't infer steps, so spell them out.
- **Update PLAN.md at the end of every work session** (phase status, open risks,
  changelog).
- Direction (Sept 2026): get it working well with the mouse first, then use the
  IR gun as the input. Both go through the same `shoot()` path.
- Visual goal: realistic. Decision (Sept 2026): stay in the browser (not a
  native iPad app) and go 3D with three.js plus real assets, one scene at a
  time, starting with the parking-lot knife attack.
- Target screen is a desktop/laptop browser or a projector. Don't spend time on
  phone-sized layouts.

## Hard rules (don't break these)
1. **One coordinate system.** Normalized screen coords, (0,0) = top-left of the
   viewport, (1,1) = bottom-right, for the mouse, the camera homography, and
   targets. No Y-flip anywhere.
2. **One shot path.** Mouse and camera both call `shoot()` in main.js.
   Never add a second path for an input type.
3. **One scoring path.** Points are added only in `Game.registerScoredShot`.
   `Range.scoreShot` is pure classification; `Range.onShot` is reaction-only
   (holes, pop-ups dropping, plates falling) and must never add score. A runner
   may re-judge a shot first via `judge()` (Dot Torture: wrong dot = miss).
   Scoring shapes and drawn shapes come from the same geometry (uspsa.js,
   actors.js, star.js) so what you see is what scores.
4. **One clock.** Every timestamp is `performance.now()` milliseconds. Camera
   shots use the frame's `captureTime` from `requestVideoFrameCallback`, which
   is on the same clock. Never mix in `Date.now()` for timing.
5. **`web/js/config.js` is the single source of truth** for every tunable
   (thresholds, target geometry, points, physics, timings, sounds). Never
   hard-code one elsewhere. Course CONTENT (drill definitions, Dot Torture
   sequence, scenario templates) lives in courses.js and scenarios.js.
6. **Calibration uses inset crosshairs** (10% from each edge, `calibration.inset`),
   not the literal corners. The homography fixes perspective but NOT barrel
   distortion, so a low-distortion lens is required (no 170-degree fisheye).
   Calibration is only valid while the page fills the same projected area it was
   calibrated at (use fullscreen); setup warns when the viewport size changes.
7. **No audio files.** Sounds are generated in audio.js (WebAudio). 2D scenes
   are drawn in code. 3D scenes may use asset files in `web/assets/3d/`; every
   asset must be listed with its source and licence in `web/assets/3d/CREDITS.md`.
8. **No build step.** Plain ES modules served as static files. The one library
   is three.js, vendored (copied) into `web/vendor/three/` and mapped with the
   import map in index.html; never load it from a CDN at runtime. 3D modules are
   imported on demand so 2D courses don't pay for them.
9. Wrap all `localStorage` access in the helpers in storage.js (it can throw).
   Settings, calibration and the run log live in the browser only.

## Layout
```
PLAN.md                 roadmap, audit findings, changelog (keep current)
web/                    the app; deploy this folder as-is
  index.html            page shell: canvas, HUD panels, setup drawer, help, calibration overlay
  style.css
  js/config.js          ALL tunables
  js/main.js            wiring, shoot(), course selection/picker, HUD, keyboard, setup drawer
  js/courses.js         course list: drills, Dot Torture sequence, scenario entries
  js/run.js             Runner base + DrillRunner: shot timer, drills, pass/fail, hit factor
  js/dots.js            DotTortureRunner (50 rounds, stage by stage)
  js/scenario.js        ScenarioRunner: plays a scene, grades shoot/no-shoot
  js/scenarios.js       scenario templates (randomized each run)
  js/popdrill.js        PopupRunner: pop-up reaction drills
  js/popups.js          PopupBank: hinged pop-up targets behind a mound
  js/flipdrill.js       FlipRunner: flip-grid drills (flash / numbered in order / called numbers)
  js/fliptiles.js       FlipBoard: steel frame of square plates that spin
  js/knife.js           KnifeRunner: parking-lot knife charge (real-world distances/speeds)
  js/knife3d.js         3D version: Lot3DView (three.js scene, rigged man, raycast hits, hit reactions) + Knife3DRunner
  js/blood3d.js         3D blood: wound stains on bones, droplet spray, mist, ground drops
  js/char3d.js          reusable 3D Character: retargeted clips, IK poses (aim/handsUp/hostage), hits, falls, pistol
  js/office3d.js        3D office active-shooter scenario: OfficeView + OfficeRunner
  js/range3d.js         photo-real 3D range: paper, pop-ups and steel layouts ('range3d-*'); courses switch to it via range.js TO_3D
  js/steel3d.js         3D steel for the range: plate rack, poppers, mini poppers, plate stands, Texas Star (rotation from star.js)
  js/stage.js           StageRunner: USPSA-style stages (paper + no-shoots + steel), stage score + hit factor
  assets/3d/            3D models, animations, sky, range textures (see CREDITS.md)
  vendor/three/         three.js 0.186 + the addons we use (GLTF/Draco/HDR loaders, SkeletonUtils)
  js/range.js           layouts, movement, hit testing, holes/strikes, drawing
  js/uspsa.js           USPSA metric target shape: drawing + zone scoring
  js/star.js            Texas Star with rigid-body physics
  js/actors.js          scenario people: poses, drawing, hit zones
  js/scenery.js         painted backdrops (range, room, parking lot) and textures
  js/game.js            session stats + registerScoredShot (single scoring path)
  js/camera.js          webcam capture, dot detection, rising-edge shots, debug preview
  js/calibrate.js       guided 4-point calibration + centre-shot validation
  js/homography.js      4-point perspective transform
  js/audio.js           procedural beeps / shot / hit / steel / penalty sounds
  js/log.js             per-run log in localStorage, CSV export
  js/review.js          shot review: records shots + frames during a run, review screen (V)
  js/storage.js         safe localStorage helpers
  manifest.webmanifest  Add to Home Screen (iPad/tablet) app manifest; icon.svg is its icon
  controller.html       remote Controller page (iPad screen); js/controller.js + controller.css
  js/remote.js          Controller <-> Display messages (BroadcastChannel); index.html?display is the Display
docs/IPAD.md            running on an iPad: what works, hardware setup, risks, other routes
archive/                old Python + Unity code, reference only
```

## Testing
- Run locally: `cd web && python3 -m http.server 8000`, then open
  http://localhost:8000. Any static server works. Camera access needs
  https or localhost.
- Mouse mode needs no hardware: click targets, Space starts a timed run.
- Headless check: Playwright + Chromium is available in Claude Code cloud
  sessions. Open the page with `?debug` to get `window.sim` (range, game,
  runners, selectCourse, shoot) for driving courses from tests. For 3D, launch
  Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`; it is
  slow (~70 ms/frame), so give screenshots long timeouts and use ~960x540. Launch Chromium with `--use-fake-device-for-media-stream` and
  `--use-fake-ui-for-media-stream` to exercise the camera path. Check
  there are no console errors, the scores are right, and the timer and drills work.
- Real laser testing is done by Andrew on the projector rig. List exactly what to
  click and what should happen.
