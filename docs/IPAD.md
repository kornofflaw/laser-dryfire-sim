# Running the simulator on an iPad (M3 or newer)

Study done 2026-09-25. Short version: **no port is needed.** The app is already
a web page, and an M3 iPad runs it in Safari. What an iPad adds is a few
hardware questions (camera, projector, one USB-C port) and some touch fixes,
which are now done. Recommended path: use it in Safari, "Add to Home Screen"
so it opens full screen like an app. Only consider an App Store wrapper later.

## What already works on iPad Safari (iPadOS 17 or newer)

| Need | Status on iPad |
| --- | --- |
| The app itself (ES modules, import map, WebGL2 for the 3D scenes) | Supported. Import maps need Safari 16.4+; WebGL2 runs on Metal. An M3 GPU is far faster than the laptops the 3D scenes were built for. |
| USB laser camera (ELP etc.) | iPadOS 17 added USB Video Class (UVC) camera support, and Safari's `getUserMedia` can open it, so the camera path works unchanged. |
| Frame timing for shots | `requestVideoFrameCallback` is in Safari 15.4+. If Safari doesn't give `captureTime` for a USB camera, camera.js already falls back to `expectedDisplayTime`, then to the callback time (a few ms later; still one clock). |
| Full screen | The element Fullscreen API works on iPad (unprefixed since Safari 16.4). Better: Add to Home Screen, which opens with no browser bars (manifest added). |
| Settings, calibration, run log (localStorage) | Works. Note a Home Screen app keeps its own storage, separate from Safari's: calibrate inside the one you use. |
| Sounds and the spoken numbers | Works after the first tap (fixed: audio now also unlocks at the end of a tap, which is what iPad counts as a gesture). |

## Changes made for iPad (and any touch screen)

- Audio unlocks on `pointerup`/`touchend` too (iPad ignores `pointerdown` for this).
- The toolbar **Start** button turns into **Stop** during a run (no Esc key on a tablet).
- The screen is kept awake while the page is open (Screen Wake Lock), so the
  iPad doesn't dim or lock in the middle of a session.
- `manifest.webmanifest` + Apple meta tags: Share → **Add to Home Screen**
  gives a "Dry-Fire" icon that opens full screen, landscape.
- The 3D range lowers its render resolution by itself if frames get slow
  (an iPad Pro screen is ~5.6 million pixels at 2x), and uses much smaller
  target textures than before (less memory; Safari tabs have tighter limits).
- Tapping the target shoots, same as a mouse click (one shot path).

## Hardware setup to try

The iPad has **one USB-C port**, and the rig needs a camera in and a projector
out. Use a **USB-C hub/dock with HDMI + a USB-A port + power pass-through**.

1. Projector: HDMI from the hub. Two ways the picture can go to the projector:
   - **Mirroring** (default): the projector shows exactly the iPad screen, at
     the iPad's shape (4:3-ish), so a 16:9 projector shows black bars. Fine to
     start with.
   - **Extended display with Stage Manager** (M-series iPads, iPadOS 16.2+):
     drag the Safari / Home Screen app window onto the projector and make it
     full screen: fills a 16:9 image. Calibrate in whichever mode you'll shoot in.
2. Camera: the ELP camera into the hub's USB-A port. In the app: Setup → Start
   camera → pick it from the list → tune threshold → Calibrate.
3. Plug the hub into power so the iPad doesn't drain during a session.

## Risks / things only a real test can answer

- **Camera exposure:** iPadOS gives apps (and Safari) no manual exposure
  control for USB cameras. With the IR-pass filter the scene is dark and the
  laser dot is bright, so the auto-exposure should be OK, but if the dot is
  washed out, lock exposure on the camera itself (some UVC cameras remember
  settings set once from a computer) or use a camera with a fixed exposure.
- **Camera frame rate:** check Setup's fps readout. 60 fps is good; 30 fps
  still works but can merge two very fast shots.
- **Mirroring aspect ratio:** calibration must be redone if you switch between
  mirrored and extended display (the projected area changes).
- **Safari memory:** very long sessions switching between many 3D scenes;
  the range now frees old targets when changing courses. Reload the page if it
  ever becomes sluggish.

## Other routes (not recommended now)

| Route | What it is | Pros | Cons |
| --- | --- | --- | --- |
| **Web app in Safari / Home Screen (chosen)** | This site, as is | Nothing to install or approve; same code on every device; updates by pushing to main | Camera controls limited to what Safari exposes |
| App wrapper (Capacitor / WKWebView) | The same web code inside a small native app | App Store icon, offline, could add native camera controls later | Needs a Mac with Xcode to build, an Apple Developer account ($99/yr), App Store review for every update |
| Native rewrite (Swift, RealityKit, AVFoundation) | Start over as an iPad app | Full camera control (exposure, 120 fps where supported, exact frame times) | Months of work, iPad only, loses the Windows/Mac/projector-PC versions |

A wrapper only makes sense if Safari's camera access turns out to be the
weak point in real testing; the web code would move into it unchanged.

## What to test on the iPad (in order)

1. Open https://laser-dryfire-sim.vercel.app in Safari. Tap **Courses** →
   **Bill Drill** → **Start**. Tap the target after the beep. Sounds should play.
2. Share button → **Add to Home Screen**. Open it from the icon: no browser bars.
3. Try a 3D course (Stages → Paper and Steel) and the 3D knife attack: smooth?
4. Hub + projector: does the picture fill the projector (mirrored vs extended)?
5. Hub + camera: Setup → Start camera. Does the ELP camera appear? What fps?
   Then calibrate and shoot with the laser.

Sources:
- [iPadOS 17 external USB camera support (MacRumors)](https://forums.macrumors.com/threads/ipados-17-adds-support-for-studio-display-webcam-and-other-external-usb-cameras.2391966/page-2)
- [Safari + getUserMedia with a UVC device on iPadOS 17 (Qiita)](https://qiita.com/youtoy/items/40f4c1b9b996d91aff3e)
- [External camera exposure on iPadOS 17 (Apple forums)](https://developer.apple.com/forums/thread/740341)
- [requestVideoFrameCallback (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [caniuse](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback)
- [Fullscreen API on iPad Safari (Apple forums)](https://developer.apple.com/forums/thread/133248), [caniuse](https://caniuse.com/fullscreen)
