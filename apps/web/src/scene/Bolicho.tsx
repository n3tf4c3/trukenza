import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PHRASES } from '@trukenza/shared';
import { useStore } from '../store';
import { CHAIR_RADIUS, polar, seatAngle } from './layout';
import { barkeepPose, barkeepYaw, dogPose, dogYaw } from './figurantes';
import { addRim, finishSurface } from './acabamento';
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
 * `public/modelos/bolicho.glb`: `cenario` (sala, balcão, mesa, petiscos, decoração, com sombra assada nos
 * vértices), `brilhos` (lampiões, fogo, céu), `cadeira`, `copo` e os figurantes (bolicheiro e cachorro, em
 * peças com o giro na origem). As texturas entram aqui pelo nome do material.
 */

export const BOLICHO_URL = '/modelos/bolicho.glb?v=figurantes-1';
const DRACO = '/draco/';

/** Onde estão as fontes de luz no modelo (mesmas medidas do script do Blender). */
export const LAMP = new THREE.Vector3(0, 2.5, 0);
export const COUNTER_LAMP = new THREE.Vector3(-1.6, 1.25, -4.55);
export const FIRE = new THREE.Vector3(0, 0.55, 5.3);

/** Bolicheiro e cachorro ganham a mesma contraluz dos personagens da mesa. */
const FIGURE_SKIN = new Set(['pelo_caramelo', 'pelo_claro', 'pele', 'camisa', 'avental', 'lenco', 'chapeu', 'bombacha']);

const SURFACES: Record<string, { maps: () => SurfaceMaps; bump: number }> = {
  piso: { maps: floorMaps, bump: 0.018 },
  parede: { maps: whitewashMaps, bump: 0.025 },
  tijolo: { maps: brickMaps, bump: 0.035 },
  forro: { maps: ceilingMaps, bump: 0.012 },
  madeira: { maps: woodMaps, bump: 0.008 },
  madeira_escura: { maps: woodMaps, bump: 0.008 },
  tampo: { maps: tableTopMaps, bump: 0.006 },
  palha: { maps: strawMaps, bump: 0.025 },
  saco: { maps: burlapMaps, bump: 0.012 },
  poncho: { maps: burlapMaps, bump: 0.008 },
};

/** Põe textura e relevo pelo nome do material, uma vez por material (os clones compartilham). */
export function dress(root: THREE.Object3D, shadows: { cast: boolean; receive: boolean }): void {
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
      // Brilho de verniz, vidro, metal e louça, com reflexo do ambiente.
      finishSurface(mat);
      if (FIGURE_SKIN.has(mat.name)) addRim(mat, '#ffe6c4', 0.3);
    }
  });
}

