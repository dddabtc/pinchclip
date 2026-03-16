import { contextBridge, ipcRenderer } from 'electron';

const api = {
  captureScreen: (): Promise<string> => ipcRenderer.invoke('capture-screen'),
  copyImage: (dataUrl: string): Promise<boolean> => ipcRenderer.invoke('copy-image', dataUrl),
  saveImage: (dataUrl: string): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('save-image', dataUrl),
  hideOverlay: (): void => ipcRenderer.send('hide-overlay'),
  openFileLocation: (filePath: string): void => ipcRenderer.send('open-file-location', filePath),
  onScreenCaptured: (handler: (dataUrl: string) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, dataUrl: string) => handler(dataUrl);
    ipcRenderer.on('screen-captured', wrapped);
    return () => ipcRenderer.removeListener('screen-captured', wrapped);
  }
};

contextBridge.exposeInMainWorld('pinchclip', api);

declare global {
  interface Window {
    pinchclip: typeof api;
  }
}
