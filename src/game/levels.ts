import * as THREE from 'three';
import type { ChamberProfile, LayoutVariant, LevelDefinition, TileCoord } from './types';

const FIRST_LEVEL_NUMBER = 1;
const FIRST_WIDTH = 5;
const FIRST_DEPTH = 6;
const MAX_WIDTH = 14;
const MAX_DEPTH = 16;
const STARTING_DENSITY = 0.1;
const DENSITY_STEP = 0.014;
const MAX_DENSITY = 0.24;

const BASE_PROFILES: ChamberProfile[] = [
  {
    label: 'Maintenance Bay',
    visualStyle: 'clean',
    floor: '#141a1f',
    wall: '#1b2730',
    wallDark: '#0e151b',
    panel: '#13212b',
    trim: '#d8b37c',
    coolTrim: '#263a49',
    ceiling: '#1a2630',
    light: '#d5f0ff',
    sideLight: '#58c9ff',
    warning: '#f2cc82',
    dressingDensity: 0.42,
    haze: 0.22,
    bloom: 0.38,
    stripeEvery: 2,
    lightEvery: 3,
  },
  {
    label: 'Relay Gallery',
    visualStyle: 'highTech',
    floor: '#111521',
    wall: '#1b2233',
    wallDark: '#0d111b',
    panel: '#141b2e',
    trim: '#7668ff',
    coolTrim: '#2d3659',
    ceiling: '#181f33',
    light: '#a9d9ff',
    sideLight: '#7b6cff',
    warning: '#f1d36c',
    dressingDensity: 0.5,
    haze: 0.2,
    bloom: 0.42,
    stripeEvery: 3,
    lightEvery: 2,
  },
  {
    label: 'Signal Foundry',
    visualStyle: 'industrial',
    floor: '#1b1918',
    wall: '#292725',
    wallDark: '#171413',
    panel: '#241a17',
    trim: '#d65f3e',
    coolTrim: '#403b38',
    ceiling: '#2b2926',
    light: '#ffd0a6',
    sideLight: '#ff9b6f',
    warning: '#ffe08a',
    dressingDensity: 0.78,
    haze: 0.52,
    bloom: 0.42,
    stripeEvery: 2,
    lightEvery: 4,
  },
  {
    label: 'Survey Annex',
    visualStyle: 'survey',
    floor: '#171a1d',
    wall: '#22282d',
    wallDark: '#12171c',
    panel: '#17222b',
    trim: '#d2b85b',
    coolTrim: '#2f3f4a',
    ceiling: '#202934',
    light: '#d4edff',
    sideLight: '#8ac7ff',
    warning: '#ffce68',
    dressingDensity: 0.58,
    haze: 0.4,
    bloom: 0.5,
    stripeEvery: 4,
    lightEvery: 2,
  },
];

const LAYOUT_VARIANTS: LayoutVariant[] = ['standard', 'narrow', 'elevated', 'obstacle', 'asymmetric', 'lowVisibility', 'hazard', 'multiLevel'];

type RandomSource = () => number;

export function createProceduralLevel(levelNumber = FIRST_LEVEL_NUMBER, random: RandomSource = Math.random): LevelDefinition {
  const normalizedLevel = Math.max(FIRST_LEVEL_NUMBER, Math.floor(levelNumber));
  const width = Math.min(MAX_WIDTH, FIRST_WIDTH + Math.ceil((normalizedLevel - 1) * 0.72));
  const depth = Math.min(MAX_DEPTH, FIRST_DEPTH + Math.ceil((normalizedLevel - 1) * 0.86));
  const mineDensity = Math.min(MAX_DENSITY, STARTING_DENSITY + (normalizedLevel - 1) * DENSITY_STEP);
  const chamber = createChamberForLevel(normalizedLevel);
  const layoutVariant = LAYOUT_VARIANTS[(normalizedLevel - 1) % LAYOUT_VARIANTS.length];
  const startTile = { x: Math.floor(width / 2), z: depth - 1 };
  const exitTile = { x: chooseExitColumn(width, startTile.x, normalizedLevel, random), z: 0 };
  const safeRoute = createSafeRoute(startTile, exitTile, depth);
  const protectedTiles = createProtectedTileSet(width, depth, safeRoute, startTile, exitTile);
  const candidates = createMineCandidates(width, depth, protectedTiles);
  const mineCount = Math.min(candidates.length, Math.max(3, Math.ceil(width * depth * mineDensity)));
  const mines = pickRandomMines(candidates, mineCount, random);
  const secondRouteTile = safeRoute[1] ?? startTile;

  return {
    levelNumber: normalizedLevel,
    name: `Training Chamber ${String(normalizedLevel).padStart(2, '0')}`,
    sector: `Sector ${7 + Math.floor((normalizedLevel - 1) / 3)}`,
    chamber,
    layoutVariant,
    mineDensity,
    width,
    depth,
    startTile,
    exitTile,
    mines,
    preRevealed: [startTile, secondRouteTile],
    safeRoute,
  };
}

