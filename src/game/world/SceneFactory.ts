import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { TILE_SIZE } from '../config';
import type { LevelDefinition, TileCoord } from '../types';

const TEXTURE_ANISOTROPY = 8;

type SurfaceKind = 'floor' | 'wall' | 'dark-panel' | 'metal' | 'trim' | 'door';

export type SceneParts = {
  scene: THREE.Scene;
  levelEnvironment: LevelEnvironment;
} & LevelEnvironment;

export type LevelEnvironment = {
  group: THREE.Group;
  exitDoor: THREE.Group;
  exitGlow: THREE.PointLight;
  alarmLight: THREE.PointLight;
};

export function createScene(level: LevelDefinition): SceneParts {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = createChamberSkyTexture(level);
  scene.fog = new THREE.FogExp2(level.chamber.visualStyle === 'industrial' ? '#090706' : '#04080b', 0.01 + level.chamber.haze * 0.016);

  const ambient = new THREE.HemisphereLight('#9fdcff', '#0c0b09', level.chamber.visualStyle === 'clean' ? 0.24 : 0.18);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(level.chamber.light, level.chamber.visualStyle === 'highTech' ? 0.92 : 0.84);
  keyLight.position.set(4.5, 9.8, 5.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(3072, 3072);
  keyLight.shadow.camera.near = 0.8;
  keyLight.shadow.camera.far = 42;
  keyLight.shadow.camera.left = -18;
  keyLight.shadow.camera.right = 18;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -18;
  keyLight.shadow.bias = -0.00008;
  keyLight.shadow.normalBias = 0.035;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(level.chamber.sideLight, 0.28 + level.chamber.bloom * 0.22);
  rimLight.position.set(-5, 3.2, -4.2);
  scene.add(rimLight);

  const boardSpot = new THREE.SpotLight(level.chamber.light, level.chamber.visualStyle === 'industrial' ? 0.9 : 0.72, 20, Math.PI / 5.8, 0.68, 1.6);
  boardSpot.position.set(0, 4.25, 2.4);
  boardSpot.target.position.set(0, 0.05, -0.7);
  boardSpot.castShadow = true;
  boardSpot.shadow.mapSize.set(1024, 1024);
  boardSpot.shadow.bias = -0.00012;
  scene.add(boardSpot, boardSpot.target);

  const levelEnvironment = createLevelEnvironment(level);
  scene.add(levelEnvironment.group);

  return { scene, levelEnvironment, ...levelEnvironment };
}

export function createLevelEnvironment(level: LevelDefinition): LevelEnvironment {
  const group = new THREE.Group();
  group.name = 'ProceduralLevelEnvironment';

  addExteriorVista(group, level);

  const alarmLight = new THREE.PointLight('#ff4d2f', 0, 14, 2);
  alarmLight.position.set(0, 3.1, -1.4);
  group.add(alarmLight);

  const exitGlow = new THREE.PointLight('#ff3d2e', 3.2, 10, 2);
  const exitPosition = tileWorldPosition(level, level.exitTile);
  exitGlow.position.set(exitPosition.x, 1.8, exitPosition.z - 0.65);
  group.add(exitGlow);

  const floor = new THREE.Mesh(
    new RoundedBoxGeometry(level.width * TILE_SIZE + 5.2, 0.22, level.depth * TILE_SIZE + 5.8, 3, 0.08),
    createIndustrialMaterial(level.chamber.floor, 0.84, 0.2, 'floor', 4, 5),
  );
  floor.position.y = -0.18;
  floor.receiveShadow = true;
  group.add(floor);

  addFloorRails(group, level);
  addFloorLightStrips(group, level);
  addWalls(group, level);
  addLayoutDressing(group, level);
  addCeilingPanels(group, level);
  addOverheadBeams(group, level);
  addTrainingPanels(group, level);
  addThemeDecals(group, level);

  const exitDoor = createExitDoor(level);
  group.add(exitDoor);
  prepareObjectForPbr(group);

  return { group, exitDoor, exitGlow, alarmLight };
}

function createChamberSkyTexture(level: LevelDefinition): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create chamber sky texture.');
  }

  const topColor = new THREE.Color(level.chamber.sideLight);
  const warningColor = new THREE.Color(level.chamber.warning);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#102733');
  gradient.addColorStop(0.34, `rgba(${Math.round(topColor.r * 78)}, ${Math.round(topColor.g * 128)}, ${Math.round(topColor.b * 145)}, 1)`);
  gradient.addColorStop(0.72, '#05090d');
  gradient.addColorStop(1, '#020304');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let layer = 0; layer < 4; layer += 1) {
    context.globalAlpha = 0.08 + layer * 0.028;
    context.fillStyle = layer % 2 === 0 ? '#7fdfff' : colorToStyle(warningColor);
    for (let index = 0; index < 28; index += 1) {
      const random = pseudoRandom(index, layer * 37 + level.levelNumber * 17);
      const x = pseudoRandom(index, layer + 3) * canvas.width;
      const y = canvas.height * (0.06 + pseudoRandom(index, layer + 9) * 0.54);
      const width = 100 + random * 340;
      const height = 1 + pseudoRandom(index, layer + 13) * 5;
      context.fillRect(x, y, width, height);
    }
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function addExteriorVista(target: THREE.Object3D, level: LevelDefinition): void {
  const width = level.width * TILE_SIZE + 5.2;
  const depth = level.depth * TILE_SIZE + 5.8;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(46, 32, 16),
    new THREE.MeshBasicMaterial({ map: createChamberSkyTexture(level), side: THREE.BackSide, fog: false }),
  );
  skyDome.position.set(0, 2, 0);
  skyDome.name = 'StormSkyDome';
  target.add(skyDome);

  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: '#030607', transparent: true, opacity: 0.72, fog: false, side: THREE.DoubleSide });
  const rearZ = -depth / 2 - 3.2;

  for (let index = 0; index < 9; index += 1) {
    const towerWidth = 0.32 + pseudoRandom(index, level.levelNumber * 11) * 0.8;
    const towerHeight = 3.2 + pseudoRandom(index, level.levelNumber * 19) * 5.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth, towerHeight, 0.16), silhouetteMaterial.clone());
    tower.position.set((index / 8 - 0.5) * (width + 9), towerHeight / 2 - 0.35, rearZ - pseudoRandom(index, 5) * 5.4);
    target.add(tower);
  }

  const exteriorHazeMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.sideLight, transparent: true, opacity: 0.024, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  [-0.34, 0.34].forEach((offset) => {
    const exteriorHaze = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.16, 0.84), exteriorHazeMaterial.clone());
    exteriorHaze.position.set(offset * width, 2.32, rearZ + 0.18);
    target.add(exteriorHaze);
  });
}

function tileWorldPosition(level: LevelDefinition, coord: TileCoord): THREE.Vector3 {
  return new THREE.Vector3(
    (coord.x - (level.width - 1) / 2) * TILE_SIZE,
    0,
    (coord.z - (level.depth - 1) / 2) * TILE_SIZE,
  );
}

export function disposeLevelEnvironment(environment: LevelEnvironment): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  environment.group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach((material) => {
      materials.add(material);
      collectMaterialTextures(material, textures);
    });
  });

  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>): void {
  const materialWithMaps = material as THREE.Material & Record<string, unknown>;

  Object.values(materialWithMaps).forEach((value) => {
    if (value instanceof THREE.Texture) {
      textures.add(value);
    }
  });
}

function addFloorRails(target: THREE.Object3D, level: LevelDefinition): void {
  const railMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.48, 0.62, 'metal', 1.4, 7);
  const railDepth = level.depth * TILE_SIZE + 3.8;
  const railWidth = level.width * TILE_SIZE + 3.6;

  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.18, railDepth, 2, 0.035), railMaterial);
    rail.position.set(side * railWidth / 2, 0.05, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    target.add(rail);

    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, railDepth, 12),
      new THREE.MeshStandardMaterial({ color: '#111719', roughness: 0.62, metalness: 0.34 }),
    );
    cable.position.set(side * (railWidth / 2 - 0.18), 0.2, 0);
    cable.rotation.x = Math.PI / 2;
    cable.castShadow = true;
    target.add(cable);
  });
}

