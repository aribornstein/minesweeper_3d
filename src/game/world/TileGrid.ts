import * as THREE from 'three';
import { BOARD_DEPTH, BOARD_WIDTH, COLORS, TILE_GAP, TILE_SIZE } from '../config';
import type { TileCoord, TileState } from '../types';

type TileVisual = {
  root: THREE.Group;
  tileMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  insetMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  routeGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  marker?: THREE.Object3D;
  label?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
};

export class TileGrid {
  readonly group = new THREE.Group();
  readonly interactiveMeshes: THREE.Mesh[] = [];
  private readonly visuals = new Map<string, TileVisual>();
  private hoverKey: string | undefined;
  private routeVisible = false;
  private elapsed = 0;

  constructor(private readonly tiles: TileState[]) {
    this.group.name = 'MinesweeperTileGrid';
    this.build();
  }

  rebuild(tiles: TileState[]): void {
    this.clear();
    this.tiles.splice(0, this.tiles.length, ...tiles);
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
    visual.tileMesh.position.y = tile.revealed ? 0 : 0.07;
    visual.insetMesh.position.y = tile.revealed ? 0.16 : 0.24;
    visual.routeGlow.visible = this.routeVisible && tile.isRouteHint && !tile.hasMine;

    if (visual.marker) {
      visual.root.remove(visual.marker);
      visual.marker = undefined;
    }

    if (visual.label) {
      visual.root.remove(visual.label);
      this.disposeLabel(visual.label);
      visual.label = undefined;
    }

    if (tile.flagged) {
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

  animate(delta: number): void {
    this.elapsed += delta;
    const pulse = 0.55 + Math.sin(this.elapsed * 5) * 0.25;

    this.visuals.forEach((visual) => {
      visual.routeGlow.material.opacity = visual.routeGlow.visible ? pulse : 0;

      if (visual.marker?.userData.kind === 'mine') {
        visual.marker.rotation.y += delta * 0.8;
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
    }
  }

  clear(): void {
    this.interactiveMeshes.length = 0;
    this.visuals.forEach((visual) => {
      visual.tileMesh.geometry.dispose();
      visual.tileMesh.material.dispose();
      if (visual.label) {
        this.disposeLabel(visual.label);
      }
      visual.insetMesh.geometry.dispose();
      visual.insetMesh.material.dispose();
      visual.routeGlow.geometry.dispose();
      visual.routeGlow.material.dispose();
      this.group.remove(visual.root);
    });
    this.visuals.clear();
  }

  tileWorldPosition(coord: TileCoord): THREE.Vector3 {
    return new THREE.Vector3(
      (coord.x - (BOARD_WIDTH - 1) / 2) * TILE_SIZE,
      0,
      (coord.z - (BOARD_DEPTH - 1) / 2) * TILE_SIZE,
    );
  }

  private build(): void {
    this.tiles.forEach((tile) => {
      const root = new THREE.Group();
      const colors = this.tileColors(tile);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE - TILE_GAP, 0.24, TILE_SIZE - TILE_GAP),
        new THREE.MeshStandardMaterial({ color: colors.base, roughness: 0.46, metalness: 0.28 }),
      );
      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE - 0.32, 0.05, TILE_SIZE - 0.32),
        new THREE.MeshStandardMaterial({ color: colors.inset, roughness: 0.52, metalness: 0.22 }),
      );
      const routeGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(TILE_SIZE - 0.18, TILE_SIZE - 0.18),
        new THREE.MeshBasicMaterial({ color: COLORS.routeTile, transparent: true, opacity: 0, depthWrite: false }),
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      inset.castShadow = true;
      inset.receiveShadow = true;
      mesh.userData.tileCoord = { x: tile.x, z: tile.z } satisfies TileCoord;
      inset.position.y = 0.24;
      routeGlow.rotation.x = -Math.PI / 2;
      routeGlow.position.y = 0.285;
      routeGlow.visible = false;
      root.position.copy(this.tileWorldPosition(tile));
      root.add(mesh, inset, routeGlow, ...this.createPanelBolts());
      this.group.add(root);
      this.interactiveMeshes.push(mesh);
      this.visuals.set(this.key(tile), { root, tileMesh: mesh, insetMesh: inset, routeGlow });
      this.updateTile(tile);
    });
  }

  private tileColors(tile: TileState): { base: THREE.Color; inset: THREE.Color; emissive: THREE.Color } {
    const emissive = new THREE.Color('#000000');

    if (tile.flagged) {
      return { base: COLORS.flaggedTile, inset: new THREE.Color('#d75a41'), emissive: new THREE.Color('#310908') };
    }

    if (tile.revealed && tile.hasMine) {
      return { base: new THREE.Color('#46201d'), inset: new THREE.Color('#7a1f18'), emissive: new THREE.Color('#3c0907') };
    }

    if (tile.revealed) {
      return { base: COLORS.safeTile, inset: COLORS.safeTileInset, emissive };
    }

    return { base: COLORS.unknownTile, inset: COLORS.unknownTileInset, emissive };
  }

  private createPanelBolts(): THREE.Mesh[] {
    const bolts: THREE.Mesh[] = [];
    const boltMaterial = new THREE.MeshStandardMaterial({ color: '#33302b', roughness: 0.5, metalness: 0.7 });
    const boltGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.035, 10);
    const offset = TILE_SIZE * 0.38;
    const positions = [
      [-offset, -offset],
      [offset, -offset],
      [-offset, offset],
      [offset, offset],
    ];

    positions.forEach(([positionX, positionZ]) => {
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial.clone());
      bolt.position.set(positionX, 0.29, positionZ);
      bolt.rotation.x = Math.PI / 2;
      bolts.push(bolt);
    });

    return bolts;
  }

  private createFlag(): THREE.Object3D {
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: '#2c2c2c', roughness: 0.5, metalness: 0.5 }),
    );
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.04),
      new THREE.MeshStandardMaterial({ color: '#d62020', roughness: 0.4, metalness: 0.05 }),
    );

    pole.position.y = 0.48;
    cloth.position.set(0.2, 0.72, 0);
    cloth.rotation.y = -0.15;
    flag.add(pole, cloth);
    return flag;
  }

  private createMine(): THREE.Object3D {
    const mine = new THREE.Group();
    mine.userData.kind = 'mine';
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshStandardMaterial({ color: COLORS.mine, emissive: '#180000', roughness: 0.42, metalness: 0.6 }),
    );
    body.position.y = 0.36;
    mine.add(body);

    for (let i = 0; i < 8; i += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: COLORS.mine, roughness: 0.4, metalness: 0.5 }),
      );
      const angle = (i / 8) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.3, 0.36, Math.sin(angle) * 0.3);
      spike.rotation.z = Math.PI / 2;
      spike.rotation.y = -angle;
      mine.add(spike);
    }

    return mine;
  }

  private createNumberLabel(number: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
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
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), material);
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.31;
    return label;
  }

  private disposeLabel(label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>): void {
    label.geometry.dispose();
    label.material.map?.dispose();
    label.material.dispose();
  }

  private key(coord: TileCoord): string {
    return `${coord.x}:${coord.z}`;
  }
}