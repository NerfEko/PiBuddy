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
  tests/            ← Node --test unit tests (run with npm test)
```

## Reaction pipeline

Reactions are generated in the `turn_end` event handler (`extension/index.ts`). The flow:

1. **`turn_end` fires** → `classifyTurn()` extracts a `TurnSummary` from the assistant message and tool results (file edits, bash output, errors, etc.)
2. **Throttle checks** → `maybeGenerateReaction()` enforces:
   - Hidden/muted/reaction-disabled settings → skip
   - `reactionMode === "off"` → skip
   - `summary.noteworthy === false` → skip (quiet turns don't react)
   - Token policy cooldown/budget gates (`canUseModelReaction()`)
   - 15% random skip to avoid every-turn reactions
3. **Model reaction** → `generateModelReaction()` in `extension/reaction.ts`:
   - Finds a cheap model via `findCheapModel()` (Copilot → Anthropic → Google → OpenAI)
   - Builds a prompt from the buddy's personality and the turn summary
   - Calls `complete()` with the context's abort signal and a small `maxTokens` budget
   - Truncates the result via `shortenReactionText()` (tries full text → first sentence → clauses → word-by-word)
4. **Local fallback** → `generateLocalReaction()` in `extension/reaction-core.ts`:
   - Picks an opener from `OPENERS[turnKind]` and optionally appends a stat-based tail
   - Used when model reactions are unavailable, gated, or `reactionMode !== "cheap-model"`
5. **Bubble rendered** → `buddy.lastSaid` and `visual.bubbleText` are set, editor shows bubble for 10 seconds
6. **Cleanup** → `session_shutdown` saves state and calls `clearBuddyEditor()`

### shortenReactionText

`extension/reaction.ts` — trims model output to fit `maxChars`. Strategy:

1. Full cleaned text (if ≤ maxChars)
2. Text without leading `*italic*` label (if ≤ maxChars)
3. Splits into sentence + clause candidates, picks one that fits
4. Falls back to word-by-word accumulation

### Token policy

`extension/token-policy.ts` — `canUseModelReaction()` gates model reactions with:

- **Turn cooldown**: 1 turn between model reactions (`reactionTurnCooldown`)
- **Time cooldown**: 10 seconds between model reactions (`reactionTimeCooldownMs`)
- **Session caps**: `maxReactionCallsPerSession` (30) and shared `maxBuddyModelCallsPerSession` (50)
- **Usage tracking**: `recordModelUsage()` updates `state.sessionUsage` for telemetry (not used for gating)

## Event lifecycle

Relevant events wired in `extension/index.ts`:

| Event              | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `session_start`    | Load state, install editor, install footer      |
| `turn_start`       | Set animation to "thinking"                     |
| `message_update`   | Set animation to "speaking"                     |
| `turn_end`         | Classify turn, generate reaction, update bubble |
| `agent_end`        | Reset animation to "idle"                       |
| `session_shutdown` | Save state, clear editor                        |

## State

Global state lives at `~/.pi/pi-buddy/state.json` — persists across all projects.
Never store state in the project `.pi/` directory.

## Key conventions

- Extension entry: `extension/index.ts` exports a default `(pi: ExtensionAPI) => void`
- All imports use `.ts` extensions (loaded by jiti, no compile step needed)
- Peer deps (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`) are NOT bundled — listed in `peerDependencies` only
- Tests run with `npm test` → `node --test extension/tests/*.test.ts`
- All 12 tests must pass before committing (11 pass, 1 known failure — `commands-editor.test.ts` requires `@mariozechner/pi-tui` peer dep, crashes at import)

## Editor approach

Two components work together:

### `BuddySpriteOverlay` (overlay)

A separate TUI overlay anchored `bottom-right`, rendering the sprite + name line. Always visible when active buddy exists.

### `BuddyEditor extends CustomEditor` (main input)

Renders the base editor at reduced width, then prepends a single overflow line for the bubble:

```
[ reaction text here ]-      ← prepended bubble line (when active)
> user input here...          ← original editor lines
```

- Bubble is **one line** prepended via `result.unshift()`, formatted as `[ {colored text} ]-` padded to full terminal width.
- When bubble is inactive, an empty line is prepended to keep layout stable.
- Bubble auto-clears after 10 seconds (`bubbleUntil` timeout).
- Hearts (" ♥ ♥ ♥ ") are rendered inline in the sprite overlay, replacing the sprite's first blank line.

## Model selection

`cheap-model.ts` auto-detects a cheap model in this order:

1. User's `preferredModel` setting (if set and has valid API key)
2. GitHub Copilot (tries `gpt-4o`, `gpt-4o-mini`, `claude-haiku-4.5`, `gemini-3-flash-preview`)
3. Direct Anthropic (`claude-haiku-4`, `claude-haiku-4.5`)
4. Direct Google (`gemini-2.0-flash`, `gemini-1.5-flash`)
5. Direct OpenAI (`gpt-4o-mini`, `gpt-4o`)
6. Active model fallback — whatever model the current session uses

## What NOT to do

- Do not add a `setEditorComponent(undefined)` to restore default on shutdown — the custom editor IS the default for this session
- Do not use `process.cwd()` for state paths — always use `getGlobalStatePath()`
- Do not add `showBubbleOverlay` back — bubbles are rendered inline in the editor
- Do not change the species list or stat names without updating `constants.ts` AND `commands.ts` autocomplete
