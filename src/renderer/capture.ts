import { AnnotationEngine, normalizeRect, type Point, type Tool } from './annotate';
import { Toolbar } from './toolbar';

type Mode = 'idle' | 'selecting' | 'annotating';

const screenshotCanvas = document.getElementById('screenshotCanvas') as HTMLCanvasElement;
const selectionCanvas = document.getElementById('selectionCanvas') as HTMLCanvasElement;
const annotationCanvas = document.getElementById('annotationCanvas') as HTMLCanvasElement;
const textInput = document.getElementById('textInput') as HTMLInputElement;

const screenshotCtxRaw = screenshotCanvas.getContext('2d');
const selectionCtxRaw = selectionCanvas.getContext('2d');

if (!screenshotCtxRaw || !selectionCtxRaw) {
  throw new Error('Canvas context initialization failed.');
}

const shotCtx = screenshotCtxRaw;
const selCtx = selectionCtxRaw;

const annotationEngine = new AnnotationEngine(annotationCanvas);

let mode: Mode = 'idle';
let selectionStart: Point | null = null;
let selectionEnd: Point | null = null;
let drawingStart: Point | null = null;
let drawingPreviewImage: ImageData | null = null;
let currentTool: Tool = 'rectangle';

const toolbar = new Toolbar({
  onToolChange: (tool) => {
    currentTool = tool;
    annotationEngine.setTool(tool);
    annotationCanvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
  },
  onColorChange: (color) => annotationEngine.setColor(color),
  onCopy: () => void copySelection(),
  onSave: () => void saveSelection(),
  onCancel: () => resetAndHide()
});

function setCanvasSizes(width: number, height: number): void {
  [screenshotCanvas, selectionCanvas, annotationCanvas].forEach((canvas) => {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  });

  annotationEngine.resize(width, height);
}

function drawSelectionOverlay(): void {
  selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

  if (!selectionStart || !selectionEnd) return;

  const rect = normalizeRect(selectionStart, selectionEnd);

  selCtx.save();
  selCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  selCtx.fillRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  selCtx.clearRect(rect.x, rect.y, rect.width, rect.height);

  selCtx.strokeStyle = '#00d8ff';
  selCtx.lineWidth = 1.5;
  selCtx.setLineDash([6, 4]);
  selCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  selCtx.restore();
}

function getMousePoint(event: MouseEvent): Point {
  return { x: event.clientX, y: event.clientY };
}

function isInsideSelection(point: Point): boolean {
  if (!selectionStart || !selectionEnd) return false;
  const rect = normalizeRect(selectionStart, selectionEnd);
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function beginSelection(event: MouseEvent): void {
  if (mode === 'annotating') return;

  mode = 'selecting';
  selectionStart = getMousePoint(event);
  selectionEnd = selectionStart;
  drawSelectionOverlay();
}

function updateSelection(event: MouseEvent): void {
  if (mode !== 'selecting' || !selectionStart) return;

  selectionEnd = getMousePoint(event);
  drawSelectionOverlay();
}

function finalizeSelection(): void {
  if (mode !== 'selecting' || !selectionStart || !selectionEnd) return;

  const rect = normalizeRect(selectionStart, selectionEnd);
  if (rect.width < 4 || rect.height < 4) {
    mode = 'idle';
    selectionStart = null;
    selectionEnd = null;
    selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    return;
  }

  mode = 'annotating';
  annotationCanvas.style.pointerEvents = 'auto';
  annotationCanvas.style.cursor = 'crosshair';
  toolbar.showAt(rect.x, rect.y + rect.height + 10);
}

function mergeSelectedRegionToDataUrl(): string | null {
  if (!selectionStart || !selectionEnd) return null;
  const rect = normalizeRect(selectionStart, selectionEnd);

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.floor(rect.width));
  output.height = Math.max(1, Math.floor(rect.height));
  const outCtx = output.getContext('2d');
  if (!outCtx) return null;

  outCtx.drawImage(
    screenshotCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );
  outCtx.drawImage(
    annotationCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );

  return output.toDataURL('image/png');
}

