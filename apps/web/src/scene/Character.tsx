import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHARACTERS, SIGNAL_DURATION_MS, type CharacterId, type SignalId } from '@trukenza/shared';
import type { Card } from '@trukenza/game-engine';
import { Portrait } from '../ui/Portrait';
import { CHAIR_RADIUS, CUP_RADIUS, CUP_SIDE, DOOR, SEAT_HEIGHT, TABLE_HEIGHT, polar } from './layout';
import { useCupModel } from './Bolicho';
import { idleSound } from '../sound';
import { HeldCards } from './Cards';
import { localAvatar } from './avatar';
import { htmlLayer } from './htmlLayer';
import { HEAD_RADIUS, HIP_X, SHOULDER_X, useCharacterParts } from './personagens';
import type { Gesture } from '../store';
import { signalPose, smooth } from '../performance';
import { GOLE_HELD, IDLE_DURATION, characterGesture, idlePose, pickIdle, thinkingPose, type IdleKind } from '../acting';

/**
 * Um personagem na mesa. As peças (tronco, cabeça, olhos, braços, coxas e canelas) vêm do modelo do
 * Blender (`personagens.ts`); este componente monta o esqueleto comum a todos e o anima: andar até a
 * cadeira contornando a mesa, sentar, levantar, respirar, olhar em volta e piscar.
 * O modelo olha para -z local.
 */

export interface Pose {
  position: [number, number, number];
  rotationY: number;
}

interface CharacterProps {
  id: string;
  character: CharacterId;
  name: string;
  target: Pose;
  /** O alvo é uma cadeira: ao chegar, senta. */
  seatTarget: boolean;
  /** Começa já no alvo (quem já estava sentado quando a mesa apareceu). */
  startAtTarget: boolean;
  connected: boolean;
  ready: boolean;
  host: boolean;
  bot: boolean;
  isMe: boolean;
  /** Cartas na mão: as do próprio jogador com a frente virada para ele; as dos outros, só o verso. */
  hand: Card[] | number;
  handKey: number;
  /** Esconde o boneco quando ele estiver sentado (visão de perto, em primeira pessoa). */
  hideSeated: boolean;
  /** Gesto do último acontecimento público desta cadeira (canto ou vitória). */
  gesture: Gesture | undefined;
  /** É a vez de quem está aqui (destaca a etiqueta). */
  active: boolean;
  playing: boolean;
  focus: [number, number, number] | null;
  speakingAt: number | null;
  signal: { signal: SignalId; at: number } | undefined;
  /** Cadeira do parceiro (só em duplas): quem vai responder a um canto olha para ele antes. */
  partner: [number, number, number] | null;
  /** Instante (performance.now) do canto adversário que esta cadeira precisa responder. */
  challengeAt: number | null;
  /** Instante (performance.now) em que quem está aqui ergueu o copo numa frase de brinde. */
  cheerAt: number | null;
}

const WALK_SPEED = 3.4;
const SIT_SPEED = 1.7;
/** Raio de contorno: quem anda nunca atravessa a mesa nem as cadeiras. */
const AROUND = CHAIR_RADIUS + 0.65;
/** Segmentos que passam mais perto do centro que isto cruzariam a mesa ou as cadeiras. */
const BLOCK = CHAIR_RADIUS + 0.35;
/** Copo na beira da mesa, à direita de quem senta (local da cadeira; a mesa fica em -z). */
const CUP_REST = new THREE.Vector3(CUP_SIDE, TABLE_HEIGHT, -(CHAIR_RADIUS - CUP_RADIUS));
/** Intervalo entre ações ociosas de um mesmo personagem, em segundos. */
const IDLE_GAP: readonly [number, number] = [7, 19];
const scratch = new THREE.Vector3();

/**
 * Caminho até o destino, calculado uma vez por destino. Entre dois pontos fora do anel com o trecho
 * livre, vai direto; senão vai até o anel de contorno, gira por ele pelo lado mais curto e entra em
 * linha reta (radial) até a cadeira.
 */
function planPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] {
  const outside = (p: THREE.Vector3) => Math.hypot(p.x, p.z) >= AROUND - 0.01;
  const d = goal.clone().sub(start);
  const len2 = d.lengthSq();
  const t = len2 > 1e-8 ? THREE.MathUtils.clamp(-start.dot(d) / len2, 0, 1) : 0;
  if (outside(start) && outside(goal) && start.clone().addScaledVector(d, t).length() >= BLOCK) return [goal];
  const a0 = Math.atan2(start.x, start.z);
  const turn = Math.atan2(Math.sin(Math.atan2(goal.x, goal.z) - a0), Math.cos(Math.atan2(goal.x, goal.z) - a0));
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.35));
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) path.push(new THREE.Vector3(...polar(a0 + (turn * i) / steps, AROUND)));
  path.push(goal);
  return path;
}

