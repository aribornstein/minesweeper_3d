# First-Person Minesweeper

A Three.js first-person Minesweeper puzzle-thriller prototype inspired by the supplied storyboard. The current build is a playable vertical slice: walk the training sector, inspect tiles with the scanner, reveal safe numbers, flag mines, trigger and learn from failures, confirm the safe route, and unlock the exit.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Test

Start the dev server, then run the Playwright smoke test:

```bash
npm run dev
npm run test:e2e
```

## Controls

- Click **Enter Training Sector** to lock the pointer and start.
- `WASD` moves through the room.
- Mouse movement looks around.
- Left click reveals the tile in the scanner reticle.
- Left click a revealed numbered tile to reveal adjacent tiles when matching flags are placed.
- Right click or `F` flags or unflags the tile in the scanner reticle.
- `R` resets the current run.

## Scaffold

- `src/game/Game.ts` owns the render loop and high-level game state.
- `src/game/levels.ts` defines the authored training board, mines, start, exit, and route hints.
- `src/game/systems/MinesweeperBoard.ts` owns Minesweeper rules and win/fail checks.
- `src/game/systems/PlayerController.ts` owns first-person movement and pointer lock.
- `src/game/world/TileGrid.ts` renders the interactive board tiles, flags, mines, and numbers.
- `src/game/world/SceneFactory.ts` builds the training room, lighting, and exit door.
- `src/game/world/ViewModel.ts` renders the first-person scanner and remote.
- `src/game/world/Effects.ts` renders mine blast feedback.
- `src/ui/Hud.ts` updates scanner, objective, and state feedback.

## Next Design Pass

- Replace procedural geometry with authored GLB assets for the scanner, hands, remote, tiles, wall modules, and exit door.
- Add audio, stronger postprocessing, and richer particle/debris variation.
- Add additional level definitions for a multi-room training sequence.
- Add visual regression screenshots once the art direction stabilizes.