export const TRAINING_LEVEL: LevelDefinition = createProceduralLevel(FIRST_LEVEL_NUMBER);

function chooseExitColumn(width: number, startX: number, levelNumber: number, random: RandomSource): number {
  const maxOffset = Math.min(Math.floor(width / 2), 1 + Math.floor(levelNumber / 3));
  const offset = randomInt(-maxOffset, maxOffset, random);
  return clamp(startX + offset, 0, width - 1);
}

function createSafeRoute(startTile: TileCoord, exitTile: TileCoord, depth: number): TileCoord[] {
  const route: TileCoord[] = [];
  const pivotZ = Math.max(1, Math.floor(depth * 0.45));
  let currentX = startTile.x;

  for (let tileZ = startTile.z; tileZ >= pivotZ; tileZ -= 1) {
    route.push({ x: currentX, z: tileZ });
  }

  while (currentX !== exitTile.x) {
    currentX += Math.sign(exitTile.x - currentX);
    route.push({ x: currentX, z: pivotZ });
  }

  for (let tileZ = pivotZ - 1; tileZ >= exitTile.z; tileZ -= 1) {
    route.push({ x: exitTile.x, z: tileZ });
  }

  return uniqueCoords(route);
}

function createProtectedTileSet(width: number, depth: number, safeRoute: TileCoord[], startTile: TileCoord, exitTile: TileCoord): Set<string> {
  const protectedTiles = new Set(safeRoute.map(key));

  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      addIfInBounds(protectedTiles, { x: startTile.x + offsetX, z: startTile.z + offsetZ }, width, depth);
    }
  }

  addIfInBounds(protectedTiles, exitTile, width, depth);
  return protectedTiles;
}

function createMineCandidates(width: number, depth: number, protectedTiles: Set<string>): TileCoord[] {
  const candidates: TileCoord[] = [];

  for (let tileZ = 0; tileZ < depth; tileZ += 1) {
    for (let tileX = 0; tileX < width; tileX += 1) {
      const coord = { x: tileX, z: tileZ };

      if (!protectedTiles.has(key(coord))) {
        candidates.push(coord);
      }
    }
  }

  return candidates;
}

function pickRandomMines(candidates: TileCoord[], mineCount: number, random: RandomSource): TileCoord[] {
  const pool = [...candidates];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index, random);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, mineCount);
}

function uniqueCoords(coords: TileCoord[]): TileCoord[] {
  const seen = new Set<string>();
  return coords.filter((coord) => {
    const coordKey = key(coord);

    if (seen.has(coordKey)) {
      return false;
    }

    seen.add(coordKey);
    return true;
  });
}

function addIfInBounds(coords: Set<string>, coord: TileCoord, width: number, depth: number): void {
  if (coord.x >= 0 && coord.x < width && coord.z >= 0 && coord.z < depth) {
    coords.add(key(coord));
  }
}

function randomInt(min: number, max: number, random: RandomSource): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function key(coord: TileCoord): string {
  return `${coord.x}:${coord.z}`;
}

const ARCHETYPE_LABEL_SUFFIXES: Record<number, string[]> = {
  0: ['Maintenance Bay', 'Calibration Vault', 'Holding Bay', 'Telemetry Hall', 'Inspection Wing', 'Service Annex'],
  1: ['Relay Gallery', 'Quantum Node', 'Synapse Span', 'Data Concourse', 'Spectrum Lab', 'Cascade Spire'],
  2: ['Signal Foundry', 'Reactor Pit', 'Pressure Forge', 'Coolant Loop', 'Smelting Run', 'Slag Causeway'],
  3: ['Survey Annex', 'Cartograph Bay', 'Pulse Atrium', 'Beacon Rotunda', 'Echo Plaza', 'Drift Observatory'],
};

