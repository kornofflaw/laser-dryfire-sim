#!/usr/bin/env python3
"""
calibrate.py — Guided 4-corner calibration for the laser dry-fire simulator.

WHAT IT DOES
  Shows a fullscreen window on the projector with one crosshair at a time.
  You shoot each crosshair; it captures where the IR dot lands in the CAMERA
  image, then builds the camera->screen homography and saves it to JSON.
  The whole 4-shot sequence is hands-free (shooting advances it). Keyboard is
  only needed at the computer to redo / accept / quit.

WHY PYTHON-ONLY
  Unity needs no new code. The projector is already showing the Mac's output,
  so an OpenCV fullscreen window appears on the projection just like Unity does.
  No reverse UDP channel, no extra Inspector wiring.

RUN
  python run.py --calibrate      (recommended)
  python calibrate.py
  python calibrate.py --camera 1 --screen 1920 1080 --profile bedroom

CONTROLS
  (capture)  shoot the highlighted crosshair = capture & advance
             b = redo previous corner   r = restart   q = quit
  (validate) shoot center to measure accuracy
             enter / s = save   t = test again   r = restart   q = quit

CONVENTION (important)
  The saved homography outputs normalized [0,1] coords with a TOP-LEFT origin,
  exactly matching laser_detector.py. Your detector sends those coords to Unity
  UNCHANGED — Unity's ShotReceiver is what flips Y to the bottom-left viewport.
  So do NOT add a Y-flip in Python anywhere; that's already handled downstream.
  The calibration.json this writes is loaded directly by laser_detector.py.
"""

import argparse
import json
import time
from datetime import datetime

import cv2
import numpy as np

import detector_config as cfg   # all tunables live here (shared by every script)
import camera                    # robust ELP/macOS-friendly camera opener

WIN = "Calibration"

# Corner capture order, with on-screen labels. Destination points are the
# normalized (top-left origin) positions of each crosshair. Crosshairs sit
# cfg.INSET in from each edge (easier to hit; edge detection is less reliable).
CORNERS = [
    ("TOP-LEFT",     cfg.INSET,       cfg.INSET),
    ("TOP-RIGHT",    1.0 - cfg.INSET, cfg.INSET),
    ("BOTTOM-RIGHT", 1.0 - cfg.INSET, 1.0 - cfg.INSET),
    ("BOTTOM-LEFT",  cfg.INSET,       1.0 - cfg.INSET),
]


