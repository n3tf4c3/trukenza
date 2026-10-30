import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Hud, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { cardId, type Card } from '@trukenza/game-engine';
import type { CameraMode } from '../store';
import { cardBackTexture, cardFaceTexture } from './textures';
import { DRAG_PX } from './freeCamera';

const ASPECT = 1.5;

/**
 * Carta de duas faces: a frente olha para +z, o verso para -z. `flat`: a frente ignora a luz e mostra as
 * cores exatas do desenho (cartas jogadas na mesa, que debaixo do lampião ficariam lavadas).
 */
export function CardMesh({ card, width, flat = false }: { card: Card | null; width: number; flat?: boolean }) {
  const front = useMemo(() => (card ? cardFaceTexture(card) : cardBackTexture()), [card]);
  const back = useMemo(() => cardBackTexture(), []);
  const h = width * ASPECT;
  return (
    <group>
      <mesh castShadow>
        <planeGeometry args={[width, h]} />
        {flat ? <meshBasicMaterial map={front} toneMapped={false} /> : <meshStandardMaterial map={front} roughness={0.6} />}
      </mesh>
      <mesh rotation-y={Math.PI}>
        <planeGeometry args={[width, h]} />
        <meshStandardMaterial map={back} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** De onde a carta vem na distribuição: do monte, no meio da mesa (no referencial das mãos do personagem). */
const FROM_DECK = new THREE.Vector3(0, -0.15, -1.6);

/** Leque de cartas que chega voando do monte, uma depois da outra (a distribuição). */
function PopIn({ index, children, position, ...rest }: { index: number; children: React.ReactNode; position: [number, number, number] } & Omit<React.ComponentProps<'group'>, 'position'>) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef(-1);
  const end = useMemo(() => new THREE.Vector3(...position), [position]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (born.current < 0) born.current = clock.elapsedTime;
    const k = 1 - (1 - THREE.MathUtils.clamp((clock.elapsedTime - born.current - index * 0.18) / 0.4, 0, 1)) ** 3;
    ref.current.position.lerpVectors(FROM_DECK, end, k);
    ref.current.scale.setScalar(0.4 + 0.6 * k);
    ref.current.visible = clock.elapsedTime - born.current >= index * 0.18;
  });
  return (
    <group ref={ref} visible={false} {...rest}>
      {children}
    </group>
  );
}

/** Cartas na mão de um personagem, na mesa 3D. Quem não é dono vê só o verso. */
export function HeldCards({ hand, handKey, faceUp }: { hand: Card[] | number; handKey: number; faceUp: boolean }) {
  const cards: (Card | null)[] = typeof hand === 'number' ? Array.from({ length: hand }, () => null) : faceUp ? hand : hand.map(() => null);
  const n = cards.length;
  return (
    <group key={handKey}>
      {cards.map((card, i) => {
        const k = n > 1 ? i / (n - 1) - 0.5 : 0;
        return (
          <PopIn key={i} index={i} position={[k * 0.13, -Math.abs(k) * 0.02, i * 0.004]} rotation-z={-k * 0.5}>
            <CardMesh card={card} width={0.15} />
          </PopIn>
        );
      })}
    </group>
  );
}

function HandCard({ card, index, count, size, lift, playable, onPlay }: { card: Card; index: number; count: number; size: number; lift: number; playable: boolean; onPlay: (card: Card) => void }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const born = useRef(-1);
  const k = count > 1 ? index / (count - 1) - 0.5 : 0;
  const x = k * size * 1.15;
  const baseY = -Math.abs(k) * size * 0.25;
  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (!g) return;
    if (born.current < 0) born.current = clock.elapsedTime;
    // Distribuição: cada carta sobe da borda da tela com um pequeno atraso.
    const arrive = THREE.MathUtils.clamp((clock.elapsedTime - born.current - index * 0.15) / 0.35, 0, 1);
    const enter = (1 - (1 - arrive) ** 3) * lift;
    const up = hover && playable;
    const y = baseY - lift + enter + (up ? size * 0.35 : playable ? size * 0.08 : 0);
    g.position.y = THREE.MathUtils.damp(g.position.y, y, 14, dt);
    const s = up ? 1.12 : 1;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, s, 14, dt));
  });
  return (
    <group
      ref={ref}
      position={[x, baseY - lift, index * 0.01]}
      rotation={[-0.12, 0, -k * 0.35]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        if (playable) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
      onClick={(e) => {
        e.stopPropagation();
        // Arrastar para girar a câmera não joga a carta.
        if (playable && e.delta <= DRAG_PX) onPlay(card);
      }}
    >
      <CardMesh card={card} width={size} />
    </group>
  );
}

/**
 * Espaço, em pixels, embaixo da mão. Em tela larga as ações ficam numa coluna no canto e a mão desce até o
 * pé da tela; em tela estreita (celular) as ações ocupam a faixa de baixo, que muda de altura (respostas,
 * cantos), e a mão fica sempre logo acima dela.
 */
const WIDE_PX = 900;
const BOTTOM_WIDE_PX = 14;

/** Altura atual da faixa de ações (`.acoes`), acompanhada enquanto ela muda. */
function useActionsHeight(): number {
  const [height, setHeight] = useState(150);
  useEffect(() => {
    const el = document.querySelector('.acoes');
    if (!el) return;
    const update = () => setHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return height;
}

const HUD_Z = 5;
const HUD_FOV = 40;

function HandLayout({ hand, mode, playable, onPlay }: { hand: Card[]; mode: CameraMode; playable: ReadonlySet<string>; onPlay: (card: Card) => void }) {
  // Área visível da câmera do Hud no plano z = 0 (o viewport do R3F aqui segue a câmera da cena).
  const size = useThree((s) => s.size);
  const height = 2 * HUD_Z * Math.tan(THREE.MathUtils.degToRad(HUD_FOV / 2));
  const width = (height * size.width) / size.height;
  const px = height / size.height;
  // Sempre no centro de baixo; de perto, maior.
  const cardW = Math.min(mode === 'cartas' ? height * 0.2 : height * 0.16, width / (mode === 'cartas' ? 4.4 : 5.5));
  const h = cardW * ASPECT;
  const actions = useActionsHeight();
  const bottom = size.width >= WIDE_PX ? BOTTOM_WIDE_PX : actions + 20;
  const y = -height / 2 + bottom * px + h * 0.55;
  return (
    <group position={[0, y, 0]}>
      {hand.map((card, i) => (
        <HandCard
          key={cardId(card)}
          card={card}
          index={i}
          count={hand.length}
          size={cardW}
          lift={h}
          playable={playable.has(cardId(card))}
          onPlay={onPlay}
        />
      ))}
    </group>
  );
}

/** A mão do próprio jogador, desenhada por cima da cena (sempre legível, sem bater na mesa). */
/** Na sua vez, as cartas que pode jogar ficam um pouco levantadas; um clique joga. */
export function HandHud({
  hand,
  handKey,
  mode,
  renderPriority,
  playable,
  onPlay,
}: {
  hand: Card[];
  handKey: number;
  mode: CameraMode;
  renderPriority: number;
  playable: ReadonlySet<string>;
  onPlay: (card: Card) => void;
}) {
  return (
    <Hud renderPriority={renderPriority}>
      <PerspectiveCamera makeDefault position={[0, 0, HUD_Z]} fov={HUD_FOV} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[2, 3, 5]} intensity={1.4} />
      <HandLayout key={handKey} hand={hand} mode={mode} playable={playable} onPlay={onPlay} />
    </Hud>
  );
}

