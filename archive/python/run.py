#!/usr/bin/env python3
"""
run.py — one command to run the whole thing.

    python run.py              normal session: calibrate if needed, then detect
    python run.py --calibrate  (re)calibrate first, then detect
    python run.py --detect     skip straight to detection
    python run.py --debug      open the tuning view (detector_debug.py)
    python run.py --test       send fake shots to Unity (no camera needed)

It just runs the other scripts for you in the right order, so you don't have to
remember the steps. Press 'q' in a window to stop it.

WHAT THIS LAUNCHES
    The PYTHON side only: camera -> IR detection -> UDP to Unity.
    You still start the Unity game yourself:
      * In development: press Play in the Unity Editor.
      * If you've built a Mac app: set UNITY_APP below and this opens it for you.
"""

import argparse
import os
import subprocess
import sys

# Run everything from this script's own folder so calibration.json and the
# `import detector_config` in each script always resolve, no matter where you
# launched from.
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

import detector_config as cfg

# Optional: path to a built Unity .app to open automatically. Leave "" to just
# get a reminder to press Play in the Editor.
UNITY_APP = ""   # e.g. "/Users/you/Builds/DryFire.app"

SCRIPTS = ["detector_config.py", "camera.py", "laser_detector.py",
           "calibrate.py", "detector_debug.py", "udp_test.py"]


def have_module(name):
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def run_script(script):
    """Run one of our scripts with this same Python interpreter. Returns exit code."""
    return subprocess.run([sys.executable, script]).returncode


def main():
    ap = argparse.ArgumentParser(description="Launcher for the dry-fire simulator (Python side).")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--calibrate", action="store_true", help="(re)calibrate first, then detect")
    mode.add_argument("--detect", action="store_true", help="skip straight to detection")
    mode.add_argument("--debug", action="store_true", help="open the tuning view")
    mode.add_argument("--test", action="store_true", help="send fake shots to test Unity (no camera)")
    args = ap.parse_args()

    # 1) Dependencies present?
    missing = [m for m in ("cv2", "numpy") if not have_module(m)]
    if missing:
        print("Missing Python package(s):", ", ".join(missing))
        print("Install with:")
        print(f"    {sys.executable} -m pip install opencv-python numpy")
        return 1

    # 2) All scripts present in this folder?
    for f in SCRIPTS:
        if not os.path.exists(f):
            print(f"Can't find {f} next to run.py. Keep all the scripts in one folder.")
            return 1

    # 3) Tuning view is a standalone shortcut — no Unity, no calibration needed.
    if args.debug:
        return run_script("detector_debug.py")

    # 3b) Synthetic-shot test — needs Unity in Play mode, but no camera.
    if args.test:
        print(">> Make sure your Unity scene is in PLAY mode, then watch the screen.")
        return run_script("udp_test.py")

    # 4) Nudge / open Unity.
    if UNITY_APP and os.path.exists(UNITY_APP):
        print(f"Opening Unity app: {UNITY_APP}")
        subprocess.Popen(["open", UNITY_APP])
    elif UNITY_APP:
        print(f"UNITY_APP is set but not found: {UNITY_APP}")
        print(">> Start your Unity game manually (press Play in the Editor).")
    else:
        print(">> Start your Unity game now (press Play in the Editor).")

    # 5) Calibrate when asked, or automatically if there's no calibration yet.
    have_calib = os.path.exists(cfg.CALIB_FILE)
    if args.calibrate or (not args.detect and not have_calib):
        if not have_calib and not args.calibrate:
            print(f"No {cfg.CALIB_FILE} found yet — running calibration first.")
        run_script("calibrate.py")
        if not os.path.exists(cfg.CALIB_FILE):
            print("\nNo calibration was saved, so the detector has no mapping.")
            print("Run again and finish calibration (press Enter to save on the")
            print("validate step), or use 'python run.py --detect' to proceed anyway.")
            return 1

    # 6) Detect — this is the part that runs alongside Unity.
    print("\nStarting the detector. Press 'q' in its window to stop.")
    return run_script("laser_detector.py")


if __name__ == "__main__":
    sys.exit(main())
