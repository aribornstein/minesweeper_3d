import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, TILE_GAP, TILE_SIZE } from '../config';
import type { LevelDefinition, TileCoord, TileState } from '../types';
import { createFlagModel } from './FlagModel';

const TEXTURE_ANISOTROPY = 8;

type TileVisual = {
  root: THREE.Group;
  rimMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  tileMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  insetMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edgeLights: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  routeGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hoverGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  marker?: THREE.Object3D;
  label?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
};

export class TileGrid {
  readonly group = new THREE.Group();
  readonly interactiveMeshes: THREE.Mesh[] = [];
  private readonly visuals = new Map<string, TileVisual>();
  private readonly panelDetailTexture = createTileDetailTexture();
  private readonly panelRoughnessTexture = createTileRoughnessTexture();
  private readonly panelNormalTexture = createTileNormalTexture();
  private readonly panelAoTexture = createTileAoTexture();
  private readonly glowTexture = createSoftGlowTexture();
  private readonly suppressedFlagMarkers = new Set<string>();
  private hoverKey: string | undefined;
  private routeVisible = false;
  private elapsed = 0;

  constructor(private tiles: TileState[], private level: LevelDefinition) {
    this.group.name = 'MinesweeperTileGrid';
    this.build();
  }

  rebuild(tiles: TileState[], level: LevelDefinition): void {
    this.clear();
    this.tiles = tiles;
    this.level = level;
    this.hoverKey = undefined;
    this.routeVisible = false;
    this.suppressedFlagMarkers.clear();
    this.build();
  }

  updateTile(tile: TileState): void {
    const visual = this.visuals.get(this.key(tile));

    if (!visual) {
      return;
    }

    const colors = this.tileColors(tile);
    visual.tileMesh.material.color.copy(colors.base);
    visual.insetMesh.material.color.copy(colors.inset);
    visual.tileMesh.material.emissive.copy(colors.emissive);
    visual.insetMesh.material.emissive.copy(colors.emissive).multiplyScalar(0.45);
    visual.tileMesh.material.roughness = tile.revealed ? 0.56 : 0.45;
    visual.insetMesh.material.roughness = tile.revealed ? 0.62 : 0.5;
    visual.rimMesh.material.color.set(tile.revealed ? '#0f1718' : '#11191a');
    visual.tileMesh.position.y = tile.revealed ? 0 : 0.07;
    visual.insetMesh.position.y = tile.revealed ? 0.16 : 0.24;
    visual.routeGlow.visible = this.routeVisible && tile.isRouteHint && !tile.hasMine;
    visual.hoverGlow.visible = false;
    visual.hoverGlow.material.opacity = 0;
    const edgeColor = tile.flagged ? COLORS.alarm : tile.revealed ? this.routeAccentColor() : COLORS.unknownTileInset;
    const edgeOpacity = tile.flagged ? 0.42 : tile.revealed ? 0.18 : 0.06;
    visual.edgeLights.forEach((edgeLight) => {
      edgeLight.material.color.copy(edgeColor);
      edgeLight.material.opacity = edgeOpacity;
      edgeLight.material.userData.baseOpacity = edgeOpacity;
    });

    if (visual.marker) {
      visual.root.remove(visual.marker);
      this.disposeObject(visual.marker);
      visual.marker = undefined;
    }

    if (visual.label) {
      visual.root.remove(visual.label);
      this.disposeLabel(visual.label);
      visual.label = undefined;
    }

    if (tile.flagged && !this.suppressedFlagMarkers.has(this.key(tile))) {
      visual.marker = this.createFlag();
      visual.root.add(visual.marker);
    } else if (tile.revealed && tile.hasMine) {
      visual.marker = this.createMine();
      visual.root.add(visual.marker);
    } else if (tile.revealed && tile.adjacentMines > 0) {
      visual.label = this.createNumberLabel(tile.adjacentMines);
      visual.root.add(visual.label);
    }
  }

