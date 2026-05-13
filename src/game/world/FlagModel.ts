import * as THREE from 'three';

type FlagModelOptions = {
  withBase?: boolean;
  scale?: number;
};

type ClothUserData = {
  basePositions: Float32Array;
  phase: number;
  amplitude: number;
  age: number;
  plantStrength: number;
};

const FLAG_WIDTH = 0.48;
const FLAG_HEIGHT = 0.34;
const FLAG_SEGMENTS_X = 6;
const FLAG_SEGMENTS_Y = 4;

const poleGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.92, 16);
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.55 });
const baseGeometry = new THREE.BoxGeometry(0.18, 0.05, 0.18);
const baseMaterial = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6, metalness: 0.4 });
poleMaterial.userData.shared = true;
baseMaterial.userData.shared = true;
const clothMaterial = new THREE.MeshStandardMaterial({
  color: '#d92f2f',
  roughness: 0.74,
  metalness: 0.01,
  side: THREE.DoubleSide,
  normalMap: createFlagNormalTexture(),
  normalScale: new THREE.Vector2(0.12, 0.08),
});
clothMaterial.userData.shared = true;

export function createFlagModel({ withBase = true, scale = 1 }: FlagModelOptions = {}): THREE.Group {
  const flag = new THREE.Group();
  flag.userData.kind = 'flag';
  flag.userData.flagPhase = Math.random() * Math.PI * 2;
  flag.scale.setScalar(scale);

  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.y = 0.46;
  pole.castShadow = true;
  pole.userData.shared = true;
  flag.add(pole);

  const clothGeometry = createFlagClothGeometry();
  const cloth = new THREE.Mesh(clothGeometry, clothMaterial);
  cloth.name = 'ProceduralFlagCloth';
  cloth.position.set(0, 0.9 - FLAG_HEIGHT / 2, 0);
  cloth.castShadow = true;
  cloth.userData.flagCloth = true;
  cloth.userData.cloth = {
    basePositions: new Float32Array(clothGeometry.attributes.position.array as Float32Array),
    phase: flag.userData.flagPhase as number,
    amplitude: 0.72 + Math.random() * 0.42,
    age: 0,
    plantStrength: 1,
  } satisfies ClothUserData;
  flag.add(cloth);

  if (withBase) {
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.025;
    base.castShadow = true;
    base.userData.shared = true;
    flag.add(base);
  }

  updateFlagModel(flag, 0);
  return flag;
}

export function updateFlagModel(flag: THREE.Object3D, delta: number): void {
  let clothMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> | undefined;
  let clothData: ClothUserData | undefined;

  flag.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.flagCloth && !clothMesh) {
      clothMesh = child;
      clothData = child.userData.cloth as ClothUserData;
    }
  });

  if (!clothMesh || !clothData) {
    return;
  }

  clothData.age += delta;
  const position = clothMesh.geometry.attributes.position as THREE.BufferAttribute;
  const positions = position.array as Float32Array;
  const base = clothData.basePositions;
  const plantLag = Math.exp(-clothData.age * 4.8) * Math.sin(clothData.age * 15.5) * clothData.plantStrength;
  const settle = 1 - Math.exp(-clothData.age * 5.5);

  for (let index = 0; index < positions.length; index += 3) {
    const baseX = base[index];
    const baseY = base[index + 1];
    const weight = THREE.MathUtils.clamp(baseX / FLAG_WIDTH, 0, 1);

    if (weight < 0.001) {
      positions[index] = baseX;
      positions[index + 1] = baseY;
      positions[index + 2] = base[index + 2];
      continue;
    }

    const fold = Math.sin(clothData.age * 2.8 + clothData.phase + baseX * 12.0 + baseY * 5.0);
    const ripple = Math.sin(clothData.age * 5.2 + clothData.phase * 0.7 + baseX * 21.0);
    const edgeWeight = Math.pow(weight, 1.25);
    positions[index] = baseX - Math.sin(clothData.age * 1.9 + clothData.phase + baseY * 7.0) * 0.018 * edgeWeight;
    positions[index + 1] = baseY - 0.052 * Math.pow(weight, 1.45) * settle + plantLag * 0.045 * edgeWeight;
    positions[index + 2] = (fold * 0.035 + ripple * 0.014 + plantLag * 0.12) * edgeWeight * clothData.amplitude;
  }

  position.needsUpdate = true;
  clothMesh.geometry.computeVertexNormals();
}

function createFlagClothGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT, FLAG_SEGMENTS_X, FLAG_SEGMENTS_Y);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const positions = position.array as Float32Array;

  for (let index = 0; index < positions.length; index += 3) {
    const normalizedX = (positions[index] + FLAG_WIDTH / 2) / FLAG_WIDTH;
    const pinY = positions[index + 1];
    const tipY = 0;
    positions[index] = normalizedX * FLAG_WIDTH;
    positions[index + 1] = THREE.MathUtils.lerp(pinY, tipY, normalizedX);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createFlagNormalTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create flag normal texture.');
  }

  context.fillStyle = 'rgb(128, 128, 255)';
  context.fillRect(0, 0, size, size);
  context.strokeStyle = 'rgba(104, 128, 255, 0.55)';
  context.lineWidth = 3;
  for (let x = 18; x < size; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x + 10, size * 0.28, x - 8, size * 0.62, x + 8, size);
    context.stroke();
  }
  context.strokeStyle = 'rgba(152, 132, 255, 0.3)';
  context.lineWidth = 2;
  for (let y = 18; y < size; y += 28) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y + Math.sin(y) * 4);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}