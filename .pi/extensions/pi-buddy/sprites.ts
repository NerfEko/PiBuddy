import { HAT_OVERLAYS, SPRITES, type Eye, type Hat, type Species } from './constants.ts';

export function substituteEyes(line: string, eye: string): string {
  return line.replaceAll('{E}', eye);
}

export function renderSprite(species: Species, frameIndex: number, eye: Eye, hat: Hat, blink = false): string[] {
  const frames = SPRITES[species];
  const base = frames[Math.max(0, Math.min(frames.length - 1, frameIndex))] ?? frames[0];
  const rendered = base.map((line) => substituteEyes(line, blink ? '-' : eye));
  if (hat !== 'none' && rendered[0].trim().length === 0) {
    rendered[0] = HAT_OVERLAYS[hat];
  }
  return rendered;
}