  setRouteVisible(visible: boolean): void {
    this.routeVisible = visible;
    this.tiles.forEach((tile) => this.updateTile(tile));
  }

  setFlagMarkerSuppressed(tile: TileCoord, suppressed: boolean): void {
    const tileKey = this.key(tile);

    if (suppressed) {
      this.suppressedFlagMarkers.add(tileKey);
    } else {
      this.suppressedFlagMarkers.delete(tileKey);
    }
  }

  animate(delta: number): void {
    this.elapsed += delta;
    const pulse = 0.09 + Math.sin(this.elapsed * 5) * 0.035;
    const hoverPulse = 0.18 + Math.sin(this.elapsed * 8.5) * 0.08;
    const edgePulse = 0.82 + Math.sin(this.elapsed * 4.2) * 0.18;

    this.visuals.forEach((visual) => {
      visual.routeGlow.material.opacity = visual.routeGlow.visible ? pulse : 0;
      visual.hoverGlow.material.opacity = visual.hoverGlow.visible ? hoverPulse : 0;
      visual.edgeLights.forEach((edgeLight) => {
        const baseOpacity = Number(edgeLight.material.userData.baseOpacity ?? edgeLight.material.opacity);
        edgeLight.material.opacity = baseOpacity * edgePulse;
      });

      if (visual.marker?.userData.kind === 'mine') {
        visual.marker.rotation.y += delta * 0.8;
      } else if (visual.marker?.userData.kind === 'flag') {
        visual.marker.rotation.y = Math.sin(this.elapsed * 2.8) * 0.035;
      }
    });
  }

  setHover(tile: TileCoord | undefined): void {
    if (this.hoverKey) {
      const previousTile = this.tiles.find((candidate) => this.key(candidate) === this.hoverKey);
      if (previousTile) {
        this.updateTile(previousTile);
      }
    }

    this.hoverKey = tile ? this.key(tile) : undefined;

    if (!this.hoverKey) {
      return;
    }

    const visual = this.visuals.get(this.hoverKey);
    const hoveredTile = this.tiles.find((candidate) => this.key(candidate) === this.hoverKey);

    if (visual && hoveredTile && !hoveredTile.revealed) {
      visual.tileMesh.material.color.copy(COLORS.hoverTile);
      visual.tileMesh.material.emissive.copy(COLORS.blueAccent).multiplyScalar(0.13);
      visual.hoverGlow.visible = true;
    }
  }

  clear(): void {
    this.interactiveMeshes.length = 0;
    this.suppressedFlagMarkers.clear();
    this.visuals.forEach((visual) => {
      visual.tileMesh.geometry.dispose();
      visual.tileMesh.material.dispose();
      visual.rimMesh.geometry.dispose();
      visual.rimMesh.material.dispose();
      visual.edgeLights.forEach((edgeLight) => {
        edgeLight.geometry.dispose();
        edgeLight.material.dispose();
      });
      if (visual.label) {
        this.disposeLabel(visual.label);
      }
      if (visual.marker) {
        this.disposeObject(visual.marker);
      }
      visual.insetMesh.geometry.dispose();
      visual.insetMesh.material.dispose();
      visual.routeGlow.geometry.dispose();
      visual.routeGlow.material.dispose();
      visual.hoverGlow.geometry.dispose();
      visual.hoverGlow.material.dispose();
      this.group.remove(visual.root);
    });
    this.visuals.clear();
  }

  tileWorldPosition(coord: TileCoord): THREE.Vector3 {
    return new THREE.Vector3(
      (coord.x - (this.level.width - 1) / 2) * TILE_SIZE,
      0,
      (coord.z - (this.level.depth - 1) / 2) * TILE_SIZE,
    );
  }

