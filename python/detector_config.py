"""
detector_config.py
-------------------
ONE place for every detector knob. laser_detector.py, calibrate.py,
detector_debug.py, camera.py, udp_test.py and run.py all import this file, so
you tune a value here ONCE and every script stays in sync.

Keep this file in the SAME folder as those scripts. run.py chdir's to this
folder, so `import detector_config` always resolves.
"""

# ---- Shared detection (used by all scripts) ------------------------------
CAMERA_INDEX = 0              # if the wrong camera opens, try 1, 2, ...
BRIGHTNESS_THRESHOLD = 230   # 0-255. Raise if noise causes false shots,
                             # lower if real shots are being missed.
BLUR_SIZE = 5                # smooths single hot pixels. Must be an ODD number.

# ---- Networking (laser_detector.py -> Unity) -----------------------------
UDP_IP = "127.0.0.1"         # 127.0.0.1 = same machine as Unity
UDP_PORT = 5005              # MUST match the port in the Unity ShotReceiver

# ---- Calibration ---------------------------------------------------------
CALIB_FILE = "calibration.json"   # where the homography is saved / loaded
INSET = 0.10                 # calibrate.py crosshair inset (10% from each edge)
ACCUM_FRAMES = 6             # frames averaged per calibration shot
COOLDOWN_FRAMES = 8          # dark frames required between calibration captures
MIN_BLOB_AREA = 2            # px^2, reject single-pixel noise (calibrate.py)
MAX_BLOB_AREA = 2000         # px^2, reject big bright splashes / reflections

# ---- Capture format (helps the ELP run fast enough to catch a brief flash) --
# MJPG is what lets most UVC cameras (incl. ELP) hit their high frame rates.
# 640x480 keeps fps high and latency low — plenty of resolution for a bright dot.
USE_MJPG = True
CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480
CAPTURE_FPS = 60             # bump to 100/120 if your ELP model supports it
