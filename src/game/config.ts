import * as THREE from 'three';

export const BOARD_WIDTH = 8;
export const BOARD_DEPTH = 9;
export const MINE_COUNT = 10;
export const TILE_SIZE = 1.45;
export const TILE_GAP = 0.1;
export const PLAYER_HEIGHT = 1.72;
export const WALK_SPEED = 3.8;
export const MOUSE_SENSITIVITY = 0.0022;
export const RAYCAST_DISTANCE = 8;

export const START_TILE = { x: 3, z: BOARD_DEPTH - 1 };
export const EXIT_TILE = { x: 3, z: 0 };

export const COLORS = {
  floor: new THREE.Color('#171b1d'),
  wall: new THREE.Color('#202529'),
  wallDark: new THREE.Color('#111619'),
  trim: new THREE.Color('#c98325'),
  blueAccent: new THREE.Color('#28c7ff'),
  safeTile: new THREE.Color('#8c9293'),
  safeTileInset: new THREE.Color('#a3a9a9'),
  unknownTile: new THREE.Color('#656b69'),
  unknownTileInset: new THREE.Color('#7c8582'),
  hoverTile: new THREE.Color('#9ed9ea'),
  flaggedTile: new THREE.Color('#a64232'),
  routeTile: new THREE.Color('#ffd36b'),
  mine: new THREE.Color('#161616'),
  exit: new THREE.Color('#32d17d'),
  alarm: new THREE.Color('#ff3d2e'),
};