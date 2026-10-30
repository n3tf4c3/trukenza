import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { parseCardId } from '@trukenza/game-engine';
import type { GameView } from '../game';
import { CardMesh } from './Cards';
import { TABLE_HEIGHT, polar, seatAngle } from './layout';

/**
 * As cartas jogadas na mesa. Cada uma sai da mão de quem jogou e pousa virada para cima perto do centro,
 * do lado de quem a jogou. Todas ficam de frente para o próprio jogador (legíveis sem girar a cabeça);
 * as vazas anteriores ficam por baixo, deslocadas. A que levou a vaza ganha um brilho dourado; no fim
 * da mão, depois de uma pausa para ver o resultado, todas são recolhidas para o monte.
 */

const CARD_W = 0.4;
const FLY_S = 0.42;
/** Depois do fim da mão: tempo vendo as cartas e duração do recolhimento (a sala espera 3,5 s). */
const COLLECT_AFTER_S = 2.1;
const COLLECT_S = 0.7;
/** Distância do centro até a carta de cada um: na mesa de 4 as laterais pedem um pouco mais de espaço. */
const RADIUS: Record<number, number> = { 2: 0.34, 4: 0.58 };
/**
 * As cartas deslizam um pouco para o lado de quem está vendo: a do adversário fica quase no centro e
 * nenhuma longe demais. É só a vista de cada um (cada cliente desenha a mesa a partir da própria cadeira).
 */
const VIEW_SHIFT: Record<number, number> = { 2: 0.3, 4: 0.2 };
/** Cada vaza nova pousa um pouco deslocada sobre a anterior, como na mesa de verdade. */
const TRICK_SHIFT = 0.12;

/** O monte fica na frente de quem distribui, longe das cartas jogadas. */
export function deckPose(dealer: number, seats: number): { position: [number, number, number]; rotationY: number } {
  const a = seatAngle(dealer, seats);
  return { position: polar(a + 0.45, 0.98, TABLE_HEIGHT), rotationY: a + 0.3 };
}

function ease(t: number): number {
  return 1 - (1 - THREE.MathUtils.clamp(t, 0, 1)) ** 3;
}

interface TableCardProps {
  cardId: string;
  seat: number;
  seats: number;
  trick: number;
  winner: boolean;
  ended: boolean;
  /** Para onde as cartas olham (o ângulo da cadeira de quem está vendo). */
  viewAngle: number;
  deck: THREE.Vector3;
}

function TableCard({ cardId, seat, seats, trick, winner, ended, viewAngle, deck }: TableCardProps) {
  const card = useMemo(() => parseCardId(cardId), [cardId]);
  const ref = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const born = useRef(-1);
  const endedAt = useRef(-1);
  const a = seatAngle(seat, seats);
  // Do lado de quem jogou, perto do centro; a vaza nova um pouco para o lado e por cima.
  const toward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const side = new THREE.Vector3(Math.cos(viewAngle), 0, -Math.sin(viewAngle));
  const target = toward
    .clone()
    .multiplyScalar(RADIUS[seats] ?? 0.45)
    .addScaledVector(side, (trick - 1) * TRICK_SHIFT)
    .addScaledVector(new THREE.Vector3(Math.sin(viewAngle), 0, Math.cos(viewAngle)), VIEW_SHIFT[seats] ?? 0.25)
    .setY(TABLE_HEIGHT + 0.004 + trick * 0.004);
  const start = new THREE.Vector3(Math.sin(a) * 1.75, 1.05, Math.cos(a) * 1.75);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || !card) return;
    const t = clock.elapsedTime;
    if (born.current < 0) born.current = t;
    const k = ease((t - born.current) / FLY_S);
    g.position.lerpVectors(start, target, k);
    g.position.y += Math.sin(Math.PI * k) * 0.25; // um arco no ar
    // Gira no voo: sai virada para quem jogou e pousa de frente para quem está vendo.
    g.rotation.set(0, THREE.MathUtils.lerp(a, viewAngle + Math.round((a - viewAngle) / (2 * Math.PI)) * 2 * Math.PI, k), 0);
    if (ended && endedAt.current < 0) endedAt.current = t;
    if (endedAt.current >= 0) {
      const c = ease((t - endedAt.current - COLLECT_AFTER_S) / COLLECT_S);
      g.position.lerp(deck, c);
      g.scale.setScalar(1 - c * 0.85);
    }
    if (glow.current) {
      glow.current.visible = winner;
      (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(t * 6);
    }
  });
  if (!card) return null;
  return (
    <group ref={ref} position={start.toArray()}>
      <group rotation-x={-Math.PI / 2}>
        <CardMesh card={card} width={CARD_W} flat />
        <mesh ref={glow} position-z={-0.002} visible={false}>
          <planeGeometry args={[CARD_W * 1.22, CARD_W * 1.5 * 1.16]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.7} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** `viewSeat`: a cadeira de quem está vendo (de pé ou assistindo, -1: vale a cadeira 0). */
export function TableCards({ game, viewSeat }: { game: GameView; viewSeat: number }) {
  const h = game.hand;
  if (!h) return null;
  // O brilho de quem levou fica só na última vaza fechada (nas anteriores, amarelaria a mesa toda).
  const lastDone = h.tricks.reduce((last, t, i) => (t.outcome !== null ? i : last), -1);
  const viewAngle = seatAngle(Math.max(0, viewSeat), game.seats);
  const deck = new THREE.Vector3(...deckPose(h.dealer, game.seats).position).setY(TABLE_HEIGHT + 0.05);
  return (
    <group key={h.number}>
      {h.tricks.flatMap((t, ti) =>
        t.plays.map((p) => (
          <TableCard
            key={`${ti}:${p.seat}`}
            cardId={p.card}
            seat={p.seat}
            seats={game.seats}
            trick={ti}
            winner={ti === lastDone && t.outcome !== 'parda' && t.winnerSeat === p.seat}
            ended={h.ended !== null}
            viewAngle={viewAngle}
            deck={deck}
          />
        )),
      )}
    </group>
  );
}

