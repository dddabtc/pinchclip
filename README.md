# PinchClip ✂️

Lightweight screenshot & annotation tool for Windows and macOS.

Global hotkey → select region → annotate → copy or save. That's it.

## Features

- **Global Hotkey**: `Ctrl+Alt+A` (Windows) / `Cmd+Alt+A` (macOS)
- **Region Selection**: Click and drag to capture any area of your screen
- **Annotations**: Rectangle, Ellipse, Arrow, Text
- **Color Picker**: Preset colors + custom color selection
- **Copy to Clipboard**: One click to copy your annotated screenshot
- **Save to File**: Export as PNG
- **System Tray**: Runs quietly in the background, close to tray
- **Cross-Platform**: Windows (.exe) and macOS (.dmg)

## Install

Download the latest release from [Releases](https://github.com/dddabtc/pinchclip/releases):

- **Windows**: `PinchClip-Setup-x.x.x.exe`
- **macOS**: `PinchClip-x.x.x.dmg`

## Build from Source

```bash
git clone https://github.com/dddabtc/pinchclip.git
cd pinchclip
npm install
npm run build
npm start
```

## macOS Permission

On first capture, macOS may require **Screen Recording** permission. If PinchClip shows a permission dialog or captures a black screen:

1. Open **System Settings → Privacy & Security → Screen Recording**
2. Enable **PinchClip**
3. Quit and reopen PinchClip

## Usage

1. Launch PinchClip — it sits in your system tray
2. Press `Ctrl+Alt+A` (Win) / `Cmd+Alt+A` (Mac) to start capture
3. Click and drag to select a region
4. Use the toolbar to annotate (rectangle, ellipse, arrow, text)
5. Click **Copy** to clipboard or **Save** to export as PNG
6. Press `ESC` to cancel

## Tech Stack

- Electron + TypeScript
- HTML5 Canvas for selection and annotations
- electron-builder for packaging

## License

MIT
