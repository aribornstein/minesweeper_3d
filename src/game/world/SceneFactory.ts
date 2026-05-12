import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06080a');
  scene.fog = new THREE.FogExp2('#07090a', 0.052);

  const ambient = new THREE.HemisphereLight('#91c8dd', '#1a120d', 0.46);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#fff0d4', 1.85);
  keyLight.position.set(4.5, 8.6, 5.4);
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

  const rimLight = new THREE.DirectionalLight('#6ad9ff', 0.42);
  rimLight.position.set(-5, 3.2, -4.2);
  scene.add(rimLight);

  const levelEnvironment = createLevelEnvironment(level);
  scene.add(levelEnvironment.group);

  return { scene, levelEnvironment, ...levelEnvironment };
}

export function createLevelEnvironment(level: LevelDefinition): LevelEnvironment {
  const group = new THREE.Group();
  group.name = 'ProceduralLevelEnvironment';

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
  addWalls(group, level);
  addOverheadBeams(group, level);
  addTrainingPanels(group, level);

  const exitDoor = createExitDoor(level);
  group.add(exitDoor);

  return { group, exitDoor, exitGlow, alarmLight };
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

function addWalls(target: THREE.Object3D, level: LevelDefinition): void {
  const width = level.width * TILE_SIZE + 5.2;
  const depth = level.depth * TILE_SIZE + 5.8;
  const wallMaterial = createIndustrialMaterial(level.chamber.wall, 0.8, 0.24, 'wall', 2, 1);
  const darkMaterial = createIndustrialMaterial(level.chamber.wallDark, 0.86, 0.22, 'dark-panel', 1, 1.25);
  const insetMaterial = createIndustrialMaterial(level.chamber.panel, 0.82, 0.2, 'dark-panel', 0.8, 1.1);
  const trimMaterial = createIndustrialMaterial(level.chamber.trim, 0.5, 0.34, 'trim', 1, 1.2);
  const coolTrimMaterial = createIndustrialMaterial(level.chamber.coolTrim, 0.58, 0.46, 'metal', 1, 1);

  addSegmentedBackWall(target, level, width, depth, wallMaterial);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.2, depth), wallMaterial);
  leftWall.position.set(-width / 2, 1.9, 0);
  leftWall.receiveShadow = true;
  target.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = width / 2;
  target.add(rightWall);

  addWallBands(target, level, width, depth, trimMaterial, coolTrimMaterial);
  addBackWallModules(target, level, width, depth, darkMaterial, insetMaterial, trimMaterial, coolTrimMaterial);
  addSideWallModules(target, level, width, depth, darkMaterial, insetMaterial, trimMaterial, coolTrimMaterial);
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

function addWallBands(target: THREE.Object3D, level: LevelDefinition, width: number, depth: number, trimMaterial: THREE.Material, coolTrimMaterial: THREE.Material): void {
  const bandMeshes: THREE.Mesh[] = [];
  const backZ = -depth / 2 + 0.24;
  const exitOpeningX = tileWorldPosition(level, level.exitTile).x;
  const exitOpeningWidth = 3.2;

  bandMeshes.push(
    ...createSplitBackBand(width - 0.85, 0.11, 0.12, 3.28, backZ, coolTrimMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width - 0.85, 0.12, 0.14, 0.35, backZ + 0.02, coolTrimMaterial, exitOpeningX, exitOpeningWidth),
    ...createSplitBackBand(width * 0.72, 0.045, 0.05, 0.55, backZ + 0.09, trimMaterial, exitOpeningX, exitOpeningWidth),
  );
  target.add(...bandMeshes);

  [-1, 1].forEach((side) => {
    const x = side * (width / 2 - 0.22);
    const upperRail = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.11, depth - 0.85, 2, 0.025), coolTrimMaterial);
    const lowerRail = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.12, depth - 0.85, 2, 0.025), coolTrimMaterial);
    const amberLine = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.045, depth * 0.72, 1, 0.01), trimMaterial);

    upperRail.position.set(x, 3.28, 0);
    lowerRail.position.set(x, 0.35, 0);
    amberLine.position.set(x - side * 0.055, 0.55, 0);
    target.add(upperRail, lowerRail, amberLine);
    bandMeshes.push(upperRail, lowerRail, amberLine);
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
      const stripe = createHazardStripe(trimMaterial);
      stripe.position.set(0.36, 0, 0.09);
      group.add(stripe);
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

      const shell = new THREE.Mesh(new RoundedBoxGeometry(0.08, 2.72, 1.18, 3, 0.028), darkMaterial);
      const inset = new THREE.Mesh(new RoundedBoxGeometry(0.052, 2.08, 0.86, 3, 0.022), insetMaterial);
      const amberStile = new THREE.Mesh(new RoundedBoxGeometry(0.07, 2.62, 0.12, 2, 0.018), trimMaterial);
      const topCap = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.07, 0.95, 2, 0.015), coolTrimMaterial);
      const bottomCap = topCap.clone();

      inset.position.x = side * -0.04;
      amberStile.position.set(side * -0.065, 0, -0.44);
      topCap.position.set(side * -0.055, 1.18, 0);
      bottomCap.position.set(side * -0.055, -1.18, 0);
      group.add(shell, inset, amberStile, topCap, bottomCap);

      if ((bayIndex + side + level.levelNumber) % level.chamber.lightEvery === 0) {
        const lightStrip = createWallLight(level.chamber.warning);
        lightStrip.position.set(side * -0.075, 0.68, 0.38);
        lightStrip.rotation.y = side * Math.PI / 2;
        group.add(lightStrip);
      } else {
        createVentSlats(0.03, 0.42, side * -0.07, coolTrimMaterial).forEach((slat) => {
          slat.rotation.y = Math.PI / 2;
          slat.position.z += 0.25;
          group.add(slat);
        });
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
  const diffuserMaterial = new THREE.MeshBasicMaterial({ color: level.chamber.light, transparent: true, opacity: 0.42, depthWrite: false });
  const shaftMaterial = new THREE.MeshBasicMaterial({
    color: level.chamber.light,
    transparent: true,
    opacity: 0.045,
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

    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.58, 2.7), shaftMaterial.clone());
    shaft.position.set(0, 2.25, positionZ);
    target.add(shaft);

    const light = new THREE.RectAreaLight(level.chamber.light, 0.92, width * 0.55, 0.08);
    light.position.set(0, 3.67, positionZ);
    light.rotation.x = -Math.PI / 2;
    target.add(light);
  }
}

