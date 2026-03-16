import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  type NativeImage,
  type Event,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  shell
} from 'electron';
import path from 'node:path';
import { copyPngDataUrlToClipboard } from './utils/clipboard';
import { savePngDataUrlToFile } from './utils/save';

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const HOTKEY = 'CommandOrControl+Shift+A';

function createTrayIcon(): NativeImage {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAZElEQVR4AWNABmJkYGD4z8DAwMhABv///2fg4uJiYGBg+M8AA0YkRjQYGBj+M7A0NDSYGBgY/p8BGgYGBhYGBgaG/4zQ0FAwMDD8Z2BgYAAhWmA0GEMQ0QjGoA1Q3QfE0A0Qk0h0QhQAAAvYQv1Jm9LZAAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event: Event) => {
  event.preventDefault();
});
