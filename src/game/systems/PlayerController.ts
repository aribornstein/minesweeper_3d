import * as THREE from 'three';
import { BOARD_DEPTH, BOARD_WIDTH, MOUSE_SENSITIVITY, PLAYER_HEIGHT, START_TILE, TILE_SIZE, WALK_SPEED } from '../config';

const DEFAULT_PITCH = -0.32;
const DEFAULT_YAW = 0;

export class PlayerController {
  private readonly keys = new Set<string>();
  private pitch = DEFAULT_PITCH;
  private yaw = DEFAULT_YAW;
  private enabled = false;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement) {
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
    this.canvas.requestPointerLock();
  }

  update(delta: number): void {
    if (!this.enabled) {
      return;
    }

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();

    if (this.keys.has('KeyW')) movement.add(forward);
    if (this.keys.has('KeyS')) movement.sub(forward);
    if (this.keys.has('KeyD')) movement.add(right);
    if (this.keys.has('KeyA')) movement.sub(right);

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(WALK_SPEED * delta);
      this.camera.position.add(movement);
      this.clampToRoom();
    }
  }

  reset(): void {
    this.camera.position.copy(this.startPosition());
    this.pitch = DEFAULT_PITCH;
    this.yaw = DEFAULT_YAW;
    this.updateCameraRotation();
  }

  private startPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      (START_TILE.x - (BOARD_WIDTH - 1) / 2) * TILE_SIZE,
      PLAYER_HEIGHT,
      (BOARD_DEPTH * TILE_SIZE) / 2 + 1.6,
    );
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) {
      return;
    }

    this.yaw -= event.movementX * MOUSE_SENSITIVITY;
    this.pitch -= event.movementY * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.1, 1.1);
    this.updateCameraRotation();
  };

  private onPointerLockChange = (): void => {
    this.enabled = document.pointerLockElement === this.canvas;
  };

  private updateCameraRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private clampToRoom(): void {
    const halfWidth = (BOARD_WIDTH * TILE_SIZE) / 2 + 1.5;
    const halfDepth = (BOARD_DEPTH * TILE_SIZE) / 2 + 2.4;
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -halfWidth, halfWidth);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -halfDepth, halfDepth);
    this.camera.position.y = PLAYER_HEIGHT;
  }
}