async function copySelection(): Promise<void> {
  const dataUrl = mergeSelectedRegionToDataUrl();
  if (!dataUrl) return;

  await window.pinchclip.copyImage(dataUrl);
  resetAndHide();
}

async function saveSelection(): Promise<void> {
  const dataUrl = mergeSelectedRegionToDataUrl();
  if (!dataUrl) return;

  const result = await window.pinchclip.saveImage(dataUrl);
  if (result.filePath) {
    window.pinchclip.openFileLocation(result.filePath);
  }
  if (!result.canceled) resetAndHide();
}

function resetAndHide(): void {
  mode = 'idle';
  selectionStart = null;
  selectionEnd = null;
  drawingStart = null;
  drawingPreviewImage = null;

  textInput.classList.add('hidden');
  toolbar.hide();

  selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  annotationEngine.getCanvas().getContext('2d')?.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

  annotationCanvas.style.pointerEvents = 'none';
  window.pinchclip.hideOverlay();
}

function beginAnnotation(event: MouseEvent): void {
  if (mode !== 'annotating') return;

  const point = getMousePoint(event);
  if (!isInsideSelection(point)) return;

  if (currentTool === 'text') {
    textInput.value = '';
    textInput.style.left = `${point.x}px`;
    textInput.style.top = `${point.y}px`;
    textInput.classList.remove('hidden');
    textInput.focus();
    textInput.onblur = () => {
      annotationEngine.drawText(textInput.value, point);
      textInput.classList.add('hidden');
    };
    return;
  }

  drawingStart = point;
  const ctx = annotationEngine.getCanvas().getContext('2d');
  if (!ctx) return;
  drawingPreviewImage = ctx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
}

function updateAnnotation(event: MouseEvent): void {
  if (mode !== 'annotating' || !drawingStart || !drawingPreviewImage) return;

  const point = getMousePoint(event);
  const ctx = annotationEngine.getCanvas().getContext('2d');
  if (!ctx) return;

  ctx.putImageData(drawingPreviewImage, 0, 0);
  annotationEngine.drawShape(drawingStart, point);
}

function finalizeAnnotation(event: MouseEvent): void {
  if (mode !== 'annotating' || !drawingStart || !drawingPreviewImage) return;

  const point = getMousePoint(event);
  const ctx = annotationEngine.getCanvas().getContext('2d');
  if (!ctx) return;

  ctx.putImageData(drawingPreviewImage, 0, 0);
  annotationEngine.drawShape(drawingStart, point);

  drawingStart = null;
  drawingPreviewImage = null;
}

function loadCapture(dataUrl: string): void {
  const img = new Image();
  img.onload = () => {
    setCanvasSizes(img.width, img.height);
    shotCtx.clearRect(0, 0, img.width, img.height);
    shotCtx.drawImage(img, 0, 0, img.width, img.height);

    annotationCanvas.style.pointerEvents = 'none';
    toolbar.hide();

    mode = 'idle';
    selectionStart = null;
    selectionEnd = null;
    drawingStart = null;
    drawingPreviewImage = null;

    selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    annotationEngine.getCanvas().getContext('2d')?.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  };
  img.src = dataUrl;
}

window.pinchclip.onScreenCaptured((dataUrl) => {
  loadCapture(dataUrl);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    resetAndHide();
  }
});

selectionCanvas.addEventListener('mousedown', beginSelection);
selectionCanvas.addEventListener('mousemove', updateSelection);
selectionCanvas.addEventListener('mouseup', finalizeSelection);

annotationCanvas.addEventListener('mousedown', beginAnnotation);
annotationCanvas.addEventListener('mousemove', updateAnnotation);
annotationCanvas.addEventListener('mouseup', finalizeAnnotation);

document.addEventListener('mousedown', (event) => {
  if (event.target !== textInput && !textInput.classList.contains('hidden')) {
    textInput.blur();
  }
});
