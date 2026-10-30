import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  brickMaps,
  burlapMaps,
  ceilingMaps,
  floorMaps,
  skyTexture,
  strawMaps,
  tableTopMaps,
  whitewashMaps,
  woodMaps,
  type SurfaceMaps,
} from './bolichoTextures';

/**
 * O bolicho gaúcho, modelado no Blender (`assets/blender/bolicho.py`) e exportado em
 * `public/modelos/bolicho.glb`: `cenario` (sala, balcão, mesa, decoração, com sombra assada nos
 * vértices), `brilhos` (lampiões, fogo, céu) e `cadeira`. As texturas entram aqui pelo nome do material.
 */

export const BOLICHO_URL = '/modelos/bolicho.glb';
const DRACO = '/draco/';

/** Onde estão as fontes de luz no modelo (mesmas medidas do script do Blender). */
export const LAMP = new THREE.Vector3(0, 2.5, 0);
export const COUNTER_LAMP = new THREE.Vector3(-1.6, 1.25, -4.55);
export const FIRE = new THREE.Vector3(0, 0.55, 5.3);

const SURFACES: Record<string, { maps: () => SurfaceMaps; bump: number }> = {
  piso: { maps: floorMaps, bump: 0.6 },
  parede: { maps: whitewashMaps, bump: 0.8 },
  tijolo: { maps: brickMaps, bump: 1.2 },
  forro: { maps: ceilingMaps, bump: 0.5 },
  madeira: { maps: woodMaps, bump: 0.35 },
  madeira_escura: { maps: woodMaps, bump: 0.35 },
  tampo: { maps: tableTopMaps, bump: 0.25 },
  palha: { maps: strawMaps, bump: 1.5 },
  saco: { maps: burlapMaps, bump: 0.8 },
  poncho: { maps: burlapMaps, bump: 0.6 },
};

/** Põe textura e relevo pelo nome do material, uma vez por material (os clones compartilham). */
function dress(root: THREE.Object3D, shadows: { cast: boolean; receive: boolean }): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial;
      if (mat.userData.dressed) continue;
      mat.userData.dressed = true;
      const surface = SURFACES[mat.name];
      if (surface) {
        const { map, bump } = surface.maps();
        mat.map = map;
        mat.bumpMap = bump;
        mat.bumpScale = surface.bump;
        mat.needsUpdate = true;
      }
      if (mat.name === 'ceu') {
        // Degradê do céu pela altura (UV em metros, do chão até 2,6 m), sem repetir.
        const sky = skyTexture();
        sky.wrapT = THREE.ClampToEdgeWrapping;
        sky.repeat.set(1, 1 / 2.6);
        mat.map = sky;
        mat.emissiveMap = sky;
        mat.emissive.set('#ffffff');
        mat.emissiveIntensity = 1.25;
        mat.needsUpdate = true;
      }
      if (mat.name.startsWith('vidro')) {
        // Garrafas: brilho de vidro com reflexo do ambiente.
        mat.envMapIntensity = 1.6;
      }
    }
  });
}

export function useBolicho() {
  const gltf = useGLTF(BOLICHO_URL, DRACO);
  return useMemo(() => {
    const cenario = gltf.scene.getObjectByName('cenario')!;
    const brilhos = gltf.scene.getObjectByName('brilhos')!;
    const cadeira = gltf.scene.getObjectByName('cadeira')!;
    dress(cenario, { cast: true, receive: true });
    dress(brilhos, { cast: false, receive: false });
    dress(cadeira, { cast: true, receive: true });
    return { cenario, brilhos, cadeira };
  }, [gltf]);
}

/** O cenário fixo e o que brilha. O fogo tremula; os lampiões respiram de leve. */
export function Bolicho() {
  const { cenario, brilhos } = useBolicho();
  const flames = useMemo(() => {
    const list: THREE.MeshStandardMaterial[] = [];
    brilhos.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && (m.name === 'chama' || m.name === 'lampiao_vidro') && !list.includes(m)) list.push(m);
    });
    return list;
  }, [brilhos]);
  const base = useMemo(() => flames.map((m) => m.emissiveIntensity), [flames]);
  useEffect(() => () => flames.forEach((m, i) => (m.emissiveIntensity = base[i]!)), [flames, base]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flames.forEach((m, i) => {
      const fire = m.name === 'chama';
      const wobble = fire ? 0.75 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) : 0.95 + 0.05 * Math.sin(t * 2.3);
      m.emissiveIntensity = base[i]! * wobble;
    });
  });
  return (
    <>
      <primitive object={cenario} />
      <primitive object={brilhos} />
    </>
  );
}

/** Uma cadeira de palha nova (clone com geometria e materiais compartilhados). */
export function useChairModel(): THREE.Object3D {
  const { cadeira } = useBolicho();
  return useMemo(() => cadeira.clone(), [cadeira]);
}

useGLTF.preload(BOLICHO_URL, DRACO);