function addFloorLightStrips(target: THREE.Object3D, level: LevelDefinition): void {
  const railDepth = level.depth * TILE_SIZE + 3.2;
  const laneWidth = level.width * TILE_SIZE + 3.1;
  const stripMaterial = new THREE.MeshBasicMaterial({
    color: level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.light,
    transparent: true,
    opacity: level.chamber.visualStyle === 'clean' ? 0.34 : 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const channelMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.74, 0.36, 'dark-panel', 0.6, 6);

  [-1, 1].forEach((side) => {
    const channel = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.045, railDepth, 2, 0.014), channelMaterial);
    const strip = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.026, railDepth * 0.92, 1, 0.008), stripMaterial.clone());
    channel.position.set(side * laneWidth / 2, 0.075, 0);
    strip.position.set(side * (laneWidth / 2 - 0.01), 0.108, 0);
    channel.receiveShadow = true;
    target.add(channel, strip);
  });
}

function addLayoutDressing(target: THREE.Object3D, level: LevelDefinition): void {
  const width = level.width * TILE_SIZE + 5.2;
  const depth = level.depth * TILE_SIZE + 5.8;
  const sideDistance = width / 2 - 1.08;
  const propMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.68, 0.4, 'metal', 1, 1);
  const trimMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.45, 0.62, 'metal', 1, 1);
  const hazardMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.warning, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });

  if (level.layoutVariant === 'narrow') {
    [-1, 1].forEach((side) => {
      const bulkhead = new THREE.Mesh(new RoundedBoxGeometry(0.36, 1.05, depth - 2.2, 4, 0.045), propMaterial);
      const guide = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.045, depth - 2.6, 1, 0.008), hazardMaterial.clone());
      bulkhead.position.set(side * sideDistance, 0.54, -0.2);
      guide.position.set(side * (sideDistance - 0.2), 1.12, -0.2);
      bulkhead.castShadow = true;
      bulkhead.receiveShadow = true;
      target.add(bulkhead, guide);
    });
  }

  if (level.layoutVariant === 'elevated' || level.layoutVariant === 'multiLevel') {
    [-1, 1].forEach((side) => {
      const deck = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.16, depth - 1.4, 4, 0.04), propMaterial);
      const rail = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.72, depth - 1.7, 2, 0.018), trimMaterial);
      deck.position.set(side * (width / 2 - 0.72), 1.05, -0.18);
      rail.position.set(side * (width / 2 - 1.18), 1.52, -0.18);
      deck.castShadow = true;
      deck.receiveShadow = true;
      rail.castShadow = true;
      target.add(deck, rail);
    });
  }

  if (level.layoutVariant === 'obstacle' || level.layoutVariant === 'asymmetric' || level.layoutVariant === 'hazard') {
    const propCount = level.layoutVariant === 'hazard' ? 6 : 4;
    for (let index = 0; index < propCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const z = (pseudoRandom(index, level.levelNumber * 29) - 0.5) * (depth - 3.4);
      const crate = new THREE.Group();
      crate.position.set(side * (sideDistance - pseudoRandom(index, 9) * 0.58), 0.25, z);
      const base = new THREE.Mesh(new RoundedBoxGeometry(0.54 + pseudoRandom(index, 3) * 0.3, 0.5, 0.52 + pseudoRandom(index, 5) * 0.42, 4, 0.045), propMaterial);
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.045, 0.46, 2, 0.012), trimMaterial);
      cap.position.y = 0.28;
      base.castShadow = true;
      base.receiveShadow = true;
      crate.add(base, cap);
      target.add(crate);
    }
  }

  if (level.layoutVariant === 'lowVisibility') {
    const mistMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.sideLight, transparent: true, opacity: 0.026, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    [-0.24, 0.24].forEach((offset) => {
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.56, 0.78), mistMaterial.clone());
      mist.position.set(0, 0.76, offset * depth);
      mist.rotation.x = -Math.PI / 2 + 0.05;
      target.add(mist);
    });
  }
}

function addWalls(target: THREE.Object3D, level: LevelDefinition): void {
  const width = level.width * TILE_SIZE + 5.2;
  const depth = level.depth * TILE_SIZE + 5.8;
  const wallMaterial = createIndustrialMaterial(level.chamber.wall, 0.78, 0.28, 'wall', 3.2, 1.4);
  const darkMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.86, 0.22, 'dark-panel', 1, 1.25);
  const insetMaterial = createIndustrialMaterial(level.chamber.panel, 0.82, 0.2, 'dark-panel', 0.8, 1.1);
  const trimMaterial = createIndustrialMaterial(level.chamber.trim, 0.5, 0.34, 'trim', 1, 1.2);
  const coolTrimMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.58, 0.46, 'metal', 1, 1);

  addSegmentedBackWall(target, level, width, depth, wallMaterial);
  addBackWallFocalArchitecture(target, level, width, depth, darkMaterial, trimMaterial, coolTrimMaterial);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.18, depth), wallMaterial);
  leftWall.position.set(-width / 2, 1.9, 0);
  leftWall.receiveShadow = true;
  target.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = width / 2;
  target.add(rightWall);

  addWallStructuralRibs(target, level, width, depth, coolTrimMaterial, darkMaterial);
  addObservationWindows(target, level, width, depth);
  addWallConduits(target, level, width, depth, coolTrimMaterial, trimMaterial);
  addWallBands(target, level, width, depth, trimMaterial, coolTrimMaterial);
  addBackWallModules(target, level, width, depth, darkMaterial, insetMaterial, trimMaterial, coolTrimMaterial);
  addSideWallModules(target, level, width, depth, darkMaterial, insetMaterial, trimMaterial, coolTrimMaterial);
}

function addWallStructuralRibs(
  target: THREE.Object3D,
  level: LevelDefinition,
  width: number,
  depth: number,
  coolTrimMaterial: THREE.Material,
  darkMaterial: THREE.Material,
): void {
  const bayCount = clamp(Math.floor(depth / 1.85), 4, 9);

  [-1, 1].forEach((side) => {
    for (let bayIndex = 0; bayIndex < bayCount; bayIndex += 1) {
      const normalizedOffset = bayCount === 1 ? 0 : bayIndex / (bayCount - 1) - 0.5;
      const z = normalizedOffset * (depth - 0.62);
      const rib = new THREE.Group();
      rib.position.set(side * (width / 2 - 0.08), 1.9, z);

      const vertical = new THREE.Mesh(new RoundedBoxGeometry(0.2, 4.16, 0.13, 3, 0.035), coolTrimMaterial);
      const shadowSlot = new THREE.Mesh(new RoundedBoxGeometry(0.032, 3.74, 0.72, 2, 0.018), darkMaterial);
      const armorTop = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.14, 1.34, 3, 0.035), coolTrimMaterial);
      const armorBottom = armorTop.clone();
      const accent = new THREE.Mesh(
        new RoundedBoxGeometry(0.035, 2.9, 0.045, 1, 0.01),
        new THREE.MeshBasicMaterial({ color: level.chamber.sideLight, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
      );

      shadowSlot.position.x = side * -0.07;
      armorTop.position.set(side * -0.04, 1.82, 0);
      armorBottom.position.set(side * -0.04, -1.82, 0);
      accent.position.set(side * -0.13, 0, bayIndex % 2 === 0 ? 0.34 : -0.34);
      rib.add(vertical, shadowSlot, armorTop, armorBottom, accent);
      rib.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      target.add(rib);
    }
  });
}

function addObservationWindows(target: THREE.Object3D, level: LevelDefinition, width: number, depth: number): void {
  const bayMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.72, 0.32, 'dark-panel', 0.9, 1.2);
  const insetMaterial = new THREE.MeshStandardMaterial({ color: '#090f13', roughness: 0.64, metalness: 0.34, envMapIntensity: 0.2 });
  const frameMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.42, 0.68, 'metal', 1, 1.2);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const windowZ = -depth / 2 + 0.18;
  const exitOpeningX = tileWorldPosition(level, level.exitTile).x;
  const positions = [-width * 0.3, width * 0.3].filter((x) => Math.abs(x - exitOpeningX) > 1.9);

  positions.forEach((x, index) => {
    const group = new THREE.Group();
    group.position.set(x, 2.15, windowZ + 0.03);

    const bay = new THREE.Mesh(new RoundedBoxGeometry(1.48, 1.1, 0.06, 3, 0.026), bayMaterial);
    const innerPanel = new THREE.Mesh(new RoundedBoxGeometry(0.74, 0.86, 0.04, 2, 0.016), insetMaterial);
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.08, 0.12, 2, 0.018), frameMaterial);
    const bottom = top.clone();
    const left = new THREE.Mesh(new RoundedBoxGeometry(0.08, 1.16, 0.12, 2, 0.018), frameMaterial);
    const right = left.clone();
    const mullion = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.96, 0.1, 2, 0.012), frameMaterial);
    const verticalRibA = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.78, 0.052, 1, 0.01), frameMaterial);
    const verticalRibB = verticalRibA.clone();
    const dataSlit = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.035, 0.026, 1, 0.006), glowMaterial.clone());
    const shortSlit = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.03, 0.026, 1, 0.006), glowMaterial.clone());

    bay.position.z = 0.025;
    innerPanel.position.z = 0.06;
    top.position.set(0, 0.58, 0.035);
    bottom.position.set(0, -0.58, 0.035);
    left.position.set(-0.84, 0, 0.035);
    right.position.set(0.84, 0, 0.035);
    mullion.position.set(index % 2 === 0 ? -0.26 : 0.26, 0, 0.05);
    verticalRibA.position.set(-0.26, 0, 0.09);
    verticalRibB.position.set(0.26, 0, 0.09);
    dataSlit.position.set(index % 2 === 0 ? 0.16 : -0.16, 0.24, 0.105);
    shortSlit.position.set(index % 2 === 0 ? -0.24 : 0.24, -0.24, 0.105);
    group.add(bay, innerPanel, top, bottom, left, right, mullion, verticalRibA, verticalRibB, dataSlit, shortSlit);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    target.add(group);
  });
}

