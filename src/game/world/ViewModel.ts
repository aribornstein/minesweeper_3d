import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BoardProgress, GamePhase, ScannerMode, TileState } from '../types';
import { createFlagModel, updateFlagModel } from './FlagModel';
import { applyFlagGripHandPose, createFlagGripHand, DEFAULT_FLAG_GRIP_HAND_POSE, type FlagGripHandPose, type QuaternionTuple } from './FlagGripHand';

const SCREEN_SIZE = 1024;
const HELD_FLAG_SCALE = 0.78;
const GRIP_CALIBRATION_STORAGE_KEY = 'minesweeper3d.flagGripCalibration.v2';

type FlagGripCalibration = {
  handX: number;
  handY: number;
  handZ: number;
  handQuatX: number;
  handQuatY: number;
  handQuatZ: number;
  handQuatW: number;
  gripX: number;
  gripY: number;
  gripZ: number;
  flagAttachX: number;
  flagAttachY: number;
  flagAttachZ: number;
  fistX: number;
  fistY: number;
  fistZ: number;
  fistQuatX: number;
  fistQuatY: number;
  fistQuatZ: number;
  fistQuatW: number;
  fistScale: number;
};

type StoredFlagGripCalibration = Partial<FlagGripCalibration> & {
  handRotX?: number;
  handRotY?: number;
  handRotZ?: number;
  fistRotX?: number;
  fistRotY?: number;
  fistRotZ?: number;
};

