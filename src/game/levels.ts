import { BOARD_DEPTH, BOARD_WIDTH, EXIT_TILE, START_TILE } from './config';
import type { LevelDefinition } from './types';

export const TRAINING_LEVEL: LevelDefinition = {
  name: 'Training Facility',
  sector: 'Sector 7',
  width: BOARD_WIDTH,
  depth: BOARD_DEPTH,
  startTile: START_TILE,
  exitTile: EXIT_TILE,
  mines: [
    { x: 2, z: 7 },
    { x: 5, z: 7 },
    { x: 1, z: 6 },
    { x: 6, z: 6 },
    { x: 2, z: 5 },
    { x: 5, z: 4 },
    { x: 1, z: 3 },
    { x: 6, z: 3 },
    { x: 2, z: 2 },
    { x: 5, z: 1 },
  ],
  preRevealed: [START_TILE, { x: 3, z: 7 }],
  safeRoute: [
    { x: 3, z: 8 },
    { x: 3, z: 7 },
    { x: 3, z: 6 },
    { x: 3, z: 5 },
    { x: 3, z: 4 },
    { x: 3, z: 3 },
    { x: 3, z: 2 },
    { x: 3, z: 1 },
    { x: 3, z: 0 },
  ],
};