export function useBolicho() {
  const gltf = useGLTF(BOLICHO_URL, DRACO);
  return useMemo(() => {
    // Os primitives passam a pertencer à cena R3F; o índice do GLTF continua estável ao remontar.
    const cenario = gltf.nodes.cenario!;
    const brilhos = gltf.nodes.brilhos!;
    const cadeira = gltf.nodes.cadeira!;
    const copo = gltf.nodes.copo!;
    dress(cenario, { cast: true, receive: true });
    dress(brilhos, { cast: false, receive: false });
    dress(cadeira, { cast: true, receive: true });
    dress(copo, { cast: true, receive: false });
    return { cenario, brilhos, cadeira, copo };
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
      <Figurantes />
    </>
  );
}

/** Uma cadeira de palha nova (clone com geometria e materiais compartilhados). */
export function useChairModel(): THREE.Object3D {
  const { cadeira } = useBolicho();
  return useMemo(() => cadeira.clone(), [cadeira]);
}

/** Um copo de cerveja (clone com geometria e materiais compartilhados), um por lugar da mesa e outro na mão. */
export function useCupModel(): THREE.Object3D {
  const { copo } = useBolicho();
  return useMemo(() => copo.clone(), [copo]);
}

useGLTF.preload(BOLICHO_URL, DRACO);

const FIGURE_NODES = ['bolicheiro', 'bolicheiro_braco', 'bolicheiro_cabeca', 'cachorro', 'cachorro_cabeca', 'cachorro_rabo'] as const;

/**
 * O bolicheiro seca o copo atrás do balcão e olha para quem grita ou fala; acena quando pedem uma gelada.
 * O cachorro cochila na lareira, ergue a cabeça de vez em quando e fica alerta num canto, abanando o rabo.
 * Só reagem ao que é público (gritos e falas); o sorteio é local, como os gestos ociosos dos personagens.
 */
function Figurantes() {
  const gltf = useGLTF(BOLICHO_URL, DRACO);
  const parts = useMemo(() => {
    const nodes = Object.fromEntries(FIGURE_NODES.map((name) => [name, gltf.nodes[name]!])) as Record<(typeof FIGURE_NODES)[number], THREE.Object3D>;
    for (const node of Object.values(nodes)) dress(node, { cast: true, receive: true });
    // Rosto do bolicheiro: gira para os lados e depois inclina, sem entortar o pescoço.
    nodes.bolicheiro_cabeca.rotation.order = 'YXZ';
    return nodes;
  }, [gltf]);
  const mind = useRef({
    shout: 0, dogAlertUntil: 0, dogLookUntil: 0, nextDogLook: 10, alert: 0, dogYaw: 0,
    look: [0, 0] as [number, number], lookUntil: 0, nextGlance: 5, nodAt: -9, attention: 0, barkYaw: 0,
  });
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    const m = mind.current;
    const { shouts, speaking, table } = useStore.getState();
    const seatAt = (seat: number): [number, number] => {
      const [x, , z] = polar(seatAngle(seat, table?.seatCount ?? 2), CHAIR_RADIUS);
      return [x, z];
    };
    const last = shouts.at(-1);
    if (last && last.id !== m.shout) {
      m.shout = last.id;
      if (last.big) m.dogAlertUntil = t + 3.5;
      m.look = seatAt(last.seat);
      m.lookUntil = t + (last.big ? 3 : 2);
      if (last.text === PHRASES.gelada.text) m.nodAt = t + 0.4;
    }
    if (speaking) {
      m.look = seatAt(speaking.seat);
      m.lookUntil = Math.max(m.lookUntil, t + 0.6);
    }
    if (t > m.nextDogLook) {
      m.dogLookUntil = t + 2.5;
      m.nextDogLook = t + 12 + Math.random() * 18;
    }
    if (t > m.nextGlance) {
      if (t > m.lookUntil) {
        m.look = [0, 0];
        m.lookUntil = t + 2;
      }
      m.nextGlance = t + 6 + Math.random() * 8;
    }
    const alertTarget = t < m.dogAlertUntil ? 1 : t < m.dogLookUntil ? 0.6 : 0;
    m.alert = THREE.MathUtils.damp(m.alert, alertTarget, 3, dt);
    m.dogYaw = THREE.MathUtils.damp(m.dogYaw, alertTarget ? dogYaw([0, 0]) * (alertTarget < 1 ? 0.5 : 1) : 0, 2.5, dt);
    const dog = dogPose(t, m.alert);
    parts.cachorro.scale.y = dog.breath;
    parts.cachorro_cabeca.rotation.set(0, m.dogYaw, dog.pitch);
    parts.cachorro_rabo.rotation.set(0, dog.tailWag, dog.tailLift);

    const attending = t < m.lookUntil;
    m.attention = THREE.MathUtils.damp(m.attention, attending ? 1 : 0, 4, dt);
    m.barkYaw = THREE.MathUtils.damp(m.barkYaw, attending ? barkeepYaw(m.look) : 0, 4, dt);
    const bar = barkeepPose(t, m.attention, t - m.nodAt);
    parts.bolicheiro_cabeca.rotation.set(bar.pitch, m.barkYaw, 0);
    parts.bolicheiro_braco.rotation.set(bar.armX, bar.armY, 0);
  });
  return <>{FIGURE_NODES.map((name) => <primitive key={name} object={parts[name]} />)}</>;
}
