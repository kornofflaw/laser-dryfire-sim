# Running the simulator from an iPad (M3 or newer)

Goal (Andrew, 2026-09-25): **the iPad is the remote control** (settings,
course, start/stop, review). **The range itself plays full screen on the
projector or TV** the iPad is connected to.

Short version: no rewrite is needed. The app runs in iPad Safari, and it now
has a **Display** window (the range) and a **Controller** window (the remote),
both on the iPad, talking to each other inside the iPad. The Display window goes
on the external screen using Stage Manager. If Safari's windowing gets in the
way on the real rig, the fallback is a small native wrapper app (below) that
uses the same two pages.

## How it works

```
iPad
 ├─ Controller window (controller.html)  → on the iPad screen: big Start/Stop,
 │     course list, settings, review buttons, live timer/results
 │        │  BroadcastChannel (inside the iPad; no network, no server)
 │        ▼
 └─ Display window (index.html?display)  → on the projector/TV via USB-C → HDMI:
       the range, 3D scenes, laser camera, scoring, timer panels
```

- Everything is scored and timed in the Display window, exactly as before
  (one shot path, one clock). The Controller only sends commands.
- Sounds: an iPad won't play audio in a window nobody has tapped. The Display
  is on the projector and never tapped, so its sounds are sent to the
  Controller and played there. The iPad's audio goes to the HDMI output (the
  projector/TV speakers) either way.
- The Controller keeps the iPad awake (if the iPad locks, the Display stops).
- Works the same on a laptop with a projector as a second screen: Display window
  full screen on the projector, Controller on the laptop.

## Setting it up on the iPad (to test)

Needs: an M-series iPad on iPadOS 17 or newer, a USB-C hub with HDMI + USB-A +
power pass-through, the projector/TV on HDMI, the laser camera on USB-A.

1. Plug the hub into the iPad, then the HDMI cable and power into the hub.
2. Turn on **Stage Manager** (Control Center → Stage Manager). With Stage
   Manager the external screen is a second screen, not a mirror of the iPad.
3. In Safari open **https://laser-dryfire-sim.vercel.app/controller.html**.
4. Tap **Open Display window**. Safari opens the range in a new tab.
5. Make that tab its own window: press and hold the tab → **Open in New Window**
   (or drag the tab out).
6. Move that window to the projector: tap the **•••** at the top of the window →
   **Move to Display** (wording varies by iPadOS version). Make it as large as
   it goes on that screen.
7. Back on the iPad screen the Controller should say **Display connected**.
   Tap **Courses** → Bill Drill → **Start**. The beep comes from the TV/projector.
8. Laser camera (once): in the Controller's Setup column tap **Start camera**.
   If Safari asks for camera permission, the prompt appears in the Display
   window; tap it there with the window back on the iPad screen, or allow the
   camera for the site in Settings → Apps → Safari → Camera. Then **Calibrate**
   with the Display window where it will stay.

## What to look for (open questions only the real rig can answer)

- **Does the Display window keep running** when you're touching the
  Controller? (Both windows are visible, so it should. If the range freezes,
  tell me: that's the case for the native wrapper.)
- **Full screen on the projector:** a Safari window may keep its tab/address
  bar at the top. That's fine for testing (calibration only uses the page
  area), but it wastes some screen. The wrapper removes it.
- **Camera in the Display window:** frame rate (Setup shows fps) and whether
  capture keeps going while the Controller is in front.
- **Latency:** there should be none you can notice; commands are local.

## Changes made for iPad and touch

- Controller page + Display mode (`controller.html`, `js/controller.js`,
  `js/remote.js`, `index.html?display`). The Display's Setup drawer also has
  "Open Display window" / "Open Controller window" buttons (laptop use).
- Sound forwarding to the Controller when the Display can't play audio.
- Audio also unlocks at the end of a tap (iPad doesn't count the start of a tap).
- The toolbar Start button becomes Stop during a run (no Esc key on a tablet).
- Screen wake lock on both pages.
- `manifest.webmanifest`: the site can be added to the Home Screen and opens
  full screen (useful for single-screen use; for the two-window setup stay in
  Safari, because a Home Screen app keeps separate storage and can't open a
  second window).
- The 3D range lowers its resolution by itself on slow frames and uses much
  smaller target textures (less memory, faster hits).

## What the research found

| Need | iPad Safari (iPadOS 17+) |
| --- | --- |
| The app (ES modules, import map, WebGL2) | Supported (import maps since Safari 16.4; WebGL2 runs on Metal). An M3 GPU is much faster than what the 3D scenes need. |
| USB laser camera | iPadOS 17 added USB Video Class (UVC) cameras, and Safari's getUserMedia can open them. |
| Camera exposure control | Not available to Safari for USB cameras. With the IR-pass filter the dot is still the brightest thing; if it washes out, use a camera that keeps its exposure setting. |
| Frame timing | requestVideoFrameCallback is in Safari 15.4+; camera.js falls back cleanly if captureTime is missing. |
| External screen | Mirroring by default; a real second screen with Stage Manager on M-series iPads (wired). AirPlay only mirrors, so use HDMI. |
| Fullscreen API | Works on iPad for any element (Safari 16.4+), but needs a tap in that window, so the Display on the projector can't enter it by itself. |

## If Safari's windows get in the way: native wrapper (plan B)

A small iPad app (Capacitor or a plain Swift app with WKWebView) that:
- shows `controller.html` on the iPad screen, and
- when a screen is connected, opens a second, **true full-screen** window on it
  (UIKit's external-display scene) showing `index.html?display`.

Same web code, same messages. It removes the Safari tab bar and the manual
"move window" steps, and could add native camera exposure control later.
Cost: needs a Mac with Xcode to build, an Apple Developer account ($99/yr),
and App Store (or TestFlight) distribution. Only worth it if the Safari setup
above has problems on the real rig.

A full native rewrite (Swift, RealityKit) is not recommended: months of work
and it would drop the Windows/Mac/projector-PC versions.

Sources:
- [iPadOS 17 external USB camera support (MacRumors)](https://forums.macrumors.com/threads/ipados-17-adds-support-for-studio-display-webcam-and-other-external-usb-cameras.2391966/page-2)
- [Safari + getUserMedia with a UVC device on iPadOS 17 (Qiita)](https://qiita.com/youtoy/items/40f4c1b9b996d91aff3e)
- [External camera exposure on iPadOS 17 (Apple forums)](https://developer.apple.com/forums/thread/740341)
- [requestVideoFrameCallback (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [caniuse](https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback)
- [Fullscreen API on iPad Safari (Apple forums)](https://developer.apple.com/forums/thread/133248), [caniuse](https://caniuse.com/fullscreen)
