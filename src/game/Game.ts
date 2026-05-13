import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAYER_HEIGHT, RAYCAST_DISTANCE, TILE_SIZE } from './config';
import { createProceduralLevel } from './levels';
import { MinesweeperBoard } from './systems/MinesweeperBoard';
import { PlayerController } from './systems/PlayerController';
import type { GamePhase, LevelDefinition, TileCoord, TileState } from './types';
import { Effects } from './world/Effects';
import { createFlagModel, updateFlagModel } from './world/FlagModel';
import { createLevelEnvironment, createScene, disposeLevelEnvironment, type LevelEnvironment } from './world/SceneFactory';
import { detectQualityTier, type QualitySettings } from './world/quality';
import { TileGrid } from './world/TileGrid';
import { ViewModel } from './world/ViewModel';
import { Hud } from '../ui/Hud';
import { MobileControls } from '../ui/MobileControls';

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
      cameraPosition: () => { x: number; y: number; z: number };
      moveToTile: (tileX: number, tileZ: number) => { x: number; y: number; z: number };
      exitSignal: () => { glow: string; status: string };
      level: () => { levelNumber: number; name: string; sector: string; chamber: string; visualStyle: string; layoutVariant: string; width: number; depth: number; mineCount: number; mineDensity: number };
      enterExit: () => GamePhase;
    };
  }
}

const LOCKED_EXIT_COLOR = '#ff3d2e';
const UNLOCKED_EXIT_COLOR = '#36ff96';
const LEVEL_TRANSITION_DURATION = 2.45;
const LEVEL_TRANSITION_SWAP_TIME = 1.16;
const TRANSITION_FADE_IN_START = 0.72;
const TRANSITION_FADE_IN_END = 1.02;
const TRANSITION_FADE_OUT_START = 1.3;
const TRANSITION_FADE_OUT_END = 1.86;
const EXIT_PANEL_CLOSED_Y = 1.23;
const EXIT_PANEL_OPEN_Y = 4.15;
const LOCKED_EXIT_BARRIER_OFFSET = 0.34;
const EXIT_OPENING_HALF_WIDTH = 0.92;
const FLAG_THROW_DURATION = 0.46;
const STEP_ACTIVATION_COOLDOWN = 0.42;
const STEP_ACTIVATION_TILE_RADIUS = TILE_SIZE * 0.42;

type LevelTransition = {
  elapsed: number;
  nextLevel: LevelDefinition;
  swapped: boolean;
  startPosition: THREE.Vector3;
  doorwayPosition: THREE.Vector3;
  passagePosition: THREE.Vector3;
  entryStartPosition: THREE.Vector3;
  entryEndPosition: THREE.Vector3;
};

