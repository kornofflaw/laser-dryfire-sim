# Laser Dry-Fire Simulator

An IR laser training pistol fires at a projected screen. A USB camera with an
IR-pass filter sees the dot, the browser maps it to the screen, and the app
scores the shot USPSA-style and runs timed drills. Everything runs in one web
page on any OS. Clicking with the mouse works too, with no hardware needed.

## Run it
- **Hosted:** open the site URL (see PLAN.md for where it's deployed).
- **Locally:** `cd web && python3 -m http.server 8000`, then open
  http://localhost:8000 in Chrome or Edge.

## Use it
| Key | Action |
| --- | --- |
| Space | Start a timed run (random delay, then the beep) |
| Tab | Next drill: Free Run, Bill Drill, Mozambique, Par String |
| L | Target layout: bay, pop-ups, movers |
| S | Setup: camera, threshold, calibration, run log |
| C | Calibrate the laser camera |
| F | Fullscreen |
| R | Reset the session |

Laser setup (once per room): project the page fullscreen, plug in the camera,
**Setup → Start camera**, tune the threshold until the preview is dark with no
laser, then **Calibrate** by shooting the 4 crosshairs and the centre.

See **PLAN.md** for the roadmap and **CLAUDE.md** for architecture and rules.
The earlier Python + Unity version is in `archive/` for reference.