function addWallConduits(
  target: THREE.Object3D,
  level: LevelDefinition,
  width: number,
  depth: number,
  coolTrimMaterial: THREE.Material,
  trimMaterial: THREE.Material,
): void {
  const cableMaterial = new THREE.MeshStandardMaterial({ color: '#070b0d', roughness: 0.48, metalness: 0.34, envMapIntensity: 0.38 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.warning, transparent: true, opacity: 0.44, blending: THREE.AdditiveBlending, depthWrite: false });

  [-1, 1].forEach((side) => {
    [-0.42, 0.22, 0.78].forEach((offset, cableIndex) => {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.022 + cableIndex * 0.004, 0.022 + cableIndex * 0.004, depth - 1.3, 14), cableIndex === 1 ? coolTrimMaterial : cableMaterial);
      cable.position.set(side * (width / 2 - 0.34 - cableIndex * 0.045), 2.85 + offset * 0.22, 0);
      cable.rotation.x = Math.PI / 2;
      cable.castShadow = true;
      target.add(cable);
    });

    for (let markerIndex = 0; markerIndex < 4; markerIndex += 1) {
      const z = (markerIndex / 3 - 0.5) * (depth - 2.4);
      const bracket = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.34, 0.22, 2, 0.018), trimMaterial);
      const led = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.22, 0.028, 1, 0.006), glowMaterial.clone());
      bracket.position.set(side * (width / 2 - 0.28), 2.9, z);
      led.position.set(side * (width / 2 - 0.335), 2.9, z);
      bracket.castShadow = true;
      bracket.receiveShadow = true;
      target.add(bracket, led);
    }
  });
}

function addCeilingPanels(target: THREE.Object3D, level: LevelDefinition): void {
  const width = level.width * TILE_SIZE + 5.1;
  const depth = level.depth * TILE_SIZE + 5.4;
  const ceilingMaterial = createIndustrialMaterial(level.chamber.ceiling, 0.62, 0.42, 'metal', 2.6, 3.4);
  const recessMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.78, 0.28, 'dark-panel', 1.8, 2.4);
  const diffuserMaterial = new THREE.MeshBasicMaterial({
    color: level.chamber.light,
    transparent: true,
    opacity: level.chamber.visualStyle === 'industrial' ? 0.26 : 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ceiling = new THREE.Mesh(new RoundedBoxGeometry(width, 0.14, depth, 4, 0.04), ceilingMaterial);
  ceiling.position.set(0, 4.05, 0);
  ceiling.castShadow = true;
  ceiling.receiveShadow = true;
  target.add(ceiling);

  const panelRows = clamp(Math.floor(depth / 2.3), 3, 7);
  for (let rowIndex = 0; rowIndex < panelRows; rowIndex += 1) {
    const z = panelRows === 1 ? 0 : (rowIndex / (panelRows - 1) - 0.5) * (depth - 1.1);
    const recess = new THREE.Mesh(new RoundedBoxGeometry(width * 0.82, 0.035, 0.56, 2, 0.018), recessMaterial);
    const diffuser = new THREE.Mesh(new RoundedBoxGeometry(width * 0.36, 0.024, 0.08, 1, 0.008), diffuserMaterial.clone());
    const leftDiffuser = new THREE.Mesh(new RoundedBoxGeometry(width * 0.18, 0.02, 0.052, 1, 0.006), diffuserMaterial.clone());
    const rightDiffuser = leftDiffuser.clone();
    const panelLight = new THREE.RectAreaLight(level.chamber.light, level.chamber.visualStyle === 'industrial' ? 0.46 : 0.62, width * 0.36, 0.12);

    recess.position.set(0, 3.94, z);
    diffuser.position.set(0, 3.91, z);
    leftDiffuser.position.set(-width * 0.31, 3.91, z);
    rightDiffuser.position.set(width * 0.31, 3.91, z);
    panelLight.position.set(0, 3.89, z);
    panelLight.rotation.x = -Math.PI / 2;
    recess.castShadow = true;
    recess.receiveShadow = true;
    target.add(recess, diffuser, leftDiffuser, rightDiffuser, panelLight);
  }
}

function addSegmentedBackWall(target: THREE.Object3D, level: LevelDefinition, width: number, depth: number, material: THREE.Material): void {
  const wallZ = -depth / 2;
  const wallMinX = -width / 2;
  const wallMaxX = width / 2;
  const openingCenterX = tileWorldPosition(level, level.exitTile).x;
  const openingWidth = 2.72;
  const openingLeft = openingCenterX - openingWidth / 2;
  const openingRight = openingCenterX + openingWidth / 2;
  const spans = [
    { centerX: (wallMinX + openingLeft) / 2, width: openingLeft - wallMinX, centerY: 1.9, height: 4.2 },
    { centerX: (openingRight + wallMaxX) / 2, width: wallMaxX - openingRight, centerY: 1.9, height: 4.2 },
    { centerX: openingCenterX, width: openingWidth, centerY: 3.58, height: 0.84 },
  ];

  spans.forEach((span) => {
    if (span.width <= 0.08 || span.height <= 0.08) {
      return;
    }

    const segment = new THREE.Mesh(new THREE.BoxGeometry(span.width, span.height, 0.28), material);
    segment.position.set(span.centerX, span.centerY, wallZ);
    segment.receiveShadow = true;
    target.add(segment);
  });
}

function addBackWallFocalArchitecture(
  target: THREE.Object3D,
  level: LevelDefinition,
  width: number,
  depth: number,
  darkMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  coolTrimMaterial: THREE.Material,
): void {
  const wallZ = -depth / 2 + 0.23;
  const exitX = tileWorldPosition(level, level.exitTile).x;
  const lightMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.light, transparent: true, opacity: level.chamber.visualStyle === 'industrial' ? 0.44 : 0.62, blending: THREE.AdditiveBlending, depthWrite: false });
  const diagnosticMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });

  const upperLintel = new THREE.Mesh(new RoundedBoxGeometry(3.86, 0.22, 0.22, 3, 0.035), coolTrimMaterial);
  const lowerThreshold = new THREE.Mesh(new RoundedBoxGeometry(3.28, 0.12, 0.18, 2, 0.018), trimMaterial);
  upperLintel.position.set(exitX, 3.18, wallZ + 0.08);
  lowerThreshold.position.set(exitX, 0.42, wallZ + 0.08);
  upperLintel.castShadow = true;
  lowerThreshold.castShadow = true;
  target.add(upperLintel, lowerThreshold);

  [-1, 1].forEach((side) => {
    const columnX = exitX + side * 1.48;
    const column = new THREE.Mesh(new RoundedBoxGeometry(0.24, 3.06, 0.28, 4, 0.045), darkMaterial);
    const innerRail = new THREE.Mesh(new RoundedBoxGeometry(0.07, 2.72, 0.12, 2, 0.016), coolTrimMaterial);
    const light = new THREE.Mesh(new RoundedBoxGeometry(0.045, 2.2, 0.035, 1, 0.008), lightMaterial.clone());
    column.position.set(columnX, 1.82, wallZ + 0.02);
    innerRail.position.set(columnX - side * 0.11, 1.82, wallZ + 0.18);
    light.position.set(columnX - side * 0.16, 1.82, wallZ + 0.23);
    column.castShadow = true;
    column.receiveShadow = true;
    innerRail.castShadow = true;
    target.add(column, innerRail, light);
  });

  const sidePanels = [-1, 1].map((side) => {
    const group = new THREE.Group();
    const panelWidth = Math.min(1.62, Math.max(1.12, width * 0.18));
    group.position.set(exitX + side * Math.min(width * 0.31, 3.2), 1.9, wallZ + 0.07);
    const frame = new THREE.Mesh(new RoundedBoxGeometry(panelWidth, 1.42, 0.12, 4, 0.035), coolTrimMaterial);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(panelWidth - 0.12, 1.24, 0.045, 3, 0.02), darkMaterial);
    const inset = new THREE.Mesh(
      new RoundedBoxGeometry(panelWidth * 0.48, 0.82, 0.036, 2, 0.014),
      new THREE.MeshStandardMaterial({ color: '#070d10', roughness: 0.68, metalness: 0.28, envMapIntensity: 0.18 }),
    );
    const ribA = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.96, 0.045, 1, 0.008), coolTrimMaterial);
    const ribB = ribA.clone();
    const statusLine = new THREE.Mesh(new RoundedBoxGeometry(panelWidth * 0.42, 0.028, 0.024, 1, 0.006), diagnosticMaterial.clone());
    const shortStatus = new THREE.Mesh(new RoundedBoxGeometry(panelWidth * 0.2, 0.026, 0.024, 1, 0.006), diagnosticMaterial.clone());
    plate.position.z = 0.035;
    inset.position.z = 0.07;
    ribA.position.set(-panelWidth * 0.28, 0, 0.09);
    ribB.position.set(panelWidth * 0.28, 0, 0.09);
    statusLine.position.set(0, 0.28, 0.105);
    shortStatus.position.set(side * -0.18, -0.26, 0.105);
    frame.castShadow = true;
    plate.receiveShadow = true;
    group.add(frame, plate, inset, ribA, ribB, statusLine, shortStatus);
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return group;
  });
  target.add(...sidePanels);
}

