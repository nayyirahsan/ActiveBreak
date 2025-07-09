# ActiveBreak - AI-Powered Productivity Timer

**ActiveBreak** is a Chrome extension that enforces healthy exercise breaks using AI-powered webcam tracking. It helps you stay productive and healthy by requiring you to complete a physical exercise—verified by your webcam—before you can resume work.

## Features

- ⏰ **Customizable Break Intervals:** Set how often you want to be reminded to take a break (e.g., every 20 or 30 minutes, or 1 hour).
- 🏋️ **Exercise Variety:** Choose from Jumping Jacks, Squats, Push-ups, or let the extension pick a random exercise for you.
- 🤖 **AI-Powered Verification:** Uses on-device AI pose detection (MediaPipe) to verify that you actually perform the exercise.
- 🔒 **Privacy First:** All AI processing runs locally in your browser. Your webcam feed never leaves your device.
- 🎨 **Modern, Accessible UI:** Clean, user-friendly popup and overlay with accessibility in mind.

## How It Works

1. **Set Up:** Click the extension icon and choose your break interval and exercise.
2. **Work:** The timer runs in the background while you work.
3. **Break Time:** When it's time for a break, an overlay appears on your screen, blocking access until you complete the exercise.
4. **AI Verification:** The extension uses your webcam and AI pose detection to verify the exercise.
5. **Resume Work:** Once verified, the overlay disappears and you can continue working.

## Installation

1. Clone or download this repository.
2. Go to `chrome://extensions` in your Chrome browser.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the `ActiveBreak` project folder.

## File Structure

```
ActiveBreak/
  background.js         # Handles alarms, break logic, and messaging
  content/
    overlay.js          # Injected overlay and AI pose detection logic
    overlay.css         # Styles for the break overlay
  icons/
    logo.png            # Extension icon
  manifest.json         # Chrome extension manifest
  popup/
    popup.html          # Extension popup UI
    popup.js            # Popup logic (timer setup, status)
    popup.css           # Popup styles
```

## Privacy

- Your camera feed is **never sent anywhere**—all AI runs locally in your browser.
- No data leaves your device.

## Technologies Used

- Chrome Extensions API (Manifest V3)
- JavaScript (ES6+)
- [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose.html) for AI exercise detection
- HTML/CSS (modern, accessible design)

## Contributing

Pull requests and suggestions are welcome! Please open an issue to discuss your ideas.

## License

MIT License 