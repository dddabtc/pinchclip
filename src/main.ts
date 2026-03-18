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
  shell
} from 'electron';
import path from 'node:path';
import { copyPngDataUrlToClipboard } from './utils/clipboard';
import { savePngDataUrlToFile } from './utils/save';

// --- Single instance lock ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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
  const { width, height } = screen.getPrimaryDisplay().bounds;

  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
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

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreen(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

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

async function capturePrimaryScreenDataUrl(): Promise<string> {
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

  const source =
    sources.find((s) => s.display_id === String(primaryDisplay.id)) ??
    sources.find((s) => s.name.toLowerCase().includes('entire')) ??
    sources[0];

  if (!source) {
    throw new Error('Unable to capture screen source.');
  }

  return source.thumbnail.toDataURL();
}

async function showCaptureOverlay(): Promise<void> {
  if (!overlayWindow) return;

  try {
    const dataUrl = await capturePrimaryScreenDataUrl();
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.send('screen-captured', dataUrl);
  } catch (error) {
    console.error('Failed to capture screen:', error);
  }
}

function registerGlobalHotkey(): void {
  const ok = globalShortcut.register(HOTKEY, () => {
    void showCaptureOverlay();
  });

  if (!ok) {
    console.warn(`Failed to register global shortcut: ${HOTKEY}`);
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
