# pi-buddy

> **Experimental** — this extension is a work in progress. Expect rough edges and layout quirks. Pull requests with improvements are very welcome.

<p align="center">
  <img src="docs/images/buddy.png" alt="pi-buddy screenshot" width="85%" />
</p>

A recreation of the Claude Code companion experience for [Pi](https://github.com/badlogic/pi-mono). Based on the idea of the Claude Code buddy — an animated ASCII creature that sits beside your input, reacts to what you are doing, and collects a roster of unique companions over time.

This is not an official project and has no affiliation with Anthropic or Claude Code.

## Install

```bash
pi install git:github.com/NerfEko/PiBuddy
```

Then do `/reload` or restart Pi. On first load, use `/buddy hatch` to get your first buddy.

## Features

- 18 species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk
- 5 rarity tiers: common, uncommon, rare, epic, legendary
- 5 stats per buddy: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
- Contextual reactions after each assistant turn, powered by a cheap model
- One-time soul generation at hatch — unique name and personality
- Roster system — collect multiple buddies and switch between them
- Custom footer showing buddy name, rarity, and token usage

## Commands

| Command | Description |
|---|---|
| `/buddy` | Show buddy card, or hatch one if none exist |
| `/buddy hatch` | Hatch a random new buddy |
| `/buddy spawn <species>` | Spawn a specific species |
| `/buddy list` | Browse your roster |
| `/buddy switch <name>` | Switch active buddy |
| `/buddy card` | View full stat card |
| `/buddy pet` | Pet your buddy |
| `/buddy rename <name>` | Rename active buddy |
| `/buddy delete` | Delete active buddy |
| `/buddy reroll` | Hatch another random buddy |
| `/buddy mute` / `/buddy unmute` | Toggle reactions |
| `/buddy off` / `/buddy on` | Hide or show the buddy |
| `/buddy model` | Pick which model to use for reactions |
| `/buddy enablefallbacks` | Enable local fallback reactions and names |
| `/buddy disablefallbacks` | Disable local fallbacks (model-only mode) |

Tab completion works on all subcommands and species names.

## Model usage

Buddy AI uses a cheap model auto-detected from your configured providers, in this order:

1. GitHub Copilot: gpt-4o, gpt-4o-mini, claude-haiku-4.5, gemini-3-flash-preview
2. Anthropic: claude-haiku-4.5, claude-haiku-4
3. Google: gemini-2.0-flash, gemini-1.5-flash
4. OpenAI: gpt-4o-mini, gpt-4o
5. Falls back to your active model if none of the above are available

Use `/buddy model` to override the auto-detected model.

A model is required for hatching new buddies (soul generation) and for contextual reactions. Without a model, the buddy displays but won't speak.

## Reactions

Reactions are generated using the buddy's name, personality, stats, and a summary of what just happened — including what files changed and what the AI said. This keeps reactions specific to the work rather than generic.

Reactions are dynamically sized to fit your terminal width. The character limit is computed from your editor width minus the buddy sprite and chrome, then trimmed to avoid visual clipping. If the model returns something too long, it's progressively shortened — first by picking the longest fitting sentence, then by word, then by hard truncation with an ellipsis.

## Token usage

- Soul generation: output capped at 220 tokens (hard cap), once per hatch
- Reactions: output token cap is derived from the dynamic character limit (60% of bubble char limit, min 28 chars), divided by ~3.5 chars/token, clamped by target 80 and hard cap 160. On a typical 80-col terminal this works out to ~13 output tokens; on wider terminals it scales up to 80. Input tokens vary with turn context. ~85% chance, 1 turn cooldown, max 30 reactions per session
- Normal sessions (reactions only, no hatches): typically well under 2K output tokens per session

## State

Buddy state is stored globally at `~/.pi/pi-buddy/state.json` so your roster persists across all projects.

## Contributing

Pull requests are welcome. Some areas that could use improvement:

- More sprite polish and additional species
- Better reaction quality and prompt tuning
- Settings UI for toggling reaction mode, model preferences, etc.
- Performance improvements to the editor overlay rendering
- Support for themes (rarity colors, etc.)

Please open an issue first for larger changes.
