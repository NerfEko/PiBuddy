import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type BuddyCommandAction = 'default' | 'hatch' | 'list' | 'switch' | 'card' | 'pet' | 'mute' | 'unmute' | 'off' | 'on' | 'reroll' | 'spawn' | 'rename' | 'delete' | 'model' | 'test';

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
  spawn(ctx: any, query: string): Promise<void>;
  rename(ctx: any, query: string): Promise<void>;
  reroll(ctx: any): Promise<void>;
  deleteBuddy(ctx: any): Promise<void>;
  model(ctx: any): Promise<void>;
  test(ctx: any, query: string): Promise<void>;
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
    case 'delete':
    case 'model':
      return { action: head };
    case 'test':
      return { action: head, value };
    case 'switch':
    case 'spawn':
    case 'rename':
      return { action: head, value };
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
    case 'spawn':
      return runtime.spawn(ctx, command.value || '');
    case 'rename':
      return runtime.rename(ctx, command.value || '');
    case 'delete':
      return runtime.deleteBuddy(ctx);
    case 'model':
      return runtime.model(ctx);
    case 'test':
      return runtime.test(ctx, command.value || '');
  }
}

export function registerBuddyCommands(pi: ExtensionAPI, runtime: BuddyCommandRuntime): void {
  const subcommands = ['hatch', 'list', 'switch', 'card', 'pet', 'mute', 'unmute', 'off', 'on', 'reroll', 'spawn', 'rename', 'delete', 'model', 'test'];
  const speciesList = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk'];

  pi.registerCommand('buddy', {
    description: 'Hatch, view, and manage Pi buddies',
    getArgumentCompletions: (prefix: string) => {
      const parts = prefix.trim().split(/\s+/);
      if (parts.length <= 1) {
        const items = subcommands.map(s => ({ value: s, label: s }));
        return items.filter(i => i.value.startsWith(parts[0] || ''));
      }
      // Second arg for spawn = species
      if (parts[0] === 'spawn' && parts.length === 2) {
        const items = speciesList.map(s => ({ value: `spawn ${s}`, label: s }));
        return items.filter(i => i.label.startsWith(parts[1] || ''));
      }
      return null;
    },
    handler: async (args, ctx) => {
      await executeBuddyCommand(parseBuddyCommand(args), ctx, runtime);
    },
  });
}