  private build(): void {
    this.tiles.forEach((tile) => {
      const root = new THREE.Group();
      const colors = this.tileColors(tile);
      // Subtle per-tile rim variation so the floor reads as imperfect cast metal panels.
      const rimVariation = pseudoRandom(tile.x * 53 + tile.z * 71, this.level.levelNumber * 11);
      const rimRoughness = 0.66 + rimVariation * 0.14;
      const rimMetalness = 0.22 + rimVariation * 0.18;
      const rimColor = new THREE.Color('#11191a').multiplyScalar(0.94 + rimVariation * 0.12);
      const rim = new THREE.Mesh(
        new RoundedBoxGeometry(TILE_SIZE - TILE_GAP + 0.08, 0.13, TILE_SIZE - TILE_GAP + 0.08, 3, 0.055),
        new THREE.MeshStandardMaterial({ color: rimColor, roughness: rimRoughness, metalness: rimMetalness, envMapIntensity: 0.35 }),
      );
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(TILE_SIZE - TILE_GAP, 0.24, TILE_SIZE - TILE_GAP, 4, 0.055),
        this.createTileMaterial(colors.base, 0.46, 0.3),
      );
      const inset = new THREE.Mesh(
        new RoundedBoxGeometry(TILE_SIZE - 0.32, 0.018, TILE_SIZE - 0.32, 3, 0.018),
        this.createTileMaterial(colors.inset, 0.42, 0.34),
      );
      const routeGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(TILE_SIZE - 0.42, TILE_SIZE - 0.42),
        new THREE.MeshBasicMaterial({
          map: this.glowTexture,
          color: this.routeAccentColor(),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const hoverGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(TILE_SIZE - 0.08, TILE_SIZE - 0.08),
        new THREE.MeshBasicMaterial({
          map: this.glowTexture,
          color: COLORS.blueAccent,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );

      rim.castShadow = true;
      rim.receiveShadow = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      inset.castShadow = true;
      inset.receiveShadow = true;
      prepareGeometryForAo(rim.geometry);
      prepareGeometryForAo(mesh.geometry);
      prepareGeometryForAo(inset.geometry);
      mesh.userData.tileCoord = { x: tile.x, z: tile.z } satisfies TileCoord;
      rim.position.y = -0.035;
      inset.position.y = 0.24;
      routeGlow.rotation.x = -Math.PI / 2;
      routeGlow.position.y = 0.285;
      routeGlow.visible = false;
      hoverGlow.rotation.x = -Math.PI / 2;
      hoverGlow.position.y = 0.31;
      hoverGlow.visible = false;
      const edgeLights = this.createTileEdgeLights();
      root.position.copy(this.tileWorldPosition(tile));
      // Micro jitter so adjacent plates don't read as a stamped grid.
      const jitterSeed = pseudoRandom(tile.x * 73 + tile.z * 131, this.level.levelNumber * 19);
      root.rotation.y = (jitterSeed - 0.5) * 0.018;
      root.position.y += (pseudoRandom(tile.x * 17 + tile.z * 41, this.level.levelNumber * 7) - 0.5) * 0.006;
      root.add(rim, mesh, inset, routeGlow, hoverGlow, ...edgeLights);
      this.group.add(root);
      this.interactiveMeshes.push(mesh);
      this.visuals.set(this.key(tile), { root, rimMesh: rim, tileMesh: mesh, insetMesh: inset, edgeLights, routeGlow, hoverGlow });
      this.updateTile(tile);
    });
  }

  private createTileMaterial(color: THREE.Color, roughness: number, metalness: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      map: this.panelDetailTexture,
      roughnessMap: this.panelRoughnessTexture,
      normalMap: this.panelNormalTexture,
      normalScale: new THREE.Vector2(0.085, 0.085),
      aoMap: this.panelAoTexture,
      aoMapIntensity: 0.65,
      roughness,
      metalness,
      envMapIntensity: 0.28,
    });
  }

