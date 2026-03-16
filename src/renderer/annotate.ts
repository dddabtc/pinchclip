export type Tool = 'rectangle' | 'ellipse' | 'arrow' | 'text';

export interface Point {
  x: number;
  y: number;
}

interface AnnotationState {
  tool: Tool;
  color: string;
  lineWidth: number;
}

export class AnnotationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: AnnotationState = {
    tool: 'rectangle',
    color: '#ff3b30',
    lineWidth: 2
  };

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get annotation context');

    this.canvas = canvas;
    this.ctx = ctx;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.resize(canvas.width, canvas.height);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setTool(tool: Tool): void {
    this.state.tool = tool;
  }

  setColor(color: string): void {
    this.state.color = color;
  }

  getTool(): Tool {
    return this.state.tool;
  }

  getColor(): string {
    return this.state.color;
  }

  drawShape(start: Point, end: Point): void {
    this.ctx.save();
    this.ctx.strokeStyle = this.state.color;
    this.ctx.lineWidth = this.state.lineWidth;

    if (this.state.tool === 'rectangle') {
      const { x, y, width, height } = normalizeRect(start, end);
      this.ctx.strokeRect(x, y, width, height);
    } else if (this.state.tool === 'ellipse') {
      const { x, y, width, height } = normalizeRect(start, end);
      this.ctx.beginPath();
      this.ctx.ellipse(
        x + width / 2,
        y + height / 2,
        Math.abs(width / 2),
        Math.abs(height / 2),
        0,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
    } else if (this.state.tool === 'arrow') {
      drawArrow(this.ctx, start, end, this.state.color, this.state.lineWidth);
    }

    this.ctx.restore();
  }

  drawText(text: string, point: Point): void {
    const value = text.trim();
    if (!value) return;

    this.ctx.save();
    this.ctx.fillStyle = this.state.color;
    this.ctx.font = '24px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(value, point.x, point.y);
    this.ctx.restore();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}

export function normalizeRect(start: Point, end: Point): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  lineWidth: number
): void {
  const headLength = 14;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
