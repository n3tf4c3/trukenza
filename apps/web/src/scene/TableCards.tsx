import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { parseCardId } from '@trukenza/game-engine';
import type { GameView } from '../game';
import { CardMesh } from './Cards';
import { TABLE_HEIGHT, TABLE_CARD_WIDTH, archivedCardPosition, polar, seatAngle, tableCardPosition } from './layout';

/**
 * As cartas jogadas na mesa. Cada uma sai da mão de quem jogou e pousa virada para cima perto do centro,
 * do lado de quem a jogou. Todas ficam de frente para o próprio jogador (legíveis sem girar a cabeça);
 * as vazas anteriores vão para montes menores na lateral. A que levou a vaza ganha um brilho dourado; no fim
 * da mão, depois de uma pausa para ver o resultado, todas são recolhidas para o monte.
 */

const CARD_W = TABLE_CARD_WIDTH;
// Só um contorno: um plano preenchido parecia outra carta amarela suspensa sobre a pilha.
const WINNER_FRAME = new THREE.Shape();
WINNER_FRAME.moveTo(-CARD_W * 0.53, -CARD_W * 0.78);
WINNER_FRAME.lineTo(CARD_W * 0.53, -CARD_W * 0.78);
WINNER_FRAME.lineTo(CARD_W * 0.53, CARD_W * 0.78);
WINNER_FRAME.lineTo(-CARD_W * 0.53, CARD_W * 0.78);
WINNER_FRAME.closePath();
const frameHole = new THREE.Path();
frameHole.moveTo(-CARD_W * 0.5, -CARD_W * 0.75);
frameHole.lineTo(-CARD_W * 0.5, CARD_W * 0.75);
frameHole.lineTo(CARD_W * 0.5, CARD_W * 0.75);
frameHole.lineTo(CARD_W * 0.5, -CARD_W * 0.75);
frameHole.closePath();
WINNER_FRAME.holes.push(frameHole);
const FLY_S = 0.42;
/** Depois do fim da mão: tempo vendo as cartas e duração do recolhimento (a sala espera 3,5 s). */
const COLLECT_AFTER_S = 2.1;
const COLLECT_S = 0.7;

/** O monte fica na frente de quem distribui, longe das cartas jogadas. */
export function deckPose(dealer: number, seats: number): { position: [number, number, number]; rotationY: number } {
  const a = seatAngle(dealer, seats);
  return { position: polar(a + 0.72, 1.23, TABLE_HEIGHT), rotationY: a + 0.3 };
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
  archived: boolean;
  animate: boolean;
  /** Para onde as cartas olham (o ângulo da cadeira de quem está vendo). */
  viewAngle: number;
  deck: THREE.Vector3;
}

function TableCard({ cardId, seat, seats, trick, winner, ended, archived, animate, viewAngle, deck }: TableCardProps) {
  const card = useMemo(() => parseCardId(cardId), [cardId]);
  const ref = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const born = useRef(-1);
  const endedAt = useRef(-1);
  const archivedAt = useRef(-1);
  const alreadyArchived = useRef(archived);
  const a = seatAngle(seat, seats);
  // Do lado de quem jogou, perto do centro; a vaza nova um pouco para o lado e por cima.
  const target = new THREE.Vector3(...tableCardPosition(seat, seats, trick, viewAngle));
  const start = new THREE.Vector3(Math.sin(a) * 1.75, 1.05, Math.cos(a) * 1.75);
  const archive = new THREE.Vector3(...archivedCardPosition(seat, trick, viewAngle));
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || !card) return;
    const t = clock.elapsedTime;
    if (born.current < 0) born.current = t;
    const flight = animate ? THREE.MathUtils.clamp((t - born.current) / FLY_S, 0, 1) : 1;
    const k = 1 - (1 - flight) ** 2;
    g.position.lerpVectors(start, target, k);
    g.position.y += Math.sin(Math.PI * flight) * 0.20; // arco curto: toca o tampo junto com o som
    // Gira no voo: sai virada para quem jogou e pousa de frente para quem está vendo.
    g.rotation.set(0.16 * (1 - flight), THREE.MathUtils.lerp(a, viewAngle + Math.round((a - viewAngle) / (2 * Math.PI)) * 2 * Math.PI, k), 0.08 * Math.sin(Math.PI * flight));
    if (archived && archivedAt.current < 0) archivedAt.current = t;
    const stored = archived ? (alreadyArchived.current ? 1 : ease((t - archivedAt.current) / 0.6)) : 0;
    g.position.lerp(archive, stored);
    g.scale.setScalar(1 - stored * 0.38);
    if (ended && endedAt.current < 0) endedAt.current = t;
    if (endedAt.current >= 0) {
      const c = ease((t - endedAt.current - COLLECT_AFTER_S) / COLLECT_S);
      g.position.lerp(deck, c);
      g.scale.multiplyScalar(1 - c * 0.85);
      g.visible = c < 1;
    }
    if (glow.current) {
      glow.current.visible = winner && !archived && flight === 1;
      (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(t * 6);
    }
  });
  if (!card) return null;
  return (
    <group ref={ref} position={start.toArray()}>
      <group rotation-x={-Math.PI / 2}>
        <CardMesh card={card} width={CARD_W} flat />
        <mesh ref={glow} position-z={-0.0008} visible={false}>
          <shapeGeometry args={[WINNER_FRAME]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** `viewSeat`: a cadeira de quem está vendo (de pé ou assistindo, -1: vale a cadeira 0). */
export function TableCards({ game, viewSeat }: { game: GameView; viewSeat: number }) {
  const h = game.hand;
  // Cartas que já estavam na mesa ao entrar/reconectar não repetem o voo.
  const existing = useRef(new Set(h?.tricks.flatMap((t, i) => t.plays.map(p => `${h.number}:${i}:${p.seat}`)) ?? []));
  if (!h) return null;
  // O brilho de quem levou fica só na última vaza fechada (nas anteriores, amarelaria a mesa toda).
  const lastDone = h.tricks.reduce((last, t, i) => (t.outcome !== null ? i : last), -1);
  const current = h.tricks.reduce((last, t, i) => t.plays.length ? i : last, 0);
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
            archived={ti < current}
            animate={!existing.current.has(`${h.number}:${ti}:${p.seat}`)}
            viewAngle={viewAngle}
            deck={deck}
          />
        )),
      )}
    </group>
  );
}

