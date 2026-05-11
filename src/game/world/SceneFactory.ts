import * as THREE from 'three';
import { BOARD_DEPTH, BOARD_WIDTH, COLORS, EXIT_TILE, TILE_SIZE } from '../config';

export type SceneParts = {
  scene: THREE.Scene;
  exitDoor: THREE.Group;
  exitGlow: THREE.PointLight;
  alarmLight: THREE.PointLight;
};

export function createScene(): SceneParts {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07090a');
  scene.fog = new THREE.Fog('#07090a', 10, 28);

  const ambient = new THREE.HemisphereLight('#87b7ca', '#1c130d', 1.05);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#fff0d4', 2.6);
  keyLight.position.set(4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);

  const alarmLight = new THREE.PointLight('#ff4d2f', 0, 14, 2);
  alarmLight.position.set(0, 3.1, -1.4);
  scene.add(alarmLight);

  const exitGlow = new THREE.PointLight('#36ff96', 3.5, 10, 2);
  exitGlow.position.set((EXIT_TILE.x - (BOARD_WIDTH - 1) / 2) * TILE_SIZE, 1.8, -((BOARD_DEPTH - 1) / 2) * TILE_SIZE - 0.65);
  scene.add(exitGlow);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_WIDTH * TILE_SIZE + 5.2, 0.22, BOARD_DEPTH * TILE_SIZE + 5.8),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.82, metalness: 0.18 }),
  );
  floor.position.y = -0.18;
  floor.receiveShadow = true;
  scene.add(floor);

  addFloorRails(scene);
  addWalls(scene);
  addOverheadBeams(scene);
  addTrainingPanels(scene);

  const exitDoor = createExitDoor();
  scene.add(exitDoor);

  return { scene, exitDoor, exitGlow, alarmLight };
}

function addFloorRails(scene: THREE.Scene): void {
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#2c3337', roughness: 0.5, metalness: 0.58 });
  const railDepth = BOARD_DEPTH * TILE_SIZE + 3.8;
  const railWidth = BOARD_WIDTH * TILE_SIZE + 3.6;

  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, railDepth), railMaterial);
    rail.position.set(side * railWidth / 2, 0.05, 0);
    rail.castShadow = true;
    rail.receiveShadow = true;
    scene.add(rail);
  });
}

function addWalls(scene: THREE.Scene): void {
  const width = BOARD_WIDTH * TILE_SIZE + 5.2;
  const depth = BOARD_DEPTH * TILE_SIZE + 5.8;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.72, metalness: 0.35 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wallDark, roughness: 0.8, metalness: 0.28 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 0.48, metalness: 0.25 });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, 4.2, 0.28), wallMaterial);
  backWall.position.set(0, 1.9, -depth / 2);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.2, depth), wallMaterial);
  leftWall.position.set(-width / 2, 1.9, 0);
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = width / 2;
  scene.add(rightWall);

  for (let panelIndex = -4; panelIndex <= 4; panelIndex += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.65, 0.08), darkMaterial);
    panel.position.set(panelIndex * 1.45, 1.55, -depth / 2 + 0.18);
    scene.add(panel);

    if (panelIndex % 2 === 0) {
      const stripe = createHazardStripe(trimMaterial);
      stripe.position.set(panelIndex * 1.45 + 0.38, 1.55, -depth / 2 + 0.25);
      scene.add(stripe);
    }
  }

  [-1, 1].forEach((side) => {
    for (let panelIndex = -3; panelIndex <= 3; panelIndex += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.16), trimMaterial);
      rib.position.set(side * (width / 2 - 0.18), 1.75, panelIndex * 2.05);
      scene.add(rib);
    }
  });
}

function addOverheadBeams(scene: THREE.Scene): void {
  const beamMaterial = new THREE.MeshStandardMaterial({ color: '#20262a', roughness: 0.56, metalness: 0.55 });
  const width = BOARD_WIDTH * TILE_SIZE + 4.7;

  for (let beamIndex = -3; beamIndex <= 3; beamIndex += 1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.18), beamMaterial);
    beam.position.set(0, 3.82, beamIndex * 1.95);
    beam.castShadow = true;
    scene.add(beam);

    const light = new THREE.RectAreaLight('#b7e9ff', 1.4, width * 0.55, 0.08);
    light.position.set(0, 3.67, beamIndex * 1.95);
    light.rotation.x = -Math.PI / 2;
    scene.add(light);
  }
}

function addTrainingPanels(scene: THREE.Scene): void {
  const leftPanel = createTextPanel(['TRAINING FACILITY', 'SECTOR 7', '', 'CHECKPOINT: RESTORE', 'LEARN. ADAPT. ESCAPE.']);
  leftPanel.position.set(-6.05, 2.0, -3.9);
  leftPanel.rotation.y = Math.PI / 2;
  scene.add(leftPanel);

  const rightPanel = createTextPanel(['MAKE BETTER CHOICES', 'NEXT TIME.', '', 'ONLY DEDUCTION', 'LEADS TO ESCAPE.']);
  rightPanel.position.set(6.05, 2.0, -3.25);
  rightPanel.rotation.y = -Math.PI / 2;
  scene.add(rightPanel);
}

function createHazardStripe(material: THREE.Material): THREE.Group {
  const stripeGroup = new THREE.Group();

  for (let stripeIndex = 0; stripeIndex < 5; stripeIndex += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), material);
    stripe.position.y = (stripeIndex - 2) * 0.43;
    stripe.rotation.z = stripeIndex % 2 === 0 ? 0.34 : -0.34;
    stripeGroup.add(stripe);
  }

  return stripeGroup;
}

function createExitDoor(): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#333a3e', roughness: 0.45, metalness: 0.65 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: '#18211e', emissive: '#062814', roughness: 0.42, metalness: 0.46 });
  const signMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['EXIT'], '#ffcf75', 256, 96), transparent: true });

  const positionX = (EXIT_TILE.x - (BOARD_WIDTH - 1) / 2) * TILE_SIZE;
  const positionZ = -((BOARD_DEPTH - 1) / 2) * TILE_SIZE - 1.05;
  group.position.set(positionX, 0, positionZ);
  group.name = 'ExitDoor';

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.45, 3.2, 0.28), frameMaterial);
  frame.position.y = 1.45;
  group.add(frame);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.72, 2.55, 0.34), panelMaterial);
  door.position.set(0, 1.23, -0.03);
  door.name = 'ExitDoorPanel';
  group.add(door);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.42), signMaterial);
  sign.position.set(0, 3.18, 0.19);
  group.add(sign);

  return group;
}

function createTextPanel(lines: string[]): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const texture = createTextTexture(lines, '#f0a629', 512, 320);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.32), material);
}

function createTextTexture(lines: string[], color: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create text panel texture.');
  }

  context.fillStyle = 'rgba(2, 5, 6, 0.82)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(69, 188, 224, 0.38)';
  context.lineWidth = 4;
  context.strokeRect(6, 6, width - 12, height - 12);
  context.fillStyle = color;
  context.font = 'bold 32px system-ui';
  context.textAlign = 'left';
  context.textBaseline = 'top';

  lines.forEach((line, lineIndex) => {
    context.fillText(line, 30, 28 + lineIndex * 50);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}