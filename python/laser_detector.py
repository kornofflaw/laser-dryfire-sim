"""
laser_detector.py
------------------
Detects an IR laser flash on a projected screen and sends the hit location
to Unity over UDP as normalized screen coordinates (0..1, 0..1), plus the
detection timestamp.

WHY THIS IS SIMPLE WITH IR:
    With an IR-pass filter on your camera, the whole frame is nearly black
    except for the laser flash. So "find the shot" = "find the brightest spot".

SETUP (run once in Terminal):
    pip install opencv-python numpy

RUN:
    python run.py            (recommended — calibrates if needed, then detects)
    python laser_detector.py (detector only)

CONTROLS (click the preview window first so it has focus):
    c  -> start 4-corner calibration (shoot each projected corner)
    s  -> save calibration to a file (so you don't redo it every launch)
    l  -> load a saved calibration
    q  -> quit

CALIBRATION OPTIONS:
    * In-app: press 'c' here (quick, corner-by-corner in the preview window).
    * Guided: run calibrate.py instead — fullscreen crosshairs on the projector,
      hands-free shoot-to-advance, plus an accuracy check. It writes the same
      calibration.json this script loads on startup (see load_calibration).

PACKET FORMAT (UDP, to cfg.UDP_IP:cfg.UDP_PORT):
    "x,y,t"   x,y = normalized screen coords, TOP-LEFT origin (Unity flips Y)
              t   = time.perf_counter() at detection (seconds, monotonic).
    Unity only ever uses DIFFERENCES between t values (shot-to-shot splits).

Run this AT THE SAME TIME as your Unity game. They talk over localhost UDP.
"""

import socket
import json
import os
import time

import cv2
import numpy as np

import detector_config as cfg   # all tunables live here (shared by every script)
import camera                    # robust ELP/macOS-friendly camera opener
# --------------------------------------------------------------------

# The normalized screen corners we map TO, in this order:
# top-left, top-right, bottom-right, bottom-left
SCREEN_CORNERS = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])
CORNER_NAMES = ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-RIGHT", "BOTTOM-LEFT"]

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


def find_bright_point(gray):
    """Return (x, y, brightness) of the brightest pixel, or None if too dim."""
    blurred = cv2.GaussianBlur(gray, (cfg.BLUR_SIZE, cfg.BLUR_SIZE), 0)
    _, max_val, _, max_loc = cv2.minMaxLoc(blurred)
    if max_val >= cfg.BRIGHTNESS_THRESHOLD:
        return (max_loc[0], max_loc[1], max_val)
    return None


def run_calibration(cap):
    """Ask the shooter to hit each projected corner; build the mapping."""
    print("\n--- CALIBRATION ---")
    print("Fire at each corner of the PROJECTED image when prompted.\n")
    cam_points = []
    for name in CORNER_NAMES:
        print(f"Aim and fire at the {name} corner...")
        while True:
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hit = find_bright_point(gray)
            preview = frame.copy()
            cv2.putText(preview, f"Shoot the {name} corner", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            if hit:
                cv2.circle(preview, (hit[0], hit[1]), 12, (0, 0, 255), 2)
            cv2.imshow("Laser Detector", preview)
            key = cv2.waitKey(1) & 0xFF
            if hit:
                cam_points.append([hit[0], hit[1]])
                print(f"  recorded {name} at pixel {hit[0]},{hit[1]}")
                cv2.waitKey(400)  # brief pause so one flash isn't counted twice
                break
            if key == ord('q'):
                return None
    H = cv2.getPerspectiveTransform(np.float32(cam_points), SCREEN_CORNERS)
    print("Calibration complete.\n")
    return H


def map_point(H, x, y):
    """Map a camera pixel through the homography to normalized screen coords."""
    pt = np.float32([[[x, y]]])
    out = cv2.perspectiveTransform(pt, H)
    return float(out[0][0][0]), float(out[0][0][1])


def save_calibration(H):
    with open(cfg.CALIB_FILE, "w") as f:
        json.dump(H.tolist(), f)
    print(f"Saved calibration to {cfg.CALIB_FILE}")


def load_calibration():
    """Load the homography from calibration.json.

    Accepts BOTH formats so the in-app 's' save and calibrate.py interoperate:
      * a bare 3x3 list (what this script's 's' key writes), and
      * a richer object with the matrix under a "homography" key plus metadata
        (profile, accuracy, etc.) — what calibrate.py writes.
    Both store a camera->normalized-screen matrix in the SAME top-left-origin
    convention, so the rest of this file (and Unity's Y-flip) is unchanged.
    """
    if not os.path.exists(cfg.CALIB_FILE):
        print("No calibration file found yet. Press 'c', or run calibrate.py.")
        return None
    try:
        with open(cfg.CALIB_FILE) as f:
            data = json.load(f)
        if isinstance(data, dict):                    # calibrate.py format
            H = np.array(data["homography"], dtype=np.float32)
            who = data.get("profile", "calibrate.py")
            print(f"Loaded calibration from {cfg.CALIB_FILE} (profile: {who})")
        else:                                         # legacy bare-list format
            H = np.array(data, dtype=np.float32)
            print(f"Loaded calibration from {cfg.CALIB_FILE}")
        if H.shape != (3, 3):
            print(f"  warning: expected a 3x3 matrix, got {H.shape}. Ignoring.")
            return None
        return H
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Could not read {cfg.CALIB_FILE} ({e}). Recalibrate with 'c' or calibrate.py.")
        return None


def main():
    cap, _ = camera.open_camera()
    if cap is None:
        print("Could not open any camera. Set CAMERA_INDEX in detector_config.py (try 0, 1, 2),")
        print("and grant Terminal Camera permission in System Settings > Privacy & Security.")
        return

    H = load_calibration()
    in_shot = False  # True while a flash is currently visible (used to debounce)

    print("Running. Press 'c' to calibrate, 'q' to quit.")
    while True:
        ok, frame = cap.read()
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hit = find_bright_point(gray)
        preview = frame.copy()

        if hit:
            cv2.circle(preview, (hit[0], hit[1]), 12, (0, 0, 255), 2)
            # A "rising edge" (no flash -> flash) counts as one new shot.
            if not in_shot and H is not None:
                shot_time = time.perf_counter()     # stamp AT DETECTION (monotonic)
                sx, sy = map_point(H, hit[0], hit[1])
                if 0.0 <= sx <= 1.0 and 0.0 <= sy <= 1.0:
                    # No Y-flip here — Unity's ShotReceiver does it.
                    msg = f"{sx:.5f},{sy:.5f},{shot_time:.6f}"
                    sock.sendto(msg.encode(), (cfg.UDP_IP, cfg.UDP_PORT))
                    print(f"SHOT -> {msg}")
            in_shot = True
        else:
            in_shot = False

        status = "CALIBRATED" if H is not None else "NOT CALIBRATED - press 'c'"
        cv2.putText(preview, status, (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("Laser Detector", preview)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c'):
            new_H = run_calibration(cap)
            if new_H is not None:
                H = new_H
        elif key == ord('s') and H is not None:
            save_calibration(H)
        elif key == ord('l'):
            loaded = load_calibration()
            if loaded is not None:
                H = loaded

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
