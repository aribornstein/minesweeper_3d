import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type QuaternionTuple = [number, number, number, number];

export type FlagGripHandPose = {
  fistPosition: THREE.Vector3Tuple;
  fistQuaternion: QuaternionTuple;
  fistScale: number;
};

export const DEFAULT_FLAG_GRIP_HAND_POSE: FlagGripHandPose = {
  fistPosition: [0.105, 0.135, 0],
  fistQuaternion: [0, 0, 0, 1],
  fistScale: 1,
};

const gloveMaterial = new THREE.MeshStandardMaterial({
  color: '#080909',
  roughness: 0.58,
  metalness: 0.08,
  envMapIntensity: 0.55,
});
const gloveHighlightMaterial = new THREE.MeshStandardMaterial({
  color: '#151819',
  roughness: 0.52,
  metalness: 0.08,
  envMapIntensity: 0.65,
});
const cuffMaterial = new THREE.MeshStandardMaterial({
  color: '#050606',
  roughness: 0.78,
  metalness: 0.04,
  envMapIntensity: 0.32,
});

function createGripTube(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const finger = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, radius, 10, false), material);
  finger.castShadow = true;
  return finger;
}

function createCurledFinger(y: number, index: number): THREE.Mesh {
  const radius = 0.017 - index * 0.0008;
  return createGripTube(
    [
      new THREE.Vector3(0.066, y, -0.042),
      new THREE.Vector3(0.036, y + 0.002, 0.014),
      new THREE.Vector3(-0.008, y + 0.001, 0.058),
      new THREE.Vector3(-0.056, y - 0.001, 0.032),
      new THREE.Vector3(-0.044, y - 0.002, -0.02),
    ],
    radius,
    gloveMaterial,
  );
}

function createKnucklePad(x: number, y: number, z: number, width: number, height = 0.028): THREE.Mesh {
  const knuckle = new THREE.Mesh(new RoundedBoxGeometry(width, height, 0.026, 4, 0.011), gloveHighlightMaterial);
  knuckle.position.set(x, y, z);
  knuckle.rotation.set(0.02, -0.2, -0.08);
  knuckle.castShadow = true;
  return knuckle;
}

function createPoleGripCluster(): THREE.Group {
  const grip = new THREE.Group();
  grip.name = 'ClosedFistMesh';

  const palmBack = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.19, 0.092, 6, 0.04), gloveMaterial);
  palmBack.position.set(0.072, -0.006, -0.05);
  palmBack.rotation.set(0.05, -0.2, -0.08);
  palmBack.castShadow = true;
  grip.add(palmBack);

  const palmHeel = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.076, 0.088, 5, 0.032), gloveMaterial);
  palmHeel.position.set(0.07, -0.112, -0.045);
  palmHeel.rotation.set(0.05, -0.12, -0.16);
  palmHeel.castShadow = true;
  grip.add(palmHeel);

  const fingerYs = [0.066, 0.027, -0.012, -0.05];
  fingerYs.forEach((y, index) => {
    grip.add(createCurledFinger(y, index));
    grip.add(createKnucklePad(0.054 - index * 0.003, y + 0.002, -0.004, 0.056 - index * 0.002));
  });

  const fingerBackBridge = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.17, 0.032, 4, 0.014), gloveMaterial);
  fingerBackBridge.position.set(0.046, 0.006, -0.012);
  fingerBackBridge.rotation.set(0.04, -0.18, -0.07);
  fingerBackBridge.castShadow = true;
  grip.add(fingerBackBridge);

  grip.add(
    createGripTube(
      [
        new THREE.Vector3(0.078, -0.058, -0.05),
        new THREE.Vector3(0.044, -0.028, 0.02),
        new THREE.Vector3(-0.006, 0.002, 0.076),
        new THREE.Vector3(-0.07, 0.026, 0.034),
      ],
      0.021,
      gloveMaterial,
    ),
  );

  const thumbPad = new THREE.Mesh(new RoundedBoxGeometry(0.076, 0.04, 0.044, 4, 0.017), gloveHighlightMaterial);
  thumbPad.position.set(-0.044, 0.02, 0.058);
  thumbPad.rotation.set(0.14, -0.28, 0.44);
  thumbPad.castShadow = true;
  grip.add(thumbPad);

  const thumbFace = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.115, 10, 18), gloveHighlightMaterial);
  thumbFace.position.set(-0.014, -0.008, 0.082);
  thumbFace.rotation.set(0.16, -0.28, 0.9);
  thumbFace.scale.set(1, 0.96, 0.92);
  thumbFace.castShadow = true;
  grip.add(thumbFace);

  const wristBridge = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.12, 5, 0.036), cuffMaterial);
  wristBridge.position.set(0.075, -0.165, -0.04);
  wristBridge.rotation.set(0.02, -0.1, -0.08);
  wristBridge.castShadow = true;
  grip.add(wristBridge);

  return grip;
}

export function applyFlagGripHandPose(hand: THREE.Object3D, pose: FlagGripHandPose): void {
  hand.userData.flagGripHandPose = pose;
  const fist = hand.getObjectByName('ClosedFistMesh');
  if (!fist) return;

  fist.position.set(...pose.fistPosition);
  fist.quaternion.set(...pose.fistQuaternion).normalize();
  fist.scale.setScalar(pose.fistScale);
}

export function createFlagGripHand(initialPose: FlagGripHandPose = DEFAULT_FLAG_GRIP_HAND_POSE): THREE.Group {
  const hand = new THREE.Group();
  hand.name = 'FlagGripHand';
  hand.userData.flagGripHandPose = initialPose;

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.5, 24), cuffMaterial);
  sleeve.position.set(0.08, -0.35, -0.04);
  sleeve.rotation.set(0.02, -0.1, 0.34);
  sleeve.castShadow = true;
  hand.add(sleeve);

  const cuffBand = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.1, 0.18, 5, 0.035), cuffMaterial);
  cuffBand.position.set(0.035, -0.12, -0.02);
  cuffBand.rotation.set(0.03, -0.1, 0.08);
  cuffBand.castShadow = true;
  hand.add(cuffBand);

  hand.add(createPoleGripCluster());
  applyFlagGripHandPose(hand, initialPose);

  return hand;
}