# ActiveBreak — AI-Verified Exercise Break Timer

**ActiveBreak** is a Chrome extension that enforces healthy exercise breaks. When your timer runs out, every tab locks and a dedicated break tab opens — it only unlocks after on-device AI pose detection verifies you completed your reps with real form.

## Features

- ⏰ **Customizable break intervals:** Every 20/30/60 minutes (plus a 10-second test mode).
- 🏋️ **Exercise variety:** Jumping Jacks, Squats, Push-ups, or "Surprise me" for a random pick each break.
- 🤖 **Verified form, not just movement:** MediaPipe Pose Landmarker (bundled locally) tracks 33 body landmarks. Each exercise has a form state machine — a rep only counts on full range of motion:
  - **Jumping Jacks (10 by default):** wrists above your nose *and* ankles wider than 1.5× shoulder width, then back to standing.
  - **Squats (8 by default):** knee angle below 110°, then back above 160°.
  - **Push-ups (5 by default):** body in plank, elbow angle below 100°, then locked out past 150°.
- ⚙️ **Configurable rep targets:** A settings page (gear icon in the popup, or right-click the extension → Options) lets you set 1–50 reps per exercise, with auto-save.
- 🎯 **Live coaching:** A skeleton overlay is drawn on your video with real-time form hints ("Deeper — hips down to knee level").
- 📊 **Live progress everywhere:** Rep progress is mirrored through `chrome.storage` — the popup ring and every locked tab show "3 of 8 reps verified" in real time, and the popup tracks today's totals (breaks completed, reps verified).
- 🔁 **Recurring timer:** After each completed break the timer automatically re-arms.
- 🪟 **All-tab lock:** Every tab shows a lock screen with a button that jumps to the break tab. Closing the break tab mid-break just reopens it.
- 🔒 **Privacy first:** The model, wasm runtime, and inference all live and run inside the extension. Video never leaves your device.
- 🧘 **Graceful fallback:** No camera, denied permission, or no WebGL? You get an enforced 30-second breather instead of being locked out. A "Skip this break" escape hatch always exists (skipped breaks don't count toward your stats).
- ♿ **Accessible:** Live regions announce rep progress, the segmented progress bar carries real `progressbar` semantics, focus states are visible throughout, and all motion respects `prefers-reduced-motion`.

## Design

All three surfaces (popup, break page, lock screen) share a single set of design tokens — color, type scale, radii, elevation, and motion curves — defined in each stylesheet's `:root` block. The popup is state-aware: it acts as a setup form when idle, a countdown status surface while the timer runs (settings tucked behind "Adjust schedule"), and a live progress mirror during breaks. The lock screen intentionally stays quiet: one primary action, live progress, no nagging.

## How It Works

1. **Set up:** Click the extension icon, pick your interval and exercise, hit **Start timer**.
2. **Work:** A countdown ring in the popup shows time until your next break.
3. **Break time:** All tabs lock and a break tab opens with your assigned exercise.
4. **Move:** Pose detection tracks your body and counts only full-range reps, with live form hints.
5. **Resume:** Once your reps are verified, hit **Back to work** — every tab unlocks and the next timer starts automatically.

## Installation

1. Clone or download this repository.
2. Go to `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `ActiveBreak` folder.
5. Tip: use the **10s (test)** interval to try the full flow immediately. Chrome asks for camera access once (for the extension's break page) on your first break.

## File Structure

```
ActiveBreak/
  background.js           # Alarm lifecycle, break state, break-tab management
  break/
    break.html            # Dedicated break page (opens as a tab during breaks)
    break.js              # Pose detection + per-exercise form state machines
    break.css             # Break page styles (clean light theme)
  content/
    overlay.js            # Lock screen injected into every tab during a break
    overlay.css           # Lock screen styles
  icons/
    logo.png              # Extension icon
  manifest.json           # Chrome extension manifest (MV3)
  options/
    options.html/.js/.css # Settings page: configurable rep targets (auto-save)
  popup/
    popup.html/.js/.css   # Popup: timer setup, countdown ring, stop/restart
  vendor/
    tasks-vision/         # MediaPipe Tasks Vision bundle + wasm (local, no CDN)
    pose_landmarker_lite.task  # Pose model (~5.5 MB, runs on-device)
  bench/
    benchmark.html/.js    # Browser benchmarks (model load, inference, storage)
    accuracy-bench.mjs    # Synthetic rep-count FSM tests
    results.json          # Latest measured numbers
```

## Benchmarks

Local performance harness in `bench/`. Numbers below are from a Mac dev machine (Chrome 150, GPU delegate); your results may vary.

| Metric | Measured |
|---|---|
| Model load (cold) | ~83 ms |
| Model load (warm median) | ~49 ms |
| Pose inference | ~7.9 ms/frame median |
| Production throughput | ~30 fps (camera frame rate) |
| `chrome.storage` sync | ~0.3 ms median (background → UI) |
| Rep FSM (synthetic) | 6/6 test cases pass |

### Run

```bash
cd bench
npm install
node run-browser-only.mjs      # model load + inference
node run-storage-playwright.mjs # chrome.storage latency (extension context)
npm run accuracy               # synthetic rep-count FSM tests
node run-cold-start.mjs        # fresh-profile cold start
```

Latest full results: `bench/results.json`.

**Note:** Synthetic FSM tests validate the rep-counting logic on ideal landmark sequences. Real-world webcam accuracy requires labeled exercise video and is not benchmarked here.

## Why a dedicated break tab?

Manifest V3 forbids loading remote code, and arbitrary websites' Content Security Policies block injected scripts — so pose detection can't run inside a content script. Instead, the break runs in an extension-owned page where the bundled wasm runtime is allowed (`wasm-unsafe-eval` CSP), and the camera permission is granted once for the extension rather than per-website.

## Privacy

- The pose model and wasm runtime are **bundled inside the extension** — nothing is fetched at runtime.
- Video frames are processed in memory on your device and never stored or transmitted.

## Technologies Used

- Chrome Extensions API (Manifest V3): alarms, storage, content scripts, extension pages
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (Tasks Vision, bundled locally)
- Vanilla JavaScript (ES6+)

## License

MIT License