  private routeAccentColor(): THREE.Color {
    if (this.level.chamber.visualStyle === 'industrial') {
      return this.level.chamber.warning ? new THREE.Color(this.level.chamber.warning) : COLORS.routeTile;
    }

    return new THREE.Color(this.level.chamber.sideLight);
  }

  private createTileEdgeLights(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] {
    const material = new THREE.MeshBasicMaterial({
      color: COLORS.blueAccent,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const longGeometry = new RoundedBoxGeometry(TILE_SIZE - 0.32, 0.012, 0.026, 1, 0.006);
    const shortGeometry = new RoundedBoxGeometry(0.026, 0.012, TILE_SIZE - 0.32, 1, 0.006);
    const offset = TILE_SIZE * 0.43;
    const top = new THREE.Mesh(longGeometry, material.clone());
    const bottom = new THREE.Mesh(longGeometry.clone(), material.clone());
    const left = new THREE.Mesh(shortGeometry, material.clone());
    const right = new THREE.Mesh(shortGeometry.clone(), material.clone());
    top.position.set(0, 0.305, -offset);
    bottom.position.set(0, 0.305, offset);
    left.position.set(-offset, 0.305, 0);
    right.position.set(offset, 0.305, 0);
    return [top, bottom, left, right];
  }

  private tileColors(tile: TileState): { base: THREE.Color; inset: THREE.Color; emissive: THREE.Color } {
    const variation = 0.94 + pseudoRandom(tile.x * 17 + tile.z * 31, this.level.levelNumber * 13) * 0.1;
    const vary = (color: THREE.Color): THREE.Color => color.clone().multiplyScalar(variation);

    if (tile.flagged) {
      return { base: vary(COLORS.flaggedTile), inset: vary(new THREE.Color('#e76346')), emissive: new THREE.Color('#5e1410') };
    }

    if (tile.revealed && tile.hasMine) {
      return { base: vary(new THREE.Color('#52221e')), inset: vary(new THREE.Color('#8a221a')), emissive: new THREE.Color('#4e0a08') };
    }

    if (tile.revealed) {
      // Slightly brighter and cleaner so cleared cells visually pop vs unknown.
      const cleaned = vary(COLORS.safeTile.clone().multiplyScalar(1.08));
      const cleanedInset = vary(COLORS.safeTileInset.clone().multiplyScalar(1.04));
      // Route-hint tiles get a soft cyan/warm path emissive to read as the safe corridor.
      let accent: THREE.Color;
      if (tile.isRouteHint && !tile.hasMine) {
        accent = this.level.chamber.visualStyle === 'industrial'
          ? new THREE.Color('#3a2412')
          : new THREE.Color('#102132');
      } else {
        accent = this.level.chamber.visualStyle === 'industrial' ? new THREE.Color('#1d1208') : new THREE.Color('#08101a');
      }
      return { base: cleaned, inset: cleanedInset, emissive: accent };
    }

    return { base: vary(COLORS.unknownTile), inset: vary(COLORS.unknownTileInset), emissive: new THREE.Color('#000000') };
  }

  private createPanelBolts(): THREE.Object3D[] {
    const bolts: THREE.Object3D[] = [];
    const boltMaterial = new THREE.MeshStandardMaterial({ color: '#33302b', roughness: 0.44, metalness: 0.78, envMapIntensity: 0.62 });
    const slotMaterial = new THREE.MeshStandardMaterial({ color: '#101315', roughness: 0.7, metalness: 0.35 });
    const boltGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.035, 16);
    const slotGeometry = new RoundedBoxGeometry(0.06, 0.008, 0.018, 1, 0.004);
    const offset = TILE_SIZE * 0.38;
    const positions = [
      [-offset, -offset],
      [offset, -offset],
      [-offset, offset],
      [offset, offset],
    ];

    positions.forEach(([positionX, positionZ]) => {
      const boltGroup = new THREE.Group();
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial.clone());
      const slot = new THREE.Mesh(slotGeometry, slotMaterial.clone());
      bolt.position.y = 0;
      slot.position.y = 0.02;
      slot.rotation.y = positionX > 0 ? Math.PI / 2 : 0;
      bolt.castShadow = true;
      slot.castShadow = true;
      boltGroup.position.set(positionX, 0.29, positionZ);
      boltGroup.add(bolt, slot);
      bolts.push(boltGroup);
    });

    return bolts;
  }

