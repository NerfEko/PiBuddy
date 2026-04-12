import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { IDLE_SEQUENCE } from './constants.ts';
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

/** Pad a string (possibly with ANSI) to exact visible width */
function padToWidth(str: string, width: number): string {
  const vw = visibleWidth(str);
  if (vw >= width) return truncateToWidth(str, width);
  return str + ' '.repeat(width - vw);
}

/** Build a speech bubble that goes ABOVE the sprite */
function buildBubbleLines(text: string, maxWidth: number): string[] {
  if (!text || maxWidth < 8) return [];
  const innerW = Math.max(4, maxWidth - 4);
  const words = text.split(/\s+/);
  const wrapped: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > innerW && cur) {
      wrapped.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) wrapped.push(cur);
  const lines = wrapped.slice(0, 3);
  const w = Math.max(...lines.map(l => l.length));
  return [
    `.-${'-'.repeat(w)}-.`,
    ...lines.map(l => `| ${l.padEnd(w)} |`),
    `'-${'-'.repeat(w)}-'`,
    `  \\`,
  ];
}

/** Build the right-side buddy panel: bubble on top, sprite below, name at bottom */
function buildBuddyPanel(buddy: BuddyRecord, visual: BuddyVisualState, panelWidth: number): string[] {
  const now = Date.now();
  const frameToken = visual.animationState === 'idle'
    ? IDLE_SEQUENCE[visual.tick % IDLE_SEQUENCE.length]!
    : visual.animationState === 'speaking' ? 2 : 1;
  const blink = frameToken === -1;
  const frame = frameToken < 0 ? 0 : frameToken;

  const lines: string[] = [];

  // Bubble above sprite
  const showBubble = visual.bubbleText && visual.bubbleUntil > now;
  if (showBubble) {
    lines.push(...buildBubbleLines(visual.bubbleText!, panelWidth));
  }

  // Hearts
  if (visual.heartsUntil > now) lines.push('♥  ♥  ♥');

  // Sprite
  const sprite = renderSprite(buddy.species, frame, buddy.eye, buddy.hat, blink);
  lines.push(...sprite);

  // Name line
  lines.push(`${buddy.name}${buddy.shiny ? ' ✨' : ''} ${starsForRarity(buddy.rarity)}`);

  return lines;
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
    const visual = this.runtime.getVisualState();

    // No buddy or hidden or too narrow: normal editor
    if (!buddy || state.settings.hidden || width < 60) {
      return super.render(width);
    }

    // Panel width: just enough for sprite + bubble
    const panelWidth = Math.min(30, Math.max(14, Math.floor(width * 0.22)));
    const gap = 1;
    const editorWidth = width - panelWidth - gap;

    // Render editor at reduced width
    const editorLines = super.render(editorWidth);

    // Build buddy panel (bubble + sprite + name, top to bottom)
    const panelLines = buildBuddyPanel(buddy, visual, panelWidth);

    // Bottom-align panel with the editor: the name line sits at the
    // second-to-last editor line (one row up from the very bottom border)
    const totalLines = editorLines.length;
    const panelStart = Math.max(0, totalLines - panelLines.length - 1);
    const merged: string[] = [];

    for (let i = 0; i < totalLines; i++) {
      const left = padToWidth(editorLines[i] ?? '', editorWidth);
      const panelIdx = i - panelStart;
      let right = '';
      if (panelIdx >= 0 && panelIdx < panelLines.length) {
        right = panelLines[panelIdx]!;
      }
      merged.push(truncateToWidth(`${left} ${right}`, width));
    }

    return merged;
  }
}

export function installBuddyEditor(pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;
  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) =>
    new BuddyEditor(tui, theme, keybindings, runtime),
  );
}

export function clearBuddyWidget(ctx: any): void {
  if (ctx.hasUI) {
    ctx.ui.setEditorComponent(undefined);
  }
}
