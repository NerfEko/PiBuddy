import { matchesKey } from '@mariozechner/pi-tui';
import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import { STATS } from './constants.ts';
import { renderSprite } from './sprites.ts';
import { getHighestStat, getLowestStat } from './roll.ts';
import { statBar, starsForRarity } from './theme.ts';
import type { BuddyRecord, BuddyState } from './state.ts';

function box(lines: string[], width: number): string[] {
  const inner = width - 4;
  return [
    `+${'-'.repeat(width - 2)}+`,
    ...lines.map((line) => `| ${line.slice(0, inner).padEnd(inner)} |`),
    `+${'-'.repeat(width - 2)}+`,
  ];
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderBuddyCardLines(buddy: BuddyRecord, state: BuddyState, width = 42): string[] {
  const sprite = renderSprite(buddy.species, 0, buddy.eye, buddy.hat, false);
  const personality = wrap(buddy.personality, width - 4);
  const high = getHighestStat(buddy.stats);
  const low = getLowestStat(buddy.stats);
  const lines = [
    `${starsForRarity(buddy.rarity)} ${buddy.rarity.toUpperCase()} ${buddy.species}`,
    ...sprite,
    `${buddy.name}${buddy.shiny ? ' ✨' : ''}`,
    ...personality,
    '',
    ...STATS.map((stat) => `${stat.padEnd(10)} ${statBar(buddy.stats[stat], 12)} ${String(buddy.stats[stat]).padStart(3)}`),
    '',
    `Peak: ${high.name} ${high.value}`,
    `Low: ${low.name} ${low.value}`,
    buddy.lastSaid ? `Last said: ${buddy.lastSaid}` : '',
    `Soul: ${buddy.soulSource}`,
    `Session tokens: ↑${state.sessionUsage.estimatedInputTokens} ↓${state.sessionUsage.estimatedOutputTokens}`,
    'Esc/q/Enter to close',
  ].filter(Boolean);
  return box(lines, width);
}

export async function showBuddyCard(ctx: ExtensionContext, buddy: BuddyRecord, state: BuddyState): Promise<void> {
  await ctx.ui.custom<void>(
    (_tui, _theme, _kb, done) => ({
      render(width: number) {
        return renderBuddyCardLines(buddy, state, Math.min(44, Math.max(38, width - 4)));
      },
      invalidate() {},
      handleInput(data: string) {
        if (matchesKey(data, 'escape') || matchesKey(data, 'enter') || data.toLowerCase() === 'q') done(undefined);
      },
    }),
    { overlay: true, overlayOptions: { anchor: 'right-center', width: 44, maxHeight: '95%', margin: 1 } },
  );
}

export async function showRosterBrowser(ctx: ExtensionContext, state: BuddyState): Promise<string | null> {
  const choices = state.buddies.filter((buddy) => !buddy.archived);
  if (choices.length === 0) return null;
  let index = Math.max(0, choices.findIndex((buddy) => buddy.id === state.activeBuddyId));
  return ctx.ui.custom<string | null>(
    (_tui, _theme, _kb, done) => ({
      render(width: number) {
        const inner = Math.max(28, Math.min(42, width - 4));
        const lines = [
          'Buddy roster',
          '',
          ...choices.map((buddy, i) => `${i === index ? '>' : ' '} ${buddy.name} · ${buddy.species} · ${starsForRarity(buddy.rarity)}`),
          '',
          '↑/↓ move · Enter switch · Esc close',
        ];
        return box(lines, inner);
      },
      invalidate() {},
      handleInput(data: string) {
        if (matchesKey(data, 'escape') || data.toLowerCase() === 'q') done(null);
        else if (matchesKey(data, 'up')) index = (index - 1 + choices.length) % choices.length;
        else if (matchesKey(data, 'down')) index = (index + 1) % choices.length;
        else if (matchesKey(data, 'enter')) done(choices[index]!.id);
      },
    }),
    { overlay: true, overlayOptions: { anchor: 'right-center', width: 42, margin: 1 } },
  );
}
