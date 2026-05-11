import { TRAINING_LEVEL } from '../levels';
import type { BoardProgress, LevelDefinition, RevealResult, TileCoord, TileState } from '../types';

export class MinesweeperBoard {
  readonly width: number;
  readonly depth: number;
  private tiles: TileState[] = [];

  constructor(private readonly level: LevelDefinition = TRAINING_LEVEL) {
    this.width = level.width;
    this.depth = level.depth;
    this.reset();
  }

  reset(): void {
    this.tiles = [];

    for (let tileZ = 0; tileZ < this.depth; tileZ += 1) {
      for (let tileX = 0; tileX < this.width; tileX += 1) {
        this.tiles.push({
          x: tileX,
          z: tileZ,
          hasMine: false,
          revealed: false,
          flagged: false,
          adjacentMines: 0,
          isStart: this.sameCoord({ x: tileX, z: tileZ }, this.level.startTile),
          isExit: this.sameCoord({ x: tileX, z: tileZ }, this.level.exitTile),
          isRouteHint: this.level.safeRoute.some((routeTile) => this.sameCoord(routeTile, { x: tileX, z: tileZ })),
        });
      }
    }

    this.placeAuthoredMines();
    this.calculateAdjacency();
    this.level.preRevealed.forEach((coord) => this.forceReveal(coord));
  }

  get allTiles(): TileState[] {
    return this.tiles;
  }

  getTile(coord: TileCoord): TileState | undefined {
    return this.tiles.find((tile) => tile.x === coord.x && tile.z === coord.z);
  }

  reveal(coord: TileCoord): RevealResult {
    const target = this.getTile(coord);

    if (!target || target.revealed || target.flagged) {
      return { exploded: false, revealedTiles: [] };
    }

    if (target.hasMine) {
      target.revealed = true;
      return { exploded: true, revealedTiles: [target] };
    }

    const revealedTiles: TileState[] = [];
    const queue: TileState[] = [target];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const tile = queue.shift();

      if (!tile || tile.flagged || visited.has(this.key(tile))) {
        continue;
      }

      visited.add(this.key(tile));
      tile.revealed = true;
      revealedTiles.push(tile);

      if (tile.adjacentMines === 0) {
        this.neighbors(tile).forEach((neighbor) => {
          if (!neighbor.revealed && !neighbor.hasMine) {
            queue.push(neighbor);
          }
        });
      }
    }

    return { exploded: false, revealedTiles };
  }

  revealAdjacent(coord: TileCoord): RevealResult {
    const target = this.getTile(coord);

    if (!target || !target.revealed || target.adjacentMines === 0) {
      return { exploded: false, revealedTiles: [] };
    }

    const adjacentFlags = this.adjacentFlagCount(target);

    if (adjacentFlags !== target.adjacentMines) {
      return { exploded: false, revealedTiles: [] };
    }

    return this.neighbors(target).reduce<RevealResult>(
      (combinedResult, neighbor) => {
        if (neighbor.revealed || neighbor.flagged) {
          return combinedResult;
        }

        const result = this.reveal(neighbor);
        return {
          exploded: combinedResult.exploded || result.exploded,
          revealedTiles: [...combinedResult.revealedTiles, ...result.revealedTiles],
        };
      },
      { exploded: false, revealedTiles: [] },
    );
  }

  toggleFlag(coord: TileCoord): TileState | undefined {
    const tile = this.getTile(coord);

    if (!tile || tile.revealed) {
      return undefined;
    }

    tile.flagged = !tile.flagged;
    return tile;
  }

  isSolved(): boolean {
    const allSafeTilesRevealed = this.tiles.every((tile) => tile.hasMine || tile.revealed);
    const everyMineFlagged = this.tiles.filter((tile) => tile.hasMine).every((tile) => tile.flagged);
    const noFalseFlags = this.tiles.filter((tile) => tile.flagged).every((tile) => tile.hasMine);
    return allSafeTilesRevealed || (everyMineFlagged && noFalseFlags);
  }

  revealAllMines(): TileState[] {
    return this.tiles.filter((tile) => tile.hasMine).map((tile) => {
      tile.revealed = true;
      return tile;
    });
  }

  adjacentFlagCount(coord: TileCoord): number {
    const tile = this.getTile(coord);
    return tile ? this.neighbors(tile).filter((neighbor) => neighbor.flagged).length : 0;
  }

  progress(): BoardProgress {
    const safeTiles = this.tiles.filter((tile) => !tile.hasMine);
    const flaggedTiles = this.tiles.filter((tile) => tile.flagged);

    return {
      mineCount: this.level.mines.length,
      flaggedCount: flaggedTiles.length,
      correctFlagCount: flaggedTiles.filter((tile) => tile.hasMine).length,
      revealedSafeCount: safeTiles.filter((tile) => tile.revealed).length,
      safeTileCount: safeTiles.length,
    };
  }

  routeTiles(): TileState[] {
    return this.level.safeRoute.map((coord) => this.getTile(coord)).filter((tile): tile is TileState => Boolean(tile));
  }

  get exitTile(): TileState | undefined {
    return this.getTile(this.level.exitTile);
  }

  get startTile(): TileState | undefined {
    return this.getTile(this.level.startTile);
  }

  private placeAuthoredMines(): void {
    this.level.mines.forEach((coord) => {
      const tile = this.getTile(coord);

      if (tile) {
        tile.hasMine = true;
      }
    });
  }

  private calculateAdjacency(): void {
    this.tiles.forEach((tile) => {
      tile.adjacentMines = this.neighbors(tile).filter((neighbor) => neighbor.hasMine).length;
    });
  }

  private neighbors(coord: TileCoord): TileState[] {
    const results: TileState[] = [];

    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetZ === 0) {
          continue;
        }

        const neighbor = this.getTile({ x: coord.x + offsetX, z: coord.z + offsetZ });

        if (neighbor) {
          results.push(neighbor);
        }
      }
    }

    return results;
  }

  private forceReveal(coord: TileCoord): void {
    const tile = this.getTile(coord);

    if (tile && !tile.hasMine) {
      tile.revealed = true;
    }
  }

  private sameCoord(firstCoord: TileCoord, secondCoord: TileCoord): boolean {
    return firstCoord.x === secondCoord.x && firstCoord.z === secondCoord.z;
  }

  private key(coord: TileCoord): string {
    return `${coord.x}:${coord.z}`;
  }
}