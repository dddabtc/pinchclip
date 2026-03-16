import { BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'node:fs';

export async function savePngDataUrlToFile(
  browserWindowId: number,
  dataUrl: string
): Promise<{ canceled: boolean; filePath?: string }> {
  const browserWindow = BrowserWindow.fromId(browserWindowId);

  const saveOptions = {
    title: 'Save Screenshot',
    defaultPath: `pinchclip-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  };

  const { canceled, filePath } = browserWindow
    ? await dialog.showSaveDialog(browserWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);

  if (canceled || !filePath) return { canceled: true };

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);

  return { canceled: false, filePath };
}
