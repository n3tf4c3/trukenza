import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Loader } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { PHASE_PLAYING, PHASE_WAITING, SEAT_AWAY, SEAT_FREE, SEAT_TAKEN } from '@trukenza/shared';
import { sendAction, sit } from '../net';
import { selectMe, useStore } from '../store';
import { Bolicho, COUNTER_LAMP, FIRE, LAMP } from './Bolicho';
import { CameraRig } from './CameraRig';
import { HandHud } from './Cards';
import { Character, type Pose } from './Character';
import { Chair, Deck } from './Furniture';
import { TableCards, deckPose } from './TableCards';
import { CHAIR_RADIUS, polar, seatAngle, standingSpot } from './layout';

/** Fogo do fogão campeiro: luz laranja que tremula (sem sombra). */
function FireLight() {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 5 + 1.6 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) + 0.6 * Math.sin(t * 17);
  });
  return <pointLight ref={light} position={FIRE.toArray()} color="#ff8a3d" distance={7} decay={1.6} />;
}

/**
 * Luz do bolicho: o lampião sobre a mesa é a fonte principal (foco para baixo, com sombra macia, e um
 * pouco de luz para cima); a janela e a porta trazem a luz fria do pampa; o fogo esquenta a frente.
 */
function Lights({ high }: { high: boolean }) {
  const target = useRef<THREE.Object3D>(new THREE.Object3D());
  // No gráfico baixo (celular): só três luzes, sem sombra; a sombra assada nos vértices segura o volume.
  return (
    <>
      <hemisphereLight args={['#ffe2bd', '#3a2416', high ? 0.35 : 0.7]} />
      <primitive object={target.current} position={[0, 0, 0]} />
      <spotLight
        position={LAMP.toArray()}
        target={target.current}
        angle={1.1}
        penumbra={0.9}
        intensity={16}
        distance={10}
        decay={1.7}
        color="#ffc98a"
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
      />
      <FireLight />
      {high && (
        <>
          <pointLight position={[0, LAMP.y + 0.25, 0]} intensity={6} distance={7} decay={1.6} color="#ffd29a" />
          <pointLight position={COUNTER_LAMP.toArray()} intensity={2.2} distance={4} decay={1.8} color="#ffc070" />
          {/* Janela (parede da direita): luz do dia, fria. */}
          <directionalLight position={[12, 5, 0.5]} intensity={1.3} color="#cfe0ff" />
        </>
      )}
    </>
  );
}

