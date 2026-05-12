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
  levelNumber: number;
  mineCount: number;
  flaggedCount: number;
  correctFlagCount: number;
  revealedSafeCount: number;
  safeTileCount: number;
};

export type ChamberProfile = {
  label: string;
  floor: string;
  wall: string;
  wallDark: string;
  panel: string;
  trim: string;
  coolTrim: string;
  ceiling: string;
  light: string;
  sideLight: string;
  warning: string;
  stripeEvery: number;
  lightEvery: number;
};

export type LevelDefinition = {
  levelNumber: number;
  name: string;
  sector: string;
  chamber: ChamberProfile;
  mineDensity: number;
  width: number;
  depth: number;
  startTile: TileCoord;
  exitTile: TileCoord;
  mines: TileCoord[];
  preRevealed: TileCoord[];
  safeRoute: TileCoord[];
};

export type ScannerMode = 'analyzing' | 'unknown' | 'safe' | 'flagged' | 'alarm' | 'path' | 'escaped';