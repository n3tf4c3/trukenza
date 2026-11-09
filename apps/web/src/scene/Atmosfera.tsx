import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { COUNTER_LAMP, FIRE, LAMP } from './Bolicho';
import { TABLE_HEIGHT } from './layout';

/**
 * O ar do bolicho: halo dos lampiões e do fogo, o facho de luz que desce do lampião até o tampo, a
 * réstia de sol da janela, poeira parada na luz e fagulhas da lareira. Tudo aditivo e sem sombra: só
 * soma luz à imagem, não muda a iluminação das cartas nem o que se lê na mesa.
 */

let glow: THREE.CanvasTexture | null = null;

/** Mancha redonda e macia, branca: a cor vem do material. */
function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

interface HaloProps {
  position: [number, number, number];
  color: string;
  size: number;
  opacity: number;
  /** Tremula como chama (fogo) ou respira devagar (lampião). */
  flicker?: boolean;
}

/** Halo em volta de uma fonte de luz, sempre de frente para a câmera. */
export function Halo({ position, color, size, opacity, flicker = false }: HaloProps) {
  const material = useRef<THREE.SpriteMaterial>(null);
  const map = useMemo(glowTexture, []);
  useFrame(({ clock }) => {
    if (!material.current) return;
    const t = clock.elapsedTime;
    const k = flicker ? 0.8 + 0.2 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) : 0.95 + 0.05 * Math.sin(t * 2.3);
    material.current.opacity = opacity * k;
  });
  return (
    <sprite position={position} scale={[size, size, 1]} renderOrder={5}>
      <spriteMaterial ref={material} map={map} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}

const BEAM_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/** `along` é 0 na fonte e 1 no fim do facho; a borda some onde o cone vira de lado para a câmera. */
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float edge = pow(facing, 2.2);
    float along = 1.0 - vUv.y;
    float fade = (1.0 - smoothstep(0.35, 1.0, along)) * smoothstep(0.0, 0.08, along);
    gl_FragColor = vec4(color * strength * edge * fade, 1.0);
  }
`;

function beamMaterial(color: string, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Facho do lampião: um cone aberto da base da lanterna até o tampo. */
function LampBeam() {
  const top = LAMP.y - 0.18;
  const height = top - TABLE_HEIGHT;
  const material = useMemo(() => beamMaterial('#ffe6c4', 0.06), []);
  useFrame(({ clock }) => {
    material.uniforms.strength!.value = 0.06 * (0.95 + 0.05 * Math.sin(clock.elapsedTime * 2.3));
  });
  return (
    <mesh position={[0, TABLE_HEIGHT + height / 2, 0]} material={material} renderOrder={4}>
      <cylinderGeometry args={[0.1, 1.55, height, 40, 1, true]} />
    </mesh>
  );
}

/** Réstia da janela (parede x = +6, z de −1 a 1, y de 1 a 2,2) caindo no piso, com a mancha de sol. */
function WindowShaft() {
  const map = useMemo(glowTexture, []);
  const material = useMemo(() => beamMaterial('#dbe8ff', 0.05), []);
  const geometry = useMemo(() => {
    // Prisma inclinado: sai da janela e pousa no chão, 2,6 m para dentro da sala.
    const g = new THREE.BufferGeometry();
    const win: [number, number, number][] = [[5.95, 2.2, -1], [5.95, 2.2, 1], [5.95, 1.0, 1], [5.95, 1.0, -1]];
    const floor: [number, number, number][] = [[3.9, 0.02, -1.25], [3.9, 0.02, 1.25], [2.3, 0.02, 1.25], [2.3, 0.02, -1.25]];
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = win[i]!, b = win[(i + 1) % 4]!, c = floor[(i + 1) % 4]!, d = floor[i]!;
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={4} />
      <mesh position={[3.1, 0.015, 0]} rotation-x={-Math.PI / 2} renderOrder={3}>
        <planeGeometry args={[2.6, 3.4]} />
        <meshBasicMaterial map={map} color="#fff1d6" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </>
  );
}

export function Atmosfera({ high }: { high: boolean }) {
  return (
    <>
      <Halo position={[LAMP.x, LAMP.y - 0.05, LAMP.z]} color="#ffcf8a" size={high ? 1.5 : 1.1} opacity={0.5} />
      <Halo position={[COUNTER_LAMP.x, COUNTER_LAMP.y, COUNTER_LAMP.z]} color="#ffcf8a" size={0.9} opacity={0.4} />
      <Halo position={[FIRE.x, FIRE.y - 0.05, FIRE.z - 0.25]} color="#ff9a4d" size={1.9} opacity={0.34} flicker />
      {high && (
        <>
          <LampBeam />
          <WindowShaft />
          {/* Poeira parada na luz do lampião e na réstia da janela. */}
          <Sparkles count={46} position={[0, 1.6, 0]} scale={[2.6, 1.5, 2.6]} size={1.1} speed={0.16} opacity={0.3} color="#ffe6bd" noise={0.6} />
          <Sparkles count={26} position={[4.1, 1.2, 0]} scale={[2.8, 1.8, 2]} size={1.0} speed={0.12} opacity={0.26} color="#eef3ff" noise={0.5} />
          {/* Fagulhas da lareira. */}
          <Sparkles count={14} position={[FIRE.x, FIRE.y + 0.25, FIRE.z - 0.2]} scale={[0.7, 0.9, 0.35]} size={2.4} speed={0.55} opacity={0.8} color="#ffb060" noise={[0.3, 1.4, 0.3]} />
        </>
      )}
    </>
  );
}
