#!/usr/bin/env python3
"""
detector_debug.py — Live tuning view for the IR laser detector.

WHAT IT'S FOR
  Run this INSTEAD of laser_detector.py when you're dialing in your setup.
  It shows two panels side by side:
     LEFT  = the camera image (grayscale, what detection actually sees),
             with the detected dot circled and a live readout.
     RIGHT = the THRESHOLD MASK — every pixel bright enough to count as "dot".
             This is the important one: when you're NOT shooting it should be
             almost solid black. White speckle = ambient IR or a reflection,
             i.e. the stuff that causes phantom shots. Raise the threshold (or
             fix the lighting) until it's clean, then shoot and confirm your
             dot shows up as one tidy blob.

  Sliders let you tune THRESHOLD and BLUR live. Once the mask is clean and your
  dot reads strong, put those values in detector_config.py (press 'p' to print).

  This tool does NOT send UDP and does NOT need Unity. It's purely for tuning.

RUN
  python run.py --debug
  python detector_debug.py --camera 1

KEYS  (click the window first so it has focus)
  q = quit     p = print current settings to the terminal     s = save a snapshot PNG
"""

import argparse
import json
import os
import time

import cv2
import numpy as np

import detector_config as cfg   # all tunables live here (shared by every script)
import camera                    # robust ELP/macOS-friendly camera opener

# Camera exposure/gain control is driver-dependent and often a no-op on macOS.
# Leave True to try; if the sliders do nothing, set False and adjust exposure
# in a Mac UVC "webcam settings" utility instead. (Tool-only, not shared.)
SHOW_CAMERA_CONTROLS = True

WIN = "Detector Debug  (q quit | p print | s snapshot)"


def load_homography():
    """Load calibration.json if present (both formats). Returns 3x3 or None."""
    if not os.path.exists(cfg.CALIB_FILE):
        return None
    try:
        with open(cfg.CALIB_FILE) as f:
            data = json.load(f)
        H = np.array(data["homography"] if isinstance(data, dict) else data,
                     dtype=np.float32)
        return H if H.shape == (3, 3) else None
    except Exception:
        return None


def map_point(H, x, y):
    out = cv2.perspectiveTransform(np.float32([[[x, y]]]), H)
    return float(out[0][0][0]), float(out[0][0][1])


def odd(n):
    """Force a blur kernel to be a positive odd number."""
    n = max(1, int(n))
    return n if n % 2 == 1 else n + 1


def put(img, text, y, color=(0, 255, 0), scale=0.6):
    cv2.putText(img, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=cfg.CAMERA_INDEX)
    args = ap.parse_args()

    cap, _ = camera.open_camera(args.camera)
    if cap is None:
        raise SystemExit("Could not open any camera. Set CAMERA_INDEX in detector_config.py "
                         "(try 0/1/2) and grant Terminal Camera permission.")

    H = load_homography()
    if H is not None:
        print(f"Loaded {cfg.CALIB_FILE} — mapped shot coords will be shown on hits.")
    else:
        print(f"No usable {cfg.CALIB_FILE} — run calibrate.py to see mapped coords here.")

    cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
    cv2.createTrackbar("Threshold", WIN, cfg.BRIGHTNESS_THRESHOLD, 255, lambda v: None)
    cv2.createTrackbar("Blur",      WIN, cfg.BLUR_SIZE, 25, lambda v: None)

    if SHOW_CAMERA_CONTROLS:
        exp = cap.get(cv2.CAP_PROP_EXPOSURE)
        gain = cap.get(cv2.CAP_PROP_GAIN)
        print(f"Camera reports exposure={exp}, gain={gain}. "
              "If the sliders below don't change the image, your driver "
              "doesn't support software control — set SHOW_CAMERA_CONTROLS=False.")
        cv2.createTrackbar("Exposure*", WIN, 50, 255, lambda v: None)
        cv2.createTrackbar("Gain*",     WIN, 50, 255, lambda v: None)

    last = time.time()
    fps = 0.0
    frames_with_blob = 0   # rough false-positive counter (frames a dot was seen)
    total_frames = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            continue
        total_frames += 1

        thresh = cv2.getTrackbarPos("Threshold", WIN)
        blur = odd(cv2.getTrackbarPos("Blur", WIN))
        if SHOW_CAMERA_CONTROLS:
            cap.set(cv2.CAP_PROP_EXPOSURE, cv2.getTrackbarPos("Exposure*", WIN))
            cap.set(cv2.CAP_PROP_GAIN, cv2.getTrackbarPos("Gain*", WIN))

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (blur, blur), 0)
        _, max_val, _, max_loc = cv2.minMaxLoc(blurred)
        _, mask = cv2.threshold(blurred, thresh, 255, cv2.THRESH_BINARY)
        bright_px = cv2.countNonZero(mask)
        detected = max_val >= thresh
        if detected:
            frames_with_blob += 1

        # ---- build the two display panels ----
        raw = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        msk = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
        if detected:
            for img in (raw, msk):
                cv2.circle(img, max_loc, 14, (0, 0, 255), 2)
                cv2.drawMarker(img, max_loc, (0, 0, 255), cv2.MARKER_CROSS, 22, 1)

        # FPS (smoothed)
        now = time.time()
        dt = now - last
        last = now
        if dt > 0:
            fps = 0.9 * fps + 0.1 * (1.0 / dt)

        # ---- HUD on the raw panel ----
        put(raw, "CAMERA VIEW", 26, (255, 255, 0))
        put(raw, f"max brightness: {int(max_val)}   threshold: {thresh}", 52,
            (0, 255, 0) if detected else (180, 180, 180))
        gap = "above -> WOULD FIRE" if detected else f"below by {thresh - int(max_val)}"
        put(raw, f"status: {gap}", 78, (0, 255, 0) if detected else (0, 165, 255))
        put(raw, f"bright pixels: {bright_px}  (want ~0 when not shooting)", 104,
            (0, 255, 0) if bright_px < 30 else (0, 165, 255))
        put(raw, f"blur: {blur}    fps: {fps:4.1f}", 130, (200, 200, 200))
        if detected and H is not None:
            sx, sy = map_point(H, max_loc[0], max_loc[1])
            inb = 0.0 <= sx <= 1.0 and 0.0 <= sy <= 1.0
            put(raw, f"-> Unity (x,y): {sx:.3f}, {sy:.3f}" + ("" if inb else "  OUT OF BOUNDS"),
                156, (0, 255, 0) if inb else (0, 0, 255))

        put(msk, "THRESHOLD MASK  (clean = good)", 26, (255, 255, 0))

        combined = np.hstack((raw, msk))
        # keep the window a sane width regardless of camera resolution
        if combined.shape[1] > 1600:
            scale = 1600 / combined.shape[1]
            combined = cv2.resize(combined, None, fx=scale, fy=scale)
        cv2.imshow(WIN, combined)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("p"):
            seen = 100.0 * frames_with_blob / max(1, total_frames)
            print(f"\nCurrent settings:  THRESHOLD = {thresh}   BLUR = {blur}")
            print(f"A dot was detected in {seen:.1f}% of frames so far.")
            print("Put THRESHOLD/BLUR into detector_config.py.\n")
        elif key == ord("s"):
            fname = f"debug_snapshot_{int(time.time())}.png"
            cv2.imwrite(fname, combined)
            print(f"Saved {fname}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