function addWallBands(target: THREE.Object3D, level: LevelDefinition, width: number, depth: number, trimMaterial: THREE.Material, coolTrimMaterial: THREE.Material): void {
  const bandMeshes: THREE.Mesh[] = [];
  const backZ = -depth / 2 + 0.24;
  const exitOpeningX = tileWorldPosition(level, level.exitTile).x;
  const exitOpeningWidth = 3.2;
  const lineColor = level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.light;
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: level.chamber.visualStyle === 'industrial' ? 0.34 : 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  bandMeshes.push(
    ...createSplitBackBand(width - 0.85, 0.11, 0.12, 3.28, backZ, coolTrimMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width - 0.85, 0.12, 0.14, 0.35, backZ + 0.02, coolTrimMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width * 0.72, 0.045, 0.05, 0.55, backZ + 0.09, trimMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width * 0.78, 0.032, 0.03, 2.96, backZ + 0.11, lineMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width * 0.68, 0.028, 0.03, 0.76, backZ + 0.12, lineMaterial, exitOpeningX, exitOpeningWidth),
  );
  target.add(...bandMeshes);

  [-1, 1].forEach((side) => {
    const x = side * (width / 2 - 0.22);
    const upperRail = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.11, depth - 0.85, 2, 0.025), coolTrimMaterial);
    const lowerRail = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.12, depth - 0.85, 2, 0.025), coolTrimMaterial);
    const amberLine = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.045, depth * 0.72, 1, 0.01), trimMaterial);
    const upperGlow = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.036, depth * 0.72, 1, 0.008), lineMaterial.clone());
    const lowerGlow = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.028, depth * 0.68, 1, 0.008), lineMaterial.clone());

    upperRail.position.set(x, 3.28, 0);
    lowerRail.position.set(x, 0.35, 0);
    amberLine.position.set(x - side * 0.055, 0.55, 0);
    upperGlow.position.set(x - side * 0.078, 2.98, 0);
    lowerGlow.position.set(x - side * 0.078, 0.74, 0);
    target.add(upperRail, lowerRail, amberLine, upperGlow, lowerGlow);
    bandMeshes.push(upperRail, lowerRail, amberLine, upperGlow, lowerGlow);
  });

  bandMeshes.forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function createSplitBackBand(
  totalWidth: number,
  height: number,
  depth: number,
  positionY: number,
  positionZ: number,
  material: THREE.Material,
  openingCenterX: number,
  openingWidth: number,
): THREE.Mesh[] {
  const halfWidth = totalWidth / 2;
  const openingLeft = openingCenterX - openingWidth / 2;
  const openingRight = openingCenterX + openingWidth / 2;
  const spans = [
    { min: -halfWidth, max: openingLeft },
    { min: openingRight, max: halfWidth },
  ];

  return spans.flatMap((span) => {
    const spanWidth = span.max - span.min;

    if (spanWidth <= 0.08) {
      return [];
    }

    const mesh = new THREE.Mesh(new RoundedBoxGeometry(spanWidth, height, depth, 2, 0.025), material);
    mesh.position.set((span.min + span.max) / 2, positionY, positionZ);
    return [mesh];
  });
}

function addBackWallModules(
  target: THREE.Object3D,
  level: LevelDefinition,
  width: number,
  depth: number,
  darkMaterial: THREE.Material,
  insetMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  coolTrimMaterial: THREE.Material,
): void {
  const wallZ = -depth / 2 + 0.18;
  const panelCount = clamp(Math.floor(width / 1.35), 3, 11);
  const exitOpeningX = tileWorldPosition(level, level.exitTile).x;
  const exitOpeningWidth = 3.2;

  for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
    const centeredIndex = panelIndex - (panelCount - 1) / 2;
    const moduleX = centeredIndex * 1.45;

    if (Math.abs(moduleX - exitOpeningX) < exitOpeningWidth / 2) {
      continue;
    }

    const group = new THREE.Group();
    group.position.set(moduleX, 1.55, wallZ);

    const shell = new THREE.Mesh(new RoundedBoxGeometry(1.14, 2.68, 0.08, 3, 0.03), darkMaterial);
    const inset = new THREE.Mesh(new RoundedBoxGeometry(0.9, 2.14, 0.052, 3, 0.025), insetMaterial);
    const topRail = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.07, 0.08, 2, 0.018), coolTrimMaterial);
    const bottomRail = topRail.clone();
    const leftStile = new THREE.Mesh(new RoundedBoxGeometry(0.055, 2.42, 0.075, 2, 0.014), coolTrimMaterial);
    const rightStile = leftStile.clone();

    inset.position.z = 0.045;
    topRail.position.set(0, 1.18, 0.065);
    bottomRail.position.set(0, -1.18, 0.065);
    leftStile.position.set(-0.52, 0, 0.06);
    rightStile.position.set(0.52, 0, 0.06);
    group.add(shell, inset, topRail, bottomRail, leftStile, rightStile, ...createVentSlats(0.64, 0.34, 0.068, coolTrimMaterial));

    if ((panelIndex + level.levelNumber) % level.chamber.stripeEvery === 0) {
      const accentColumn = createWallAccentColumn(level, trimMaterial, coolTrimMaterial);
      accentColumn.position.set(0.34, 0, 0.09);
      group.add(accentColumn);
    } else if ((panelIndex + level.levelNumber) % level.chamber.lightEvery === 0) {
      const lightStrip = createWallLight(level.chamber.sideLight);
      lightStrip.position.set(-0.38, 0.82, 0.095);
      group.add(lightStrip);
    } else {
      const smallPlate = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.62, 0.055, 2, 0.018), insetMaterial);
      smallPlate.position.set(-0.34, -0.62, 0.072);
      group.add(smallPlate);
    }

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    target.add(group);
  }
}

