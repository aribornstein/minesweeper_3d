import * as THREE from 'three';
import { COLORS } from '../config';

type BlastParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  drag: number;
  gravity: number;
  fadeStart: number;
  kind: 'spark' | 'debris' | 'smoke';
};

type Blast = {
  group: THREE.Group;
  light: THREE.PointLight;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  scorch: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  shockwaves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  particles: BlastParticle[];
  elapsed: number;
  duration: number;
};

export class Effects {
  private readonly blasts: Blast[] = [];
  private triggeredBlastCount = 0;

  constructor(private readonly scene: THREE.Scene) {}

  get activeBlastCount(): number {
    return this.blasts.length;
  }

  get totalTriggeredBlastCount(): number {
    return this.triggeredBlastCount;
  }

  triggerMineBlast(position: THREE.Vector3): void {
    this.triggeredBlastCount += 1;
    const group = new THREE.Group();
    group.position.copy(position);
    group.position.y = 0.18;
    group.name = 'MineExplosionEffect';

    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 48),
      new THREE.MeshBasicMaterial({ color: '#150604', transparent: true, opacity: 0.86, depthWrite: false }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.04;
    group.add(scorch);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 32, 20),
      new THREE.MeshBasicMaterial({ color: COLORS.alarm, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    core.position.y = 0.45;
    group.add(core);

    const shockwaves = this.createShockwaves(group);

    const light = new THREE.PointLight('#ff4b2f', 75, 9, 2);
    light.position.y = 1.1;
    group.add(light);

    const particles = [
      ...this.createSparkParticles(group),
      ...this.createDebrisParticles(group),
      ...this.createSmokeParticles(group),
    ];
    this.scene.add(group);
    this.blasts.push({ group, light, core, scorch, shockwaves, particles, elapsed: 0, duration: 2.8 });
  }

  update(delta: number): void {
    for (let blastIndex = this.blasts.length - 1; blastIndex >= 0; blastIndex -= 1) {
      const blast = this.blasts[blastIndex];
      blast.elapsed += delta;
      const progress = Math.min(blast.elapsed / blast.duration, 1);
      const fade = 1 - progress;

      blast.core.scale.setScalar(1 + progress * 4.8);
      blast.core.material.opacity = Math.max(0, 1 - progress * 3.2);
      blast.scorch.scale.setScalar(1 + Math.min(progress * 1.3, 1));
      blast.scorch.material.opacity = 0.62 * Math.max(0, 1 - progress * 0.38);
      blast.light.intensity = 75 * Math.max(0, 1 - progress * 2.4);

      blast.shockwaves.forEach((shockwave, shockwaveIndex) => {
        const offsetProgress = THREE.MathUtils.clamp((progress - shockwaveIndex * 0.1) / 0.55, 0, 1);
        const scale = 0.35 + offsetProgress * (3.2 + shockwaveIndex * 0.9);
        shockwave.visible = offsetProgress > 0 && offsetProgress < 1;
        shockwave.scale.setScalar(scale);
        shockwave.material.opacity = Math.max(0, 0.88 * (1 - offsetProgress));
      });

      blast.particles.forEach((particle) => {
        particle.velocity.multiplyScalar(Math.max(0, 1 - particle.drag * delta));
        particle.velocity.y -= particle.gravity * delta;
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.mesh.rotation.x += particle.spin.x * delta;
        particle.mesh.rotation.y += particle.spin.y * delta;
        particle.mesh.rotation.z += particle.spin.z * delta;
        this.updateParticleMaterial(particle, progress);
      });

      if (progress >= 1) {
        this.scene.remove(blast.group);
        this.disposeBlast(blast);
        this.blasts.splice(blastIndex, 1);
      }
    }
  }

  private createShockwaves(group: THREE.Group): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] {
    const shockwaves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];

