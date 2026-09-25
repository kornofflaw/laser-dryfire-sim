# CLAUDE.md — Laser Dry-Fire Simulator

Claude Code reads this file automatically at the start of every session.
Read PLAN.md next: it holds phase status, open audit findings, and the changelog.

## What this is
A laser dry-fire training simulator for practical shooting (USPSA-style scoring
and structured drills). Long-term aim: something like VirTra, only better.

Pipeline:
```
IR laser (laser cartridge / SIRT pistol) -> projected screen
  -> ELP NoIR UVC USB camera + ~760nm IR-pass filter
  -> Python/OpenCV (python/) finds the dot, maps it through a homography
  -> UDP 127.0.0.1:5005, packet "x,y,t"
  -> Unity (unity/Assets/Scripts/) raycasts, scores A/C/D/Head, runs drills, shows HUD
```

## Owner and how to work with him
- Andrew has limited programming experience. Claude is the architect and does
  the implementing on both sides (Python and C# Unity).
- Andrew doesn't want to push code himself. Claude commits and pushes to the
  GitHub repo **kornofflaw/laser-dryfire-sim** (private; keep it private).
- Platform: macOS. Unity project uses Canvas + TextMeshPro at a 1920x1080
  reference resolution (TMP Essential Resources must be imported).
- Cadence: Andrew live-tests, confirms what passed, then names the next priority.
  Keep back-and-forth to a minimum.
- When a file gets several edits, deliver the whole consolidated file rather than
  layered patches.
- Explanations stay short: what changed, why, and an explicit list of any
  **manual Unity steps** (adding components, Inspector wiring, deleting duplicate
  scripts). Andrew can't infer those, so always spell them out.
- **Update PLAN.md at the end of every work session** (phase status, open risks,
  changelog).
- Current direction (Sept 2026): get it working well as a **mouse-and-keyboard
  game first**, then plug in the IR gun as the input. A mouse-click input path
  should feed the same ShotReceiver scoring path as UDP shots.

## Hard rules (hard-won gotchas; don't break these)
1. **Y-flip lives in Unity only.** Python/OpenCV uses a top-left origin; Unity's
   viewport is bottom-left. `ShotReceiver` applies `1 - y`. Never flip in Python.
2. **Calibration uses inset crosshairs** (10% from each edge, `INSET` in
   detector_config.py), not the literal corners. The homography maps to those inset
   positions. It fixes perspective but NOT barrel distortion, so a low-distortion
   lens is required (no 170-degree fisheye).
3. **One scoring path.** Score is added only through
   `GameManager.RegisterScoredShot`. `Target.OnHit` is reaction-only and must never
   add score (that was a double-counting bug).
4. **Two clocks.** Python `perf_counter()` timestamps drive shot-to-shot splits.
   Unity's clock drives first-shot-from-beep until a clock handshake exists. Don't
   subtract a Python timestamp from a Unity time.
5. **`detector_config.py` is the single source of truth** for every Python tunable.
   Never hard-code a threshold, port, etc. in another script.
6. **Keep wiring minimal.** Prefer `FindObjectOfType` / singletons
   (`GameManager.Instance`) over Inspector references.
7. UDP packet parsing stays backward-compatible (2 or 3 fields).
8. Audio is generated procedurally. There are no audio files, so don't add any.
9. PS3 Eye does not work with `cv2.VideoCapture` on macOS, so don't suggest it.

## Layout
```
PLAN.md                      roadmap, audit findings, changelog (keep current)
python/                      detection side (run from here: python run.py)
  detector_config.py         all tunables
  camera.py                  robust macOS/ELP camera opener
  laser_detector.py          main detector -> UDP
  calibrate.py               guided fullscreen 4-point calibration -> calibration.json
  detector_debug.py          live threshold/blur tuning view
  udp_test.py                fake shots to test Unity without a camera
  run.py                     one-command launcher (--calibrate/--detect/--debug/--test)
unity/Assets/Scripts/        drop into the Unity project's Assets/Scripts
  ShotReceiver.cs            UDP -> raycast -> score -> marker + sounds (on Main Camera)
  GameManager.cs             singleton; ShotFired / ShotScored events; RegisterScoredShot
  ScoringTarget.cs           ShotZone/ShotScore types; A/C/D + optional head zone
  Target.cs                  shootable marker; OnHit = reaction only
  ShotTimer.cs               random delay -> start beep -> par beep
  DrillRunner.cs             Bill Drill, Mozambique, par strings; hit factor; PASS/FAIL
  GameUI.cs                  code-built HUD (stats / timer / drill panels)
  SessionLogger.cs           CSV per timed run (persistentDataPath)
  TargetSpawner.cs           spawns targets in an area
  MovingTarget.cs            PingPong / Crossing / SineWave movement
  HitMarker.cs               fading bullet-hole marker
```
Only the scripts are in git right now. The actual Unity project (scenes,
prefabs, ProjectSettings) is on Andrew's Mac. If it gets added later, keep
`Library/`, `Temp/`, `Logs/`, `obj/`, and `Build/` out of git (see .gitignore).

## Testing
- Python: `cd python && python run.py --test` sends fake corner shots to Unity
  (Unity must be in Play mode). Markers must land at the described corners.
  If top and bottom are swapped, the Y-flip is broken.
- There's no Unity CLI or automated test setup yet. Unity changes are verified by
  Andrew in the Editor, so list exactly what he should click and look for.

## Next up
See PLAN.md. The top item is **adding a target ID to ShotScore**, which
unblocks both dot torture and the Phase 2b judgment scenarios. Audit finding #1
(flat-points hits skip `ShotScored`) is a cheap fix to do in the same pass.