function addSideWallModules(
  target: THREE.Object3D,
  level: LevelDefinition,
  width: number,
  depth: number,
  darkMaterial: THREE.Material,
  insetMaterial: THREE.Material,
  trimMaterial: THREE.Material,
  coolTrimMaterial: THREE.Material,
): void {
  [-1, 1].forEach((side) => {
    const bayCount = clamp(Math.floor(depth / 1.55), 4, 12);

    for (let bayIndex = 0; bayIndex < bayCount; bayIndex += 1) {
      const normalizedOffset = bayCount === 1 ? 0 : bayIndex / (bayCount - 1) - 0.5;
      const group = new THREE.Group();
      group.position.set(side * (width / 2 - 0.17), 1.64, normalizedOffset * (depth - 2.2));

      const recess = new THREE.Mesh(new RoundedBoxGeometry(0.055, 3.02, 1.32, 4, 0.032), darkMaterial);
      const shell = new THREE.Mesh(new RoundedBoxGeometry(0.12, 2.72, 1.18, 3, 0.028), insetMaterial);
      const inset = new THREE.Mesh(new RoundedBoxGeometry(0.055, 1.64, 0.62, 3, 0.022), darkMaterial);
      const amberStile = new THREE.Mesh(new RoundedBoxGeometry(0.075, 2.62, 0.12, 2, 0.018), trimMaterial);
      const topCap = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.085, 1.02, 2, 0.015), coolTrimMaterial);
      const bottomCap = topCap.clone();
      const innerTopCap = new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.062, 0.62, 2, 0.012), coolTrimMaterial);
      const innerBottomCap = innerTopCap.clone();
      const innerLeftRail = new THREE.Mesh(new RoundedBoxGeometry(0.056, 1.32, 0.045, 2, 0.012), coolTrimMaterial);
      const innerRightRail = innerLeftRail.clone();
      const centerServicePlate = new THREE.Mesh(new RoundedBoxGeometry(0.06, 1.04, 0.34, 2, 0.018), darkMaterial);
      const dataLineMaterial = new THREE.MeshBasicMaterial({
        color: level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight,
        transparent: true,
        opacity: level.chamber.visualStyle === 'industrial' ? 0.24 : 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const verticalDataLine = new THREE.Mesh(new RoundedBoxGeometry(0.018, 1.14, 0.03, 1, 0.006), dataLineMaterial);
      const lowerServicePlate = new THREE.Mesh(new RoundedBoxGeometry(0.062, 0.42, 0.72, 2, 0.018), insetMaterial);

      recess.position.x = side * -0.02;
      shell.position.x = side * -0.06;
      inset.position.x = side * -0.12;
      amberStile.position.set(side * -0.145, 0, -0.46);
      topCap.position.set(side * -0.105, 1.18, 0);
      bottomCap.position.set(side * -0.105, -1.18, 0);
      innerTopCap.position.set(side * -0.152, 0.82, 0.04);
      innerBottomCap.position.set(side * -0.152, -0.82, 0.04);
      innerLeftRail.position.set(side * -0.17, 0.2, -0.28);
      innerRightRail.position.set(side * -0.17, 0.2, 0.28);
      centerServicePlate.position.set(side * -0.174, 0.12, 0);
      verticalDataLine.position.set(side * -0.206, 0.12, 0);
      lowerServicePlate.position.set(side * -0.16, -0.66, 0.08);
      group.add(recess, shell, inset, amberStile, topCap, bottomCap, innerTopCap, innerBottomCap, innerLeftRail, innerRightRail, centerServicePlate, verticalDataLine, lowerServicePlate);

      if ((bayIndex + side + level.levelNumber) % level.chamber.lightEvery === 0) {
        const lightStrip = createWallLight(level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight);
        lightStrip.position.set(side * -0.185, 0.58, 0.38);
        lightStrip.rotation.y = side * Math.PI / 2;
        group.add(lightStrip);
      } else {
        createVentSlats(0.035, 0.42, side * -0.17, coolTrimMaterial).forEach((slat) => {
          slat.rotation.y = Math.PI / 2;
          slat.position.z += 0.25;
          group.add(slat);
        });
      }

      const microPanelMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.light, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
      for (let statusIndex = 0; statusIndex < 3; statusIndex += 1) {
        const statusLed = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.12, 0.026, 1, 0.004), microPanelMaterial.clone());
        statusLed.position.set(side * -0.19, -0.42 + statusIndex * 0.16, -0.31);
        group.add(statusLed);
      }

      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
        target.add(group);
    }
  });
}

function createVentSlats(width: number, height: number, z: number, material: THREE.Material): THREE.Mesh[] {
  const slats: THREE.Mesh[] = [];

  for (let slatIndex = 0; slatIndex < 5; slatIndex += 1) {
    const slat = new THREE.Mesh(new RoundedBoxGeometry(width, 0.022, 0.035, 1, 0.006), material);
    slat.position.set(0, -height + slatIndex * 0.08, z);
    slats.push(slat);
  }

  return slats;
}

function createWallLight(color: string): THREE.Group {
  const group = new THREE.Group();
  const casing = new THREE.Mesh(
    new RoundedBoxGeometry(0.08, 0.46, 0.045, 2, 0.014),
    new THREE.MeshStandardMaterial({ color: '#0d1315', roughness: 0.48, metalness: 0.5, envMapIntensity: 0.34 }),
  );
  const glow = new THREE.Mesh(
    new RoundedBoxGeometry(0.045, 0.36, 0.018, 2, 0.009),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false }),
  );

  glow.position.z = 0.025;
  group.add(casing, glow);
  return group;
}

function addOverheadBeams(target: THREE.Object3D, level: LevelDefinition): void {
  const beamMaterial = createIndustrialMaterial(level.chamber.ceiling, 0.54, 0.58, 'metal', 2.8, 1);
  const diffuserMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.light, transparent: true, opacity: 0.24, depthWrite: false });
  const shaftMaterial = new THREE.MeshBasicMaterial({
    color: level.chamber.light,
    transparent: true,
    opacity: level.layoutVariant === 'lowVisibility' ? 0.026 : 0.014,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const width = level.width * TILE_SIZE + 4.7;
  const depth = level.depth * TILE_SIZE + 4.8;
  const beamCount = clamp(Math.ceil(depth / 2), 4, 10);

  for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
    const positionZ = beamCount === 1 ? 0 : (beamIndex / (beamCount - 1) - 0.5) * (depth - 1.2);
    const beam = new THREE.Mesh(new RoundedBoxGeometry(width, 0.12, 0.18, 2, 0.025), beamMaterial);
    beam.position.set(0, 3.82, positionZ);
    beam.castShadow = true;
    target.add(beam);

    const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.55, 0.08), diffuserMaterial.clone());
    diffuser.position.set(0, 3.66, positionZ);
    diffuser.rotation.x = -Math.PI / 2;
    target.add(diffuser);

    if (level.layoutVariant === 'lowVisibility' || level.chamber.visualStyle === 'industrial') {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.34, 1.35), shaftMaterial.clone());
      shaft.position.set(0, 2.86, positionZ);
      target.add(shaft);
    }

    const light = new THREE.RectAreaLight(level.chamber.light, 0.92, width * 0.55, 0.08);
    light.position.set(0, 3.67, positionZ);
    light.rotation.x = -Math.PI / 2;
    target.add(light);
  }
}

function addTrainingPanels(target: THREE.Object3D, level: LevelDefinition): void {
  const halfWidth = (level.width * TILE_SIZE + 5.2) / 2;
  const halfDepth = (level.depth * TILE_SIZE + 5.8) / 2;
  const panelTextColor = level.chamber.visualStyle === 'industrial' ? level.chamber.warning : '#dff7ff';
  const leftPanel = createTextPanel([level.name.toUpperCase(), level.chamber.label.toUpperCase(), '', `GRID ${level.width}x${level.depth}`, `MINES ${level.mines.length}`], panelTextColor, level.chamber.sideLight);
  leftPanel.position.set(-halfWidth + 0.44, 2.0, -Math.min(halfDepth - 1.4, 3.9));
  leftPanel.rotation.y = Math.PI / 2;
  target.add(leftPanel);

  const rightPanel = createTextPanel([level.sector.toUpperCase(), 'RANDOMIZED MINES', '', 'SOLVE TO UNLOCK', 'WALK THROUGH EXIT'], panelTextColor, level.chamber.sideLight);
  rightPanel.position.set(halfWidth - 0.44, 2.0, -Math.min(halfDepth - 1.4, 3.25));
  rightPanel.rotation.y = -Math.PI / 2;
  target.add(rightPanel);
}