const SECTOR_BLOCKS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Theta', 'Omega', 'Phi', 'Psi', 'Lambda'];

function createChamberForLevel(levelNumber: number): ChamberProfile {
  const archetypeIndex = levelNumber <= BASE_PROFILES.length
    ? (levelNumber - 1) % BASE_PROFILES.length
    : Math.floor(seededRandom(levelNumber, 11) * BASE_PROFILES.length);
  const base = BASE_PROFILES[archetypeIndex];

  // Level 1 stays untouched for deterministic identity (smoke test relies on it).
  if (levelNumber === FIRST_LEVEL_NUMBER) {
    return base;
  }

  const hueShift = (seededRandom(levelNumber, 23) - 0.5) * 0.14;
  const lightnessShift = (seededRandom(levelNumber, 31) - 0.5) * 0.12;
  const accentHueShift = (seededRandom(levelNumber, 43) - 0.5) * 0.22;
  const warningHueShift = (seededRandom(levelNumber, 47) - 0.5) * 0.18;
  const hazeVar = (seededRandom(levelNumber, 53) - 0.5) * 0.18;
  const bloomVar = (seededRandom(levelNumber, 59) - 0.5) * 0.2;
  const densityVar = (seededRandom(levelNumber, 67) - 0.5) * 0.24;
  const stripeVar = Math.round((seededRandom(levelNumber, 71) - 0.5) * 1.8);
  const lightVar = Math.round((seededRandom(levelNumber, 73) - 0.5) * 1.8);

  return {
    ...base,
    label: deriveChamberLabel(levelNumber, archetypeIndex),
    floor: shiftColor(base.floor, hueShift, -0.04 + lightnessShift * 0.5),
    wall: shiftColor(base.wall, hueShift, lightnessShift * 0.5),
    wallDark: shiftColor(base.wallDark, hueShift, -0.04 + lightnessShift * 0.3),
    panel: shiftColor(base.panel, hueShift, lightnessShift * 0.4),
    trim: shiftColor(base.trim, warningHueShift, lightnessShift * 0.3),
    coolTrim: shiftColor(base.coolTrim, hueShift, lightnessShift * 0.3),
    ceiling: shiftColor(base.ceiling, hueShift, lightnessShift * 0.4),
    light: shiftColor(base.light, accentHueShift * 0.4, lightnessShift * 0.3),
    sideLight: shiftColor(base.sideLight, accentHueShift, lightnessShift * 0.5),
    warning: shiftColor(base.warning, warningHueShift, 0),
    haze: clamp01(base.haze + hazeVar),
    bloom: clamp01(base.bloom + bloomVar),
    dressingDensity: clamp01(base.dressingDensity + densityVar),
    stripeEvery: clamp(base.stripeEvery + stripeVar, 1, 5),
    lightEvery: clamp(base.lightEvery + lightVar, 1, 6),
  };
}

function deriveChamberLabel(levelNumber: number, archetypeIndex: number): string {
  const variants = ARCHETYPE_LABEL_SUFFIXES[archetypeIndex] ?? [BASE_PROFILES[archetypeIndex].label];
  const nameIndex = Math.floor(seededRandom(levelNumber, 97) * variants.length);
  const sectorBlock = SECTOR_BLOCKS[Math.floor(seededRandom(levelNumber, 113) * SECTOR_BLOCKS.length)];
  return `${variants[nameIndex]} ${sectorBlock}`;
}

function shiftColor(hex: string, hueShift: number, lightnessShift: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    THREE.MathUtils.euclideanModulo(hsl.h + hueShift, 1),
    THREE.MathUtils.clamp(hsl.s, 0, 1),
    THREE.MathUtils.clamp(hsl.l + lightnessShift, 0.02, 0.96),
  );
  return `#${color.getHexString()}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function seededRandom(level: number, salt: number): number {
  const value = Math.sin(level * 12.9898 + salt * 78.233 + 0.31) * 43758.5453;
  return value - Math.floor(value);
}
