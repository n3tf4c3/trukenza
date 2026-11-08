import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';
import type { CharacterId } from '@trukenza/shared';

/**
 * Peças articuladas dos personagens, modeladas no Blender (`assets/blender/personagens.py`) e exportadas
 * em `public/modelos/personagens.glb`. Cada peça nasce no seu ponto de giro; o `Character` só as encaixa
 * nos grupos que já anima.
 */

export const PERSONAGENS_URL = '/modelos/personagens.glb?v=sinais-1';
const DRACO = '/draco/';

/** Raio da cabeça de cada um (o mesmo do script do Blender): posiciona cabeça, olhos e etiqueta. */
export const HEAD_RADIUS: Record<CharacterId, number> = { neymt: 0.22, presuntinho: 0.25, moleti: 0.22, baiaca: 0.22, luistesoura: 0.23, sardinha: 0.235, gordodofusca: 0.25, tiba: 0.23, negon: 0.30 };

/** Pivôs acompanham a largura de cada corpo, iguais aos da prévia Blender. */
export const SHOULDER_X = (id: CharacterId) => id === 'gordodofusca' ? 0.35 : id === 'negon' ? 0.23 : 0.27;
export const HIP_X = (id: CharacterId) => id === 'gordodofusca' ? 0.14 : id === 'negon' ? 0.09 : 0.11;

export interface CharacterParts {
  tronco: THREE.Object3D;
  cabeca: THREE.Object3D;
  olhos: [THREE.Object3D, THREE.Object3D];
  sobrancelhas: THREE.Object3D;
  boca: THREE.Object3D;
  nariz: THREE.Object3D;
  abertura: THREE.Object3D;
  braco: [THREE.Object3D, THREE.Object3D];
  coxa: [THREE.Object3D, THREE.Object3D];
  canela: [THREE.Object3D, THREE.Object3D];
}

/** Clones das peças deste personagem (geometria e materiais compartilhados entre todos os bonecos). */
export function useCharacterParts(character: CharacterId): CharacterParts {
  const gltf = useGLTF(PERSONAGENS_URL, DRACO);
  return useMemo(() => {
    const take = (part: string) => {
      const src = gltf.scene.getObjectByName(`${character}_${part}`);
      if (!src) throw new Error(`peça ausente no modelo: ${character}_${part}`);
      const copy = src.clone();
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      return copy;
    };
    return {
      tronco: take('tronco'),
      cabeca: take('cabeca'),
      olhos: [take('olho_esq'), take('olho_dir')],
      sobrancelhas: take('sobrancelhas'),
      boca: take('boca'),
      nariz: take('nariz'),
      abertura: take('abertura'),
      braco: [take('braco'), take('braco')],
      coxa: [take('coxa'), take('coxa')],
      canela: [take('canela'), take('canela')],
    };
  }, [gltf, character]);
}

useGLTF.preload(PERSONAGENS_URL, DRACO);