function addThemeDecals(target: THREE.Object3D, level: LevelDefinition): void {
  const halfWidth = (level.width * TILE_SIZE + 5.2) / 2;
  const halfDepth = (level.depth * TILE_SIZE + 5.8) / 2;
  const color = level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight;
  const accent = level.layoutVariant === 'hazard' ? level.chamber.warning : level.chamber.light;
  const floorLabels = [
    { text: 'SERVICE', x: -halfWidth + 1.12, z: halfDepth - 1.18, rotation: 0 },
    { text: 'CLEAR', x: halfWidth - 1.12, z: halfDepth - 1.18, rotation: 0 },
  ];

  floorLabels.forEach((label, index) => {
    const decal = createDecalPlane(label.text, color, 1.04, 0.26, 512, 128);
    decal.position.set(label.x, 0.004, label.z - index * 0.2);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = label.rotation;
    target.add(decal);
  });

  [-1, 1].forEach((side) => {
    const warningDecal = createDecalPlane(level.chamber.visualStyle === 'industrial' ? 'CAUTION' : 'AUX POWER', accent, 0.92, 0.22, 512, 128);
    warningDecal.position.set(side * (halfWidth - 0.13), 0.86, -halfDepth + 2.28);
    warningDecal.rotation.y = side * -Math.PI / 2;
    target.add(warningDecal);

    for (let stripIndex = 0; stripIndex < 3; stripIndex += 1) {
      const marker = createTrimMarker(level, side, stripIndex);
      marker.position.set(side * (halfWidth - 0.11), 0.52, -1.2 + stripIndex * 1.15);
      marker.rotation.y = side * -Math.PI / 2;
      target.add(marker);
    }
  });

  if (level.layoutVariant === 'hazard') {
    for (let index = 0; index < 4; index += 1) {
      const decal = createDecalPlane('HOT ZONE', level.chamber.warning, 1.0, 0.24, 512, 128);
      decal.position.set((index % 2 === 0 ? -1 : 1) * (halfWidth - 1.32), 0.006, -halfDepth + 2.1 + index * 1.05);
      decal.rotation.x = -Math.PI / 2;
      decal.rotation.z = index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      target.add(decal);
    }
  }
}

function createTrimMarker(level: LevelDefinition, side: number, index: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight,
    transparent: true,
    opacity: 0.32 - index * 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const marker = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.32, 0.16, 1, 0.004), material);
  const notch = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.08, 0.46, 1, 0.004), material.clone());
  marker.position.x = side * -0.01;
  notch.position.set(side * -0.012, -0.18, 0);
  group.add(marker, notch);
  return group;
}

function createDecalPlane(text: string, color: string, width: number, height: number, textureWidth: number, textureHeight: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = textureWidth;
  canvas.height = textureHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create decal texture.');
  }

  const glow = new THREE.Color(color);
  context.clearRect(0, 0, textureWidth, textureHeight);
  context.strokeStyle = `rgba(${Math.round(glow.r * 255)}, ${Math.round(glow.g * 255)}, ${Math.round(glow.b * 255)}, 0.48)`;
  context.lineWidth = 4;
  context.strokeRect(18, 18, textureWidth - 36, textureHeight - 36);
  context.fillStyle = `rgba(${Math.round(glow.r * 255)}, ${Math.round(glow.g * 255)}, ${Math.round(glow.b * 255)}, 0.72)`;
  context.font = '800 42px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, textureWidth / 2, textureHeight / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  decal.renderOrder = 3;
  return decal;
}

function createWallAccentColumn(level: LevelDefinition, frameMaterial: THREE.Material, trimMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const glowColor = level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight;
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: level.chamber.visualStyle === 'industrial' ? 0.34 : 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const backing = new THREE.Mesh(new RoundedBoxGeometry(0.32, 1.92, 0.048, 2, 0.018), frameMaterial);
  const topCap = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.056, 0.07, 1, 0.01), trimMaterial);
  const bottomCap = topCap.clone();
  const lightSlot = new THREE.Mesh(new RoundedBoxGeometry(0.052, 1.38, 0.025, 1, 0.008), glowMaterial);

  topCap.position.set(0, 0.98, 0.016);
  bottomCap.position.set(0, -0.98, 0.016);
  lightSlot.position.set(-0.08, 0, 0.045);
  group.add(backing, topCap, bottomCap, lightSlot);

  for (let index = 0; index < 4; index += 1) {
    const chip = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.038, 0.024, 1, 0.006), trimMaterial);
    chip.position.set(0.08, -0.52 + index * 0.34, 0.045);
    group.add(chip);
  }

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function createExitPassage(wallMaterial: THREE.Material, floorMaterial: THREE.Material, lightColor: string): THREE.Group {
  const passage = new THREE.Group();
  const passageDepth = 4.1;
  const passageCenterZ = -1.95;
  const passageRearZ = -3.86;
  const lightMaterial = new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.64, blending: THREE.AdditiveBlending, depthWrite: false });
  const portalMaterial = new THREE.MeshBasicMaterial({ color: '#020607', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
  const portalGlowMaterial = new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.08, passageDepth, 2, 0.025), floorMaterial);
  const ceiling = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.12, passageDepth, 2, 0.025), wallMaterial);
  const leftWall = new THREE.Mesh(new RoundedBoxGeometry(0.12, 2.62, passageDepth, 2, 0.025), wallMaterial);
  const rightWall = leftWall.clone();
  const threshold = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.045, 0.08, 1, 0.01), lightMaterial);
  const rearGuide = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.055, 0.07, 1, 0.01), lightMaterial.clone());
  const rearPortal = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 2.22), portalMaterial);
  const rearGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 2.04), portalGlowMaterial);

  floor.position.set(0, 0.02, passageCenterZ);
  ceiling.position.set(0, 2.72, passageCenterZ);
  leftWall.position.set(-0.95, 1.35, passageCenterZ);
  rightWall.position.set(0.95, 1.35, passageCenterZ);
  threshold.position.set(0, 0.12, 0.06);
  rearGuide.position.set(0, 2.1, passageRearZ);
  rearPortal.position.set(0, 1.38, passageRearZ - 0.05);
  rearGlow.position.set(0, 1.38, passageRearZ - 0.08);
  [floor, ceiling, leftWall, rightWall].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  passage.add(floor, ceiling, leftWall, rightWall, threshold, rearGuide, rearPortal, rearGlow);

  [-1, 1].forEach((side) => {
    const guide = new THREE.Mesh(new RoundedBoxGeometry(0.04, 2.1, passageDepth - 0.6, 1, 0.008), lightMaterial.clone());
    guide.position.set(side * 0.72, 1.38, passageCenterZ - 0.16);
    passage.add(guide);
  });

  return passage;
}

function createExitDoor(level: LevelDefinition): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.44, 0.68, 'metal', 1.4, 1.2);
  const panelMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.4, 0.5, 'door', 1.2, 2.2, '#260907');
  const trimMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.42, 0.64, 'metal', 0.7, 1.8);
  const passageMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.86, 0.28, 'dark-panel', 0.8, 2.6);
  const passageFloorMaterial = createIndustrialMaterial(level.chamber.floor, 0.82, 0.22, 'floor', 1.2, 2.4);

  const exitPosition = tileWorldPosition(level, level.exitTile);
  const positionX = exitPosition.x;
  const positionZ = exitPosition.z - 1.05;
  group.position.set(positionX, 0, positionZ);
  group.name = 'ExitDoor';

  group.add(createExitPassage(passageMaterial, passageFloorMaterial, level.chamber.light));

  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.45, 3.2, 0.28, 4, 0.07), frameMaterial);
  frame.position.y = 1.45;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const aperture = new THREE.Mesh(
    new RoundedBoxGeometry(1.54, 2.36, 0.045, 3, 0.035),
    new THREE.MeshBasicMaterial({ color: '#010405' }),
  );
  aperture.position.set(0, 1.28, -0.24);
  group.add(aperture);

  [-1, 1].forEach((side) => {
    const apertureGuide = new THREE.Mesh(
      new RoundedBoxGeometry(0.045, 2.16, 0.035, 1, 0.008),
      new THREE.MeshBasicMaterial({ color: level.chamber.light, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    apertureGuide.position.set(side * 0.68, 1.32, -0.2);
    group.add(apertureGuide);
  });

  const doorPanel = new THREE.Group();
  doorPanel.position.set(0, 1.23, -0.03);
  doorPanel.name = 'ExitDoorPanel';

  const door = new THREE.Mesh(new RoundedBoxGeometry(1.72, 2.55, 0.34, 4, 0.045), panelMaterial);
  door.castShadow = true;
  door.receiveShadow = true;
  doorPanel.add(door);

  [-0.48, 0, 0.48].forEach((offsetY) => {
    const groove = new THREE.Mesh(new RoundedBoxGeometry(1.48, 0.035, 0.045, 2, 0.012), trimMaterial);
    groove.position.set(0, offsetY, 0.2);
    groove.castShadow = true;
    doorPanel.add(groove);
  });

  [-0.72, 0.72].forEach((offsetX) => {
    const sideRail = new THREE.Mesh(new RoundedBoxGeometry(0.08, 2.32, 0.08, 2, 0.018), trimMaterial);
    sideRail.position.set(offsetX, 0, 0.2);
    sideRail.castShadow = true;
    doorPanel.add(sideRail);
  });

  const statusInset = new THREE.Mesh(
    new RoundedBoxGeometry(0.58, 0.16, 0.04, 2, 0.015),
    new THREE.MeshStandardMaterial({ color: '#4a1813', emissive: '#5a0906', emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.24 }),
  );
  statusInset.name = 'ExitDoorStatusLight';
  statusInset.position.set(0, 0.92, 0.22);
  doorPanel.add(statusInset);
  group.add(doorPanel);

  const header = createDoorHeader(level, trimMaterial, frameMaterial);
  header.position.set(0, 3.12, 0.22);
  group.add(header);

  [-1, 1].forEach((side) => {
    const fixture = createDoorLightColumn(level);
    fixture.position.set(side * 1.08, 1.7, 0.24);
    group.add(fixture);

    const doorLight = new THREE.RectAreaLight(level.chamber.light, level.chamber.visualStyle === 'industrial' ? 0.85 : 1.15, 0.18, 1.55);
    doorLight.position.set(side * 1.1, 1.7, 0.32);
    doorLight.lookAt(new THREE.Vector3(side * 1.1, 1.7, 2.2));
    group.add(doorLight);
  });

  [-1, 1].forEach((side) => {
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.45, 14), trimMaterial);
    piston.position.set(side * 1.05, 1.42, 0.24);
    piston.castShadow = true;
    group.add(piston);
  });

  return group;
}

