import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  type NativeImage,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  shell,
  dialog
} from 'electron';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyPngDataUrlToClipboard } from './utils/clipboard';
import { savePngDataUrlToFile } from './utils/save';
import {
  getAlwaysOnTopLevel,
  getOverlayWindowBounds,
  selectPrimaryScreenSource,
  shouldUseNativeFullscreen
} from './main/platform';

const execFileAsync = promisify(execFile);

// --- Single instance lock ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let overlayWindow: BrowserWindow | null = null;
let overlayReadyPromise: Promise<void> | null = null;
let tray: Tray | null = null;
let isQuitting = false;

class ScreenCapturePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenCapturePermissionError';
  }
}

const HOTKEY = 'CommandOrControl+Alt+A';

function createTrayIcon(): NativeImage {
  // 32x32 RGBA icon – large enough for Windows 10 system tray
  const size = 32;
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      const isRing = Math.abs(dist - r) < size * 0.09;
      const isCross = dist < r * 0.6 && (Math.abs(dx) < size * 0.07 || Math.abs(dy) < size * 0.07);

      if (isRing || isCross) {
        buf[idx] = 0;      // R
        buf[idx + 1] = 168; // G
        buf[idx + 2] = 255; // B
        buf[idx + 3] = 255; // A
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const bounds = getOverlayWindowBounds(display);

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    movable: false,
    resizable: false,
    hasShadow: false,
    fullscreenable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (shouldUseNativeFullscreen(process.platform)) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setFullScreen(true);
  } else {
    win.setBounds(bounds);
    win.setAlwaysOnTop(true, getAlwaysOnTopLevel(process.platform));
  }

  overlayReadyPromise = win.loadFile(path.join(__dirname, 'renderer', 'index.html')).then(() => undefined);

  win.on('blur', () => {
    if (win.isVisible()) {
      win.hide();
    }
  });

  // Close to tray instead of quitting
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function isProbablyBlankImage(image: NativeImage): boolean {
  if (image.isEmpty()) return true;

  const bitmap = image.getBitmap();
  if (bitmap.length === 0) return true;

  // Electron returns BGRA bytes. Sampling is enough to detect the macOS
  // Screen Recording failure mode, where desktopCapturer returns a solid
  // black frame instead of the real desktop.
  const stride = 4;
  const pixelCount = Math.floor(bitmap.length / stride);
  const sampleEvery = Math.max(1, Math.floor(pixelCount / 4000));
  let sampled = 0;
  let nonBlack = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += sampleEvery) {
    const offset = pixel * stride;
    const b = bitmap[offset] ?? 0;
    const g = bitmap[offset + 1] ?? 0;
    const r = bitmap[offset + 2] ?? 0;
    const a = bitmap[offset + 3] ?? 0;

    sampled += 1;
    if (a > 0 && (r > 8 || g > 8 || b > 8)) {
      nonBlack += 1;
    }
  }

  return sampled > 0 && nonBlack / sampled < 0.002;
}

async function captureWithDesktopCapturer(): Promise<NativeImage> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.max(1, Math.floor(width * primaryDisplay.scaleFactor)),
      height: Math.max(1, Math.floor(height * primaryDisplay.scaleFactor))
    },
    fetchWindowIcons: false
  });

  const source = selectPrimaryScreenSource(sources, primaryDisplay);

  if (!source) {
    throw new Error('Unable to capture screen source.');
  }

  return source.thumbnail;
}

async function captureWithMacScreencapture(): Promise<NativeImage> {
  const tempPath = path.join(os.tmpdir(), `pinchclip-${process.pid}-${Date.now()}.png`);

  try {
    // Capture the full display set. Region capture (-R) is unreliable across
    // macOS display coordinate spaces and can fail with "could not create image
    // from rect" on otherwise valid displays.
    await execFileAsync('/usr/sbin/screencapture', ['-x', '-t', 'png', tempPath]);
    const png = await fs.readFile(tempPath);
    const image = nativeImage.createFromBuffer(png);

    if (image.isEmpty() || isProbablyBlankImage(image)) {
      throw new Error('macOS screencapture returned an empty or blank image.');
    }

    return image;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function capturePrimaryScreenDataUrl(): Promise<string> {
  if (process.platform === 'darwin') {
    try {
      return (await captureWithMacScreencapture()).toDataURL();
    } catch (macError) {
      const electronImage = await captureWithDesktopCapturer();
      if (!isProbablyBlankImage(electronImage)) {
        return electronImage.toDataURL();
      }

      throw new ScreenCapturePermissionError(
        'PinchClip needs macOS Screen Recording permission before it can capture the screen.'
      );
    }
  }

  return (await captureWithDesktopCapturer()).toDataURL();
}

async function showScreenRecordingHelp(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'PinchClip needs Screen Recording permission to capture your Mac screen.',
    detail:
      'Open System Settings → Privacy & Security → Screen Recording, enable PinchClip, then quit and reopen the app.',
    buttons: ['Open Settings', 'OK'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

async function showCaptureOverlay(): Promise<void> {
  if (!overlayWindow) return;

  try {
    const dataUrl = await capturePrimaryScreenDataUrl();
    await overlayReadyPromise;
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.send('screen-captured', dataUrl);
  } catch (error) {
    console.error('Failed to capture screen:', error);
    if (error instanceof ScreenCapturePermissionError) {
      await showScreenRecordingHelp();
    }
  }
}

function registerGlobalHotkey(): void {
  const ok = globalShortcut.register(HOTKEY, () => {
    void showCaptureOverlay();
  });

  if (!ok) {
    const message = `Failed to register global shortcut: ${HOTKEY}`;
    console.warn(message);

    if (process.platform === 'win32' && tray) {
      tray.displayBalloon({
        title: 'PinchClip hotkey unavailable',
        content: 'Ctrl+Alt+A is already used by another app. Use the tray menu to capture, or free that shortcut.'
      });
    } else {
      void dialog.showMessageBox({
        type: 'warning',
        title: 'PinchClip hotkey unavailable',
        message,
        detail: 'Use the tray menu to capture, or free that shortcut and restart PinchClip.'
      });
    }
  }
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('PinchClip');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Capture Screen',
      click: () => void showCaptureOverlay()
    },
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => void showCaptureOverlay());
}

function setupIpc(): void {
  ipcMain.handle('capture-screen', async () => {
    return capturePrimaryScreenDataUrl();
  });

  ipcMain.handle('copy-image', (_event, dataUrl: string) => {
    copyPngDataUrlToClipboard(dataUrl);
    return true;
  });

  ipcMain.handle('save-image', async (event, dataUrl: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return savePngDataUrlToFile(win?.id ?? -1, dataUrl);
  });

  ipcMain.on('hide-overlay', () => {
    overlayWindow?.hide();
  });

  ipcMain.on('open-file-location', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

app.on('second-instance', () => {
  // If someone tries to launch a second instance, trigger capture in the existing one
  void showCaptureOverlay();
});

app.whenReady().then(() => {
  overlayWindow = createOverlayWindow();
  createTray();
  registerGlobalHotkey();
  setupIpc();

  app.on('activate', () => {
    if (!overlayWindow) {
      overlayWindow = createOverlayWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do nothing — keep the app running in the tray
});