  private createFlag(): THREE.Object3D {
    return createFlagModel({ withBase: true });
  }

  private createMine(): THREE.Object3D {
    const cache = getMineAssets();
    const mine = new THREE.Group();
    mine.userData.kind = 'mine';

    const body = new THREE.Mesh(cache.bodyGeometry, cache.bodyMaterial);
    body.position.y = 0.36;
    body.castShadow = false;
    body.userData.shared = true;
    mine.add(body);

    for (let i = 0; i < 12; i += 1) {
      const spike = new THREE.Mesh(cache.spikeGeometry, cache.spikeMaterial);
      const angle = (i / 12) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.3, 0.36, Math.sin(angle) * 0.3);
      spike.rotation.z = Math.PI / 2;
      spike.rotation.y = -angle;
      spike.castShadow = false;
      spike.userData.shared = true;
      mine.add(spike);
    }

    const belt = new THREE.Mesh(cache.beltGeometry, cache.beltMaterial);
    belt.position.y = 0.36;
    belt.rotation.x = Math.PI / 2;
    belt.userData.shared = true;
    const sensor = new THREE.Mesh(cache.sensorGeometry, cache.sensorMaterial);
    sensor.position.set(0, 0.5, 0.2);
    sensor.userData.shared = true;
    mine.add(belt, sensor);

    return mine;
  }

  private createNumberLabel(number: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const material = getNumberLabelMaterial(number);
    const label = new THREE.Mesh(getNumberLabelGeometry(), material);
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.31;
    label.userData.shared = true;
    return label;
  }

  private disposeLabel(label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>): void {
    // Number geometry & material are shared module-level resources; skip disposal.
    if (!label.userData.shared) {
      label.geometry.dispose();
      label.material.map?.dispose();
      label.material.dispose();
    }
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.userData.shared) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private key(coord: TileCoord): string {
    return `${coord.x}:${coord.z}`;
  }
}

function createTileDetailTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tile detail texture.');
  }

  context.fillStyle = '#f0f0f0';
  context.fillRect(0, 0, size, size);
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  gradient.addColorStop(0.54, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  context.lineWidth = 3;
  context.strokeRect(22, 22, size - 44, size - 44);
  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.lineWidth = 2;
  context.strokeRect(34, 34, size - 68, size - 68);

  for (let scratchIndex = 0; scratchIndex < 95; scratchIndex += 1) {
    const x = pseudoRandom(scratchIndex, 1) * size;
    const y = pseudoRandom(scratchIndex, 2) * size;
    const length = 10 + pseudoRandom(scratchIndex, 3) * 58;
    context.save();
    context.translate(x, y);
    context.rotate((pseudoRandom(scratchIndex, 4) - 0.5) * 0.8);
    context.fillStyle = pseudoRandom(scratchIndex, 5) > 0.52 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    context.fillRect(-length * 0.5, 0, length, 1);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createTileRoughnessTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tile roughness texture.');
  }

  const image = context.createImageData(size, size);
  for (let index = 0; index < image.data.length; index += 4) {
    const pixel = index / 4;
    const value = THREE.MathUtils.clamp(170 + Math.floor((pseudoRandom(pixel, 12) - 0.5) * 82), 92, 230);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createTileNormalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tile normal texture.');
  }

  context.fillStyle = 'rgb(128, 128, 255)';
  context.fillRect(0, 0, size, size);
  context.strokeStyle = 'rgb(112, 126, 255)';
  context.lineWidth = 5;
  context.strokeRect(24, 24, size - 48, size - 48);
  context.strokeStyle = 'rgb(144, 134, 255)';
  context.lineWidth = 2;
  context.strokeRect(42, 42, size - 84, size - 84);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createTileAoTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tile AO texture.');
  }

  context.fillStyle = 'rgb(220, 220, 220)';
  context.fillRect(0, 0, size, size);
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.72);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  gradient.addColorStop(0.58, 'rgba(138, 138, 138, 0.08)');
  gradient.addColorStop(1, 'rgba(40, 40, 40, 0.34)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = 'rgba(24, 24, 24, 0.24)';
  context.lineWidth = 7;
  context.strokeRect(22, 22, size - 44, size - 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function createSoftGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tile glow texture.');
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  gradient.addColorStop(0.58, 'rgba(255, 255, 255, 0.28)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  return texture;
}

function prepareGeometryForAo(geometry: THREE.BufferGeometry): void {
  if (!geometry.attributes.uv || geometry.attributes.uv2) {
    return;
  }

  geometry.setAttribute('uv2', geometry.attributes.uv.clone());
}

function pseudoRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

type MineAssets = {
  bodyGeometry: THREE.BufferGeometry;
  spikeGeometry: THREE.BufferGeometry;
  beltGeometry: THREE.BufferGeometry;
  sensorGeometry: THREE.BufferGeometry;
  bodyMaterial: THREE.MeshStandardMaterial;
  spikeMaterial: THREE.MeshStandardMaterial;
  beltMaterial: THREE.MeshStandardMaterial;
  sensorMaterial: THREE.MeshStandardMaterial;
};

let mineAssets: MineAssets | undefined;

function getMineAssets(): MineAssets {
  if (!mineAssets) {
    mineAssets = {
      bodyGeometry: new THREE.IcosahedronGeometry(0.28, 2),
      spikeGeometry: new THREE.ConeGeometry(0.048, 0.25, 10),
      beltGeometry: new THREE.TorusGeometry(0.3, 0.012, 8, 48),
      sensorGeometry: new THREE.SphereGeometry(0.045, 20, 12),
      bodyMaterial: new THREE.MeshStandardMaterial({ color: COLORS.mine, emissive: '#180000', emissiveIntensity: 0.45, roughness: 0.38, metalness: 0.68, envMapIntensity: 0.72 }),
      spikeMaterial: new THREE.MeshStandardMaterial({ color: COLORS.mine, roughness: 0.36, metalness: 0.58, envMapIntensity: 0.62 }),
      beltMaterial: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.34, metalness: 0.72, envMapIntensity: 0.7 }),
      sensorMaterial: new THREE.MeshStandardMaterial({ color: COLORS.alarm, emissive: COLORS.alarm, emissiveIntensity: 1.4, roughness: 0.24, metalness: 0.2 }),
    };
  }
  return mineAssets;
}

let numberLabelGeometry: THREE.PlaneGeometry | undefined;
const numberLabelMaterials = new Map<number, THREE.MeshBasicMaterial>();

function getNumberLabelGeometry(): THREE.PlaneGeometry {
  if (!numberLabelGeometry) {
    numberLabelGeometry = new THREE.PlaneGeometry(0.92, 0.92);
  }
  return numberLabelGeometry;
}

function getNumberLabelMaterial(number: number): THREE.MeshBasicMaterial {
  let material = numberLabelMaterials.get(number);
  if (material) return material;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create number label context.');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = 'bold 170px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 14;
  context.strokeStyle = '#172016';
  context.fillStyle = number > 2 ? '#c43b2f' : number === 2 ? '#2d8e42' : '#1e4ac9';
  context.strokeText(String(number), 128, 138);
  context.fillText(String(number), 128, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = TEXTURE_ANISOTROPY;
  material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  numberLabelMaterials.set(number, material);
  return material;
}