# ----------------------------------------------------------------------------
# Detection — find the brightest blob (the IR dot) in camera-pixel coords.
# ----------------------------------------------------------------------------
def detect_dot(frame):
    """Return (cx, cy, area) of the dot in camera pixels, or None."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, cfg.BRIGHTNESS_THRESHOLD, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best, best_area = None, 0.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < cfg.MIN_BLOB_AREA or area > cfg.MAX_BLOB_AREA:
            continue
        m = cv2.moments(c)
        if m["m00"] == 0:
            continue
        cx, cy = m["m10"] / m["m00"], m["m01"] / m["m00"]
        if area > best_area:
            best, best_area = (cx, cy), area
    if best is None:
        return None
    return best[0], best[1], best_area


# ----------------------------------------------------------------------------
# Drawing the guided scene on the projector canvas.
# ----------------------------------------------------------------------------
def crosshair(canvas, x, y, color, r=26, thick=2):
    cv2.circle(canvas, (x, y), r, color, thick)
    cv2.circle(canvas, (x, y), 3, color, -1)
    cv2.line(canvas, (x - r - 8, y), (x - r + 4, y), color, thick)
    cv2.line(canvas, (x + r - 4, y), (x + r + 8, y), color, thick)
    cv2.line(canvas, (x, y - r - 8), (x, y - r + 4), color, thick)
    cv2.line(canvas, (x, y + r - 4), (x, y + r + 8), color, thick)


def banner(canvas, lines):
    y = 60
    for i, text in enumerate(lines):
        scale = 1.1 if i == 0 else 0.7
        color = (255, 255, 255) if i == 0 else (170, 170, 170)
        cv2.putText(canvas, text, (50, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, color, 2, cv2.LINE_AA)
        y += 44 if i == 0 else 32


def draw_capture(W, H, active, captured, pulse):
    canvas = np.zeros((H, W, 3), np.uint8)
    for i, (label, nx, ny) in enumerate(CORNERS):
        px, py = int(nx * W), int(ny * H)
        if i < len(captured):
            crosshair(canvas, px, py, (60, 220, 60), r=22)          # done = green
        elif i == active:
            r = 26 + int(8 * pulse)
            crosshair(canvas, px, py, (60, 200, 255), r=r, thick=3)  # active = amber
        else:
            crosshair(canvas, px, py, (90, 90, 90), r=18)            # pending = gray
    banner(canvas, [
        f"SHOOT THE HIGHLIGHTED TARGET  ({len(captured)}/4)",
        f"Active corner: {CORNERS[active][0]}",
        "b = redo previous    r = restart    q = quit",
    ])
    return canvas


def draw_validate(W, H, err_norm):
    canvas = np.zeros((H, W, 3), np.uint8)
    crosshair(canvas, W // 2, H // 2, (60, 200, 255), r=28, thick=3)
    lines = ["VALIDATE — shoot the CENTER crosshair"]
    if err_norm is not None:
        px = err_norm * ((W ** 2 + H ** 2) ** 0.5)
        quality = "great" if px < 15 else "ok" if px < 35 else "redo recommended"
        lines.append(f"Last error: {err_norm*100:.1f}% of screen  (~{px:.0f}px)  [{quality}]")
    lines.append("enter/s = save    t = test again    r = restart    q = quit")
    banner(canvas, lines)
    return canvas


# ----------------------------------------------------------------------------
# Capture state machine — averages the dot over a few frames, and refuses to
# re-arm until the image goes dark again (so one shot = one capture).
# ----------------------------------------------------------------------------
class Capturer:
    def __init__(self):
        self.reset()

    def reset(self):
        self.armed = False
        self.dark = 0
        self.acc = []

    def feed(self, dot):
        """Return averaged (cx, cy) when a shot finalizes, else None."""
        if not self.armed:
            if dot is None:
                self.dark += 1
                if self.dark >= cfg.COOLDOWN_FRAMES:
                    self.armed = True
            else:
                self.dark = 0
            return None

        # armed
        if dot is not None:
            self.acc.append((dot[0], dot[1]))
            if len(self.acc) >= cfg.ACCUM_FRAMES:
                return self._finalize()
            return None
        else:
            if self.acc:                      # dot just left the frame -> finalize
                return self._finalize()
            return None

    def _finalize(self):
        pts = np.array(self.acc, np.float32)
        cx, cy = float(pts[:, 0].mean()), float(pts[:, 1].mean())
        self.reset()
        return cx, cy


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=cfg.CAMERA_INDEX)
    ap.add_argument("--screen", type=int, nargs=2, default=[1920, 1080],
                    metavar=("W", "H"), help="projector resolution")
    ap.add_argument("--display-offset", type=int, nargs=2, default=[0, 0],
                    metavar=("X", "Y"), help="top-left of projector in the "
                    "extended desktop (move window here, then fullscreen)")
    ap.add_argument("--profile", default="default")
    ap.add_argument("--out", default=cfg.CALIB_FILE)
    args = ap.parse_args()
    W, H = args.screen

    cap, _ = camera.open_camera(args.camera)
    if cap is None:
        raise SystemExit("Could not open any camera. Set CAMERA_INDEX in detector_config.py "
                         "(try 0/1/2) and grant Terminal Camera permission.")

    cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
    cv2.moveWindow(WIN, args.display_offset[0], args.display_offset[1])
    cv2.setWindowProperty(WIN, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

    src_pts = []                 # camera-pixel hits, in CORNERS order
    capper = Capturer()
    state = "capture"            # capture -> validate -> (save/quit)
    active = 0
    H_matrix = None
    err_norm = None
    t0 = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            continue
        dot = detect_dot(frame)

        if state == "capture":
            hit = capper.feed(dot)
            if hit is not None:
                src_pts.append(hit)
                active += 1
                if active >= len(CORNERS):
                    # Build homography: 4 camera-pixel sources -> 4 normalized dsts
                    src = np.array(src_pts, np.float32)
                    dst = np.array([[nx, ny] for _, nx, ny in CORNERS], np.float32)
                    H_matrix = cv2.getPerspectiveTransform(src, dst)
                    state, err_norm = "validate", None
                    capper.reset()
            pulse = 0.5 + 0.5 * np.sin((time.time() - t0) * 6.0)
            canvas = draw_capture(W, H, min(active, len(CORNERS) - 1),
                                  src_pts, pulse)

        else:  # validate
            hit = capper.feed(dot)
            if hit is not None:
                p = cv2.perspectiveTransform(
                    np.array([[[hit[0], hit[1]]]], np.float32), H_matrix)[0][0]
                err_norm = float(np.hypot(p[0] - 0.5, p[1] - 0.5))
            canvas = draw_validate(W, H, err_norm)

        cv2.imshow(WIN, canvas)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break
        if key == ord("r"):
            src_pts, active, state, err_norm = [], 0, "capture", None
            capper.reset()
        if state == "capture" and key == ord("b") and src_pts:
            src_pts.pop()
            active = max(0, active - 1)
            capper.reset()
        if state == "validate" and key in (ord("s"), 13, 10):  # s / Enter
            save(args.out, args.profile, W, H, H_matrix, src_pts)
            print(f"\nSaved calibration -> {args.out}")
            break
        if state == "validate" and key == ord("t"):
            err_norm = None
            capper.reset()

    cap.release()
    cv2.destroyAllWindows()
    print_loader_hint()


def save(path, profile, W, H, H_matrix, src_pts):
    data = {
        "profile": profile,
        "created": datetime.now().isoformat(timespec="seconds"),
        "screen_w": W,
        "screen_h": H,
        "inset": cfg.INSET,
        "origin": "top-left",   # matches laser_detector.py; Unity flips Y downstream
        "threshold": cfg.BRIGHTNESS_THRESHOLD,
        "homography": np.asarray(H_matrix).tolist(),
        "src_points_px": [[float(x), float(y)] for x, y in src_pts],
        "dst_points_norm": [[nx, ny] for _, nx, ny in CORNERS],
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def print_loader_hint():
    print("""
Done. calibration.json is written in the format laser_detector.py reads.

  * Just launch the detector (python run.py) and it loads this file
    automatically on startup. Nothing else to do.
  * Do NOT add a Y-flip in Python — your detector sends coords as-is and
    Unity's ShotReceiver already flips Y to the bottom-left viewport.
""")


if __name__ == "__main__":
    main()
