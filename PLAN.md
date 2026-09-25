# PLAN.md — Laser Dry-Fire Simulator

A single static web app (`web/`) on any OS: the webcam finds the IR laser dot,
a 4-point homography maps it to the screen, and the page scores it (USPSA
A/C/D + head zone), times it, and runs drills. The mouse feeds the same shot path.

> 2026-09-25: Moved from Python/OpenCV + Unity (macOS) to a browser-only app.
> The old code is in `archive/` for reference. Repo should be private.
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
- [ ] Dot torture (target ID is now available).
- [ ] Draw-to-first-shot timing (first shot is measured from the beep today).
- [ ] Moving-target drills with their own pass criteria.

## Phase 2b — Judgment (shoot / no-shoot) scenarios, ≤10 s each
Design chosen 2026-09-24: data-driven "scripted cutout" scenarios, not video.
Now to be built in the web app (canvas sprites instead of Unity objects).
- [x] Target ID on ShotScore.
- [ ] `ScenarioActor`: flat card with swappable pose sprites (hands empty / gun /
      phone / wallet / hands up) + a role that can change over time
      (NonThreat → Threat at t_reveal, Threat → Surrender, etc.).
- [ ] Scenario definitions (JSON in config or a scenarios module): list of actors +
      a short timeline of events (appear, turn, swap sprite, move, disappear), max 10 s.
- [ ] Randomization per run: which actor is the threat, reveal time window,
      object shown, actor positions — so scenarios can't be memorized.
- [ ] `ScenarioRunner` (sibling of RunController): plays the timeline, listens to
      shots, grades each shot against the actor's role AT THAT MOMENT.
- [ ] Grading: correct engagement + reaction time (reveal → first shot on threat);
      no-shoot hit = penalty/fail; shot on threat before reveal = premature;
      shot after surrender = fail; threat not engaged by timeout = fail.
- [ ] Results panel + new log columns.
- [ ] Starter library: ~8 templates (single reveal, 2-person pick-the-threat,
      turn-and-reveal, surrender/stop-shooting, threat behind no-shoot, moving
      threat, all-clear, late reveal).
- [ ] Scenario art source: simple silhouettes vs. photo cutouts (undecided).

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
6. Target reaction destroys the target in pop-up/mover layouts; ScenarioActor
   will need its own reaction (still open for Phase 2b).

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
