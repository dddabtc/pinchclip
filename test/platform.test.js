const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getOverlayWindowBounds,
  shouldUseNativeFullscreen,
  getAlwaysOnTopLevel,
  selectPrimaryScreenSource
} = require('../dist/main/platform.js');

test('uses primary display origin for overlay bounds', () => {
  const display = { id: 2528732444, bounds: { x: -1920, y: 120, width: 1920, height: 1080 } };
  assert.deepEqual(getOverlayWindowBounds(display), { x: -1920, y: 120, width: 1920, height: 1080 });
});

test('does not use native fullscreen for transparent Windows overlay', () => {
  assert.equal(shouldUseNativeFullscreen('win32'), false);
  assert.equal(getAlwaysOnTopLevel('win32'), 'screen-saver');
  assert.equal(shouldUseNativeFullscreen('darwin'), true);
});

test('selects desktopCapturer source by display_id before name fallback', () => {
  const primaryDisplay = { id: 2 };
  const sources = [
    { id: 'screen:1:0', name: 'Screen 1', display_id: '1' },
    { id: 'screen:2:0', name: 'Screen 2', display_id: '2' }
  ];

  assert.equal(selectPrimaryScreenSource(sources, primaryDisplay), sources[1]);
});

test('falls back to first screen source when display_id is unavailable', () => {
  const sources = [
    { id: 'screen:1:0', name: 'Screen 1', display_id: '' },
    { id: 'window:1:0', name: 'Some Window', display_id: '' }
  ];

  assert.equal(selectPrimaryScreenSource(sources, { id: 42 }), sources[0]);
});