/** Reflexos para vidro, metal e verniz, montados na própria cena (nenhuma imagem baixada). */
function Reflections() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.45}>
      <color attach="background" args={['#1c120c']} />
      <Lightformer form="circle" intensity={4} color="#ffcf8a" position={[0, 2.6, 0]} scale={1.2} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={2.5} color="#dfeaff" position={[6, 1.6, 0]} scale={[2, 1.2, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="rect" intensity={1.5} color="#dfeaff" position={[-6, 1.2, -3.2]} scale={[1.6, 2.2, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={1.2} color="#ff9a4d" position={[0, 0.6, 6]} scale={[1.2, 0.6, 1]} rotation-y={Math.PI} />
    </Environment>
  );
}

/** Acabamento do gráfico alto: brilho em volta do que emite luz e cantos da tela mais escuros. */
function Finish() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.7} />
      <Vignette offset={0.28} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

function Mesa({ post }: { post: boolean }) {
  const table = useStore((s) => s.table)!;
  const me = useStore(selectMe);
  const hand = useStore((s) => s.hand);
  const camera = useStore((s) => s.camera);
  const game = useStore((s) => (s.table?.phase === PHASE_PLAYING ? s.game : null));
  const gestures = useStore((s) => s.gestures);
  const playableIds = useStore((s) => s.playable);
  const playable = useMemo(() => new Set(playableIds), [playableIds]);
  // Quem pode agir agora (vez ou resposta), enquanto a mão não acabou.
  const actors = new Set(game?.hand && !game.hand.ended && game.winner === null ? game.hand.actors : []);
  const handKey = game?.hand?.number ?? 0;
  // Quem já estava sentado quando a mesa apareceu não refaz a caminhada.
  const seenAtStart = useRef<Set<string> | null>(null);
  if (seenAtStart.current === null) {
    seenAtStart.current = new Set(table.seats.filter((s) => s.status === SEAT_TAKEN || s.status === SEAT_AWAY).map((s) => s.playerId));
  }
  const localSeat = me?.seat ?? -1;
  const waiting = table.phase === PHASE_WAITING;
  const standing = table.players.filter((p) => p.seat < 0);

  const seatPose = (seat: number): Pose => {
    const a = seatAngle(seat, table.seatCount);
    return { position: polar(a, CHAIR_RADIUS), rotationY: a };
  };

  return (
    <>
      {game?.hand && <Deck {...deckPose(game.hand.dealer, game.seats)} />}
      {game && <TableCards game={game} viewSeat={localSeat} />}
      {table.seats.map((seat, i) => {
        const pose = seatPose(i);
        return (
          <Chair
            key={i}
            position={pose.position}
            rotationY={pose.rotationY}
            status={seat.status}
            label={`Cadeira ${i + 1}${table.seatCount === 4 ? (i % 2 === 0 ? ' · dupla A' : ' · dupla B') : ''}`}
            // Livre, ou do computador (ele cede o lugar); cadeira de outra pessoa não.
            canSit={waiting && !!me && (seat.status === SEAT_FREE || !!table.players.find((p) => p.id === seat.playerId)?.bot)}
            onSit={() => sit(i)}
            team={game ? ((i % 2) as 0 | 1) : null}
            active={actors.has(i)}
          />
        );
      })}
      {table.players.map((p) => {
        const seated = p.seat >= 0;
        const target = seated ? seatPose(p.seat) : standingSpot(standing.indexOf(p));
        const isMe = p.id === me?.id;
        return (
          <Character
            // Só o jogador identifica o boneco: trocar de personagem troca a aparência sem recriá-lo,
            // então ele continua onde está (sentado continua sentado).
            key={p.id}
            id={p.id}
            character={p.character}
            name={p.name}
            target={target}
            seatTarget={seated}
            startAtTarget={seenAtStart.current!.has(p.id)}
            connected={p.connected}
            ready={p.ready}
            host={p.id === table.hostId}
            bot={p.bot}
            isMe={isMe}
            hand={isMe ? hand : p.cards}
            handKey={handKey}
            // Na visão de perto a câmera fica na cabeça do próprio personagem, já sentado.
            hideSeated={isMe && camera === 'cartas'}
            gesture={seated ? gestures[p.seat] : undefined}
            active={seated && actors.has(p.seat)}
          />
        );
      })}
      <CameraRig mode={camera} />
      {/* Com o acabamento ligado, quem desenha a cena é o compositor (prioridade 1) e a mão vem depois. */}
      {hand.length > 0 && localSeat >= 0 && game?.winner == null && (
        <HandHud
          hand={hand}
          handKey={handKey}
          mode={camera}
          renderPriority={post ? 2 : 1}
          playable={playable}
          onPlay={(card) => sendAction('jogar', card)}
        />
      )}
    </>
  );
}

export function MesaScene() {
  const quality = useStore((s) => s.quality);
  const high = quality === 'alta';
  return (
    <>
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : [1, 1.25]}
        gl={{ antialias: !high, powerPreference: 'high-performance' }}
        camera={{ position: [1.2, 2.2, 5.2], fov: 56, near: 0.05, far: 40 }}
      >
        <color attach="background" args={['#1c120c']} />
        <fog attach="fog" args={['#2a1a10', 10, 22]} />
        <Lights high={high} />
        <Suspense fallback={null}>
          {high && <Reflections />}
          <Bolicho />
          <Mesa post={high} />
        </Suspense>
        {high && <Finish />}
      </Canvas>
      <Loader containerStyles={{ background: '#1c120c' }} dataInterpolation={(p) => `Arrumando o bolicho… ${p.toFixed(0)}%`} />
    </>
  );
}
