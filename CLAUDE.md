# CLAUDE.md — Laser Dry-Fire Simulator

Claude Code reads this file automatically at the start of every session.
Read PLAN.md next: it holds phase status, open audit findings, and the changelog.

## What this is
A laser dry-fire training simulator for practical shooting (USPSA-style scoring
and structured drills). Long-term aim: something like VirTra, only better.

It is a **static web app** in `web/` (plain HTML/CSS/JS modules, no build step,
no dependencies). It runs in any modern browser on any OS. Chrome or Edge give
the best camera timing.

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
  **kornofflaw/laser-dryfire-sim** (keep the repo private).
- No platform assumptions: don't assume macOS, Windows, or a particular machine.
- Cadence: Andrew live-tests, confirms what passed, then names the next priority.
  Keep back-and-forth to a minimum.
- Explanations stay short: what changed, why, and exactly what to click or look
  for when testing. Andrew can't infer steps, so spell them out.
- **Update PLAN.md at the end of every work session** (phase status, open risks,
  changelog).
- Direction (Sept 2026): get it working well with the mouse first, then use the
  IR gun as the input. Both go through the same `shoot()` path.

## Hard rules (don't break these)
1. **One coordinate system.** Normalized screen coords, (0,0) = top-left of the
   viewport, (1,1) = bottom-right, for the mouse, the camera homography, and
   targets. No Y-flip anywhere.
2. **One shot path.** Mouse and camera both call `shoot()` in main.js.
   Never add a second path for an input type.
3. **One scoring path.** Points are added only in `Game.registerScoredShot`.
   `Range.scoreShot` is pure classification; `Range.onShot` is reaction-only
   (holes, pop-ups dropping) and must never add score.
4. **One clock.** Every timestamp is `performance.now()` milliseconds. Camera
   shots use the frame's `captureTime` from `requestVideoFrameCallback`, which
   is on the same clock. Never mix in `Date.now()` for timing.
5. **`web/js/config.js` is the single source of truth** for every tunable
   (thresholds, zone sizes, points, drills, timings, sounds). Never hard-code one
   elsewhere.
6. **Calibration uses inset crosshairs** (10% from each edge, `calibration.inset`),
   not the literal corners. The homography fixes perspective but NOT barrel
   distortion, so a low-distortion lens is required (no 170-degree fisheye).
   Calibration is only valid while the page fills the same projected area it was
   calibrated at (use fullscreen); setup warns when the viewport size changes.
7. **No audio files.** All sounds are generated in audio.js with WebAudio.
8. **No build step, no dependencies.** Plain ES modules served as static files,
   so the site can be hosted anywhere and opened with any static server.
9. Wrap all `localStorage` access in the helpers in storage.js (it can throw).
   Settings, calibration and the run log live in the browser only.

## Layout
```
PLAN.md                 roadmap, audit findings, changelog (keep current)
web/                    the app; deploy this folder as-is
  index.html            page shell: canvas, HUD panels, setup drawer, help, calibration overlay
  style.css
  js/config.js          ALL tunables
  js/main.js            wiring, shoot(), HUD text, keyboard, setup drawer
  js/range.js           targets: layouts (bay / pop-ups / movers), zones, holes, drawing
  js/game.js            session stats + registerScoredShot (single scoring path)
  js/run.js             shot timer (delay -> beep -> par) + drills, pass/fail, hit factor
  js/camera.js          webcam capture, dot detection, rising-edge shots, debug preview
  js/calibrate.js       guided 4-point calibration + centre-shot validation
  js/homography.js      4-point perspective transform
  js/audio.js           procedural beeps / shot / hit sounds
  js/log.js             per-run log in localStorage, CSV export
  js/storage.js         safe localStorage helpers
archive/                old Python + Unity code, reference only
```

## Testing
- Run locally: `cd web && python3 -m http.server 8000`, then open
  http://localhost:8000. Any static server works. Camera access needs
  https or localhost.
- Mouse mode needs no hardware: click targets, Space starts a timed run.
- Headless check: Playwright + Chromium is available in Claude Code cloud
  sessions. Launch Chromium with `--use-fake-device-for-media-stream` and
  `--use-fake-ui-for-media-stream` to exercise the camera path. Check
  there are no console errors, the scores are right, and the timer and drills work.
- Real laser testing is done by Andrew on the projector rig. List exactly what to
  click and what should happen.
