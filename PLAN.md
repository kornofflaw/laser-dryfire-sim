# PLAN.md — Laser Dry-Fire Simulator

Python/OpenCV detects an IR laser dot on the projection screen → UDP (port 5005,
`x,y[,perf_counter]`) → Unity scores it (USPSA A/C/D + head zone) and runs drills.

> NOTE (2026-09-25): Project moved from the claude.ai "simulator" Project into this
> repo for Claude Code. The code here is the consolidated 2026-09-24 set
> (7 Python + 11 Unity scripts), unchanged. From now on this repo is the source
> of truth, not the claude.ai project files. See CLAUDE.md for working rules.
> Stale claude.ai uploads (safe to delete there): `GameManager (1).cs`,
> `ShotTimer (1).cs`, the older root-level `.cs`/`.py` duplicates, and
> `GameHUD.cs` (replaced by GameUI).

---

## Phase 0 — End-to-end detection  ✅ done, live-tested

## Phase 1 — Detection robustness
- [x] Shot timestamps end-to-end (Python perf_counter → packet → ShotReceiver →
      GameManager/ShotTimer splits).
- [ ] Rapid-fire test: can the rig register a fast controlled pair? (pulse length
      vs. camera fps)

## Phase 1b — Mouse-and-keyboard mode (direction set Sept 2026)
- [ ] Mouse click → same ShotReceiver scoring path as a UDP shot (one code path;
      no separate scoring). Get the game solid on mouse first, then switch to the
      IR gun.

## Phase 2 — Training value
- [x] Zone scoring (ScoringTarget A/C/D + optional head zone; single scoring path;
      Target.OnHit reaction-only).
- [x] DrillRunner: Bill Drill, Mozambique, par strings; hit factor; drill HUD panel.
- [ ] **Target ID on ShotScore**: needed for BOTH dot torture and judgment
      scenarios. Do this first.
- [ ] Dot torture (needs target ID).
- [ ] Draw-to-first-shot timing wired into ShotTimer.
- [ ] Moving-target drills using MovingTarget.cs.

## Phase 2b — Judgment (shoot / no-shoot) scenarios, ≤10 s each
Design chosen 2026-09-24: data-driven "scripted cutout" scenarios in Unity, not video.
- [ ] Target ID on ShotScore (shared with Phase 2).
- [ ] `ScenarioActor`: flat card with swappable pose sprites (hands empty / gun /
      phone / wallet / hands up) + a role that can change over time
      (NonThreat → Threat at t_reveal, Threat → Surrender, etc.).
- [ ] `Scenario` ScriptableObject: list of actors + a short timeline of events
      (appear, turn, swap sprite, move via MovingTarget, disappear), max 10 s.
- [ ] Randomization per run: which actor is the threat, reveal time window,
      object shown, actor positions — so scenarios can't be memorized.
- [ ] `ScenarioRunner` (sibling of DrillRunner): plays the timeline, listens to
      ShotScored, grades each shot against the actor's role AT THAT MOMENT.
- [ ] Grading: correct engagement + reaction time (reveal → first shot on threat);
      no-shoot hit = penalty/fail; shot on threat before reveal = premature;
      shot after surrender = fail; threat not engaged by timeout = fail.
- [ ] Results panel in GameUI + new columns in SessionLogger (ties to audit #3).
- [ ] Starter library: ~8 templates (single reveal, 2-person pick-the-threat,
      turn-and-reveal, surrender/stop-shooting, threat behind no-shoot, moving
      threat, all-clear, late reveal).
- [ ] Later / optional: filmed video branching (VideoPlayer + per-frame hit
      regions) — much higher production cost; revisit only if cutouts feel flat.

## Phase 3 — Review & analytics
- [ ] Post-session summary from the SessionLogger CSV (splits, first shot,
      accuracy, hits per zone, judgment results).
- [ ] Trend view across sessions.

## Phase 4 — Polish / packaging
- [ ] Build the Unity .app; set UNITY_APP in run.py for one-command launch.
- [ ] Check camera permission + Local Network prompt on a clean macOS user.

---

## Audit findings — 2026-09-24 (still open)

1. **Flat-points hits skip `ShotScored`.** In ShotReceiver, a target with no
   ScoringTarget calls RegisterShot + AddScore directly, so `ShotScored` never
   fires. DrillRunner listens to `ShotScored`, so those hits are invisible to
   drills (round count stalls). Fix: route the flat path through
   RegisterScoredShot with a ShotScore (zone = A or a new `Flat` zone).
2. **Early shots are silently dropped.** ShotTimer.HandleShot ignores shots
   during the Delay (pre-beep) state. Should be flagged as jumping the beep.
3. **SessionLogger logs too little.** No points, zone counts, splits, or hit
   factor. Extend the CSV into a new versioned file.
4. **Frame jitter in first-shot time.** Interim: Stopwatch on the UDP thread.
   Proper: clock handshake (Python heartbeat packets with perf_counter).
5. **Duplicate reset handling.** GameHUD and GameUI both reset on R; delete GameHUD
   from the Unity project if it's still there (it is not in this repo).
6. **Target.OnHit destroys the object.** Wrong for scenarios; ScenarioActor
   should override the reaction.

## Open questions / risks
- Laser pulse duration vs. camera fps (gates rapid-fire detection).
- Lens distortion — homography fixes perspective, not barrel distortion.
- Reflections on a glossy screen can look like shots.
- Cross-clock first-shot timing (see audit item 4).
- Scenario art source: simple silhouettes vs. photo cutouts (undecided).
- The Unity project itself (scenes/prefabs/settings) isn't in git yet — only scripts.

---

## Changelog
- Phase 0 complete — live tests passed, shots land where aimed.
- Phase 1: shot timestamps wired end-to-end.
- Phase 2: zone scoring live end-to-end; DrillRunner + drill HUD (Bill Drill, par
  string); head zone added → Mozambique. Dot torture pending target ID.
- 2026-09-24: PLAN.md rebuilt in project knowledge. Audit → findings above.
- 2026-09-24: Judgment scenarios designed (Phase 2b).
- 2026-09-24: Complete code set consolidated (7 Python + 11 Unity scripts).
  Applied the July timestamp edit to laser_detector.py/udp_test.py (3-field
  packet); TargetSpawner now calls MovingTarget.Initialize with its area.
- 2026-09-25: Moved to a git repo for Claude Code. Added CLAUDE.md, README.md,
  .gitignore; added Phase 1b (mouse-and-keyboard first). No code changes.