function addTrainingPanels(target: THREE.Object3D, level: LevelDefinition): void {
  const halfWidth = (level.width * TILE_SIZE + 5.2) / 2;
  const halfDepth = (level.depth * TILE_SIZE + 5.8) / 2;
  const leftPanel = createTextPanel([level.name.toUpperCase(), level.chamber.label.toUpperCase(), '', `GRID ${level.width}x${level.depth}`, `MINES ${level.mines.length}`], level.chamber.warning, level.chamber.light);
  leftPanel.position.set(-halfWidth + 0.35, 2.0, -Math.min(halfDepth - 1.4, 3.9));
  leftPanel.rotation.y = Math.PI / 2;
  target.add(leftPanel);

  const rightPanel = createTextPanel([level.sector.toUpperCase(), 'RANDOMIZED MINES', '', 'SOLVE TO UNLOCK', 'WALK THROUGH EXIT'], level.chamber.warning, level.chamber.light);
  rightPanel.position.set(halfWidth - 0.35, 2.0, -Math.min(halfDepth - 1.4, 3.25));
  rightPanel.rotation.y = -Math.PI / 2;
  target.add(rightPanel);
}

function createHazardStripe(material: THREE.Material): THREE.Group {
  const stripeGroup = new THREE.Group();

  for (let stripeIndex = 0; stripeIndex < 5; stripeIndex += 1) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.9, 0.08, 2, 0.018), material);
    stripe.position.y = (stripeIndex - 2) * 0.43;
    stripe.rotation.z = stripeIndex % 2 === 0 ? 0.34 : -0.34;
    stripe.castShadow = true;
    stripeGroup.add(stripe);
  }

  return stripeGroup;
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
  const signMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['EXIT'], level.chamber.warning, 512, 192), transparent: true });

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

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.42), signMaterial);
  sign.position.set(0, 3.18, 0.19);
  group.add(sign);

  [-1, 1].forEach((side) => {
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.45, 14), trimMaterial);
    piston.position.set(side * 1.05, 1.42, 0.24);
    piston.castShadow = true;
    group.add(piston);
  });

  return group;
}

function createTextPanel(lines: string[], color: string, glowColor: string): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const texture = createTextTexture(lines, color, 512, 320, glowColor);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.32), material);
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
  context.strokeStyle = 'rgba(69, 188, 224, 0.38)';
  context.lineWidth = 4;
  context.strokeRect(6, 6, width - 12, height - 12);
  context.globalAlpha = 0.18;
  context.fillStyle = '#7fe8ff';
  for (let y = 18; y < height - 12; y += 14) {
    context.fillRect(14, y, width - 28, 1);
  }
  context.globalAlpha = 1;
  context.shadowColor = 'rgba(240, 166, 41, 0.45)';
  context.shadowBlur = 10;
  context.fillStyle = color;
  context.font = 'bold 32px system-ui';
  context.textAlign = 'left';
  context.textBaseline = 'top';

  lines.forEach((line, lineIndex) => {
    context.fillText(line, 30, 28 + lineIndex * 50);
  });

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
  return new THREE.MeshStandardMaterial({
    map: createSurfaceTexture(color, kind, repeatX, repeatY),
    roughnessMap: createRoughnessTexture(kind, repeatX, repeatY),
    color: '#ffffff',
    emissive: emissive ?? '#000000',
    emissiveIntensity: emissive ? 0.82 : 0,
    roughness,
    metalness,
    envMapIntensity: kind === 'metal' || kind === 'trim' ? 0.45 : 0.18,
  });
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

  const lineSpacing = kind === 'floor' ? 128 : kind === 'wall' || kind === 'dark-panel' ? 256 : 96;
  context.strokeStyle = kind === 'trim' ? 'rgba(255, 208, 104, 0.18)' : 'rgba(105, 218, 255, 0.055)';
  context.lineWidth = kind === 'floor' ? 3 : 1;
  for (let position = lineSpacing; position < size; position += lineSpacing) {
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const scratchCount = kind === 'wall' || kind === 'dark-panel' ? 58 : 210;
  for (let scratchIndex = 0; scratchIndex < scratchCount; scratchIndex += 1) {
    const random = pseudoRandom(scratchIndex, kind.length * 19);
    const x = pseudoRandom(scratchIndex, 3) * size;
    const y = pseudoRandom(scratchIndex, 7) * size;
    const length = 16 + pseudoRandom(scratchIndex, 11) * (kind === 'metal' || kind === 'trim' ? 88 : 48);
    const alpha = kind === 'wall' || kind === 'dark-panel' ? 0.012 + random * 0.028 : 0.025 + random * 0.08;
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