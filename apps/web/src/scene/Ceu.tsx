import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Céu dos exteriores: abóbada em degradê (o horizonte tem a cor da névoa do cenário, então o chão some
 * nele sem emenda), nuvens macias que andam devagar, o clarão do sol e, à noite, estrelas.
 * Desenhado em canvas e em shader; nenhuma imagem baixada.
 */

export interface SkyLook {
  /** Cor do alto do céu; a do horizonte é a do cenário (`SKY_COLORS`). */
  top: string;
  /** Tinta das nuvens (clara de dia, arroxeada no fim de tarde). */
  cloud: string;
  night?: boolean;
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  varying vec3 vDir;
  void main() {
    float h = clamp(normalize(vDir).y, 0.0, 1.0);
    // Sobe rápido perto do horizonte e assenta no alto, como a atmosfera.
    vec3 color = mix(horizon, top, pow(h, 0.55));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

let cloud: THREE.CanvasTexture | null = null;

/** Uma nuvem de bolhas macias, branca: a cor vem do material. */
function cloudTexture(): THREE.CanvasTexture {
  if (cloud) return cloud;
  const w = 256, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const puffs: [number, number, number][] = [[70, 78, 38], [112, 62, 48], [158, 70, 42], [196, 82, 30], [130, 88, 44], [92, 90, 30]];
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  cloud = new THREE.CanvasTexture(canvas);
  cloud.colorSpace = THREE.SRGBColorSpace;
  return cloud;
}

/** Posições fixas (sem sorteio): o céu é o mesmo para todos e em toda visita. */
const CLOUDS: { angle: number; height: number; size: number; speed: number }[] = [
  { angle: 0.3, height: 20, size: 34, speed: 0.006 },
  { angle: 1.25, height: 27, size: 46, speed: 0.004 },
  { angle: 2.2, height: 17, size: 30, speed: 0.007 },
  { angle: 3.05, height: 24, size: 40, speed: 0.005 },
  { angle: 3.95, height: 19, size: 36, speed: 0.006 },
  { angle: 4.8, height: 29, size: 50, speed: 0.0035 },
  { angle: 5.6, height: 16, size: 28, speed: 0.0075 },
];
const CLOUD_RADIUS = 78;

export function Ceu({ look, horizon, sun }: { look: SkyLook; horizon: string; sun: [number, number, number] }) {
  const clouds = useRef<THREE.Group>(null);
  const cloudMap = useMemo(cloudTexture, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { top: { value: new THREE.Color(look.top) }, horizon: { value: new THREE.Color(horizon) } },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [look.top, horizon],
  );
  const sunPosition = useMemo(() => new THREE.Vector3(...sun).normalize().multiplyScalar(88).toArray(), [sun]);
  useFrame(({ clock }) => {
    clouds.current?.children.forEach((sprite, i) => {
      const c = CLOUDS[i]!;
      const a = c.angle + clock.elapsedTime * c.speed;
      sprite.position.set(Math.sin(a) * CLOUD_RADIUS, c.height, Math.cos(a) * CLOUD_RADIUS);
    });
  });
  return (
    <>
      <mesh material={material} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[100, 32, 16]} />
      </mesh>
      {look.night ? (
        <Stars radius={70} depth={20} count={1400} factor={3.2} saturation={0.4} fade speed={0.6} />
      ) : (
        <>
          <sprite position={sunPosition} scale={[46, 46, 1]} renderOrder={-9}>
            <spriteMaterial map={sunTexture()} color="#fff3d2" transparent opacity={0.85} depthWrite={false} fog={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
          <group ref={clouds}>
            {CLOUDS.map((c, i) => (
              <sprite key={i} position={[Math.sin(c.angle) * CLOUD_RADIUS, c.height, Math.cos(c.angle) * CLOUD_RADIUS]} scale={[c.size, c.size * 0.5, 1]} renderOrder={-8}>
                <spriteMaterial map={cloudMap} color={look.cloud} transparent opacity={0.9} depthWrite={false} fog={false} />
              </sprite>
            ))}
          </group>
        </>
      )}
    </>
  );
}

let sunGlow: THREE.CanvasTexture | null = null;

/** Clarão redondo do sol. */
function sunTexture(): THREE.CanvasTexture {
  if (sunGlow) return sunGlow;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  sunGlow = new THREE.CanvasTexture(canvas);
  sunGlow.colorSpace = THREE.SRGBColorSpace;
  return sunGlow;
}
