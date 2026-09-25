# Laser Dry-Fire Simulator

An IR laser training pistol fires at a projected screen. A USB camera with an
IR-pass filter sees the dot, the browser maps it to the screen, and the app
scores the shot USPSA-style and runs timed drills. Everything runs in one web
page on any OS. Clicking with the mouse works too, with no hardware needed.

## Run it
- **Hosted:** https://laser-dryfire-sim.vercel.app (sign in to Vercel first;
  it's protected). Every push to `main` redeploys it.
- **Locally:** `cd web && python3 -m http.server 8000`, then open
  http://localhost:8000 in Chrome or Edge.

## Use it
| Key | Action |
| --- | --- |
| Space | Start a timed run (random delay, then the beep) |
| D | Choose a course: drills, Texas Star, Dot Torture, judgment scenarios |
| Tab | Next course |
| L | Targets for free practice: bay, single, pop-ups, movers, Texas Star |
| S | Setup: camera, threshold, calibration, run log |
| C | Calibrate the laser camera |
| F | Fullscreen |
| R | Reset the session |

Laser setup (once per room): project the page fullscreen, plug in the camera,
**Setup → Start camera**, tune the threshold until the preview is dark with no
laser, then **Calibrate** by shooting the 4 crosshairs and the centre.

See **PLAN.md** for the roadmap and **CLAUDE.md** for architecture and rules.
The earlier Python + Unity version is in `archive/` for reference.
