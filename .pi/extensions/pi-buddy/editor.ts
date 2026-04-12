import { CustomEditor, type ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { truncateToWidth } from '@mariozechner/pi-tui';
import { buildSidecarLines, type BuddyVisualState } from './sidecar.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

export interface BuddyEditorRuntime {
  getState(): BuddyState;
  getActiveBuddy(): BuddyRecord | undefined;
  getVisualState(): BuddyVisualState;
  registerEditor(editor: BuddyEditor): void;
  unregisterEditor(editor: BuddyEditor): void;
}

export class BuddyEditor extends CustomEditor {
  private runtime: BuddyEditorRuntime;

  constructor(
    tui: any,
    theme: any,
    keybindings: any,
    runtime: BuddyEditorRuntime,
  ) {
    super(tui, theme, keybindings);
    this.runtime = runtime;
    this.runtime.registerEditor(this);
  }

  render(width: number): string[] {
    const state = this.runtime.getState();
    const buddy = this.runtime.getActiveBuddy();
    const visual = this.runtime.getVisualState();
    const sidecar = buildSidecarLines(width, state, buddy, visual);
    if (sidecar.width <= 0) return super.render(width);

    const gap = 1;
    const leftWidth = Math.max(20, width - sidecar.width - gap);
    const left = super.render(leftWidth);
    const maxLines = Math.max(left.length, sidecar.lines.length);
    const merged: string[] = [];
    for (let i = 0; i < maxLines; i += 1) {
      const leftLine = (left[i] ?? '').padEnd(leftWidth);
      const rightLine = truncateToWidth(sidecar.lines[i] ?? '', sidecar.width);
      merged.push(`${leftLine}${' '.repeat(gap)}${rightLine}`.slice(0, width));
    }
    return merged;
  }
}

export function installBuddyEditor(pi: ExtensionAPI, ctx: any, runtime: BuddyEditorRuntime): void {
  if (!ctx.hasUI) return;
  ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) => new BuddyEditor(tui, theme, keybindings, runtime));
}
