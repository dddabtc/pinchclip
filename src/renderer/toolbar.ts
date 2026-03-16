import type { Tool } from './annotate';

interface ToolbarCallbacks {
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const PRESET_COLORS = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#ffffff', '#000000'];

export class Toolbar {
  private root: HTMLDivElement;
  private toolButtons = new Map<Tool, HTMLButtonElement>();

  constructor(private callbacks: ToolbarCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'toolbar';
    this.root.className = 'toolbar hidden';
    this.build();
    document.body.appendChild(this.root);
  }

  private build(): void {
    const tools: Array<{ key: Tool; label: string }> = [
      { key: 'rectangle', label: '▭' },
      { key: 'ellipse', label: '◯' },
      { key: 'arrow', label: '➤' },
      { key: 'text', label: 'T' }
    ];

    const toolGroup = document.createElement('div');
    toolGroup.className = 'toolbar-group';

    tools.forEach((tool, index) => {
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn tool-btn';
      btn.textContent = tool.label;
      btn.title = tool.key;
      if (index === 0) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.setActiveTool(tool.key);
        this.callbacks.onToolChange(tool.key);
      });
      toolGroup.appendChild(btn);
      this.toolButtons.set(tool.key, btn);
    });

    const colorGroup = document.createElement('div');
    colorGroup.className = 'toolbar-group';

    PRESET_COLORS.forEach((color, index) => {
      const swatch = document.createElement('button');
      swatch.className = 'toolbar-btn color-btn';
      swatch.style.background = color;
      if (index === 0) swatch.classList.add('active');
      swatch.addEventListener('click', () => {
        this.clearActiveColor();
        swatch.classList.add('active');
        this.callbacks.onColorChange(color);
      });
      colorGroup.appendChild(swatch);
    });

    const customColor = document.createElement('input');
    customColor.type = 'color';
    customColor.className = 'color-picker';
    customColor.value = PRESET_COLORS[0];
    customColor.addEventListener('input', () => {
      this.clearActiveColor();
      this.callbacks.onColorChange(customColor.value);
    });
    colorGroup.appendChild(customColor);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'toolbar-group';

    actionGroup.appendChild(this.makeActionButton('Copy', this.callbacks.onCopy));
    actionGroup.appendChild(this.makeActionButton('Save', this.callbacks.onSave));
    actionGroup.appendChild(this.makeActionButton('Cancel', this.callbacks.onCancel));

    this.root.append(toolGroup, colorGroup, actionGroup);
  }

  private makeActionButton(text: string, handler: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn action-btn';
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }

  private clearActiveColor(): void {
    this.root.querySelectorAll('.color-btn.active').forEach((el) => el.classList.remove('active'));
  }

  private setActiveTool(tool: Tool): void {
    this.toolButtons.forEach((btn) => btn.classList.remove('active'));
    this.toolButtons.get(tool)?.classList.add('active');
  }

  showAt(x: number, y: number): void {
    this.root.classList.remove('hidden');
    this.root.style.left = `${Math.max(12, x)}px`;
    this.root.style.top = `${Math.max(12, y)}px`;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
