import * as THREE from 'three';
import type { BoardProgress, GamePhase, ScannerMode, TileState } from '../types';

export class ViewModel {
  readonly group = new THREE.Group();
  private readonly screenCanvas = document.createElement('canvas');
  private readonly screenTexture: THREE.CanvasTexture;
  private readonly statusRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  private readonly scannerGroup = new THREE.Group();
  private readonly remoteGroup = new THREE.Group();
  private elapsed = 0;
  private lastScreenKey = '';

  constructor() {
    this.group.name = 'FirstPersonViewModel';
    this.group.renderOrder = 10;
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 512;
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;

    this.statusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 12, 32),
      new THREE.MeshStandardMaterial({ color: '#2ad4ff', emissive: '#083746', roughness: 0.35, metalness: 0.45 }),
    );

    this.buildScanner();
    this.buildRemote();
    this.group.add(this.scannerGroup, this.remoteGroup);
    this.drawScreen('analyzing', undefined, { mineCount: 10, flaggedCount: 0, correctFlagCount: 0, revealedSafeCount: 0, safeTileCount: 62 });
  }

  update(delta: number, phase: GamePhase, tile: TileState | undefined, progress: BoardProgress): void {
    this.elapsed += delta;
    const bob = Math.sin(this.elapsed * 2.6) * 0.018;
    this.scannerGroup.position.y = -0.49 + bob;
    this.remoteGroup.position.y = -0.56 - bob * 0.7;
    this.remoteGroup.rotation.z = 0.05 + Math.sin(this.elapsed * 3.1) * 0.015;

    const mode = this.modeFor(phase, tile);
    const screenKey = `${mode}:${tile?.x ?? 'n'}:${tile?.z ?? 'n'}:${tile?.revealed}:${tile?.flagged}:${tile?.adjacentMines}:${progress.flaggedCount}:${progress.revealedSafeCount}`;

    if (screenKey !== this.lastScreenKey) {
      this.drawScreen(mode, tile, progress);
      this.lastScreenKey = screenKey;
    }

    const alert = phase === 'failed';
    this.statusRing.material.color.set(alert ? '#ff3d2e' : phase === 'solved' || phase === 'escaped' ? '#4dff9a' : '#2ad4ff');
    this.statusRing.material.emissive.set(alert ? '#5a0503' : phase === 'solved' || phase === 'escaped' ? '#064d20' : '#083746');
  }

  private modeFor(phase: GamePhase, tile: TileState | undefined): ScannerMode {
    if (phase === 'failed') return 'alarm';
    if (phase === 'escaped') return 'escaped';
    if (phase === 'solved') return 'path';
    if (!tile) return 'analyzing';
    if (tile.flagged) return 'flagged';
    if (!tile.revealed) return 'unknown';
    return tile.hasMine ? 'alarm' : 'safe';
  }

  private buildScanner(): void {
    this.scannerGroup.position.set(-0.72, -0.49, -1.08);
    this.scannerGroup.rotation.set(-0.2, 0.25, -0.12);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#101417', roughness: 0.58, metalness: 0.48 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#30383d', roughness: 0.42, metalness: 0.72 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: '#090908', roughness: 0.86, metalness: 0.04 });
    const screenMaterial = new THREE.MeshBasicMaterial({ map: this.screenTexture, transparent: false });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.12), bodyMaterial);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.5), screenMaterial);
    const topRidge = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.16), edgeMaterial);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.18), bodyMaterial);

    screen.position.z = 0.066;
    screen.position.y = 0.04;
    topRidge.position.set(0, 0.43, 0.02);
    grip.position.set(-0.48, -0.08, -0.02);

    this.scannerGroup.add(body, screen, topRidge, grip);

    for (let fingerIndex = 0; fingerIndex < 4; fingerIndex += 1) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 6, 12), gloveMaterial);
      finger.position.set(-0.47, 0.17 - fingerIndex * 0.11, 0.11);
      finger.rotation.z = 0.28;
      this.scannerGroup.add(finger);
    }
  }

  private buildRemote(): void {
    this.remoteGroup.position.set(0.78, -0.56, -1.02);
    this.remoteGroup.rotation.set(-0.28, -0.28, 0.05);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#111619', roughness: 0.54, metalness: 0.52 });
    const redMaterial = new THREE.MeshStandardMaterial({ color: '#d6261c', emissive: '#350300', roughness: 0.34, metalness: 0.28 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: '#090908', roughness: 0.86, metalness: 0.04 });

    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.48, 8, 16), bodyMaterial);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.38, 16), bodyMaterial);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), redMaterial);

    grip.rotation.x = Math.PI / 2;
    stem.position.y = 0.32;
    knob.position.y = 0.54;
    this.statusRing.position.y = 0.18;
    this.statusRing.rotation.x = Math.PI / 2;

    this.remoteGroup.add(grip, stem, knob, this.statusRing);

    for (let fingerIndex = 0; fingerIndex < 3; fingerIndex += 1) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.22, 6, 12), gloveMaterial);
      finger.position.set(-0.16 + fingerIndex * 0.09, -0.04, 0.12);
      finger.rotation.x = Math.PI / 2;
      this.remoteGroup.add(finger);
    }
  }

  private drawScreen(mode: ScannerMode, tile: TileState | undefined, progress: BoardProgress): void {
    const context = this.screenCanvas.getContext('2d');

    if (!context) {
      throw new Error('Could not draw scanner screen.');
    }

    const alert = mode === 'alarm';
    const path = mode === 'path' || mode === 'escaped';
    context.fillStyle = alert ? '#110202' : '#041018';
    context.fillRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
    context.strokeStyle = alert ? '#ff2e1f' : path ? '#3cff94' : '#28c7ff';
    context.lineWidth = 8;
    context.strokeRect(18, 18, 476, 476);

    context.fillStyle = alert ? '#ff3d2e' : path ? '#55ff9d' : '#31d7ff';
    context.font = 'bold 34px system-ui';
    context.fillText('SCANNER v2.1', 42, 62);
    context.font = 'bold 48px system-ui';
    context.fillText(this.titleForMode(mode, tile), 42, 145);

    context.fillStyle = '#f7d44a';
    context.beginPath();
    context.arc(256, 256, 58, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#111';
    context.beginPath();
    context.arc(234, 244, 8, 0, Math.PI * 2);
    context.arc(278, 244, 8, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 7;
    context.strokeStyle = '#111';
    context.beginPath();
    context.arc(256, alert ? 284 : 264, 28, alert ? Math.PI : 0, alert ? Math.PI * 2 : Math.PI);
    context.stroke();

    context.fillStyle = '#aeeeff';
    context.font = 'bold 28px system-ui';
    context.fillText(`SAFE ${progress.revealedSafeCount}/${progress.safeTileCount}`, 42, 400);
    context.fillText(`FLAGS ${progress.flaggedCount}/${progress.mineCount}`, 42, 440);
    this.screenTexture.needsUpdate = true;
  }

  private titleForMode(mode: ScannerMode, tile: TileState | undefined): string {
    if (mode === 'alarm') return 'MINE DETECTED';
    if (mode === 'path') return 'PATH ASSIST';
    if (mode === 'escaped') return 'EXIT CLEAR';
    if (mode === 'flagged') return 'BEACON SET';
    if (mode === 'unknown') return 'UNKNOWN TILE';
    if (mode === 'safe') return tile?.adjacentMines ? `${tile.adjacentMines} MINE CLUES` : 'CLEAR TILE';
    return 'ANALYZING';
  }
}