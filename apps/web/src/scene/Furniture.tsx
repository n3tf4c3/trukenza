import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { SEAT_AWAY, SEAT_FREE, SEAT_RESERVED, type SeatStatus } from '@trukenza/shared';
import { cardBackTexture } from './textures';
import { htmlLayer } from './htmlLayer';
import { DRAG_PX } from './freeCamera';
import { useChairModel } from './Bolicho';
import { TEAM_COLORS } from '../game';

/** O monte de cartas no tampo durante a partida, na frente de quem distribui (a mesa em si é do cenário). */
export function Deck({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const back = useMemo(() => cardBackTexture(), []);
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position-y={0.02} castShadow receiveShadow>
        <boxGeometry args={[0.2, 0.04, 0.3]} />
        <meshStandardMaterial color="#efe4cc" roughness={0.8} />
      </mesh>
      <mesh position-y={0.0405} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.2, 0.3]} />
        <meshStandardMaterial map={back} roughness={0.6} />
      </mesh>
    </group>
  );
}

const RING_COLORS: Partial<Record<SeatStatus, string>> = {
  [SEAT_FREE]: '#7fe08c',
  [SEAT_RESERVED]: '#f4c542',
  [SEAT_AWAY]: '#9aa0a6',
};

interface ChairProps {
  position: [number, number, number];
  rotationY: number;
  status: SeatStatus;
  label: string;
  /** Pode sentar aqui agora (livre ou do computador, na espera). */
  canSit: boolean;
  onSit: () => void;
  /** Durante a partida: a dupla desta cadeira (anel na cor dela) e se é a vez de quem está nela. */
  team: 0 | 1 | null;
  active: boolean;
}

/** Cadeira de palha com o anel de estado no chão. Livre e clicável: o anel pulsa e mostra o convite. */
export function Chair({ position, rotationY, status, label, canSit, onSit, team, active }: ChairProps) {
  const model = useChairModel();
  const ring = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const pulse = status === SEAT_FREE || active ? 1 + Math.sin(clock.elapsedTime * (active ? 6 : 3)) * 0.06 : 1;
    ring.current.scale.setScalar(hover && canSit ? 1.12 : pulse);
  });
  const color = team !== null && status !== SEAT_AWAY ? TEAM_COLORS[team] : RING_COLORS[status];
  const interactive = canSit
    ? {
        onClick: (e: { stopPropagation: () => void; delta: number }) => {
          e.stopPropagation();
          // Arrastar para girar a câmera não senta.
          if (e.delta <= DRAG_PX) onSit();
        },
        onPointerOver: () => {
          setHover(true);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          setHover(false);
          document.body.style.cursor = '';
        },
      }
    : {};
  return (
    <group position={position} rotation-y={rotationY}>
      <group {...interactive}>
        <primitive object={model} />
      </group>
      {color && (
        <mesh ref={ring} position-y={0.012} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.44, 0.52, 48]} />
          <meshBasicMaterial color={color} transparent opacity={(hover && canSit) || active ? 0.95 : team !== null ? 0.45 : 0.7} toneMapped={false} />
        </mesh>
      )}
      {/* Sempre montada: o Html do drei cria uma raiz React própria, e desmontá-la a cada troca de estado gera erro. */}
      <Html position={[0, 1.25, 0]} center zIndexRange={[10, 0]} portal={htmlLayer}>
        <button
          type="button"
          className={`cadeira-livre${canSit ? '' : ' so-ver'}`}
          hidden={status !== SEAT_FREE}
          disabled={!canSit}
          onClick={onSit}
        >
          {label}
          {canSit && <small>Sentar aqui</small>}
        </button>
      </Html>
    </group>
  );
}
