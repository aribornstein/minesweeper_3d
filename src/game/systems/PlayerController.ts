import * as THREE from 'three';
import { MOUSE_SENSITIVITY, PLAYER_HEIGHT, TILE_SIZE, WALK_SPEED } from '../config';
import type { LevelDefinition } from '../types';

const DEFAULT_PITCH = -0.32;
const DEFAULT_YAW = 0;
const LOCKED_EXIT_BARRIER_OFFSET = 0.34;
const EXIT_PASSAGE_HALF_WIDTH = 0.92;

export class PlayerController {
  private readonly keys = new Set<string>();
  private readonly touchMovement = new THREE.Vector2();
  private pitch = DEFAULT_PITCH;
  private yaw = DEFAULT_YAW;
  private movementEnabled = false;
  private pointerLocked = false;
  private pointerLockUnavailable = false;
  private exitUnlocked = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private level: LevelDefinition,
  ) {
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(this.startPosition());
    this.updateCameraRotation();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }

  lock(): void {
    this.activate();
    if (this.pointerLockUnavailable) {
      return;
    }

    void this.canvas.requestPointerLock().catch(() => {
      this.pointerLockUnavailable = true;
    });
  }

  get hasPointerLock(): boolean {
    return this.pointerLocked;
  }

  get canRequestPointerLock(): boolean {
    return !this.pointerLockUnavailable;
  }

  activate(): void {
    this.movementEnabled = true;
  }

  deactivate(): void {
    this.movementEnabled = false;
    this.keys.clear();
    this.setTouchMovement(0, 0);

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  setTouchMovement(x: number, z: number): void {
    this.touchMovement.set(x, z);

    if (this.touchMovement.lengthSq() > 1) {
      this.touchMovement.normalize();
    }
  }

  setExitUnlocked(unlocked: boolean): void {
    this.exitUnlocked = unlocked;
  }

  lookBy(movementX: number, movementY: number): void {
    if (!this.movementEnabled) {
      return;
    }

    this.yaw -= movementX * MOUSE_SENSITIVITY;
    this.pitch -= movementY * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.1);
    this.updateCameraRotation();
  }

  update(delta: number): void {
    if (!this.movementEnabled) {
      return;
    }

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) movement.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) movement.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) movement.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) movement.sub(right);
    if (this.touchMovement.y !== 0) movement.addScaledVector(forward, this.touchMovement.y);
    if (this.touchMovement.x !== 0) movement.addScaledVector(right, this.touchMovement.x);

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(WALK_SPEED * delta);
      this.camera.position.add(movement);
      this.clampToRoom();
      this.blockLockedExit();
    }
  }

  reset(level: LevelDefinition = this.level): void {
    this.level = level;
    this.exitUnlocked = false;
    this.camera.position.copy(this.startPosition());
    this.pitch = DEFAULT_PITCH;
    this.yaw = DEFAULT_YAW;
    this.updateCameraRotation();
  }

  private startPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      (this.level.startTile.x - (this.level.width - 1) / 2) * TILE_SIZE,
      PLAYER_HEIGHT,
      (this.level.depth * TILE_SIZE) / 2 + 1.6,
    );
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }

    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.lookBy(event.movementX, event.movementY);
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.pointerLockUnavailable = this.pointerLockUnavailable && !this.pointerLocked;
  };

  private updateCameraRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private clampToRoom(): void {
    const halfWidth = (this.level.width * TILE_SIZE) / 2 + 1.5;
    const halfDepth = (this.level.depth * TILE_SIZE) / 2 + 2.4;
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -halfWidth, halfWidth);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -halfDepth, halfDepth);
    this.camera.position.y = PLAYER_HEIGHT;
  }

  private blockLockedExit(): void {
    if (this.exitUnlocked) {
      return;
    }

    const exitX = (this.level.exitTile.x - (this.level.width - 1) / 2) * TILE_SIZE;
    const exitZ = (this.level.exitTile.z - (this.level.depth - 1) / 2) * TILE_SIZE;
    const barrierZ = exitZ - LOCKED_EXIT_BARRIER_OFFSET;

    if (Math.abs(this.camera.position.x - exitX) <= EXIT_PASSAGE_HALF_WIDTH && this.camera.position.z < barrierZ) {
      this.camera.position.z = barrierZ;
    }
  }
}