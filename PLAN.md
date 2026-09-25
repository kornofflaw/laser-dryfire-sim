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
- [ ] Draw-to-first-shot timing (first shot is measured from the beep today).
- [ ] More steel: plate rack, poppers (need a "falls when hit" reaction).

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
- [ ] Ideas: threat that shoots back after N seconds (time pressure), cover /
      partial exposure, verbal-command audio cues, more rooms.

## Phase 3 — Review & analytics
- [x] Per-run log (points, zones, splits, hit factor, pass, early shots) with CSV export.
- [ ] Post-session summary screen from the log.
- [ ] Trend view across sessions.

## Phase 4 — Hosting / packaging
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
- 2026-09-25: Courses: picker + 23 courses (drills, Texas Star, Dot Torture, 9
  judgment scenarios). Realism pass: outdoor range bay backdrop, real USPSA
  metric target shape on stakes with cardboard texture (scoring now uses the
  same shape), torn bullet holes, dust strikes on misses, Dot Torture sheet on a
  backer, shaded people with clothing/faces in an indoor room.
