import * as THREE from 'three';
import { EXIT_TILE, PLAYER_HEIGHT, RAYCAST_DISTANCE } from './config';
import { TRAINING_LEVEL } from './levels';
import { MinesweeperBoard } from './systems/MinesweeperBoard';
import { PlayerController } from './systems/PlayerController';
import type { GamePhase, TileCoord, TileState } from './types';
import { Effects } from './world/Effects';
import { createScene } from './world/SceneFactory';
import { TileGrid } from './world/TileGrid';
import { ViewModel } from './world/ViewModel';
import { Hud } from '../ui/Hud';

declare global {
  interface Window {
    __minesweeperDebug?: {
      phase: () => GamePhase;
      progress: () => ReturnType<MinesweeperBoard['progress']>;
      reveal: (tileX: number, tileZ: number) => GamePhase;
      flag: (tileX: number, tileZ: number) => ReturnType<MinesweeperBoard['progress']>;
      solve: () => GamePhase;
      fail: () => GamePhase;
      reset: () => GamePhase;
      activeExplosions: () => number;
      triggeredExplosions: () => number;
    };
  }
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly board = new MinesweeperBoard();
  private readonly hud = new Hud();
  private readonly scene: THREE.Scene;
  private readonly exitDoor: THREE.Group;
  private readonly exitPanel: THREE.Object3D | undefined;
  private readonly exitGlow: THREE.PointLight;
  private readonly alarmLight: THREE.PointLight;
  private readonly tileGrid: TileGrid;
  private readonly player: PlayerController;
  private readonly viewModel = new ViewModel();
  private readonly effects: Effects;
  private readonly reticle = new THREE.Vector2(0, 0);
  private phase: GamePhase = 'ready';
  private hoveredTile: TileState | undefined;
  private shakeRemaining = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    const sceneParts = createScene();
    this.scene = sceneParts.scene;
    this.exitDoor = sceneParts.exitDoor;
    this.exitPanel = this.exitDoor.getObjectByName('ExitDoorPanel');
    this.exitGlow = sceneParts.exitGlow;
    this.alarmLight = sceneParts.alarmLight;
    this.scene.add(this.camera);
    this.camera.add(this.viewModel.group);

    this.tileGrid = new TileGrid(this.board.allTiles);
    this.scene.add(this.tileGrid.group);
    this.effects = new Effects(this.scene);

    this.player = new PlayerController(this.camera, canvas);
    this.bindEvents();
    this.hud.setLevel(TRAINING_LEVEL);
    this.syncHud();
    this.exposeDebugApi();
  }

  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.hud.onStartRequested(() => {
      if (this.phase === 'failed' || this.phase === 'escaped') {
        this.reset();
      } else {
        this.startPlaying();
      }
      this.player.lock();
    });
  }

  private tick = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.phase !== 'failed' && this.phase !== 'escaped') {
      this.player.update(delta);
    }
    this.updateTargetedTile();
    this.tileGrid.animate(delta);
    this.effects.update(delta);
    this.viewModel.update(delta, this.phase, this.hoveredTile, this.board.progress());
    this.animateExit(delta);
    this.updateCameraShake(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private updateTargetedTile(): void {
    this.raycaster.setFromCamera(this.reticle, this.camera);
    this.raycaster.far = RAYCAST_DISTANCE;
    const hit = this.raycaster.intersectObjects(this.tileGrid.interactiveMeshes, false)[0];

    if (!hit) {
      this.hoveredTile = undefined;
      this.tileGrid.setHover(undefined);
      this.hud.setScannerTile(undefined, 0, this.phase, this.board.progress());
      return;
    }

    const coord = hit.object.userData.tileCoord as TileCoord | undefined;
    this.hoveredTile = coord ? this.board.getTile(coord) : undefined;
    this.tileGrid.setHover(this.hoveredTile);
    this.hud.setScannerTile(
      this.hoveredTile,
      this.hoveredTile ? this.board.adjacentFlagCount(this.hoveredTile) : 0,
      this.phase,
      this.board.progress(),
    );
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      event.preventDefault();
      this.onFlag();
      return;
    }

    if (event.button === 0) {
      this.onReveal();
    }
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onReveal = (): void => {
    if (this.phase === 'ready') {
      return;
    }

    if (this.phase !== 'playing' || !this.hoveredTile) {
      return;
    }

    const result = this.hoveredTile.revealed ? this.board.revealAdjacent(this.hoveredTile) : this.board.reveal(this.hoveredTile);
    this.applyRevealResult(result, this.hoveredTile);
  };

  private onFlag = (): void => {
    if (this.phase !== 'playing' || !this.hoveredTile) {
      return;
    }

    const tile = this.board.toggleFlag(this.hoveredTile);
    if (tile) {
      this.tileGrid.updateTile(tile);
    }

    this.checkSolved();
    this.syncHud();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyR') {
      this.reset();
      return;
    }

    if (event.code === 'KeyF') {
      event.preventDefault();
      this.onFlag();
    }
  };

  private reset(): void {
    this.phase = 'playing';
    this.shakeRemaining = 0;
    this.alarmLight.intensity = 0;
    this.board.reset();
    this.tileGrid.rebuild(this.board.allTiles);
    this.tileGrid.setRouteVisible(false);
    this.player.reset();
    if (this.exitPanel) {
      this.exitPanel.position.y = 1.23;
    }
    this.syncHud();
  }

  private animateExit(delta: number): void {
    const solved = this.phase === 'solved' || this.phase === 'escaped';
    const targetY = solved ? 2.72 : 1.23;
    this.exitGlow.intensity = THREE.MathUtils.damp(this.exitGlow.intensity, solved ? 11 : 3.5, 3, delta);

    if (this.exitPanel) {
      this.exitPanel.position.y = THREE.MathUtils.damp(this.exitPanel.position.y, targetY, 3.5, delta);
    }

    const exitDistance = this.camera.position.distanceTo(this.tileGrid.tileWorldPosition(EXIT_TILE));
    if (this.phase === 'solved' && exitDistance < 1.9) {
      this.phase = 'escaped';
      this.syncHud();
    }
  }

  private startPlaying(): void {
    if (this.phase === 'ready') {
      this.phase = 'playing';
    }

    this.syncHud();
  }

  private applyRevealResult(result: ReturnType<MinesweeperBoard['reveal']>, originTile: TileState): void {
    result.revealedTiles.forEach((tile) => this.tileGrid.updateTile(tile));

    if (result.exploded) {
      this.failAt(originTile);
      return;
    }

    this.checkSolved();
    this.syncHud();
  }

  private checkSolved(): void {
    if (this.phase !== 'playing' || !this.board.isSolved()) {
      return;
    }

    this.phase = 'solved';
    this.board.routeTiles().forEach((tile) => {
      if (!tile.hasMine) {
        tile.revealed = true;
        this.tileGrid.updateTile(tile);
      }
    });
    this.tileGrid.setRouteVisible(true);
    this.syncHud();
  }

  private failAt(tile: TileState): void {
    this.phase = 'failed';
    this.board.revealAllMines().forEach((mineTile) => this.tileGrid.updateTile(mineTile));
    this.tileGrid.setRouteVisible(false);
    this.effects.triggerMineBlast(this.tileGrid.tileWorldPosition(tile));
    this.shakeRemaining = 0.95;
    this.alarmLight.intensity = 42;
    this.syncHud();
  }

  private updateCameraShake(delta: number): void {
    if (this.shakeRemaining <= 0) {
      this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, 0, 8, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, PLAYER_HEIGHT, 8, delta);
      this.alarmLight.intensity = THREE.MathUtils.damp(this.alarmLight.intensity, this.phase === 'failed' ? 16 : 0, 4, delta);
      return;
    }

    this.shakeRemaining = Math.max(0, this.shakeRemaining - delta);
    const strength = this.shakeRemaining * 0.035;
    this.camera.rotation.z = (Math.random() - 0.5) * strength;
    this.camera.position.y = PLAYER_HEIGHT + (Math.random() - 0.5) * strength;
  }

  private syncHud(): void {
    this.hud.setPhase(this.phase);
    this.hud.setProgress(this.board.progress());
    this.hud.setScannerTile(
      this.hoveredTile,
      this.hoveredTile ? this.board.adjacentFlagCount(this.hoveredTile) : 0,
      this.phase,
      this.board.progress(),
    );
  }

  private exposeDebugApi(): void {
    window.__minesweeperDebug = {
      phase: () => this.phase,
      progress: () => this.board.progress(),
      reveal: (tileX: number, tileZ: number) => {
        this.startPlaying();
        const tile = this.board.getTile({ x: tileX, z: tileZ });
        if (tile) {
          this.applyRevealResult(this.board.reveal(tile), tile);
        }
        return this.phase;
      },
      flag: (tileX: number, tileZ: number) => {
        this.startPlaying();
        const tile = this.board.toggleFlag({ x: tileX, z: tileZ });
        if (tile) {
          this.tileGrid.updateTile(tile);
        }
        this.checkSolved();
        this.syncHud();
        return this.board.progress();
      },
      solve: () => {
        this.startPlaying();
        this.board.allTiles.filter((tile) => tile.hasMine && !tile.flagged).forEach((tile) => {
          this.board.toggleFlag(tile);
          this.tileGrid.updateTile(tile);
        });
        this.checkSolved();
        return this.phase;
      },
      fail: () => {
        this.startPlaying();
        const mineTile = this.board.allTiles.find((tile) => tile.hasMine);
        if (mineTile) {
          this.applyRevealResult(this.board.reveal(mineTile), mineTile);
        }
        return this.phase;
      },
      reset: () => {
        this.reset();
        return this.phase;
      },
      activeExplosions: () => this.effects.activeBlastCount,
      triggeredExplosions: () => this.effects.totalTriggeredBlastCount,
    };
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}