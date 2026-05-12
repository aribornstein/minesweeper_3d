import * as THREE from 'three';

type FlagModelOptions = {
  withBase?: boolean;
  scale?: number;
};

export function createFlagModel({ withBase = true, scale = 1 }: FlagModelOptions = {}): THREE.Group {
  const flag = new THREE.Group();
  flag.userData.kind = 'flag';
  flag.scale.setScalar(scale);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.92, 16),
    new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.55 }),
  );
  pole.position.y = 0.46;
  pole.castShadow = true;
  flag.add(pole);

  const clothShape = new THREE.Shape();
  clothShape.moveTo(0, 0);
  clothShape.lineTo(0.42, -0.16);
  clothShape.lineTo(0, -0.32);
  clothShape.lineTo(0, 0);
  const cloth = new THREE.Mesh(
    new THREE.ShapeGeometry(clothShape),
    new THREE.MeshStandardMaterial({ color: '#d92121', roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide }),
  );
  cloth.position.set(0.022, 0.9, 0);
  cloth.castShadow = true;
  flag.add(cloth);

  if (withBase) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.18),
      new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6, metalness: 0.4 }),
    );
    base.position.y = 0.025;
    base.castShadow = true;
    flag.add(base);
  }

  return flag;
}
