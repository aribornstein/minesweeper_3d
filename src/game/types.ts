export type TileCoord = {
  x: number;
  z: number;
};

export type TileState = TileCoord & {
  hasMine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
  isStart: boolean;
  isExit: boolean;
  isRouteHint: boolean;
};

export type RevealResult = {
  exploded: boolean;
  revealedTiles: TileState[];
};

export type GamePhase = 'ready' | 'playing' | 'failed' | 'solved' | 'escaped';

export type BoardProgress = {
  mineCount: number;
  flaggedCount: number;
  correctFlagCount: number;
  revealedSafeCount: number;
  safeTileCount: number;
};

export type LevelDefinition = {
  name: string;
  sector: string;
  width: number;
  depth: number;
  startTile: TileCoord;
  exitTile: TileCoord;
  mines: TileCoord[];
  preRevealed: TileCoord[];
  safeRoute: TileCoord[];
};

export type ScannerMode = 'analyzing' | 'unknown' | 'safe' | 'flagged' | 'alarm' | 'path' | 'escaped';