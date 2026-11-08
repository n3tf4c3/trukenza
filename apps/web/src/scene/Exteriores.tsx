import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import type { SceneryId } from '@trukenza/shared';
import * as THREE from 'three';
import { dress } from './Bolicho';
import { mistTexture, outdoorTexture, waterTexture } from './outdoorTextures';
import { Petalas } from './Petalas';

function Mist() {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(mistTexture, []);
  useFrame(({ clock }) => {
    group.current?.children.forEach((sprite, i) => {
      const t = clock.elapsedTime;
      sprite.position.x = (i - 3) * 3.8 + Math.sin(t * 0.21 + i) * 0.65;
      sprite.position.y = 0.6 + Math.sin(t * 0.4 + i * 2) * 0.22;
      sprite.scale.set(6 + Math.sin(t * 0.3 + i) * 0.8, 2.5 + Math.cos(t * 0.3 + i) * 0.3, 1);
    });
  });
  return <group ref={group}>{Array.from({ length: 7 }, (_, i) =>
    <sprite key={i} position={[(i - 3) * 3.8, 0.6, -13 - Math.sin(i) * 2]} scale={[6, 2.5, 1]}>
      <spriteMaterial map={texture} opacity={0.3} transparent depthWrite={false} />
    </sprite>)}</group>;
}

export const SCENERY_URL = '/modelos/cenarios.glb?v=5';
export type OutdoorId = Exclude<SceneryId, 'bolicho'>;
export const SKY_COLORS = {
  bolicho: '#1c120c', praia: '#a2d8ed', parque: '#ecd4b2', vegas: '#131c3b',
  paris: '#e7c8b2', china: '#c4dce0', japao: '#e5d9e3', muralha: '#b8d1d2',
  fuji: '#b2d9e9', cataratas: '#b5d8ce',
} as const;

/** Modelos próprios, separados do elenco para a troca nunca remontar jogadores. */
export function Exterior({ scenery }: { scenery: OutdoorId }) {
  const gltf = useGLTF(SCENERY_URL, '/draco/');
  const parts = useMemo(() => {
    const scene = gltf.nodes[scenery]!.clone();
    const table = gltf.nodes.mesa_externa!.clone();
    const foliage: { mesh: THREE.Mesh; x: number; z: number }[] = [];
    const streams: { texture: THREE.Texture; falling: boolean }[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const movingWater = (material: THREE.Material) => {
      if (!['mar', 'lago', 'queda_agua'].includes(material.name)) return material;
      const copy = (material as THREE.MeshStandardMaterial).clone();
      const falling = material.name === 'queda_agua';
      const texture = waterTexture(falling).clone();
      texture.needsUpdate = true;
      texture.repeat.set(falling ? 1.4 : 0.65, falling ? 0.4 : 0.65);
      if (falling) {
        texture.colorSpace = THREE.SRGBColorSpace;
        copy.map = texture;
      } else {
        copy.bumpMap = texture;
        copy.bumpScale = 0.055;
        copy.roughness = 0.3;
      }
      streams.push({ texture, falling });
      ownedMaterials.push(copy);
      return copy;
    };
    dress(scene, { cast: true, receive: true });
    scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const material = m as THREE.MeshStandardMaterial;
        if (['folha', 'folha_clara'].includes(material.name) && material.side !== THREE.DoubleSide) {
          // Folhas dos coqueiros são lâminas: continuam visíveis quando vistas de baixo.
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
        const texture = outdoorTexture(material.name);
        if (texture && material.map !== texture) { material.map = texture; material.needsUpdate = true; }
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // O glTF separa as primitivas por material: só as copas se movem, nunca os troncos.
      if (materials.every(m => ['folha', 'folha_clara', 'cerejeira'].includes(m.name))) {
        foliage.push({ mesh, x: mesh.position.x, z: mesh.position.z });
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(movingWater) : movingWater(mesh.material);
    });
    dress(table, { cast: true, receive: true });
    const sea = gltf.nodes[`${scenery}_agua`]?.clone() ?? null;
    if (sea) {
      dress(sea, { cast: false, receive: true });
      sea.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(movingWater) : movingWater(mesh.material);
      });
    }
    return { scene, table, sea, foliage, streams, ownedMaterials };
  }, [gltf, scenery]);
  useEffect(() => () => {
    parts.streams.forEach(({ texture }) => texture.dispose());
    parts.ownedMaterials.forEach(material => material.dispose());
  }, [parts]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    parts.streams.forEach(({ texture, falling }) => {
      texture.offset.set(falling ? 0 : (t * 0.014) % 1, (t * (falling ? 0.65 : 0.022)) % 1);
    });
    parts.foliage.forEach(({ mesh, x, z }, i) => {
      mesh.position.x = x + Math.sin(t * 0.85 + i * 0.7) * 0.035;
      mesh.position.z = z + Math.sin(t * 0.63 + i) * 0.025;
    });
  });
  return <>
    <group dispose={null}>
      <primitive object={parts.scene} />
      <primitive object={parts.table} />
      {parts.sea && <primitive object={parts.sea} />}
    </group>
    {scenery === 'cataratas' && <Mist />}
    {(scenery === 'japao' || scenery === 'fuji' || scenery === 'parque' || scenery === 'paris') &&
      <Petalas key={scenery} scenery={scenery} />}
  </>;
}

export function OutdoorLights({ scenery, high }: { scenery: OutdoorId; high: boolean }) {
  const night = scenery === 'vegas';
  const park = scenery === 'parque' || scenery === 'paris';
  return <>
    <hemisphereLight args={[night ? '#b9c9ff' : '#e8f4ff', night ? '#6c467c' : '#c3a47c', night ? 1.1 : high ? 0.7 : 0.95]} />
    <directionalLight position={park ? [-7, 8, 4] : [5, 10, 6]} intensity={night ? 1.4 : 1.6}
      color={night ? '#d5ddff' : park ? '#ffe0b2' : '#fff0d5'} castShadow={high}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10}
      shadow-camera-top={10} shadow-camera-bottom={-10} shadow-camera-far={40}
      shadow-bias={-0.00015} shadow-normalBias={0.035} shadow-radius={4} />
    <directionalLight position={[-5, 3, -4]} intensity={night ? 0.55 : 0.45} color={night ? '#f7b7db' : '#d5e8ff'} />
    {night && <>
      <pointLight position={[-4, 2.8, -3]} color="#ff7dc1" intensity={high ? 7 : 3} distance={12} decay={2} />
      <pointLight position={[4, 2.8, 3]} color="#6edfff" intensity={high ? 7 : 3} distance={12} decay={2} />
    </>}
    {high && <Environment resolution={128} frames={1} environmentIntensity={night ? 0.65 : 0.5}>
      <color attach="background" args={[SKY_COLORS[scenery]]} />
      <Lightformer form="rect" intensity={2} color={night ? '#ef8fc6' : '#fff1d9'} position={[-4, 6, 0]} scale={6} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={2} color={night ? '#80dfff' : '#c9e8ff'} position={[4, 6, 0]} scale={6} rotation-y={-Math.PI / 2} />
    </Environment>}
  </>;
}
