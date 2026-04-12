# pi-buddy

An animated ASCII companion that lives to the right of your [Pi](https://github.com/badlogic/pi-mono) input box.

## Features

- 🐢 **18 species** — duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk
- 🌟 **5 rarity tiers** — common, uncommon, rare, epic, legendary
- ✨ **Unique stats** — DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK
- 💬 **Contextual reactions** — comments on what you're actually coding, using a cheap model
- 🎲 **Roster system** — collect and switch between multiple buddies
- 🤖 **AI soul generation** — each buddy gets a unique name and personality at hatch
- 📊 **Custom footer** — buddy info and token usage right-aligned in the status bar

## Install

```bash
pi install npm:pi-buddy
```

Or from git:
```bash
pi install git:github.com/eko/piBuddy
```

## Commands

| Command | Description |
|---|---|
| `/buddy` | Show buddy card (or hatch if none) |
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
| `/buddy off` / `/buddy on` | Hide/show buddy |

## Model usage

Buddy AI (soul generation + reactions) uses a cheap/fast model automatically detected from your configured providers. Priority order:

1. GitHub Copilot — `claude-haiku-4.5`, `gpt-4o`, `gemini-3-flash-preview`
2. Anthropic — `claude-haiku-4`
3. Google — `gemini-2.0-flash`, `gemini-1.5-flash`
4. OpenAI — `gpt-4o-mini`, `gpt-4o`
5. Falls back to your active model if none of the above are available

Reactions are disabled by default if no cheap model is found (still fully functional with local fallbacks).

## State

Buddy state is stored globally at `~/.pi/pi-buddy/state.json` so your buddies persist across all projects.

## Token usage

- **Soul generation**: ~120-220 tokens once per hatch
- **Reactions**: ~50-100 tokens per turn (70% chance, 1 turn cooldown)
- **Normal sessions with no new hatches**: 0 tokens (fully local fallbacks)

All model calls are optional and fall back gracefully if no key is available.
