import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Loader } from '@react-three/drei';
import { Bloom, EffectComposer, SSAO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { PHASE_PLAYING, PHASE_WAITING, SEAT_AWAY, SEAT_FREE, SEAT_TAKEN } from '@trukenza/shared';
import { selectCard, sit } from '../net';
import { selectMe, useStore } from '../store';
import { Bolicho, COUNTER_LAMP, FIRE, LAMP } from './Bolicho';
import { CameraRig } from './CameraRig';
import { HandHud } from './Cards';
import { Character, type Pose } from './Character';
import { Chair, Deck } from './Furniture';
import { TableCards, deckPose } from './TableCards';
import { CHAIR_RADIUS, polar, seatAngle, standingSpot } from './layout';
import { Exterior, OutdoorLights, SKY_COLORS } from './Exteriores';

/** Fogo do fogão campeiro: luz laranja que tremula (sem sombra). */
function FireLight() {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (light.current) light.current.intensity = 2.1 + 0.35 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1) + 0.15 * Math.sin(t * 17);
  });
  return <pointLight ref={light} position={FIRE.toArray()} color="#ffb974" distance={5} decay={2} />;
}

/**
 * Luz do bolicho: o lampião sobre a mesa é a fonte principal (foco para baixo, com sombra macia, e um
 * pouco de luz para cima); a janela e a porta trazem a luz fria do pampa; o fogo esquenta a frente.
 */
function Lights({ high }: { high: boolean }) {
  const target = useRef<THREE.Object3D>(new THREE.Object3D());
  // No gráfico baixo: preenchimento simples, sem sombra nem pós-processamento; mantém os rostos legíveis.
  return (
    <>
      <hemisphereLight args={['#e8efff', '#817262', high ? 0.85 : 1.6]} />
      {!high && <directionalLight position={[1, 4, 3]} intensity={1.1} color="#fff0dc" />}
      <primitive object={target.current} position={[0, 0, 0]} />
      <spotLight
        position={[0, LAMP.y - 0.2, 0]}
        target={target.current}
        angle={1.1}
        penumbra={0.9}
        intensity={9}
        distance={10}
        decay={1.7}
        color="#ffe3bc"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.015}
        shadow-radius={6}
      />
      <FireLight />
      {high && (
        <>
          <pointLight position={[0, 2.05, 0]} intensity={4.2} distance={6} decay={2} color="#fff0d9" />
          <pointLight position={COUNTER_LAMP.toArray()} intensity={2.0} distance={4} decay={2} color="#ffdc9c" />
          {/* Janela (parede da direita): luz do dia, fria. */}
          <directionalLight position={[6, 4, 1]} intensity={1.25} color="#cbdfff" />
          <directionalLight position={[-4, 3, -3]} intensity={0.65} color="#ffe1bd" />
        </>
      )}
    </>
  );
}

/** Reflexos para vidro, metal e verniz, montados na própria cena (nenhuma imagem baixada). */
function Reflections() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.75}>
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
    <EffectComposer multisampling={4} enableNormalPass>
      <SSAO samples={16} rings={4} radius={0.12} intensity={1.4} luminanceInfluence={0.4} color="#40372f" />
      <Bloom mipmapBlur luminanceThreshold={1.4} luminanceSmoothing={0.4} intensity={0.22} />
      <Vignette offset={0.25} darkness={0.22} />
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
  const signals = useStore((s) => s.signals);
  const speaking = useStore((s) => s.speaking);
  const shouts = useStore((s) => s.shouts);
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
  const focusSeat = speaking?.seat ?? shouts.at(-1)?.seat ?? actors.values().next().value;
  const focusPosition = focusSeat !== undefined && focusSeat >= 0 ? polar(seatAngle(focusSeat, table.seatCount), CHAIR_RADIUS) : null;

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
            hideSeated={isMe && camera !== 'livre'}
            gesture={seated ? gestures[p.seat] : undefined}
            active={seated && actors.has(p.seat)}
            playing={!waiting}
            focus={seated && p.seat !== focusSeat ? focusPosition : null}
            speakingAt={seated && speaking?.seat === p.seat ? speaking.at : null}
            signal={seated && signals[p.seat]?.hand === handKey && !game?.hand?.ended ? signals[p.seat] : undefined}
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
          onPlay={selectCard}
        />
      )}
    </>
  );
}

export function MesaScene() {
  const quality = useStore((s) => s.quality);
  const scenery = useStore(s => s.table?.scenery ?? 'bolicho');
  const indoor = scenery === 'bolicho';
  const high = quality === 'alta';
  return (
    <>
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : [1, 1.25]}
        gl={{ antialias: !high, powerPreference: 'high-performance' }}
        camera={{ position: [1.2, 2.2, 5.2], fov: 56, near: 0.05, far: 120 }}
      >
        <color attach="background" args={[SKY_COLORS[scenery]]} />
        <fog attach="fog" args={[indoor ? '#2a1a10' : SKY_COLORS[scenery], indoor ? 10 : 28, indoor ? 22 : 90]} />
        {indoor && <Lights high={high} />}
        <Suspense fallback={null}>
          {indoor ? <>{high && <Reflections />}<Bolicho /></> :
            <><OutdoorLights key={scenery} scenery={scenery} high={high} /><Exterior scenery={scenery} /></>}
        </Suspense>
        <Suspense fallback={null}>
          <Mesa post={high} />
        </Suspense>
        {high && <Finish />}
      </Canvas>
      <Loader containerStyles={{ background: '#1c120c' }} dataInterpolation={(p) => `Arrumando o cenário… ${p.toFixed(0)}%`} />
    </>
  );
}
