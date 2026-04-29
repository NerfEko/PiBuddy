# piBuddy — Project Context

## What this is

`pi-buddy` is an installable pi extension package. It renders an animated ASCII companion to the right of the Pi input box, with sprite animation, reactions via LLM, soul generation, and a roster system.

Install target: `pi install git:github.com/eko/piBuddy` or `npm:pi-buddy`

## File layout

```
extension/          ← all extension source (pi loads this dir)
  index.ts          ← bootstrap, event wiring, command handlers
  constants.ts      ← species, rarities, eyes, hats, stats, sprites, timing
  state.ts          ← BuddyState schema, global state path, load/save
  roll.ts           ← mulberry32 PRNG, hatch/stat generation
  sprites.ts        ← sprite rendering + eye substitution
  editor.ts         ← CustomEditor subclass: sprite overlay on input box
  soul.ts           ← one-time name/personality generation via cheap model
  reaction.ts       ← async model reaction pipeline
  reaction-core.ts  ← pure turn classification + local fallback reactions
  cheap-model.ts    ← shared model auto-detection (Copilot → Anthropic → Google → OpenAI)
  commands.ts       ← /buddy subcommand routing + autocomplete
  card.ts           ← buddy card overlay + roster browser UI
  theme.ts          ← rarity stars, stat bars, sidecar width helpers
  faces.ts          ← compact face strings for narrow mode
  personalities.ts  ← local fallback personality blurbs per species
  token-policy.ts   ← budget gates, cooldowns, usage tracking
  bubble.ts         ← speech bubble + hearts helpers (unused in editor, kept for card)
  sidecar.ts        ← legacy sidecar helpers (kept for tests)
  tests/            ← Node --test unit tests (run with npm test)
```

## State

Global state lives at `~/.pi/pi-buddy/state.json` — persists across all projects.
Never store state in the project `.pi/` directory.

## Key conventions

- Extension entry: `extension/index.ts` exports a default `(pi: ExtensionAPI) => void`
- All imports use `.ts` extensions (loaded by jiti, no compile step needed)
- Peer deps (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`) are NOT bundled — listed in `peerDependencies` only
- Tests run with `npm test` → `node --test extension/tests/*.test.ts`
- All 13 tests must pass before committing

## Editor sidecar approach

`BuddyEditor extends CustomEditor`. It:
1. Renders the base editor at reduced width (`width - spriteWidth - 2`) so text wraps before the sprite
2. Pads editor lines back to full width
3. Overlays sprite lines onto the right side using `overlayRight()`
4. Prepends overflow lines above the editor (1 when idle, 3 when bubble active)

Bubble format when active (3 overflow lines):
```
.---------------------.  [sprite line 0]
| reaction text here  |  [sprite line 1]
'---------------------.  [sprite line 2]
```

## Model selection

`cheap-model.ts` auto-detects from: GitHub Copilot → Anthropic → Google → OpenAI → active model fallback. No hardcoded provider assumptions.

## What NOT to do

- Do not add a `setEditorComponent(undefined)` to restore default on shutdown — the custom editor IS the default for this session
- Do not use `process.cwd()` for state paths — always use `getGlobalStatePath()`
- Do not add `showBubbleOverlay` back — bubbles are rendered inline in the editor
- Do not change the species list or stat names without updating `constants.ts` AND `commands.ts` autocomplete