type FlagThrow = {
  tile: TileState;
  model: THREE.Group;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  elapsed: number;
};

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly gtaoPass: GTAOPass | undefined;
  private readonly bloomPass: UnrealBloomPass;
  private readonly lutPass: LUTPass | undefined;
  private readonly smaaPass: SMAAPass | undefined;
  private readonly vignettePass: ShaderPass | undefined;
  private readonly quality: QualitySettings;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private currentLevel: LevelDefinition = createProceduralLevel();
  private readonly board = new MinesweeperBoard(this.currentLevel);
  private readonly hud = new Hud();
  private readonly scene: THREE.Scene;
  private levelEnvironment!: LevelEnvironment;
  private exitDoor!: THREE.Group;
  private exitPanel: THREE.Object3D | undefined;
  private exitStatusLight: THREE.Mesh | undefined;
  private exitGlow!: THREE.PointLight;
  private alarmLight!: THREE.PointLight;
  private readonly tileGrid: TileGrid;
  private readonly player: PlayerController;
  private readonly mobileControls: MobileControls;
  private readonly viewModel = new ViewModel();
  private readonly transitionVeil = createTransitionVeil();
  private readonly effects: Effects;
  private readonly flagThrows: FlagThrow[] = [];
  private readonly reticle = new THREE.Vector2(0, 0);
  private phase: GamePhase = 'ready';
  private hoveredTile: TileState | undefined;
  private levelTransition: LevelTransition | undefined;
  private shakeRemaining = 0;
  private stepActivationCooldown = 0;
  private stepActivationTileKey: string | undefined;
  private readonly stepActivationEnabled = window.matchMedia('(pointer: coarse)').matches;
  private adaptiveResolutionScale = 1;
  private rollingFrameMs = 16.6;
  private adaptiveTimer = 0;
  private pendingMineReveals: TileState[] = [];
  private environmentElapsed = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.quality = detectQualityTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.tier !== 'low', preserveDrawingBuffer: true, powerPreference: this.quality.tier === 'low' ? 'low-power' : 'high-performance' });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.quality.enableShadows;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 100);
    const sceneParts = createScene(this.currentLevel, this.quality);
    this.scene = sceneParts.scene;
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.46, 0.42, 0.72);
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.quality.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(renderPass);
    if (this.quality.enableGtao) {
      this.gtaoPass = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.gtaoPass.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.78, thickness: 0.34, scale: 1.08, samples: 20, distanceFallOff: 0.92 });
      this.gtaoPass.blendIntensity = 0.72;
      this.composer.addPass(this.gtaoPass);
    }
    if (this.quality.enableBloom) {
      this.composer.addPass(this.bloomPass);
    }
    if (this.quality.enableLut) {
      this.lutPass = new LUTPass({ lut: createCinematicLut(), intensity: 0.85 });
      this.composer.addPass(this.lutPass);
      this.vignettePass = new ShaderPass(createVignetteShader());
      this.vignettePass.material.uniforms.intensity.value = 0.52;
      this.vignettePass.material.uniforms.softness.value = 0.6;
      this.composer.addPass(this.vignettePass);
    }
    if (this.quality.enableSmaa) {
      this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
      this.composer.addPass(this.smaaPass);
    }
    this.composer.addPass(new OutputPass());
    this.applyRenderProfile(this.currentLevel);
    this.levelEnvironment = sceneParts.levelEnvironment;
    this.applyLevelEnvironment(sceneParts.levelEnvironment);
    this.setExitSignal(false);
    this.scene.environment = this.createEnvironmentMap();
    this.scene.add(this.camera);
    this.camera.add(this.viewModel.group);
    this.camera.add(this.transitionVeil);

    this.tileGrid = new TileGrid(this.board.allTiles, this.currentLevel);
    this.scene.add(this.tileGrid.group);
    this.effects = new Effects(this.scene);

    this.player = new PlayerController(this.camera, canvas, this.currentLevel);
    this.mobileControls = new MobileControls({
      onMove: (x, z) => this.player.setTouchMovement(x, z),
      onLook: (movementX, movementY) => this.player.lookBy(movementX, movementY),
      onReveal: () => this.onReveal(),
      onFlag: () => this.onFlag(),
      onReset: () => this.reset(),
    });
    this.bindEvents();
    this.hud.setLevel(this.currentLevel);
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
    if (!this.levelTransition && this.phase !== 'failed' && this.phase !== 'escaped') {
      this.player.update(delta);
      this.enforceLockedExitBarrier();
      this.updateStepActivation(delta);
    }
    this.updateLevelTransition(delta);
    if (this.levelTransition) {
      this.clearTargetedTile();
    } else {
      this.updateTargetedTile();
    }
    this.tileGrid.animate(delta);
    this.effects.update(delta);
    if (this.levelEnvironment.animators.length > 0) {
      this.environmentElapsed += delta;
      for (const animator of this.levelEnvironment.animators) {
        animator(this.environmentElapsed);
      }
    }
    this.updateFlagThrows(delta);
    this.viewModel.update(
      delta,
      this.phase,
      this.hoveredTile,
      this.board.progress(),
      this.hoveredTile ? this.board.adjacentFlagCount(this.hoveredTile) : 0,
    );
    this.animateExit(delta);
    this.updateCameraShake(delta);
    this.flushPendingMineReveals();
    this.updateAdaptiveResolution(delta);
    this.composer.render();
  };

  private updateAdaptiveResolution(delta: number): void {
    const frameMs = delta * 1000;
    this.rollingFrameMs = this.rollingFrameMs * 0.92 + frameMs * 0.08;
    this.adaptiveTimer += delta;
    if (this.adaptiveTimer < 0.5) return;
    this.adaptiveTimer = 0;
    let next = this.adaptiveResolutionScale;
    if (this.rollingFrameMs > 26) {
      next = Math.max(0.55, this.adaptiveResolutionScale - 0.08);
    } else if (this.rollingFrameMs < 17 && this.adaptiveResolutionScale < 1) {
      next = Math.min(1, this.adaptiveResolutionScale + 0.05);
    }
    if (Math.abs(next - this.adaptiveResolutionScale) > 0.01) {
      this.adaptiveResolutionScale = next;
      const effectivePixelRatio = this.quality.pixelRatio * this.adaptiveResolutionScale;
      this.renderer.setPixelRatio(effectivePixelRatio);
      this.composer.setPixelRatio(effectivePixelRatio);
    }
  }

  private updateTargetedTile(): void {
    this.raycaster.setFromCamera(this.reticle, this.camera);
    this.raycaster.far = RAYCAST_DISTANCE;
    const hit = this.raycaster.intersectObjects(this.tileGrid.interactiveMeshes, false)[0];

    if (!hit) {
      this.clearTargetedTile();
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

  private clearTargetedTile(): void {
    this.hoveredTile = undefined;
    this.tileGrid.setHover(undefined);
    this.hud.setScannerTile(undefined, 0, this.phase, this.board.progress());
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      return;
    }

    if ((this.phase === 'playing' || this.phase === 'solved') && !this.levelTransition && !this.player.hasPointerLock && this.player.canRequestPointerLock) {
      this.player.lock();

      if (event.button === 0) {
        event.preventDefault();
        return;
      }
    }

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

  private activateTile(tile: TileState): void {
    if (this.phase !== 'playing') {
      return;
    }

    const result = tile.revealed ? this.board.revealAdjacent(tile) : this.board.reveal(tile);
    this.applyRevealResult(result, tile);
  }

  private updateStepActivation(delta: number): void {
    this.stepActivationCooldown = Math.max(0, this.stepActivationCooldown - delta);

    if (this.phase !== 'playing') {
      return;
    }

    const tile = this.tileUnderPlayer();
    const tileKey = tile ? key(tile) : undefined;

    if (!tile || !tileKey) {
      this.stepActivationTileKey = undefined;
      return;
    }

    if (tileKey === this.stepActivationTileKey || this.stepActivationCooldown > 0 || tile.flagged || tile.revealed) {
      return;
    }

    // Stepping onto a hidden mine always detonates it, regardless of input mode.
    // Touch devices additionally treat the player's position as a reveal click for safe tiles
    // so mobile players can advance without dragging a reticle.
    if (tile.hasMine || this.stepActivationEnabled) {
      this.stepActivationTileKey = tileKey;
      this.stepActivationCooldown = STEP_ACTIVATION_COOLDOWN;
      this.activateTile(tile);
    }
  }

  private tileUnderPlayer(): TileState | undefined {
    const coord = {
      x: Math.round(this.camera.position.x / TILE_SIZE + (this.currentLevel.width - 1) / 2),
      z: Math.round(this.camera.position.z / TILE_SIZE + (this.currentLevel.depth - 1) / 2),
    };
    const tile = this.board.getTile(coord);

    if (!tile) {
      return undefined;
    }

    const center = this.tileGrid.tileWorldPosition(tile);
    const insideTileCenter =
      Math.abs(this.camera.position.x - center.x) <= STEP_ACTIVATION_TILE_RADIUS &&
      Math.abs(this.camera.position.z - center.z) <= STEP_ACTIVATION_TILE_RADIUS;

    return insideTileCenter ? tile : undefined;
  }

  private onFlag = (): void => {
    if (this.phase !== 'playing' || !this.hoveredTile) {
      return;
    }

    const wasFlagged = this.hoveredTile.flagged;
    const tile = this.board.toggleFlag(this.hoveredTile);
    if (tile) {
      if (tile.flagged && !wasFlagged) {
        this.tileGrid.setFlagMarkerSuppressed(tile, true);
        this.tileGrid.updateTile(tile);
        this.throwFlagAt(tile);
      } else {
        this.cancelFlagThrow(tile);
        this.tileGrid.setFlagMarkerSuppressed(tile, false);
        this.tileGrid.updateTile(tile);
      }
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
    this.levelTransition = undefined;
    this.stepActivationCooldown = 0;
    this.stepActivationTileKey = undefined;
    this.setTransitionVeilOpacity(0);
    this.clearFlagThrows();
    this.phase = 'playing';
    this.shakeRemaining = 0;
    this.alarmLight.intensity = 0;
    this.board.reset();
    this.tileGrid.rebuild(this.board.allTiles, this.currentLevel);
    this.tileGrid.setRouteVisible(false);
    this.player.reset(this.currentLevel);
    this.player.activate();
    if (this.exitPanel) {
      this.exitPanel.position.y = EXIT_PANEL_CLOSED_Y;
    }
    this.setExitSignal(false);
    this.syncHud();
  }

  private animateExit(delta: number): void {
    const unlocked = this.phase === 'solved' || (this.phase === 'escaped' && !this.levelTransition?.swapped);
    const targetY = unlocked ? EXIT_PANEL_OPEN_Y : EXIT_PANEL_CLOSED_Y;
    this.setExitSignal(unlocked);
    this.exitGlow.intensity = THREE.MathUtils.damp(this.exitGlow.intensity, unlocked ? 11 : 3.5, 3, delta);

    if (this.exitPanel) {
      this.exitPanel.position.y = THREE.MathUtils.damp(this.exitPanel.position.y, targetY, 3.5, delta);
    }

    const exitDistance = this.camera.position.distanceTo(this.tileGrid.tileWorldPosition(this.currentLevel.exitTile));
    if (this.phase === 'solved' && exitDistance < 1.9 && !this.levelTransition) {
      this.beginLevelTransition();
    }
  }

  private enforceLockedExitBarrier(): void {
    const exitPosition = this.tileGrid.tileWorldPosition(this.currentLevel.exitTile);
    const barrierZ = exitPosition.z - LOCKED_EXIT_BARRIER_OFFSET;
    const isInsideOpenExit = this.phase === 'solved' && Math.abs(this.camera.position.x - exitPosition.x) <= EXIT_OPENING_HALF_WIDTH;

    if (!isInsideOpenExit && this.camera.position.z < barrierZ) {
      this.camera.position.z = barrierZ;
    }
  }

  private startPlaying(): void {
    if (this.phase === 'ready') {
      this.phase = 'playing';
    }

    this.player.activate();
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
    this.setExitSignal(true);
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
    this.player.deactivate();
    this.clearFlagThrows();
    // Reveal the trigger mine immediately so the explosion ties to its tile;
    // queue the rest radiating outward so we don't allocate dozens of meshes in one frame.
    const allMines = this.board.revealAllMines();
    const trigger = this.tileGrid.tileWorldPosition(tile);
    const sorted = allMines.slice().sort((a, b) => {
      const da = this.tileGrid.tileWorldPosition(a).distanceToSquared(trigger);
      const db = this.tileGrid.tileWorldPosition(b).distanceToSquared(trigger);
      return da - db;
    });
    const triggerMine = sorted.find((m) => m.x === tile.x && m.z === tile.z);
    if (triggerMine) {
      this.tileGrid.updateTile(triggerMine);
    }
    this.pendingMineReveals = sorted.filter((m) => m !== triggerMine);
    this.tileGrid.setRouteVisible(false);
    this.effects.triggerMineBlast(this.tileGrid.tileWorldPosition(tile));
    this.shakeRemaining = 0.95;
    this.alarmLight.intensity = 42;
    this.syncHud();
  }

  private flushPendingMineReveals(): void {
    if (this.pendingMineReveals.length === 0) return;
    // Reveal up to 3 mines per frame; spreads across ~7 frames worst case for big chambers.
    const batchSize = 3;
    for (let i = 0; i < batchSize && this.pendingMineReveals.length > 0; i += 1) {
      const next = this.pendingMineReveals.shift();
      if (next) {
        this.tileGrid.updateTile(next);
      }
    }
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

  private throwFlagAt(tile: TileState): void {
    this.viewModel.triggerFlagThrow();
    this.camera.updateMatrixWorld(true);
    const start = this.viewModel.flagWorldPosition();
    const end = this.tileGrid.tileWorldPosition(tile).add(new THREE.Vector3(0, 0.32, 0));
    const control = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.72, 0));
    const model = createFlagModel({ withBase: false, scale: 0.9 });
    model.position.copy(start);
    model.rotation.set(-0.85, this.camera.rotation.y, 0.45);
    this.scene.add(model);
    this.flagThrows.push({ tile, model, start, control, end, elapsed: 0 });
  }

  private updateFlagThrows(delta: number): void {
    for (let index = this.flagThrows.length - 1; index >= 0; index -= 1) {
      const flagThrow = this.flagThrows[index];
      flagThrow.elapsed += delta;
      const progress = Math.min(flagThrow.elapsed / FLAG_THROW_DURATION, 1);
      const eased = smoothstep(progress);
      const firstLeg = flagThrow.start.clone().lerp(flagThrow.control, eased);
      const secondLeg = flagThrow.control.clone().lerp(flagThrow.end, eased);
      flagThrow.model.position.copy(firstLeg.lerp(secondLeg, eased));
      flagThrow.model.rotation.x = -0.9 + eased * 0.9;
      flagThrow.model.rotation.y += delta * 8;
      flagThrow.model.rotation.z = 0.45 - eased * 0.45;
      updateFlagModel(flagThrow.model, delta);

      if (progress >= 1) {
        this.scene.remove(flagThrow.model);
        disposeObject(flagThrow.model);
        this.flagThrows.splice(index, 1);
        this.tileGrid.setFlagMarkerSuppressed(flagThrow.tile, false);
        if (flagThrow.tile.flagged) {
          this.tileGrid.updateTile(flagThrow.tile);
        }
      }
    }
  }

  private cancelFlagThrow(tile: TileState): void {
    for (let index = this.flagThrows.length - 1; index >= 0; index -= 1) {
      const flagThrow = this.flagThrows[index];

      if (flagThrow.tile.x !== tile.x || flagThrow.tile.z !== tile.z) {
        continue;
      }

      this.scene.remove(flagThrow.model);
      disposeObject(flagThrow.model);
      this.flagThrows.splice(index, 1);
    }
  }

  private clearFlagThrows(): void {
    this.flagThrows.forEach((flagThrow) => {
      this.scene.remove(flagThrow.model);
      disposeObject(flagThrow.model);
      this.tileGrid.setFlagMarkerSuppressed(flagThrow.tile, false);
    });
    this.flagThrows.length = 0;
  }

  private syncHud(): void {
    this.mobileControls.setPhase(this.phase);
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
      cameraPosition: () => ({ x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }),
      moveToTile: (tileX: number, tileZ: number) => {
        const tilePosition = this.tileGrid.tileWorldPosition({ x: tileX, z: tileZ });
        this.camera.position.set(tilePosition.x, PLAYER_HEIGHT, tilePosition.z);
        return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
      },
      exitSignal: () => ({
        glow: `#${this.exitGlow.color.getHexString()}`,
        status: this.exitStatusLight?.material instanceof THREE.MeshStandardMaterial ? `#${this.exitStatusLight.material.emissive.getHexString()}` : '#000000',
      }),
      level: () => ({
        levelNumber: this.currentLevel.levelNumber,
        name: this.currentLevel.name,
        sector: this.currentLevel.sector,
        chamber: this.currentLevel.chamber.label,
        visualStyle: this.currentLevel.chamber.visualStyle,
        layoutVariant: this.currentLevel.layoutVariant,
        width: this.currentLevel.width,
        depth: this.currentLevel.depth,
        mineCount: this.currentLevel.mines.length,
        mineDensity: this.currentLevel.mineDensity,
      }),
      enterExit: () => {
        if (this.phase === 'solved') {
          const exitPosition = this.tileGrid.tileWorldPosition(this.currentLevel.exitTile);
          this.camera.position.set(exitPosition.x, PLAYER_HEIGHT, exitPosition.z);
          this.beginLevelTransition();
        }

        return this.phase;
      },
    };
  }

  private beginLevelTransition(): void {
    const nextLevel = createProceduralLevel(this.currentLevel.levelNumber + 1);
    const exitPosition = this.tileGrid.tileWorldPosition(this.currentLevel.exitTile);
    const entryEndPosition = this.levelStartPosition(nextLevel);
    const entryStartPosition = entryEndPosition.clone().add(new THREE.Vector3(0, 0, 2.15));

    this.phase = 'escaped';
    this.setTransitionVeilOpacity(0);
    this.player.deactivate();
    this.hoveredTile = undefined;
    this.stepActivationCooldown = 0;
    this.stepActivationTileKey = undefined;
    this.tileGrid.setHover(undefined);
    this.levelTransition = {
      elapsed: 0,
      nextLevel,
      swapped: false,
      startPosition: this.camera.position.clone(),
      doorwayPosition: new THREE.Vector3(exitPosition.x, PLAYER_HEIGHT + 0.02, exitPosition.z - 1.05),
      passagePosition: new THREE.Vector3(exitPosition.x, PLAYER_HEIGHT + 0.04, exitPosition.z - 2.42),
      entryStartPosition,
      entryEndPosition,
    };
    this.syncHud();
  }

  private updateLevelTransition(delta: number): void {
    if (!this.levelTransition) {
      return;
    }

    const transition = this.levelTransition;
    transition.elapsed = Math.min(LEVEL_TRANSITION_DURATION, transition.elapsed + delta);

    if (transition.elapsed < LEVEL_TRANSITION_SWAP_TIME) {
      const progress = smoothstep(transition.elapsed / LEVEL_TRANSITION_SWAP_TIME);
      const firstLeg = Math.min(progress / 0.58, 1);
      const secondLeg = Math.max((progress - 0.58) / 0.42, 0);
      this.updateTransitionVeil(transition.elapsed);
      this.camera.position.lerpVectors(transition.startPosition, transition.doorwayPosition, smoothstep(firstLeg));
      this.camera.position.lerp(transition.passagePosition, smoothstep(secondLeg));
      this.camera.position.y += Math.sin(progress * Math.PI * 3) * 0.018;
      this.camera.rotation.set(THREE.MathUtils.lerp(this.camera.rotation.x, -0.12, 0.12), THREE.MathUtils.lerp(this.camera.rotation.y, 0, 0.08), 0);
      return;
    }

    if (!transition.swapped) {
      this.loadLevel(transition.nextLevel, 'escaped');
      this.camera.position.copy(transition.entryStartPosition);
      transition.swapped = true;
    }

    this.updateTransitionVeil(transition.elapsed);
    const entryProgress = smoothstep((transition.elapsed - LEVEL_TRANSITION_SWAP_TIME) / (LEVEL_TRANSITION_DURATION - LEVEL_TRANSITION_SWAP_TIME));
    this.camera.position.lerpVectors(transition.entryStartPosition, transition.entryEndPosition, entryProgress);
    this.camera.position.y += Math.sin(entryProgress * Math.PI * 4) * 0.018;
    this.camera.rotation.set(THREE.MathUtils.lerp(this.camera.rotation.x, -0.18, 0.08), THREE.MathUtils.lerp(this.camera.rotation.y, 0, 0.08), 0);

    if (transition.elapsed >= LEVEL_TRANSITION_DURATION) {
      this.levelTransition = undefined;
      this.setTransitionVeilOpacity(0);
      this.phase = 'playing';
      this.player.reset(this.currentLevel);
      this.player.activate();
      this.syncHud();
    }
  }

  private updateTransitionVeil(elapsed: number): void {
    if (elapsed < TRANSITION_FADE_IN_START) {
      this.setTransitionVeilOpacity(0);
      return;
    }

    if (elapsed < TRANSITION_FADE_IN_END) {
      this.setTransitionVeilOpacity(smoothstep((elapsed - TRANSITION_FADE_IN_START) / (TRANSITION_FADE_IN_END - TRANSITION_FADE_IN_START)));
      return;
    }

    if (elapsed < TRANSITION_FADE_OUT_START) {
      this.setTransitionVeilOpacity(1);
      return;
    }

    if (elapsed < TRANSITION_FADE_OUT_END) {
      this.setTransitionVeilOpacity(1 - smoothstep((elapsed - TRANSITION_FADE_OUT_START) / (TRANSITION_FADE_OUT_END - TRANSITION_FADE_OUT_START)));
      return;
    }

    this.setTransitionVeilOpacity(0);
  }

  private setTransitionVeilOpacity(opacity: number): void {
    this.transitionVeil.material.opacity = opacity;
    this.transitionVeil.visible = opacity > 0.01;
  }

  private loadLevel(level: LevelDefinition, phase: GamePhase): void {
    this.clearFlagThrows();
    this.pendingMineReveals = [];
    this.currentLevel = level;
    this.phase = phase;
    this.hoveredTile = undefined;
    this.stepActivationCooldown = 0;
    this.stepActivationTileKey = undefined;
    this.shakeRemaining = 0;
    this.board.loadLevel(level);
    this.tileGrid.rebuild(this.board.allTiles, level);
    this.tileGrid.setRouteVisible(false);
    this.scene.remove(this.levelEnvironment.group);
    disposeLevelEnvironment(this.levelEnvironment);
    this.levelEnvironment = createLevelEnvironment(level, this.quality);
    this.scene.add(this.levelEnvironment.group);
    this.applyLevelEnvironment(this.levelEnvironment);
    this.applyRenderProfile(level);
    this.alarmLight.intensity = 0;
    this.player.reset(level);
    this.hud.setLevel(level);
    this.setExitSignal(false);
    this.syncHud();
  }

  private levelStartPosition(level: LevelDefinition): THREE.Vector3 {
    return new THREE.Vector3(
      (level.startTile.x - (level.width - 1) / 2) * TILE_SIZE,
      PLAYER_HEIGHT,
      (level.depth * TILE_SIZE) / 2 + 1.6,
    );
  }

  private applyLevelEnvironment(environment: LevelEnvironment): void {
    this.exitDoor = environment.exitDoor;
    this.exitPanel = this.exitDoor.getObjectByName('ExitDoorPanel');
    const exitStatusLight = this.exitDoor.getObjectByName('ExitDoorStatusLight');
    this.exitStatusLight = exitStatusLight instanceof THREE.Mesh ? exitStatusLight : undefined;
    this.exitGlow = environment.exitGlow;
    this.alarmLight = environment.alarmLight;
  }

  private setExitSignal(unlocked: boolean): void {
    const color = unlocked ? UNLOCKED_EXIT_COLOR : LOCKED_EXIT_COLOR;
    this.exitGlow.color.set(color);

    if (this.exitStatusLight?.material instanceof THREE.MeshStandardMaterial) {
      this.exitStatusLight.material.color.set(unlocked ? '#163726' : '#4a1813');
      this.exitStatusLight.material.emissive.set(unlocked ? '#0a5a2f' : '#5a0906');
      const target = unlocked ? 0.95 : 0.7;
      this.exitStatusLight.material.emissiveIntensity = target;
      this.exitStatusLight.material.userData.baseEmissive = target;
    }
  }

  private applyRenderProfile(level: LevelDefinition): void {
    this.bloomPass.strength = 0.22 + level.chamber.bloom * 0.22;
    this.bloomPass.radius = level.chamber.visualStyle === 'highTech' ? 0.28 : 0.24;
    this.bloomPass.threshold = level.chamber.visualStyle === 'industrial' ? 0.88 : 0.86;
    this.renderer.toneMappingExposure = level.chamber.visualStyle === 'clean' ? 0.68 : 0.62;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(this.quality.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.gtaoPass?.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    this.smaaPass?.setSize(window.innerWidth, window.innerHeight);
  };

  private createEnvironmentMap(): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    pmrem.dispose();
    return environment;
  }
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function createCinematicLut(): THREE.Data3DTexture {
  const size = 16;
  const data = new Uint8Array(size * size * size * 4);
  let index = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const rn = r / (size - 1);
        const gn = g / (size - 1);
        const bn = b / (size - 1);
        const luminance = rn * 0.299 + gn * 0.587 + bn * 0.114;
        const shadowMix = Math.pow(1 - luminance, 1.4);
        const highlightMix = Math.pow(luminance, 1.2);
        // Stronger cool shadow push, warmer highlight, deeper crushed blacks.
        let outR = rn + highlightMix * 0.11 - shadowMix * 0.08;
        let outG = gn + highlightMix * 0.05 + shadowMix * 0.005;
        let outB = bn - highlightMix * 0.08 + shadowMix * 0.11;
        // Stronger contrast curve.
        outR = contrastCurve(outR);
        outG = contrastCurve(outG);
        outB = contrastCurve(outB);
        // Crush blacks below 0.05.
        outR = liftBlacks(outR);
        outG = liftBlacks(outG);
        outB = liftBlacks(outB);
        // Subtle desaturation for filmic feel.
        const lum = outR * 0.299 + outG * 0.587 + outB * 0.114;
        outR = lum + (outR - lum) * 0.94;
        outG = lum + (outG - lum) * 0.94;
        outB = lum + (outB - lum) * 0.94;
        data[index++] = Math.round(THREE.MathUtils.clamp(outR, 0, 1) * 255);
        data[index++] = Math.round(THREE.MathUtils.clamp(outG, 0, 1) * 255);
        data[index++] = Math.round(THREE.MathUtils.clamp(outB, 0, 1) * 255);
        data[index++] = 255;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function contrastCurve(value: number): number {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x) * 0.72 + x * 0.28;
}

function liftBlacks(value: number): number {
  // Crush near-blacks: anything below 0.06 gets pulled toward 0 for deeper shadows.
  if (value < 0.06) {
    return value * 0.5;
  }
  return value;
}

function createVignetteShader() {
  return {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      intensity: { value: 0.42 },
      softness: { value: 0.65 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float intensity;
      uniform float softness;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        vec2 centered = vUv - 0.5;
        float dist = dot(centered, centered) * 1.6;
        float vignette = smoothstep(softness, softness - 0.45, dist);
        // Mix toward a slightly cool darker tone in the corners for filmic falloff.
        vec3 darkened = mix(color.rgb * (1.0 - intensity * 0.85), color.rgb, vignette);
        gl_FragColor = vec4(darkened, color.a);
      }
    `,
  };
}

function key(coord: TileCoord): string {
  return `${coord.x}:${coord.z}`;
}

function createTransitionVeil(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({
    color: '#010304',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.42), material);
  veil.position.set(0, 0, -0.2);
  veil.renderOrder = 1000;
  veil.visible = false;
  return veil;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (!child.userData.shared) {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material.userData.shared) {
        material.dispose();
      }
    });
  });
}