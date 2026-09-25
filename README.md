# Laser Dry-Fire Simulator

An IR laser training pistol fires at a projected screen. A camera with an IR-pass
filter sees the dot, Python/OpenCV maps it to screen coordinates, and Unity scores
the shot USPSA-style and runs timed drills.

## Quick start (macOS)
```bash
cd python
python3 -m pip install opencv-python numpy
python3 run.py            # calibrates the first time, then detects
python3 run.py --debug    # tune threshold/blur
python3 run.py --test     # fake shots → Unity (no camera needed)
```
In Unity: copy `unity/Assets/Scripts/*.cs` into the project's `Assets/Scripts`,
import TMP Essential Resources, and press Play.

See **PLAN.md** for the roadmap and **CLAUDE.md** for architecture and the rules
the code follows.