function angleLerp(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}

export function Character(props: CharacterProps) {
  const { character, target, seatTarget, startAtTarget } = props;
  const parts = useCharacterParts(character);
  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const knees = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const eyes = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const brows = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Group>(null);
  const nose = useRef<THREE.Group>(null);
  const opening = useRef<THREE.Group>(null);
  const cards = useRef<THREE.Group>(null);
  const acting = useRef({ ...characterGesture(character, undefined, 0), think: 0 });
  const tableCup = useRef<THREE.Group>(null);
  const handCup = useRef<THREE.Group>(null);
  const handCupBottom = useRef<THREE.Group>(null);
  const cupOnTable = useCupModel();
  const cupInHand = useCupModel();
  const cupRest = useMemo(() => CUP_REST.clone(), []);
  const anim = useRef({
    pos: new THREE.Vector3(...(startAtTarget ? target.position : DOOR)),
    rot: startAtTarget ? target.rotationY : Math.PI / 2,
    sit: startAtTarget && seatTarget ? 1 : 0,
    path: [] as THREE.Vector3[],
    /** Destino para o qual `path` foi calculado. */
    planned: startAtTarget ? target.position.join() : '',
    walk: 0,
    stride: 0,
    speed: 0,
    gaze: 0,
    seed: Math.random() * 100,
    idle: null as { kind: IdleKind; at: number } | null,
    nextIdle: 3 + Math.random() * 8,
    cheerSeen: 0,
    activeSince: 0,
  });

  useFrame(({ clock }, rawDt) => {
    // Até 0,1 s por quadro: em aparelho fraco (10 qps) o andar não fica em câmera lenta.
    const dt = Math.min(rawDt, 0.1);
    const a = anim.current;
    const key = target.position.join();
    if (key !== a.planned) {
      a.planned = key;
      a.path = planPath(a.pos, new THREE.Vector3(...target.position));
    }
    const far = a.path.length > 0;
    // Para sair da cadeira, levanta primeiro; para sentar, chega primeiro.
    const wantSit = seatTarget && !far ? 1 : 0;
    if (a.sit > 0.02 && far) a.sit = Math.max(0, a.sit - SIT_SPEED * dt);
    else a.sit = THREE.MathUtils.clamp(a.sit + Math.sign(wantSit - a.sit) * SIT_SPEED * dt, 0, 1);

    let moving = false;
    if (far && a.sit <= 0.02) {
      const distanceToGoal = a.pos.distanceTo(new THREE.Vector3(...target.position));
      a.speed = THREE.MathUtils.damp(a.speed, Math.min(WALK_SPEED, 0.6 + distanceToGoal * 2), 7, dt);
      let budget = a.speed * dt;
      let traveled = 0;
      let heading: THREE.Vector3 | null = null;
      while (budget > 0 && a.path.length > 0) {
        const step = a.path[0]!.clone().sub(a.pos);
        const dist = step.length();
        if (dist <= budget) {
          a.pos.copy(a.path.shift()!);
          budget -= dist;
          traveled += dist;
        } else {
          traveled += budget;
          a.pos.addScaledVector(step.normalize(), budget);
          budget = 0;
        }
        if (dist > 1e-4) heading = step;
      }
      a.stride += traveled * 4.1;
      if (heading) {
        a.rot = angleLerp(a.rot, Math.atan2(-heading.x, -heading.z), Math.min(1, dt * 12));
        moving = true;
      }
    } else {
      a.speed = THREE.MathUtils.damp(a.speed, 0, 10, dt);
      a.rot = angleLerp(a.rot, target.rotationY, Math.min(1, dt * 8));
    }
    a.walk = THREE.MathUtils.damp(a.walk, moving ? 1 : 0, 10, dt);
    if (props.isMe) {
      // A câmera em terceira pessoa segue este boneco.
      localAvatar.ready = true;
      localAvatar.pos.copy(a.pos);
      localAvatar.rot = a.rot;
      localAvatar.sit = a.sit;
    }

    // Gestos são poses aditivas, com antecipação e retorno; não deixam articulações presas.
    const now = performance.now();
    const cue = props.gesture && now < props.gesture.at ? props.gesture.previous : props.gesture;
    const age = cue ? (now - cue.at) / 1000 : 99;
    const desiredGesture = { ...characterGesture(character, cue?.kind, age), think: 0 };
    const gesturing = !!cue && age > -0.2 && age < 1.6;
    const clockNow = clock.elapsedTime;
    const hasCards = typeof props.hand === 'number' ? props.hand > 0 : props.hand.length > 0;
    // Vida entre jogadas: sorteio local, só sentado, conectado, fora da vez e sem gesto em curso.
    const calm = seatTarget && a.sit > 0.95 && a.walk < 0.05 && props.connected && !props.active && !gesturing &&
      props.speakingAt === null && !props.signal;
    if (a.idle && (clockNow - a.idle.at >= IDLE_DURATION[a.idle.kind] || gesturing || props.active || a.sit < 0.9)) a.idle = null;
    if (!a.idle && clockNow >= a.nextIdle) {
      if (calm) {
        a.idle = { kind: pickIdle(character, hasCards, Math.random()), at: clockNow };
        idleSound(a.idle.kind, localAvatar.ready ? a.pos.distanceTo(localAvatar.pos) : 2);
      }
      a.nextIdle = clockNow + (calm ? IDLE_GAP[0] + Math.random() * (IDLE_GAP[1] - IDLE_GAP[0]) : 2 + Math.random() * 2);
    }
    // Brinde pedido por frase rápida: o gole começa já, se estiver sentado e fora da vez.
    if (props.cheerAt !== null && props.cheerAt !== a.cheerSeen) {
      a.cheerSeen = props.cheerAt;
      if (seatTarget && a.sit > 0.9 && !props.active && now - props.cheerAt < 1500) {
        a.idle = { kind: 'gole', at: clockNow };
        idleSound('gole', localAvatar.ready ? a.pos.distanceTo(localAvatar.pos) : 2);
        a.nextIdle = clockNow + IDLE_GAP[0] + Math.random() * (IDLE_GAP[1] - IDLE_GAP[0]);
      }
    }
    const idleAge = a.idle ? clockNow - a.idle.at : 0;
    const idle = idlePose(a.idle?.kind, idleAge);
    for (const key of Object.keys(idle) as (keyof typeof idle)[]) desiredGesture[key] += idle[key];
    // Quem tem a vez pensa (depois de um instante, para não estalar em decisões rápidas).
    if (props.active) a.activeSince ||= now;
    else a.activeSince = 0;
    desiredGesture.think = props.active && !gesturing && now - a.activeSince > 700 ? 1 : 0;
    const gesture = acting.current;
    // Um novo canto pode interromper uma reação: mistura as poses em vez de estalar os braços.
    for (const key of Object.keys(gesture) as (keyof typeof gesture)[]) {
      gesture[key] = THREE.MathUtils.damp(gesture[key], desiredGesture[key], key === 'think' ? 5 : 18, dt);
    }
    const thinking = thinkingPose(gesture.think, clock.elapsedTime + a.seed);
    const signalAge = props.signal ? (now - props.signal.at) / 1000 : 99;
    const signal = signalPose(props.signal?.signal, signalAge);
    const signaling = signalAge >= 0 && signalAge < SIGNAL_DURATION_MS / 1000;
    const talking = props.speakingAt !== null;
    const speechAge = talking ? (performance.now() - props.speakingAt!) / 1000 : 0;
    const t = clock.elapsedTime + a.seed;
    const s = smooth(a.sit);
    const settled = s * (1 - a.walk);
    const swing = Math.sin(a.stride) * 0.6 * a.walk;
    root.current?.position.copy(a.pos);
    if (root.current) root.current.rotation.y = a.rot;
    if (root.current) root.current.visible = !(props.hideSeated && s > 0.9);
    if (hips.current) hips.current.position.y = THREE.MathUtils.lerp(0.93, SEAT_HEIGHT + 0.07, s) + Math.abs(Math.sin(a.stride)) * 0.04 * a.walk;
    if (hips.current) hips.current.position.z = 0.06 * s;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const leg = legs[i]!.current;
      const knee = knees[i]!.current;
      const arm = arms[i]!.current;
      if (leg) leg.rotation.x = THREE.MathUtils.lerp(side * swing, Math.PI / 2, s);
      if (knee) knee.rotation.x = THREE.MathUtils.lerp(Math.max(0, -side * swing) * -0.8, -Math.PI / 2, s);
      if (arm) {
        // Sentado, os braços vão à frente segurando as cartas; andando, balançam.
        const hasCards = typeof props.hand === 'number' ? props.hand > 0 : props.hand.length > 0;
        const armRest = hasCards ? (i === 0 ? 1.15 : 0.85) : 0.3;
        arm.rotation.x = THREE.MathUtils.lerp(-side * swing * 0.8, armRest + Math.sin(t * 1.3 + i) * 0.025, s);
        arm.rotation.z = THREE.MathUtils.lerp(side * 0.08, side * (hasCards ? 0.35 : 0.12), s);
        // A mão esquerda guarda as cartas; a direita faz o gesto. Na vitória, ambas comemoram.
        const weight = i === 1 ? settled : cue?.kind === 'vitoria' ? settled * 0.65 : 0;
        // A esquerda só reacomoda o leque; a direita pensa, coça a cabeça e bebe.
        arm.rotation.x += i === 1 ? (gesture.arm + thinking.arm) * weight : gesture.arm * weight + gesture.leftArm * settled;
        arm.rotation.z += side * (gesture.spread + (i === 1 ? thinking.spread : 0)) * weight;
      }
    }
    if (torso.current) {
      torso.current.rotation.x = -0.1 * s + (gesture.lean + thinking.lean) * settled - (props.active ? 0.035 * settled : 0);
      torso.current.rotation.y = gesture.twist * settled;
      torso.current.rotation.z = Math.sin(a.stride) * 0.025 * a.walk + gesture.sway * settled;
      if (character === 'sardinha') torso.current.rotation.z += signal.tilt * settled;
      torso.current.scale.y = 1 + Math.sin(t * 1.7) * 0.008;
    }
    if (head.current) {
      // Olha de leve em volta; desconectado, cochila; cantando, levanta o queixo.
      // Sardinha mantém a cabeça alinhada à blusa: seu olho baixo não abandona o peixe nos gritos.
      const challengeAge = props.challengeAt !== null ? (now - props.challengeAt) / 1000 : -1;
      const focus = props.partner && props.active && challengeAge > 0.25 && challengeAge < 1.5 ? props.partner : props.focus;
      const heading = focus ? Math.atan2(-(focus[0] - a.pos.x), -(focus[2] - a.pos.z)) - a.rot : Math.sin(t * 0.32) * 0.16;
      const desired = Math.max(-0.65, Math.min(0.65, Math.atan2(Math.sin(heading), Math.cos(heading))));
      a.gaze = THREE.MathUtils.damp(a.gaze, desired, 4, dt);
      head.current.rotation.y = character === 'sardinha' ? 0 : a.gaze * (props.connected ? 1 : 0.2) + gesture.shake * settled;
      head.current.rotation.x = character === 'sardinha' ? 0 : props.connected
        ? Math.sin(t * 0.37) * 0.035 + 0.12 * s + (gesture.nod + thinking.nod) * settled + (talking ? Math.sin(speechAge * 17) * 0.035 : 0)
        : 0.5;
      head.current.rotation.z = character === 'sardinha' ? 0 : gesture.twist * 0.5 + signal.tilt * settled;
    }
    if (hips.current) hips.current.position.y += gesture.bounce * settled;
    for (let i = 0; i < 2; i++) {
      const eye = eyes[i]!.current;
      const closed = !props.connected || (!signaling && t % 3.7 < 0.12);
      if (eye) eye.scale.y = THREE.MathUtils.damp(eye.scale.y, closed ? 0.1 : i === 0 ? signal.leftEye : signal.rightEye, 30, dt);
    }
    if (brows.current) brows.current.position.y = signaling ? signal.brow : gesture.brow * settled;
    if (nose.current) nose.current.position.y = signal.nose;
    if (mouth.current) {
      mouth.current.position.set(signal.mouthX, (character === 'presuntinho' ? -0.15 : -0.1) + signal.mouthY, -HEAD_RADIUS[character] * 0.9 + signal.mouthZ);
      mouth.current.scale.set(signaling ? signal.mouthWidth : 1 + gesture.smile * settled, signal.mouthHeight, 1);
    }
    if (opening.current) opening.current.visible = signal.opening > 0.25;
    if (cards.current) cards.current.visible = s > 0.9;
    // O copo: na beira da mesa; no gole, desliza até a mão, passa para ela e volta ao mesmo lugar.
    const held = a.idle?.kind === 'gole' && idleAge >= GOLE_HELD[0] && idleAge < GOLE_HELD[1] && s > 0.9;
    const arm = arms[1]!.current;
    if (handCup.current && arm && torso.current) {
      handCup.current.visible = held;
      // Fica de pé apesar do braço e do tronco; no gole, a boca do copo vai para o rosto.
      handCup.current.rotation.set(-(arm.rotation.x + torso.current.rotation.x) + gesture.tilt, 0, -arm.rotation.z);
    }
    if (tableCup.current) {
      tableCup.current.visible = seatTarget && s > 0.9 && !held;
      tableCup.current.position.copy(cupRest);
      if (gesture.cup > 0.001 && handCupBottom.current && root.current) {
        handCupBottom.current.getWorldPosition(scratch);
        root.current.worldToLocal(scratch);
        tableCup.current.position.lerp(scratch, Math.min(1, gesture.cup));
      }
    }
  });

  // Saindo da mesa, a câmera deixa de seguir este boneco.
  useEffect(() => {
    if (!props.isMe) return;
    return () => {
      localAvatar.ready = false;
    };
  }, [props.isMe]);
  const r = HEAD_RADIUS[character];

  return (
    <group ref={root}>
      <group ref={tableCup} visible={false}>
        <primitive object={cupOnTable} />
      </group>
      <group ref={hips}>
        {/* Pernas: coxa e canela (com o sapato), com o joelho como segunda articulação. */}
        {[0, 1].map((i) => (
          <group key={i} ref={legs[i]} position={[(i === 0 ? -1 : 1) * HIP_X(character), 0, 0]}>
            <primitive object={parts.coxa[i]!} />
            <group ref={knees[i]} position-y={-0.42}>
              <primitive object={parts.canela[i]!} />
            </group>
          </group>
        ))}
        <group ref={torso}>
          <primitive object={parts.tronco} />
          {/* Braços a partir dos ombros, com a mão na ponta. */}
          {[0, 1].map((i) => (
            <group key={i} ref={arms[i]} position={[(i === 0 ? -1 : 1) * SHOULDER_X(character), 0.55, 0]}>
              <primitive object={parts.braco[i]!} />
              {i === 1 && (
                // Copo na mão direita: o centro do copo fica na palma.
                <group ref={handCup} position={[0, -0.4, -0.05]} visible={false}>
                  <group ref={handCupBottom} position-y={-0.075}>
                    <primitive object={cupInHand} />
                  </group>
                </group>
              )}
              {i === 0 && (
                // Pivô na mão do modelo (personagens.py), acompanhando braço e gestos.
                <group ref={cards} position={[0, -0.38, -0.045]} rotation={[-1.5, 0, -0.35]}>
                  <group position-y={0.08}>
                    <HeldCards hand={props.hand} handKey={props.handKey} faceUp={props.isMe} />
                  </group>
                </group>
              )}
            </group>
          ))}
          <group ref={head} position-y={0.62 + r}>
            <primitive object={parts.cabeca} />
            <group ref={brows}><primitive object={parts.sobrancelhas} /></group>
            <group ref={nose}><primitive object={parts.nariz} /></group>
            <group ref={mouth} position={[0, character === 'presuntinho' ? -0.15 : -0.1, -r * 0.9]}>
              <group position={[0, character === 'presuntinho' ? 0.15 : 0.1, r * 0.9]}><primitive object={parts.boca} /></group>
            </group>
            <group ref={opening} visible={false}><primitive object={parts.abertura} /></group>
            {eyes.map((eye, i) => <group key={i} ref={eye} position={[0, 0.04, -r + 0.03]}>
              <primitive object={parts.olhos[i]!} />
            </group>)}
          </group>
          {!props.isMe && (
            <Html position={[0, 0.83 + 2 * r, 0]} center distanceFactor={4} zIndexRange={[20, 0]} portal={htmlLayer}>
              <div title={`${props.name} · ${CHARACTERS[character].name}`} className={`etiqueta${props.playing ? ' compacta' : ''}${props.connected ? '' : ' caiu'}${props.active ? ' na-vez' : ''}${props.speakingAt !== null ? ' falando' : ''}`}>
                <Portrait character={character} size={44} />
                <div>
                  <strong>{props.name}</strong>
                  <span>
                    {CHARACTERS[character].name}
                    {props.host && ' · anfitrião'}
                  </span>
                  {props.speakingAt !== null && <em className="voz-ativa">Falando</em>}
                  {props.bot ? (
                    <em className="computador">computador</em>
                  ) : !props.connected ? (
                    <em>reconectando…</em>
                  ) : (
                    props.ready && <em className="pronto">pronto</em>
                  )}
                </div>
              </div>
            </Html>
          )}
        </group>
      </group>
    </group>
  );
}
