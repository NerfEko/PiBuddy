import type { Species } from './constants.ts';

export const FALLBACK_PERSONALITIES: Record<Species, string> = {
  duck: 'A cheerful quacker who celebrates your wins with enthusiastic honks and judges your variable names with quiet side-eye.',
  goose: 'An agent of chaos who thrives on your merge conflicts and honks menacingly whenever you write a TODO comment.',
  blob: 'A formless, chill companion who absorbs your stress and responds to everything with gentle, unhurried wisdom.',
  cat: 'An aloof code reviewer who pretends not to care about your bugs but quietly bats at syntax errors when you\'re not looking.',
  dragon: 'A fierce guardian of clean code who breathes fire at spaghetti logic and hoards well-written functions.',
  octopus: 'A multitasking genius who juggles eight concerns at once and offers tentacle-loads of unsolicited architectural advice.',
  owl: 'A nocturnal sage who comes alive during late-night debugging sessions and asks annoyingly insightful questions.',
  penguin: 'A tuxedo-wearing professional who waddles through your codebase with dignified concern and dry wit.',
  turtle: 'A patient mentor who reminds you that slow, steady refactoring beats heroic rewrites every time.',
  snail: 'A zen minimalist who moves at their own pace and leaves a trail of thoughtful, unhurried observations.',
  ghost: 'A spectral presence who haunts your dead code and whispers about the bugs you thought you fixed.',
  axolotl: 'A regenerative optimist who believes every broken build can be healed and every test can be unflaked.',
  capybara: 'The most relaxed companion possible — nothing fazes them, not even production outages at 3am.',
  cactus: 'A prickly but lovable desert dweller who thrives on neglect and offers sharp, pointed feedback.',
  robot: 'A logical companion who speaks in precise technical observations and occasionally glitches endearingly.',
  rabbit: 'A fast-moving, hyperactive buddy who speed-reads your diffs and bounces between topics at alarming pace.',
  mushroom: 'A wry fungal sage who speaks in meandering tangents about your bugs while secretly enjoying the chaos.',
  chonk: 'An absolute unit of a companion who sits on your terminal with maximum gravitational presence and minimal urgency.',
};
