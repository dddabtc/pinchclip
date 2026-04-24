export interface DisplayLike {
  id: number | string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenSourceLike {
  id: string;
  name: string;
  display_id: string;
}

export type Platform = NodeJS.Platform;

export function getOverlayWindowBounds(display: DisplayLike): DisplayLike['bounds'] {
  const { x, y, width, height } = display.bounds;
  return { x, y, width, height };
}

export function shouldUseNativeFullscreen(platform: Platform): boolean {
  // Transparent frameless fullscreen windows are fragile on Windows. A window
  // sized to the display bounds behaves like an overlay without entering native
  // fullscreen mode.
  return platform !== 'win32';
}

export function getAlwaysOnTopLevel(platform: Platform): 'normal' | 'screen-saver' {
  return platform === 'win32' ? 'screen-saver' : 'normal';
}

export function selectPrimaryScreenSource<T extends ScreenSourceLike>(
  sources: T[],
  primaryDisplay: { id: number | string }
): T | undefined {
  const primaryDisplayId = String(primaryDisplay.id);

  return (
    sources.find((source) => source.display_id === primaryDisplayId) ??
    sources.find((source) => source.id.toLowerCase().startsWith('screen:')) ??
    sources.find((source) => source.name.toLowerCase().includes('entire')) ??
    sources.find((source) => source.name.toLowerCase().includes('screen')) ??
    sources[0]
  );
}