function quaternionTupleFromEuler(x: number, y: number, z: number): QuaternionTuple {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

const DEFAULT_HAND_QUATERNION: QuaternionTuple = [-0.20108995057111004, -0.7216664053212613, 0.1712833941871301, 0.6398612584660318];

const DEFAULT_GRIP_CALIBRATION: FlagGripCalibration = {
  handX: -0.05,
  handY: 0.29,
  handZ: 0.25,
  handQuatX: DEFAULT_HAND_QUATERNION[0],
  handQuatY: DEFAULT_HAND_QUATERNION[1],
  handQuatZ: DEFAULT_HAND_QUATERNION[2],
  handQuatW: DEFAULT_HAND_QUATERNION[3],
  gripX: 0.105,
  gripY: 0.135,
  gripZ: 0,
  flagAttachX: 0,
  flagAttachY: 0.49,
  flagAttachZ: 0.08,
  fistX: DEFAULT_FLAG_GRIP_HAND_POSE.fistPosition[0],
  fistY: DEFAULT_FLAG_GRIP_HAND_POSE.fistPosition[1],
  fistZ: DEFAULT_FLAG_GRIP_HAND_POSE.fistPosition[2],
  fistQuatX: DEFAULT_FLAG_GRIP_HAND_POSE.fistQuaternion[0],
  fistQuatY: DEFAULT_FLAG_GRIP_HAND_POSE.fistQuaternion[1],
  fistQuatZ: DEFAULT_FLAG_GRIP_HAND_POSE.fistQuaternion[2],
  fistQuatW: DEFAULT_FLAG_GRIP_HAND_POSE.fistQuaternion[3],
  fistScale: DEFAULT_FLAG_GRIP_HAND_POSE.fistScale,
};

function withMigratedQuaternionFields(calibration: StoredFlagGripCalibration): StoredFlagGripCalibration {
  if (
    calibration.handQuatX === undefined &&
    calibration.handRotX !== undefined &&
    calibration.handRotY !== undefined &&
    calibration.handRotZ !== undefined
  ) {
    const [x, y, z, w] = quaternionTupleFromEuler(calibration.handRotX, calibration.handRotY, calibration.handRotZ);
    calibration.handQuatX = x;
    calibration.handQuatY = y;
    calibration.handQuatZ = z;
    calibration.handQuatW = w;
  }

  if (
    calibration.fistQuatX === undefined &&
    calibration.fistRotX !== undefined &&
    calibration.fistRotY !== undefined &&
    calibration.fistRotZ !== undefined
  ) {
    const [x, y, z, w] = quaternionTupleFromEuler(calibration.fistRotX, calibration.fistRotY, calibration.fistRotZ);
    calibration.fistQuatX = x;
    calibration.fistQuatY = y;
    calibration.fistQuatZ = z;
    calibration.fistQuatW = w;
  }

  return calibration;
}

function normalizeCalibrationQuaternion(calibration: FlagGripCalibration, keys: [keyof FlagGripCalibration, keyof FlagGripCalibration, keyof FlagGripCalibration, keyof FlagGripCalibration]): void {
  const quaternion = new THREE.Quaternion(
    calibration[keys[0]],
    calibration[keys[1]],
    calibration[keys[2]],
    calibration[keys[3]],
  );

  if (quaternion.lengthSq() < 0.000001) quaternion.identity();
  else quaternion.normalize();

  calibration[keys[0]] = quaternion.x;
  calibration[keys[1]] = quaternion.y;
  calibration[keys[2]] = quaternion.z;
  calibration[keys[3]] = quaternion.w;
}

function normalizeGripCalibrationQuaternions(calibration: FlagGripCalibration): void {
  normalizeCalibrationQuaternion(calibration, ['handQuatX', 'handQuatY', 'handQuatZ', 'handQuatW']);
  normalizeCalibrationQuaternion(calibration, ['fistQuatX', 'fistQuatY', 'fistQuatZ', 'fistQuatW']);
}

function gripCalibrationEnabled(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('calibrateGrip');
}

const HELD_FLAG_POSE = {
  posX: 0.62,
  posY: -0.74,
  posZ: -0.985,
  qx: -0.27863000322453835,
  qy: 0.3493137733092253,
  qz: -0.1518833217575745,
  qw: 0.8816329540412212,
  scale: 0.72,
};

function loadGripCalibration(enabled: boolean): FlagGripCalibration {
  if (!enabled || typeof window === 'undefined') return { ...DEFAULT_GRIP_CALIBRATION };

  const saved = window.localStorage.getItem(GRIP_CALIBRATION_STORAGE_KEY);
  if (!saved) return { ...DEFAULT_GRIP_CALIBRATION };

  try {
    const parsed = withMigratedQuaternionFields(JSON.parse(saved) as StoredFlagGripCalibration);
    const calibration = { ...DEFAULT_GRIP_CALIBRATION, ...parsed };
    normalizeGripCalibrationQuaternions(calibration);
    return calibration;
  } catch {
    return { ...DEFAULT_GRIP_CALIBRATION };
  }
}

function handPoseFromCalibration(calibration: FlagGripCalibration): FlagGripHandPose {
  return {
    fistPosition: [calibration.fistX, calibration.fistY, calibration.fistZ],
    fistQuaternion: [calibration.fistQuatX, calibration.fistQuatY, calibration.fistQuatZ, calibration.fistQuatW],
    fistScale: calibration.fistScale,
  };
}

export class ViewModel {
  readonly group = new THREE.Group();
  private readonly screenCanvas = document.createElement('canvas');
  private readonly screenTexture: THREE.CanvasTexture;
  private readonly statusRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  private readonly scannerGroup = new THREE.Group();
  private readonly remoteGroup = new THREE.Group();
  private readonly heldFlag: THREE.Group;
  private readonly heldHand: THREE.Group;
  private readonly gripCalibrationEnabled = gripCalibrationEnabled();
  private scannerStatusLed: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | undefined;
  private readonly gripAnchorMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#31d7ff', depthTest: false, depthWrite: false, transparent: true, opacity: 0.82 }),
  );
  private readonly flagAttachMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ff3d2e', depthTest: false, depthWrite: false, transparent: true, opacity: 0.82 }),
  );
  private gripCalibration: FlagGripCalibration;
  private remoteRestY = -0.82;
  private remoteRestZ = -1.0;
  private elapsed = 0;
  private flagThrowTimer = 0;
  private lastScreenKey = '';

  constructor() {
    this.gripCalibration = loadGripCalibration(this.gripCalibrationEnabled);
    this.group.name = 'FirstPersonViewModel';
    this.screenCanvas.width = SCREEN_SIZE;
    this.screenCanvas.height = SCREEN_SIZE;
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;

    this.statusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.018, 16, 64),
      new THREE.MeshStandardMaterial({ color: '#2ad4ff', emissive: '#083746', emissiveIntensity: 0.82, roughness: 0.3, metalness: 0.55, envMapIntensity: 0.7 }),
    );
    this.heldFlag = createFlagModel({ withBase: false, scale: HELD_FLAG_SCALE });
    this.heldHand = createFlagGripHand(handPoseFromCalibration(this.gripCalibration));
    this.heldHand.visible = false;

    this.buildScanner();
    this.buildRemote();
    this.group.add(this.scannerGroup, this.remoteGroup);
    this.createHandOverlay();
    if (this.gripCalibrationEnabled) this.createGripCalibrationTools();
    this.drawScreen('analyzing', undefined, { levelNumber: 1, mineCount: 3, flaggedCount: 0, correctFlagCount: 0, revealedSafeCount: 0, safeTileCount: 27 }, 0, 'ready');
  }

  update(delta: number, phase: GamePhase, tile: TileState | undefined, progress: BoardProgress, adjacentFlags: number): void {
    this.elapsed += delta;
    this.flagThrowTimer = Math.max(0, this.flagThrowTimer - delta);
    const bob = Math.sin(this.elapsed * 2.6) * 0.018;
    this.scannerGroup.position.y = -0.49 + bob;
    updateFlagModel(this.heldFlag, delta);
    if (this.scannerStatusLed) {
      // Heartbeat blink: short bright pulse every ~0.4s.
      const blinkPhase = (this.elapsed * 2.4) % 1;
      const blink = blinkPhase < 0.22 ? 1 : 0.18;
      (this.scannerStatusLed.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + blink * 1.6;
    }
    const throwProgress = this.flagThrowTimer > 0 ? 1 - this.flagThrowTimer / 0.45 : 0;
    const thrust = Math.sin(Math.min(throwProgress, 1) * Math.PI);
    this.remoteGroup.position.y = this.remoteRestY - bob * 0.7 + thrust * 0.06;
    this.remoteGroup.position.z = this.remoteRestZ - thrust * 0.24;
    this.remoteGroup.rotation.x = -0.08 - thrust * 0.46;
    this.remoteGroup.rotation.z = 0.1 + Math.sin(this.elapsed * 3.1) * 0.012 + thrust * 0.08;
    const showHeld = this.flagThrowTimer <= 0.25 && phase !== 'failed';
    this.heldFlag.visible = showHeld;
    if (this.handOverlay) this.handOverlay.style.opacity = showHeld ? '1' : '0';

    const mode = this.modeFor(phase, tile);
    const screenKey = `${mode}:${phase}:${progress.levelNumber}:${tile?.x ?? 'n'}:${tile?.z ?? 'n'}:${tile?.revealed}:${tile?.flagged}:${tile?.adjacentMines}:${adjacentFlags}:${progress.mineCount}:${progress.flaggedCount}:${progress.correctFlagCount}:${progress.revealedSafeCount}:${progress.safeTileCount}`;

    if (screenKey !== this.lastScreenKey) {
      this.drawScreen(mode, tile, progress, adjacentFlags, phase);
      this.lastScreenKey = screenKey;
    }

    const alert = phase === 'failed';
    this.statusRing.material.color.set(alert ? '#ff3d2e' : phase === 'solved' || phase === 'escaped' ? '#4dff9a' : '#2ad4ff');
    this.statusRing.material.emissive.set(alert ? '#5a0503' : phase === 'solved' || phase === 'escaped' ? '#064d20' : '#083746');
  }

  triggerFlagThrow(): void {
    this.flagThrowTimer = 0.45;
  }

  flagWorldPosition(): THREE.Vector3 {
    const position = new THREE.Vector3();
    this.heldFlag.getWorldPosition(position);
    return position;
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
    this.scannerGroup.position.set(-0.7, -0.52, -1.12);
    this.scannerGroup.rotation.set(-0.2, 0.25, -0.12);
    this.scannerGroup.scale.setScalar(0.92);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#0a1013', roughness: 0.46, metalness: 0.62, envMapIntensity: 0.82 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#3b474d', roughness: 0.28, metalness: 0.82, envMapIntensity: 0.92 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: '#090908', roughness: 0.82, metalness: 0.04, envMapIntensity: 0.16 });
    const screenMaterial = new THREE.MeshBasicMaterial({ map: this.screenTexture, transparent: false });
    const glassMaterial = new THREE.MeshBasicMaterial({ color: '#7fe7ff', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    const screenGlowMaterial = new THREE.MeshBasicMaterial({ color: '#48cdf4', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });

    const body = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.78, 0.12, 4, 0.045), bodyMaterial);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.61, 0.59, 0.04, 3, 0.035), edgeMaterial);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.5), screenMaterial);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.5), glassMaterial);
    const topRidge = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.08, 0.16, 3, 0.025), edgeMaterial);
    const bottomLight = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.025, 0.02, 1, 0.006), screenGlowMaterial);
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.55, 0.18, 3, 0.04), bodyMaterial);
    const sideRail = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.64, 0.07, 2, 0.018), edgeMaterial);
    const statusLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 12),
      new THREE.MeshStandardMaterial({ color: '#2ad4ff', emissive: '#2ad4ff', emissiveIntensity: 1.6, roughness: 0.22, metalness: 0.2 }),
    );
    this.scannerStatusLed = statusLed;

    bezel.position.set(0, 0.04, 0.072);
    screen.position.z = 0.095;
    screen.position.y = 0.04;
    glass.position.copy(screen.position);
    glass.position.z += 0.003;
    topRidge.position.set(0, 0.43, 0.02);
    bottomLight.position.set(0, -0.31, 0.102);
    grip.position.set(-0.48, -0.08, -0.02);
    sideRail.position.set(0.39, 0.0, 0.04);
    statusLed.position.set(0.28, 0.39, 0.1);

    this.scannerGroup.add(body, bezel, screen, glass, topRidge, bottomLight, grip, sideRail, statusLed, ...this.createScannerScrews());
    // Cyan ambient glow projecting forward from the scanner, so nearby tiles read as lit by the device.
    const scannerGlow = new THREE.PointLight('#7fe7ff', 0.85, 3.2, 1.8);
    scannerGlow.position.set(0, 0.08, 0.18);
    this.scannerGroup.add(scannerGlow);

    for (let fingerIndex = 0; fingerIndex < 4; fingerIndex += 1) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 8, 16), gloveMaterial);
      finger.position.set(-0.47, 0.17 - fingerIndex * 0.11, 0.11);
      finger.rotation.z = 0.28;
      this.scannerGroup.add(finger);
    }
  }

  private createScannerScrews(): THREE.Object3D[] {
    const material = new THREE.MeshStandardMaterial({ color: '#242b2e', roughness: 0.38, metalness: 0.76, envMapIntensity: 0.8 });
    const geometry = new THREE.CylinderGeometry(0.024, 0.024, 0.014, 16);
    const positions = [
      [-0.31, 0.33],
      [0.31, 0.33],
      [-0.31, -0.33],
      [0.31, -0.33],
    ];

    return positions.map(([x, y]) => {
      const screw = new THREE.Mesh(geometry, material.clone());
      screw.position.set(x, y, 0.096);
      screw.rotation.x = Math.PI / 2;
      return screw;
    });
  }

  private buildRemote(): void {
    const pose = HELD_FLAG_POSE;
    this.remoteRestY = pose.posY;
    this.remoteRestZ = pose.posZ;
    this.remoteGroup.position.set(pose.posX, pose.posY, pose.posZ);
    this.remoteGroup.rotation.set(-0.04, -0.18, 0.06);
    this.heldFlag.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw).normalize();
    this.heldFlag.scale.setScalar(pose.scale);
    this.heldHand.scale.setScalar(1);
    this.remoteGroup.add(this.heldFlag);
    if (this.gripCalibrationEnabled) this.remoteGroup.add(this.heldHand);
    this.applyGripCalibration();
  }

  private handOverlay: HTMLDivElement | null = null;

  private createHandOverlay(): void {
    if (typeof document === 'undefined' || !document.body) return;
    const overlay = document.createElement('div');
    overlay.id = 'held-hand-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = [
      'position:fixed',
      'right:0',
      'bottom:0',
      'width:min(34vw, 360px)',
      'height:min(22vh, 200px)',
      'pointer-events:none',
      'z-index:5',
      'transition:opacity 140ms ease-out',
      'background:radial-gradient(120% 90% at 78% 110%, rgba(4,5,6,0.95) 0%, rgba(4,5,6,0.78) 38%, rgba(4,5,6,0.35) 65%, rgba(4,5,6,0) 85%)',
    ].join(';');
    document.body.append(overlay);
    this.handOverlay = overlay;
  }

  private alignFlagAttachAnchorToHandGrip(): void {
    const handAnchor = this.gripAnchorLocalPosition();
    const flagAnchorOffset = this.flagAttachOffset();

    this.heldFlag.position.copy(handAnchor.sub(flagAnchorOffset));
  }

  private gripAnchorLocalPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.gripCalibration.gripX, this.gripCalibration.gripY, this.gripCalibration.gripZ)
      .multiply(this.heldHand.scale)
      .applyQuaternion(this.heldHand.quaternion)
      .add(this.heldHand.position);
  }

  private flagAttachOffset(): THREE.Vector3 {
    return new THREE.Vector3(this.gripCalibration.flagAttachX, this.gripCalibration.flagAttachY, this.gripCalibration.flagAttachZ)
      .multiply(this.heldFlag.scale)
      .applyEuler(this.heldFlag.rotation);
  }

  private updateGripAnchorMarkers(): void {
    if (!this.gripCalibrationEnabled) return;
    const flagAnchor = this.flagAttachOffset().add(this.heldFlag.position);
    this.gripAnchorMarker.position.copy(this.gripAnchorLocalPosition());
    this.flagAttachMarker.position.copy(flagAnchor);
  }

  private applyGripCalibration(): void {
    normalizeGripCalibrationQuaternions(this.gripCalibration);
    this.heldHand.position.set(this.gripCalibration.handX, this.gripCalibration.handY, this.gripCalibration.handZ);
    this.heldHand.quaternion.set(
      this.gripCalibration.handQuatX,
      this.gripCalibration.handQuatY,
      this.gripCalibration.handQuatZ,
      this.gripCalibration.handQuatW,
    ).normalize();
    applyFlagGripHandPose(this.heldHand, handPoseFromCalibration(this.gripCalibration));
    this.alignFlagAttachAnchorToHandGrip();
    this.updateGripAnchorMarkers();
  }

  private createGripCalibrationTools(): void {
    this.gripAnchorMarker.name = 'HandGripAnchorMarker';
    this.flagAttachMarker.name = 'FlagAttachAnchorMarker';
    this.gripAnchorMarker.renderOrder = 100;
    this.flagAttachMarker.renderOrder = 100;
    this.remoteGroup.add(this.gripAnchorMarker, this.flagAttachMarker);
    this.updateGripAnchorMarkers();
    this.createGripCalibrationPanel();
  }

  private createGripCalibrationPanel(): void {
    if (typeof document === 'undefined' || !document.body) return;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:12px',
      'z-index:20',
      'width:300px',
      'max-height:calc(100vh - 24px)',
      'overflow:auto',
      'padding:12px',
      'background:rgba(3, 8, 10, 0.88)',
      'border:1px solid rgba(49, 215, 255, 0.45)',
      'box-shadow:0 10px 40px rgba(0, 0, 0, 0.35)',
      'color:#dff8ff',
      'font:12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Flag Grip Calibration';
    title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px;color:#7fe7ff';
    panel.append(title);

    const content = document.createElement('div');
    panel.append(content);

    const hint = document.createElement('div');
    hint.textContent = 'Cyan = hand grip anchor. Red = flag attach anchor.';
    hint.style.cssText = 'margin-bottom:10px;color:#b9d7dc;line-height:1.35';
    content.append(hint);

    const fields: Array<[keyof FlagGripCalibration, string, number, number, number]> = [
      ['handX', 'hand x', -0.35, 0.25, 0.005],
      ['handY', 'hand y', -0.05, 0.55, 0.005],
      ['handZ', 'hand z', -0.25, 0.25, 0.005],
      ['handQuatX', 'hand qx', -1, 1, 0.001],
      ['handQuatY', 'hand qy', -1, 1, 0.001],
      ['handQuatZ', 'hand qz', -1, 1, 0.001],
      ['handQuatW', 'hand qw', -1, 1, 0.001],
      ['gripX', 'grip x', -0.15, 0.2, 0.005],
      ['gripY', 'grip y', -0.05, 0.28, 0.005],
      ['gripZ', 'grip z', -0.12, 0.12, 0.005],
      ['flagAttachX', 'flag attach x', -0.1, 0.1, 0.005],
      ['flagAttachY', 'flag attach y', 0.35, 0.85, 0.005],
      ['flagAttachZ', 'flag attach z', -0.1, 0.1, 0.005],
      ['fistX', 'fist x', -0.12, 0.18, 0.005],
      ['fistY', 'fist y', -0.02, 0.28, 0.005],
      ['fistZ', 'fist z', -0.12, 0.12, 0.005],
      ['fistQuatX', 'fist qx', -1, 1, 0.001],
      ['fistQuatY', 'fist qy', -1, 1, 0.001],
      ['fistQuatZ', 'fist qz', -1, 1, 0.001],
      ['fistQuatW', 'fist qw', -1, 1, 0.001],
      ['fistScale', 'fist scale', 0.45, 1.6, 0.005],
    ];

    const controls: Partial<Record<keyof FlagGripCalibration, [HTMLInputElement, HTMLInputElement]>> = {};
    const output = document.createElement('pre');

    const sync = (): void => {
      this.applyGripCalibration();
      window.localStorage.setItem(GRIP_CALIBRATION_STORAGE_KEY, JSON.stringify(this.gripCalibration));
      output.textContent = JSON.stringify(this.gripCalibration, null, 2);
      (Object.entries(controls) as Array<[keyof FlagGripCalibration, [HTMLInputElement, HTMLInputElement]]>).forEach(([key, [range, number]]) => {
        const value = String(this.gripCalibration[key]);
        range.value = value;
        number.value = value;
      });
    };

    fields.forEach(([key, label, min, max, step]) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:76px 1fr 58px;gap:6px;align-items:center;margin:5px 0';

      const text = document.createElement('span');
      text.textContent = label;

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      range.value = String(this.gripCalibration[key]);

      const number = document.createElement('input');
      number.type = 'number';
      number.min = String(min);
      number.max = String(max);
      number.step = String(step);
      number.value = String(this.gripCalibration[key]);
      number.style.cssText = 'width:58px;background:#06161b;color:#dff8ff;border:1px solid #214650;padding:2px 4px';

      const onInput = (source: HTMLInputElement): void => {
        this.gripCalibration[key] = Number(source.value);
        range.value = source.value;
        number.value = source.value;
        sync();
      };
      range.addEventListener('input', () => onInput(range));
      number.addEventListener('input', () => onInput(number));

      controls[key] = [range, number];
      row.append(text, range, number);
      content.append(row);
    });

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;margin:10px 0';

    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.style.cssText = 'flex:1;background:#0d252d;color:#dff8ff;border:1px solid #2d6774;padding:6px;cursor:pointer';
    reset.addEventListener('click', () => {
      this.gripCalibration = { ...DEFAULT_GRIP_CALIBRATION };
      (Object.entries(controls) as Array<[keyof FlagGripCalibration, [HTMLInputElement, HTMLInputElement]]>).forEach(([key, [range, number]]) => {
        range.value = String(this.gripCalibration[key]);
        number.value = String(this.gripCalibration[key]);
      });
      sync();
    });

    const copy = document.createElement('button');
    copy.textContent = 'Copy JSON';
    copy.style.cssText = reset.style.cssText;
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(this.gripCalibration, null, 2));
    });

    buttons.append(reset, copy);
    content.append(buttons);

    output.style.cssText = 'white-space:pre-wrap;margin:0;color:#a7f2ff;background:rgba(0,0,0,0.24);padding:8px;border:1px solid rgba(49,215,255,0.24)';
    content.append(output);
    title.title = 'Double-click to collapse or expand';
    title.addEventListener('dblclick', () => {
      content.hidden = !content.hidden;
    });
    document.body.append(panel);
    sync();
  }

  private drawScreen(mode: ScannerMode, tile: TileState | undefined, progress: BoardProgress, adjacentFlags: number, phase: GamePhase): void {
    const context = this.screenCanvas.getContext('2d');

    if (!context) {
      throw new Error('Could not draw scanner screen.');
    }

    const alert = mode === 'alarm';
    const path = mode === 'path' || mode === 'escaped';
    const scale = this.screenCanvas.width / 512;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, 512, 512);
    const background = context.createLinearGradient(0, 0, 512, 512);
    background.addColorStop(0, alert ? '#180403' : '#061b27');
    background.addColorStop(0.48, alert ? '#110202' : '#041018');
    background.addColorStop(1, '#010405');
    context.fillStyle = background;
    context.fillRect(0, 0, 512, 512);

    const glow = context.createRadialGradient(256, 210, 0, 256, 210, 260);
    glow.addColorStop(0, alert ? 'rgba(255, 61, 46, 0.2)' : path ? 'rgba(85, 255, 157, 0.18)' : 'rgba(49, 215, 255, 0.2)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 512, 512);

    context.globalAlpha = 0.24;
    context.strokeStyle = alert ? '#ff3d2e' : path ? '#55ff9d' : '#31d7ff';
    context.lineWidth = 1;
    for (let line = 92; line < 356; line += 28) {
      context.beginPath();
      context.moveTo(42, line);
      context.lineTo(470, line);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.strokeStyle = alert ? '#ff2e1f' : path ? '#3cff94' : '#28c7ff';
    context.lineWidth = 8;
    context.shadowColor = alert ? 'rgba(255, 61, 46, 0.48)' : path ? 'rgba(85, 255, 157, 0.42)' : 'rgba(49, 215, 255, 0.44)';
    context.shadowBlur = 18;
    context.strokeRect(18, 18, 476, 476);
    context.shadowBlur = 0;

    const accent = alert ? '#ff3d2e' : path ? '#55ff9d' : '#31d7ff';
    context.fillStyle = accent;
    context.font = 'bold 26px system-ui';
    context.shadowColor = alert ? 'rgba(255, 61, 46, 0.36)' : 'rgba(49, 215, 255, 0.36)';
    context.shadowBlur = 10;
    context.fillText('SCANNER v2.1', 42, 62);
    this.drawPhaseChip(context, phase, accent, progress.levelNumber);
    context.font = 'bold 38px system-ui';
    context.fillText(this.titleForMode(mode, tile), 42, 128);
    context.shadowBlur = 0;

    this.drawSmileyFace(context, 152, 254, 62, mode, phase, tile);
    this.drawObjectiveGlyph(context, 66, 362, accent, phase);
    this.drawIconCard(context, 260, 156, 'safe', `${progress.revealedSafeCount}/${progress.safeTileCount}`, 'SAFE', '#d5d0c4');
    this.drawIconCard(context, 260, 222, 'flag', `${progress.flaggedCount}/${progress.mineCount}`, 'FLAGS', '#d62020');
    this.drawIconCard(context, 260, 288, 'target', tile ? `X${tile.x} Z${tile.z}` : '--', 'TILE', accent);
    this.drawIconCard(context, 260, 354, 'nearby', String(adjacentFlags), 'NEAR', '#f2c33e');
    context.globalAlpha = 0.18;
    context.fillStyle = '#aeeeff';
    for (let scanline = 28; scanline < 492; scanline += 12) {
      context.fillRect(22, scanline, 468, 1);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
    this.screenTexture.needsUpdate = true;
  }

  private drawPhaseChip(context: CanvasRenderingContext2D, phase: GamePhase, accent: string, levelNumber: number): void {
    const label = phase === 'failed' ? 'RETRY' : phase === 'solved' ? 'EXIT' : phase === 'escaped' ? 'NEXT' : `L${levelNumber}`;
    this.drawPanel(context, 340, 28, 144, 56, accent, 0.18);
    context.fillStyle = '#eefaff';
    context.font = 'bold 34px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 412, 57);
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
  }

  private drawSmileyFace(context: CanvasRenderingContext2D, x: number, y: number, radius: number, mode: ScannerMode, phase: GamePhase, tile: TileState | undefined): void {
    const failed = phase === 'failed';
    const cool = mode === 'path' || mode === 'escaped' || phase === 'solved' || phase === 'escaped';
    const riskyClick = !failed && !cool && Boolean(tile && !tile.revealed && !tile.flagged);
    const faceRadius = radius * 0.74;

    this.drawClassicTile(context, x, y, radius * 2.22, true);

    const faceGradient = context.createRadialGradient(x - faceRadius * 0.25, y - faceRadius * 0.32, faceRadius * 0.1, x, y, faceRadius);
    faceGradient.addColorStop(0, '#fff69a');
    faceGradient.addColorStop(1, failed ? '#f0c322' : '#ffe100');

    context.shadowColor = failed ? 'rgba(255, 61, 46, 0.32)' : cool ? 'rgba(85, 255, 157, 0.24)' : 'rgba(247, 212, 74, 0.28)';
    context.shadowBlur = 16;
    context.fillStyle = faceGradient;
    context.beginPath();
    context.arc(x, y, faceRadius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = '#111';
    context.lineWidth = 4;
    context.stroke();

    context.strokeStyle = '#111';
    context.fillStyle = '#111';
    if (failed) {
      this.drawXEye(context, x - faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.13);
      this.drawXEye(context, x + faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.13);
    } else if (cool) {
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(x - faceRadius * 0.56, y - faceRadius * 0.22);
      context.lineTo(x + faceRadius * 0.56, y - faceRadius * 0.22);
      context.stroke();
      this.drawSunglassLens(context, x - faceRadius * 0.28, y - faceRadius * 0.2, faceRadius * 0.22);
      this.drawSunglassLens(context, x + faceRadius * 0.28, y - faceRadius * 0.2, faceRadius * 0.22);
    } else {
      context.beginPath();
      context.arc(x - faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.095, 0, Math.PI * 2);
      context.arc(x + faceRadius * 0.35, y - faceRadius * 0.22, faceRadius * 0.095, 0, Math.PI * 2);
      context.fill();
    }

    context.lineWidth = 5;
    context.strokeStyle = '#111';
    context.beginPath();
    if (failed) {
      context.arc(x, y + faceRadius * 0.42, faceRadius * 0.35, Math.PI * 1.08, Math.PI * 1.92);
    } else if (riskyClick) {
      context.lineWidth = 5;
      context.arc(x, y + faceRadius * 0.34, faceRadius * 0.16, 0, Math.PI * 2);
    } else {
      context.arc(x, y + faceRadius * 0.03, faceRadius * 0.42, 0.18 * Math.PI, 0.82 * Math.PI);
    }
    context.stroke();
  }

  private drawObjectiveGlyph(context: CanvasRenderingContext2D, x: number, y: number, accent: string, phase: GamePhase): void {
    const label = phase === 'failed' ? 'CHECKPOINT' : phase === 'escaped' ? 'CLEAR' : 'EXIT';
    this.drawPanel(context, x, y, 154, 46, accent, 0.12);
    this.drawIcon(context, phase === 'failed' ? 'mine' : 'exit', x + 24, y + 23, accent);
    context.fillStyle = '#f4f7ef';
    context.font = 'bold 20px system-ui';
    context.fillText(label, x + 50, y + 30);
  }

  private drawIconCard(context: CanvasRenderingContext2D, x: number, y: number, icon: 'safe' | 'flag' | 'target' | 'nearby', value: string, label: string, color: string): void {
    this.drawPanel(context, x, y, 204, 52, color, 0.1);
    this.drawIcon(context, icon, x + 26, y + 26, color, value);
    context.fillStyle = '#eefaff';
    context.font = 'bold 22px system-ui';
    context.fillText(value, x + 58, y + 24);
    context.fillStyle = '#8fa8b1';
    context.font = 'bold 12px system-ui';
    context.fillText(label, x + 60, y + 42);
  }

  private drawIcon(
    context: CanvasRenderingContext2D,
    icon: 'safe' | 'flag' | 'target' | 'nearby' | 'mine' | 'exit',
    x: number,
    y: number,
    color: string,
    value = '',
  ): void {
    context.save();
    context.translate(x, y);
    this.drawClassicTile(context, 0, 0, 34, icon !== 'safe' && icon !== 'nearby');

    if (icon === 'safe') {
      this.drawClassicNumber(context, 1, 0, 0);
    } else if (icon === 'flag' || icon === 'nearby') {
      if (icon === 'nearby') {
        const count = Number.parseInt(value, 10);
        this.drawClassicNumber(context, Number.isFinite(count) ? count : 0, 0, 0);
        context.restore();
        return;
      }

      context.strokeStyle = '#111';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(-7, -11);
      context.lineTo(-7, 11);
      context.stroke();
      context.fillStyle = '#e2141a';
      context.beginPath();
      context.moveTo(-6, -12);
      context.lineTo(12, -5);
      context.lineTo(-6, 1);
      context.closePath();
      context.fill();
      context.fillStyle = '#111';
      context.fillRect(-13, 10, 22, 5);
    } else if (icon === 'target') {
      context.fillStyle = '#111';
      context.font = 'bold 28px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('?', 0, 1);
    } else if (icon === 'mine') {
      this.drawClassicMine(context, 0, 0, 12);
    } else if (icon === 'exit') {
      context.fillStyle = '#32d17d';
      context.fillRect(-9, -12, 15, 24);
      context.strokeStyle = '#064d20';
      context.lineWidth = 3;
      context.strokeRect(-9, -12, 15, 24);
      context.fillStyle = '#f4f7ef';
      context.beginPath();
      context.moveTo(-1, -6);
      context.lineTo(11, 0);
      context.lineTo(-1, 6);
      context.closePath();
      context.fill();
      context.fillRect(-13, -2, 12, 4);
    }

    context.restore();
  }

  private drawClassicTile(context: CanvasRenderingContext2D, x: number, y: number, size: number, raised: boolean): void {
    const half = size / 2;
    context.fillStyle = raised ? '#c8c8c8' : '#bdbdbd';
    context.fillRect(x - half, y - half, size, size);
    context.lineWidth = 4;
    context.strokeStyle = raised ? '#f4f4f4' : '#777';
    context.beginPath();
    context.moveTo(x - half, y + half);
    context.lineTo(x - half, y - half);
    context.lineTo(x + half, y - half);
    context.stroke();
    context.strokeStyle = raised ? '#777' : '#f4f4f4';
    context.beginPath();
    context.moveTo(x + half, y - half);
    context.lineTo(x + half, y + half);
    context.lineTo(x - half, y + half);
    context.stroke();
    context.strokeStyle = '#444';
    context.lineWidth = 1;
    context.strokeRect(x - half, y - half, size, size);
  }

  private drawClassicNumber(context: CanvasRenderingContext2D, number: number, x: number, y: number): void {
    if (number <= 0) {
      return;
    }

    const colors = ['#0000d8', '#008000', '#d00000', '#000080', '#800000', '#008080', '#000000', '#808080'];
    context.fillStyle = colors[Math.min(number, 8) - 1];
    context.font = 'bold 28px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(Math.min(number, 8)), x, y + 1);
  }

  private drawClassicMine(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    context.strokeStyle = '#111';
    context.lineWidth = 5;
    for (let spikeIndex = 0; spikeIndex < 8; spikeIndex += 1) {
      const angle = (spikeIndex / 8) * Math.PI * 2;
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * radius * 0.5, y + Math.sin(angle) * radius * 0.5);
      context.lineTo(x + Math.cos(angle) * radius * 1.25, y + Math.sin(angle) * radius * 1.25);
      context.stroke();
    }
    context.fillStyle = '#111';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    const highlight = context.createRadialGradient(x - 5, y - 5, 1, x - 5, y - 5, 10);
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = highlight;
    context.beginPath();
    context.arc(x - 5, y - 5, 8, 0, Math.PI * 2);
    context.fill();
  }

  private drawXEye(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x - size, y - size);
    context.lineTo(x + size, y + size);
    context.moveTo(x + size, y - size);
    context.lineTo(x - size, y + size);
    context.stroke();
  }

  private drawSunglassLens(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    context.fillStyle = '#111';
    context.beginPath();
    context.ellipse(x, y, size, size * 0.62, -0.18, 0, Math.PI * 2);
    context.fill();
  }

  private drawPanel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, accent: string, alpha: number): void {
    context.fillStyle = 'rgba(2, 8, 11, 0.62)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.globalAlpha = alpha;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.globalAlpha = 1;
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