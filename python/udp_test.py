#!/usr/bin/env python3
"""
udp_test.py — send FAKE shots to Unity to test the Unity half by itself.

No camera, no laser, no calibration needed. This proves the path
    UDP  ->  ShotReceiver  ->  raycast  ->  HitMarker
and in particular checks the Y-FLIP: it sends each screen corner and tells you
where the marker SHOULD appear, so a flipped marker exposes a flip bug instantly.

RUN (with your Unity scene in PLAY mode):
    python udp_test.py            one pass through center + four corners
    python udp_test.py --loop     repeat forever (Ctrl-C to stop)

Coordinates use the detector's convention:
    (0,0) = TOP-LEFT of the screen, (1,1) = BOTTOM-RIGHT.
Unity's ShotReceiver flips Y, so after the flip these land where described.
Packets carry the same 3rd field (perf_counter timestamp) as the real detector.
"""

import argparse
import socket
import time

import detector_config as cfg   # same UDP_IP / UDP_PORT the real detector uses

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# (x, y, where-it-should-land-on-screen)
SHOTS = [
    (0.5, 0.5, "CENTER of the screen"),
    (0.0, 0.0, "TOP-LEFT corner"),
    (1.0, 0.0, "TOP-RIGHT corner"),
    (1.0, 1.0, "BOTTOM-RIGHT corner"),
    (0.0, 1.0, "BOTTOM-LEFT corner"),
]


def send(x, y):
    msg = f"{x:.5f},{y:.5f},{time.perf_counter():.6f}"   # exact detector format
    sock.sendto(msg.encode(), (cfg.UDP_IP, cfg.UDP_PORT))
    return msg


def one_pass():
    for x, y, where in SHOTS:
        msg = send(x, y)
        print(f"  sent {msg}  ->  marker should appear at the {where}")
        time.sleep(1.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true", help="repeat until Ctrl-C")
    args = ap.parse_args()

    print(f"Sending test shots to {cfg.UDP_IP}:{cfg.UDP_PORT} "
          f"(must match the port in your Unity ShotReceiver).")
    print("Make sure your Unity scene is in PLAY mode.\n")
    time.sleep(1.0)

    try:
        one_pass()
        while args.loop:
            print("  --- repeating ---")
            one_pass()
    except KeyboardInterrupt:
        print("\nStopped.")
        return

    print("\nDone. If markers landed where described, the Unity half is correct.")
    print("If TOP and BOTTOM were swapped, the Y-flip in ShotReceiver is wrong")
    print("(it should use 1 - y when building the viewport point).")


if __name__ == "__main__":
    main()
