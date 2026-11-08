import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const TREES = {
  japao: [[-5, -4], [5, -4], [-6, 4], [6, 5], [-8, -10], [8, -9]],
  fuji: [[-6, -3], [6, -3], [-7, 6], [7, 6]],
  parque: [[-8, 0], [8, 0], [-6, -6], [6, -6]],
  paris: [[-5, -6], [5, -6]],
} as const;
export type PetalScenery = keyof typeof TREES;

/** Uma única chamada de desenho; folhas caem junto às árvores, fora da mesa. */
export function Petalas({ scenery }: { scenery: PetalScenery }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const trees = TREES[scenery];
  const pink = scenery === 'japao' || scenery === 'fuji';
  const count = trees.length * 6;
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const tree = trees[i % trees.length]!;
      const phase = (t * (0.065 + (i % 3) * 0.008) + i * 0.618) % 1;
      const a = i * 2.399;
      scratch.position.set(
        tree[0] + Math.cos(a) * 0.85 + Math.sin(t * 0.6 + i) * 0.35 + phase * 0.35,
        0.06 + (1 - phase) * 3.2,
        tree[1] + Math.sin(a) * 0.85 + Math.cos(t * 0.45 + i) * 0.25,
      );
      scratch.rotation.set(t * 0.7 + i, a + t * 0.45, Math.sin(t + i) * 0.8);
      const size = Math.min(1, phase * 12, (1 - phase) * 12);
      scratch.scale.set(0.065 * size, (pink ? 0.04 : 0.075) * size, 1);
      scratch.updateMatrix();
      mesh.current.setMatrixAt(i, scratch.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <circleGeometry args={[1, 5]} />
    <meshStandardMaterial color={pink ? '#f7bfd4' : '#d8b665'} roughness={0.9} side={THREE.DoubleSide} />
  </instancedMesh>;
}
