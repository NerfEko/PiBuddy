import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type BuddyCommandAction = 'default' | 'hatch' | 'list' | 'switch' | 'card' | 'pet' | 'mute' | 'unmute' | 'off' | 'on' | 'reroll';

export interface BuddyCommand {
  action: BuddyCommandAction;
  value?: string;
}

export interface BuddyCommandRuntime {
  openDefault(ctx: any): Promise<void>;
  hatch(ctx: any): Promise<void>;
  list(ctx: any): Promise<void>;
  switchBuddy(ctx: any, query: string): Promise<void>;
  card(ctx: any): Promise<void>;
  pet(ctx: any): Promise<void>;
  mute(ctx: any): Promise<void>;
  unmute(ctx: any): Promise<void>;
  off(ctx: any): Promise<void>;
  on(ctx: any): Promise<void>;
  reroll(ctx: any): Promise<void>;
}

export function parseBuddyCommand(args?: string): BuddyCommand {
  const trimmed = (args || '').trim();
  if (!trimmed) return { action: 'default' };
  const [head, ...rest] = trimmed.split(/\s+/);
  const value = rest.join(' ').trim() || undefined;
  switch (head) {
    case 'hatch':
    case 'list':
    case 'card':
    case 'pet':
    case 'mute':
    case 'unmute':
    case 'off':
    case 'on':
    case 'reroll':
      return { action: head };
    case 'switch':
      return { action: 'switch', value };
    default:
      return { action: 'default' };
  }
}

export async function executeBuddyCommand(command: BuddyCommand, ctx: any, runtime: BuddyCommandRuntime): Promise<void> {
  switch (command.action) {
    case 'default':
      return runtime.openDefault(ctx);
    case 'hatch':
      return runtime.hatch(ctx);
    case 'list':
      return runtime.list(ctx);
    case 'switch':
      return runtime.switchBuddy(ctx, command.value || '');
    case 'card':
      return runtime.card(ctx);
    case 'pet':
      return runtime.pet(ctx);
    case 'mute':
      return runtime.mute(ctx);
    case 'unmute':
      return runtime.unmute(ctx);
    case 'off':
      return runtime.off(ctx);
    case 'on':
      return runtime.on(ctx);
    case 'reroll':
      return runtime.reroll(ctx);
  }
}

export function registerBuddyCommands(pi: ExtensionAPI, runtime: BuddyCommandRuntime): void {
  pi.registerCommand('buddy', {
    description: 'Hatch, view, and manage Pi buddies',
    handler: async (args, ctx) => {
      await executeBuddyCommand(parseBuddyCommand(args), ctx, runtime);
    },
  });
}