function createDoorHeader(level: LevelDefinition, trimMaterial: THREE.Material, frameMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const glowColor = level.chamber.visualStyle === 'industrial' ? level.chamber.warning : level.chamber.sideLight;
  const bezelMaterial = new THREE.MeshStandardMaterial({ color: '#05090d', roughness: 0.36, metalness: 0.52, envMapIntensity: 0.42 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: glowColor,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.14,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.7,
    depthWrite: false,
  });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false });
  const backing = new THREE.Mesh(new RoundedBoxGeometry(1.78, 0.52, 0.1, 3, 0.024), frameMaterial);
  const inset = new THREE.Mesh(new RoundedBoxGeometry(1.54, 0.36, 0.06, 2, 0.018), bezelMaterial);
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 0.24),
    new THREE.MeshBasicMaterial({ map: createDoorHeaderTexture(level), transparent: true, depthWrite: false }),
  );
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.24), glassMaterial);
  const topLight = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.026, 0.024, 1, 0.006), lightMaterial);
  const leftCap = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.42, 0.04, 1, 0.008), trimMaterial);
  const rightCap = leftCap.clone();

  inset.position.z = 0.045;
  text.position.z = 0.083;
  glass.position.z = 0.087;
  topLight.position.set(0, 0.23, 0.088);
  leftCap.position.set(-0.83, 0, 0.06);
  rightCap.position.set(0.83, 0, 0.06);
  group.add(backing, inset, text, glass, topLight, leftCap, rightCap);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  text.castShadow = false;
  glass.castShadow = false;
  topLight.castShadow = false;
  return group;
}

function createDoorLightColumn(level: LevelDefinition): THREE.Group {
  const group = new THREE.Group();
  const casingMaterial = new THREE.MeshStandardMaterial({ color: '#12181d', roughness: 0.48, metalness: 0.54, envMapIntensity: 0.32 });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: level.chamber.light,
    transparent: true,
    opacity: level.chamber.visualStyle === 'industrial' ? 0.48 : 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const casing = new THREE.Mesh(new RoundedBoxGeometry(0.18, 1.7, 0.09, 2, 0.018), casingMaterial);
  const diffuser = new THREE.Mesh(new RoundedBoxGeometry(0.07, 1.42, 0.025, 1, 0.008), glowMaterial);
  diffuser.position.z = 0.055;
  group.add(casing, diffuser);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function createTextPanel(lines: string[], color: string, glowColor: string): THREE.Group {
  const group = new THREE.Group();
  const texture = createTextTexture(lines, color, 512, 320, glowColor);
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#101820', roughness: 0.42, metalness: 0.64, envMapIntensity: 0.58 });
  const bezelMaterial = new THREE.MeshStandardMaterial({ color: '#05090d', roughness: 0.36, metalness: 0.52, envMapIntensity: 0.42 });
  const mountMaterial = new THREE.MeshStandardMaterial({ color: '#17232c', roughness: 0.68, metalness: 0.36, envMapIntensity: 0.28 });
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: glowColor,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.75,
    depthWrite: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });

  const wallMount = new THREE.Mesh(new RoundedBoxGeometry(2.52, 1.72, 0.08, 4, 0.035), mountMaterial);
  const outerFrame = new THREE.Mesh(new RoundedBoxGeometry(2.22, 1.42, 0.07, 4, 0.032), frameMaterial);
  const innerBezel = new THREE.Mesh(new RoundedBoxGeometry(1.94, 1.14, 0.038, 3, 0.022), bezelMaterial);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.94), screenMaterial);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.94), glassMaterial);
  const topRail = new THREE.Mesh(new RoundedBoxGeometry(2.06, 0.05, 0.04, 1, 0.012), glowMaterial.clone());
  const lowerStatus = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.032, 0.035, 1, 0.008), glowMaterial.clone());

  wallMount.position.z = -0.035;
  outerFrame.position.z = 0.008;
  innerBezel.position.z = 0.05;
  screen.position.z = 0.074;
  glass.position.z = 0.078;
  topRail.position.set(0, 0.66, 0.088);
  lowerStatus.position.set(-0.62, -0.65, 0.088);
  group.add(wallMount, outerFrame, innerBezel, screen, glass, topRail, lowerStatus);

  for (let screwIndex = 0; screwIndex < 4; screwIndex += 1) {
    const screw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.012, 14),
      new THREE.MeshStandardMaterial({ color: '#33434c', roughness: 0.34, metalness: 0.78, envMapIntensity: 0.52 }),
    );
    screw.rotation.x = Math.PI / 2;
    screw.position.set(screwIndex % 2 === 0 ? -1.08 : 1.08, screwIndex < 2 ? -0.72 : 0.72, 0.09);
    group.add(screw);
  }

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  screen.castShadow = false;
  glass.castShadow = false;
  topRail.castShadow = false;
  lowerStatus.castShadow = false;
  return group;
}

