"""
camera.py
---------
Opens the camera the way the ELP (and other UVC cameras) like on macOS:
  * tries the configured index first, then a few others — the camera *index* on
    a Mac is fiddly, and a camera can be recognized yet not open on index 0;
  * requests MJPG + a resolution/fps (from detector_config.py) so the ELP runs
    fast enough to catch a brief IR flash;
  * actually reads one frame to confirm video is flowing before returning.

Use it everywhere instead of cv2.VideoCapture:
    import camera
    cap, idx = camera.open_camera()      # detector: uses cfg.CAMERA_INDEX
    cap, idx = camera.open_camera(2)     # or force a preferred index
If it can't find a working camera, returns (None, None).
"""

import cv2

import detector_config as cfg


def _configure(cap):
    """Apply the capture format from detector_config.py."""
    if cfg.USE_MJPG:
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    if cfg.CAPTURE_WIDTH:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.CAPTURE_WIDTH)
    if cfg.CAPTURE_HEIGHT:
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.CAPTURE_HEIGHT)
    if cfg.CAPTURE_FPS:
        cap.set(cv2.CAP_PROP_FPS, cfg.CAPTURE_FPS)


def _try_open(index, backend):
    """Try one (index, backend); return an opened+working capture or None."""
    try:
        cap = cv2.VideoCapture(index, backend) if backend else cv2.VideoCapture(index)
    except Exception:
        return None
    if not cap.isOpened():
        cap.release()
        return None
    _configure(cap)
    ok, _ = cap.read()          # confirm frames actually flow (not just "opened")
    if not ok:
        cap.release()
        return None
    return cap


def open_camera(preferred=None):
    """Return (cap, index) for the first working camera, or (None, None)."""
    first = preferred if preferred is not None else cfg.CAMERA_INDEX
    indices = []
    for i in (first, 0, 1, 2):
        if i not in indices:
            indices.append(i)

    # On macOS, AVFoundation is the right backend; 0 == CAP_ANY as a fallback.
    av = getattr(cv2, "CAP_AVFOUNDATION", 0)
    backends = []
    for b in (av, 0):
        if b not in backends:
            backends.append(b)

    for index in indices:
        for backend in backends:
            cap = _try_open(index, backend)
            if cap is not None:
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
                print(f"Camera opened: index {index}, {w}x{h} @ {fps:.0f}fps "
                      f"(MJPG={'on' if cfg.USE_MJPG else 'off'}).")
                return cap, index
    return None, None
