import { clipboard, nativeImage } from 'electron';

export function copyPngDataUrlToClipboard(dataUrl: string): void {
  const image = nativeImage.createFromDataURL(dataUrl);
  clipboard.writeImage(image);
}