    for (let shockwaveIndex = 0; shockwaveIndex < 3; shockwaveIndex += 1) {
      const shockwave = new THREE.Mesh(
        new THREE.RingGeometry(0.32 + shockwaveIndex * 0.08, 0.48 + shockwaveIndex * 0.1, 72),
        new THREE.MeshBasicMaterial({
          color: shockwaveIndex === 0 ? '#fff1a7' : '#ff6b35',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      shockwave.rotation.x = -Math.PI / 2;
      shockwave.position.y = 0.09 + shockwaveIndex * 0.025;
      shockwave.visible = false;
      group.add(shockwave);
      shockwaves.push(shockwave);
    }

    return shockwaves;
  }

  private createSparkParticles(group: THREE.Group): BlastParticle[] {
    const particles: BlastParticle[] = [];
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffd66b', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

    for (let particleIndex = 0; particleIndex < 54; particleIndex += 1) {
      const spark = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.22 + Math.random() * 0.2), sparkMaterial.clone());
      const angle = Math.random() * Math.PI * 2;
      const speed = 4.5 + Math.random() * 5.5;
      const lift = 1.8 + Math.random() * 3.8;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, lift, Math.sin(angle) * speed);
      const spin = new THREE.Vector3(Math.random() * 18, Math.random() * 18, Math.random() * 18);
      spark.position.set(Math.cos(angle) * 0.1, 0.38 + Math.random() * 0.25, Math.sin(angle) * 0.1);
      spark.lookAt(spark.position.clone().add(velocity));
      group.add(spark);
      particles.push({ mesh: spark, velocity, spin, drag: 2.2, gravity: 6.6, fadeStart: 0.08, kind: 'spark' });
    }

    return particles;
  }

  private createDebrisParticles(group: THREE.Group): BlastParticle[] {
    const particles: BlastParticle[] = [];
    const shardMaterial = new THREE.MeshStandardMaterial({ color: '#3b3430', roughness: 0.68, metalness: 0.48 });

    for (let particleIndex = 0; particleIndex < 34; particleIndex += 1) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 + Math.random() * 0.08, 0.035 + Math.random() * 0.04, 0.12 + Math.random() * 0.2),
        shardMaterial.clone(),
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.2 + Math.random() * 3.6;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 1.3 + Math.random() * 2.8, Math.sin(angle) * speed);
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      shard.position.set(Math.cos(angle) * 0.16, 0.16, Math.sin(angle) * 0.16);
      shard.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(shard);
      particles.push({ mesh: shard, velocity, spin, drag: 0.72, gravity: 5.1, fadeStart: 0.38, kind: 'debris' });
    }

    return particles;
  }

  private createSmokeParticles(group: THREE.Group): BlastParticle[] {
    const particles: BlastParticle[] = [];
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#261814', transparent: true, opacity: 0.38, depthWrite: false });

    for (let particleIndex = 0; particleIndex < 24; particleIndex += 1) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.16, 12, 8), smokeMaterial.clone());
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.35 + Math.random() * 1.1;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 0.7 + Math.random() * 1.4, Math.sin(angle) * speed);
      const spin = new THREE.Vector3(Math.random() * 0.8, Math.random() * 0.8, Math.random() * 0.8);
      smoke.position.set(Math.cos(angle) * 0.24, 0.32 + Math.random() * 0.24, Math.sin(angle) * 0.24);
      group.add(smoke);
      particles.push({ mesh: smoke, velocity, spin, drag: 0.28, gravity: -0.08, fadeStart: 0.18, kind: 'smoke' });
    }

    return particles;
  }

  private updateParticleMaterial(particle: BlastParticle, progress: number): void {
    const fadeProgress = THREE.MathUtils.clamp((progress - particle.fadeStart) / (1 - particle.fadeStart), 0, 1);
    const opacity = Math.max(0, 1 - fadeProgress);
    const material = particle.mesh.material;

    if (particle.kind === 'smoke') {
      particle.mesh.scale.multiplyScalar(1.015);
    } else {
      particle.mesh.scale.setScalar(Math.max(0.08, opacity));
    }

    if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial) {
      material.transparent = true;
      material.opacity = particle.kind === 'smoke' ? 0.34 * opacity : opacity;
    }
  }

  private disposeBlast(blast: Blast): void {
    blast.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
      }
    });
  }
}