function createTextTexture(lines: string[], color: string, width: number, height: number, glowColor = '#28c7ff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create text panel texture.');
  }

  context.fillStyle = 'rgba(2, 5, 6, 0.82)';
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.3, width * 0.72);
  const glowRgb = new THREE.Color(glowColor);
  glow.addColorStop(0, `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0.14)`);
  glow.addColorStop(1, `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0.42)`;
  context.lineWidth = 4;
  context.strokeRect(6, 6, width - 12, height - 12);
  context.globalAlpha = 0.18;
  context.fillStyle = '#7fe8ff';
  for (let y = 18; y < height - 12; y += 14) {
    context.fillRect(14, y, width - 28, 1);
  }
  context.globalAlpha = 1;
  context.strokeStyle = `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0.32)`;
  context.lineWidth = 2;
  [width * 0.44, width * 0.56].forEach((iconX) => {
    context.beginPath();
    context.moveTo(iconX, 34);
    context.lineTo(iconX + 20, 46);
    context.lineTo(iconX + 20, 72);
    context.lineTo(iconX, 86);
    context.lineTo(iconX - 20, 72);
    context.lineTo(iconX - 20, 46);
    context.closePath();
    context.stroke();
  });
  context.shadowColor = `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0.48)`;
  context.shadowBlur = 8;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const displayLines = lines.filter((line) => line.length > 0);
  context.font = '700 27px system-ui';
  context.fillText(displayLines[0] ?? '', width / 2, 106);
  context.font = '700 18px system-ui';
  context.fillText(displayLines[1] ?? '', width / 2, 143);

  context.shadowBlur = 3;
  context.textAlign = 'left';
  context.font = '700 19px system-ui';
  displayLines.slice(2).forEach((line, lineIndex) => {
    const y = 200 + lineIndex * 36;
    context.fillStyle = `rgba(${Math.round(glowRgb.r * 255)}, ${Math.round(glowRgb.g * 255)}, ${Math.round(glowRgb.b * 255)}, 0.38)`;
    context.fillRect(114, y + 7, 10, 10);
    context.fillStyle = color;
    context.fillText(line, 144, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createDoorHeaderTexture(level: LevelDefinition): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create door header texture.');
  }

  const glow = new THREE.Color(level.chamber.light);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(3, 7, 10, 0.7)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `rgba(${Math.round(glow.r * 255)}, ${Math.round(glow.g * 255)}, ${Math.round(glow.b * 255)}, 0.34)`;
  context.lineWidth = 3;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.shadowColor = `rgba(${Math.round(glow.r * 255)}, ${Math.round(glow.g * 255)}, ${Math.round(glow.b * 255)}, 0.72)`;
  context.shadowBlur = 14;
  context.fillStyle = '#edf8ff';
  context.font = '700 48px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`C${Math.max(1, Math.ceil(level.levelNumber / 8))}`, canvas.width * 0.36, canvas.height * 0.52);
  context.fillText(String(level.levelNumber).padStart(2, '0'), canvas.width * 0.63, canvas.height * 0.52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createIndustrialMaterial(
  color: THREE.Color | string,
  roughness: number,
  metalness: number,
  kind: SurfaceKind,
  repeatX = 1,
  repeatY = 1,
  emissive?: THREE.Color | string,
): THREE.MeshStandardMaterial {
  const normalStrength = kind === 'floor' ? 0.072 : kind === 'wall' || kind === 'dark-panel' ? 0.052 : 0.082;
  const envMapIntensity = kind === 'metal' || kind === 'trim' ? 0.68 : kind === 'door' ? 0.38 : kind === 'floor' ? 0.26 : 0.22;
  const aoIntensity = kind === 'floor' ? 0.28 : kind === 'wall' || kind === 'dark-panel' ? 0.34 : 0.24;

  return new THREE.MeshStandardMaterial({
    map: createSurfaceTexture(color, kind, repeatX, repeatY),
    normalMap: createNormalTexture(kind, repeatX, repeatY),
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: createRoughnessTexture(kind, repeatX, repeatY),
    aoMap: createAoTexture(kind, repeatX, repeatY),
    aoMapIntensity: aoIntensity,
    color: '#ffffff',
    emissive: emissive ?? '#000000',
    emissiveIntensity: emissive ? 0.82 : 0,
    roughness,
    metalness,
    envMapIntensity,
  });
}

function prepareObjectForPbr(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      prepareGeometryForAo(child.geometry);
    }
  });
}

function prepareGeometryForAo(geometry: THREE.BufferGeometry): void {
  if (!geometry.attributes.uv || geometry.attributes.uv2) {
    return;
  }

  geometry.setAttribute('uv2', geometry.attributes.uv.clone());
}

function createNormalTexture(kind: SurfaceKind, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create normal texture.');
  }

  context.fillStyle = 'rgb(128, 128, 255)';
  context.fillRect(0, 0, size, size);

  const seamSpacing = kind === 'floor' ? 128 : kind === 'trim' || kind === 'metal' ? 96 : 170;
  context.strokeStyle = 'rgb(112, 126, 255)';
  context.lineWidth = kind === 'floor' ? 5 : 3;
  for (let position = seamSpacing; position < size; position += seamSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  context.strokeStyle = 'rgba(150, 132, 255, 0.28)';
  context.lineWidth = 2;
  const scratchCount = kind === 'wall' || kind === 'dark-panel' ? 8 : kind === 'floor' ? 24 : 44;
  for (let scratchIndex = 0; scratchIndex < scratchCount; scratchIndex += 1) {
    const x = pseudoRandom(scratchIndex, kind.length * 31) * size;
    const y = pseudoRandom(scratchIndex, 23) * size;
    const length = 18 + pseudoRandom(scratchIndex, 41) * 74;
    context.save();
    context.translate(x, y);
    context.rotate((pseudoRandom(scratchIndex, 59) - 0.5) * 1.1);
    context.beginPath();
    context.moveTo(-length * 0.5, 0);
    context.lineTo(length * 0.5, 0);
    context.stroke();
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createSurfaceTexture(color: THREE.Color | string, kind: SurfaceKind, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create industrial texture.');
  }

  const baseColor = colorToStyle(color);
  context.fillStyle = baseColor;
  context.fillRect(0, 0, size, size);

  const topLight = context.createLinearGradient(0, 0, size, size);
  topLight.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  topLight.addColorStop(0.42, 'rgba(255, 255, 255, 0.015)');
  topLight.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  context.fillStyle = topLight;
  context.fillRect(0, 0, size, size);

  const edgeShade = context.createRadialGradient(size * 0.5, size * 0.48, size * 0.22, size * 0.5, size * 0.5, size * 0.72);
  edgeShade.addColorStop(0, 'rgba(255, 255, 255, 0.018)');
  edgeShade.addColorStop(0.68, 'rgba(0, 0, 0, 0.02)');
  edgeShade.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  context.fillStyle = edgeShade;
  context.fillRect(0, 0, size, size);

  const lineSpacing = kind === 'floor' ? 128 : kind === 'wall' || kind === 'dark-panel' ? 256 : 96;
  context.strokeStyle = kind === 'trim' ? 'rgba(255, 208, 104, 0.12)' : 'rgba(105, 218, 255, 0.032)';
  context.lineWidth = kind === 'floor' ? 3 : 1;
  for (let position = lineSpacing; position < size; position += lineSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const scratchCount = kind === 'wall' || kind === 'dark-panel' ? 12 : kind === 'floor' ? 48 : 92;
  for (let scratchIndex = 0; scratchIndex < scratchCount; scratchIndex += 1) {
    const random = pseudoRandom(scratchIndex, kind.length * 19);
    const x = pseudoRandom(scratchIndex, 3) * size;
    const y = pseudoRandom(scratchIndex, 7) * size;
    const length = 16 + pseudoRandom(scratchIndex, 11) * (kind === 'metal' || kind === 'trim' ? 88 : 48);
    const alpha = kind === 'wall' || kind === 'dark-panel' ? 0.004 + random * 0.008 : 0.012 + random * 0.04;
    context.save();
    context.translate(x, y);
    context.rotate((pseudoRandom(scratchIndex, 13) - 0.5) * 0.6);
    context.fillStyle = random > 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha * 1.6})`;
    context.fillRect(-length * 0.5, 0, length, 1 + pseudoRandom(scratchIndex, 17) * 2);
    context.restore();
  }

  if (kind === 'door' || kind === 'dark-panel') {
    context.strokeStyle = 'rgba(47, 255, 143, 0.045)';
    context.lineWidth = 3;
    context.strokeRect(34, 34, size - 68, size - 68);
  }

  if (kind === 'wall' || kind === 'dark-panel') {
    context.strokeStyle = 'rgba(185, 232, 255, 0.035)';
    context.lineWidth = 2;
    for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
      const inset = 52 + panelIndex * 92;
      context.strokeRect(inset, inset * 0.72, size - inset * 2, size - inset * 1.44);
    }
  }

  if (kind === 'metal' || kind === 'trim' || kind === 'door') {
    context.globalAlpha = kind === 'trim' ? 0.16 : 0.1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    context.lineWidth = 1;
    for (let y = 28; y < size; y += 36) {
      context.beginPath();
      context.moveTo(20, y + pseudoRandom(y, kind.length * 47) * 7);
      context.lineTo(size - 20, y + pseudoRandom(y, kind.length * 53) * 7);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createRoughnessTexture(kind: SurfaceKind, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create roughness texture.');
  }

  const image = context.createImageData(size, size);
  const base = kind === 'metal' || kind === 'trim' ? 148 : 196;

  for (let index = 0; index < image.data.length; index += 4) {
    const pixel = index / 4;
    const variation = Math.floor((pseudoRandom(pixel, kind.length * 23) - 0.5) * 58);
    const value = THREE.MathUtils.clamp(base + variation, 84, 235);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createAoTexture(kind: SurfaceKind, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create AO texture.');
  }

  context.fillStyle = 'rgb(222, 222, 222)';
  context.fillRect(0, 0, size, size);

  const edgeGradient = context.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72);
  edgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  edgeGradient.addColorStop(0.58, 'rgba(170, 170, 170, 0.08)');
  edgeGradient.addColorStop(1, 'rgba(54, 54, 54, 0.32)');
  context.fillStyle = edgeGradient;
  context.fillRect(0, 0, size, size);

  const seamSpacing = kind === 'floor' ? 128 : kind === 'trim' || kind === 'metal' ? 96 : 170;
  context.strokeStyle = kind === 'trim' || kind === 'metal' ? 'rgba(42, 42, 42, 0.14)' : 'rgba(30, 30, 30, 0.22)';
  context.lineWidth = kind === 'floor' ? 7 : 5;
  for (let position = seamSpacing; position < size; position += seamSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function colorToStyle(color: THREE.Color | string): string {
  return color instanceof THREE.Color ? `#${color.getHexString()}` : color;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pseudoRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}