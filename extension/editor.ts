import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { visibleWidth, type OverlayHandle } from '@mariozechner/pi-tui';
import { IDLE_SEQUENCE } from './constants.ts';
import { renderReactionBubble } from './bubble.ts';
import { renderSprite } from './sprites.ts';
import { starsForRarity } from './theme.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

export interface BuddyVisualState {
  animationState: 'idle' | 'thinking' | 'speaking' | 'petted';
  bubbleText: string | null;
  bubbleUntil: number;
  heartsUntil: number;
  tick: number;
}

export interface BuddyEditorRuntime {
  getState(): BuddyState;
  getActiveBuddy(): BuddyRecord | undefined;
  getVisualState(): BuddyVisualState;
}

let buddyOverlayHandle: OverlayHandle | undefined;

function rpad(str: string, width: number): string {
  const vw = visibleWidth(str);
  if (vw >= width) return str;
  return str + ' '.repeat(width - vw);
}

function widest(lines: string[]): number {
  return lines.length > 0 ? Math.max(...lines.map((line) => visibleWidth(line))) : 0;
}

function getBubbleRenderWidth(text: string, spriteWidth: number): number {
  return Math.max(24, Math.min(34, Math.max(text.length + 4, spriteWidth + 14)));
}

function getBuddyDisplay(runtime: BuddyEditorRuntime): {
  visible: boolean;
  reservedWidth: number;
  overlayWidth: number;
  lines: string[];
} {
  const state = runtime.getState();
  const buddy = runtime.getActiveBuddy();
  const visual = runtime.getVisualState();

  if (!buddy || state.settings.hidden) {
    return { visible: false, reservedWidth: 0, overlayWidth: 0, lines: [] };
  }

  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  const nameLine = `${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`;
  const spriteWidth = Math.max(widest(sprite), visibleWidth(nameLine));
  const showBubble = !!(visual.bubbleText && visual.bubbleUntil > now);
  const showHearts = visual.heartsUntil > now;
  const heartsStr = showHearts ? '  ♥  ♥  ♥  '.slice(0, spriteWidth) : '';

  const spriteLines = [...sprite];
  let heartsInlined = false;
  if (heartsStr && spriteLines[0]?.trim() === '') {
    spriteLines[0] = heartsStr.padEnd(spriteWidth);
    heartsInlined = true;
  }

  const panelLines = [
    ...(!heartsInlined && heartsStr ? [heartsStr.padEnd(spriteWidth)] : []),
    ...spriteLines.map(line => line.padEnd(spriteWidth)),
    nameLine.padEnd(spriteWidth),
  ];

  const bubbleText = showBubble ? visual.bubbleText! : '';
  const bubbleLines = bubbleText
    ? renderReactionBubble(bubbleText, getBubbleRenderWidth(bubbleText, spriteWidth))
    : [];
  const bubbleWidth = widest(bubbleLines);

  const totalLines = Math.max(panelLines.length, bubbleLines.length);
  const lines: string[] = [];
  for (let i = 0; i < totalLines; i++) {
    const bubblePart = bubbleWidth > 0 ? (bubbleLines[i] ?? '').padEnd(bubbleWidth) + ' ' : '';
    const spritePart = (panelLines[i] ?? '').padEnd(spriteWidth);
    lines.push((bubblePart + spritePart).trimEnd());
  }

  return {
    visible: true,
    reservedWidth: spriteWidth + 2,
    overlayWidth: bubbleWidth + (bubbleWidth > 0 ? 1 : 0) + spriteWidth,
    lines,
  };
}

class BuddyOverlayComponent {
  constructor(private runtime: BuddyEditorRuntime) {}

  render(width: number): string[] {
    const display = getBuddyDisplay(this.runtime);
    if (!display.visible) return [];
    return display.lines.map(line => {
      if (visibleWidth(line) > width) return line.slice(0, width);
      return line;
    });
  }

  invalidate(): void {}
  dispose(): void {}
}

export class BuddyEditor extends CustomEditor {
  private runtime: BuddyEditorRuntime;
  private animTimer: ReturnType<typeof setInterval> | undefined;

  constructor(tui: any, theme: any, keybindings: any, runtime: BuddyEditorRuntime) {
    super(tui, theme, keybindings);
    this.runtime = runtime;
    this.animTimer = setInterval(() => {
      const visual = this.runtime.getVisualState();
      visual.tick += 1;
      if (visual.bubbleUntil && Date.now() > visual.bubbleUntil) visual.bubbleText = null;
      if (visual.animationState === 'petted' && Date.now() > visual.heartsUntil) visual.animationState = 'idle';
      this.tui.requestRender();
    }, 500);
  }

  render(width: number): string[] {
    const state = this.runtime.getState();
    const buddy = this.runtime.getActiveBuddy();

    if (!buddy || state.settings.hidden || width < 60) {
      return super.render(width);
    }

    const display = getBuddyDisplay(this.runtime);
    const editorWidth = Math.max(30, width - display.reservedWidth);
    const editorLines = super.render(editorWidth);
    return editorLines.map(line => rpad(line, width));
  }

  dispose(): void {
    if (this.animTimer) clearInterval(this.animTimer);
  }
}

function hideBuddyOverlay(): void {
  buddyOverlayHandle?.hide();
  buddyOverlayHandle = undefined;
}

export function installBuddyEditor(_pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;

  hideBuddyOverlay();
  void ctx.ui.custom<void>(
    (_tui: any, _theme: any, _keybindings: any, _done: (result: void) => void) => new BuddyOverlayComponent(runtime),
    {
      overlay: true,
      overlayOptions: () => {
        const display = getBuddyDisplay(runtime);
        return {
          anchor: 'bottom-right',
          width: Math.max(56, display.overlayWidth),
          margin: { right: 1, bottom: 2 },
          nonCapturing: true,
          visible: (termWidth: number) => termWidth >= 60 && getBuddyDisplay(runtime).visible,
        };
      },
      onHandle: (handle) => {
        buddyOverlayHandle = handle;
      },
    },
  );

  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) =>
    new BuddyEditor(tui, theme, keybindings, runtime),
  );
}

export function clearBuddyEditor(ctx: any): void {
  hideBuddyOverlay();
  if (ctx.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }
}
