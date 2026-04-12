import type { Species } from './constants.ts';

export const COMPACT_FACES: Record<Species, string> = {
  duck: '({E}>',
  goose: '({E}>',
  blob: '({E}{E})',
  cat: '={E}ω{E}=',
  dragon: '<{E}~{E}>',
  octopus: '~({E}{E})~',
  owl: '({E})({E})',
  penguin: '({E}>)',
  turtle: '[{E}_{E}]',
  snail: '{E}(@)',
  ghost: '/{E}{E}\\',
  axolotl: '}{E}.{E}{',
  capybara: '({E}oo{E})',
  cactus: '|{E}  {E}|',
  robot: '[{E}{E}]',
  rabbit: '({E}..{E})',
  mushroom: '|{E}  {E}|',
  chonk: '({E}.{E})',
};

export function renderCompactFace(face: string, eye: string): string {
  return face.replaceAll('{E}', eye);
}
