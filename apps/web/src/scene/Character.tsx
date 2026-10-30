import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '@trukenza/shared';
import type { Card } from '@trukenza/game-engine';
import { Portrait } from '../ui/Portrait';
import { CHAIR_RADIUS, DOOR, SEAT_HEIGHT, polar } from './layout';
import { HeldCards } from './Cards';
import { localAvatar } from './avatar';
import { htmlLayer } from './htmlLayer';
import { HEAD_RADIUS, useCharacterParts } from './personagens';
import type { Gesture } from '../store';

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
}

const WALK_SPEED = 3.4;
const SIT_SPEED = 3;
/** Raio de contorno: quem anda nunca atravessa a mesa nem as cadeiras. */
const AROUND = CHAIR_RADIUS + 0.65;
/** Segmentos que passam mais perto do centro que isto cruzariam a mesa ou as cadeiras. */
const BLOCK = CHAIR_RADIUS + 0.35;

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
  const blink = useRef<THREE.Group>(null);
  const cards = useRef<THREE.Group>(null);
  const anim = useRef({
    pos: new THREE.Vector3(...(startAtTarget ? target.position : DOOR)),
    rot: startAtTarget ? target.rotationY : Math.PI / 2,
    sit: startAtTarget && seatTarget ? 1 : 0,
    path: [] as THREE.Vector3[],
    /** Destino para o qual `path` foi calculado. */
    planned: startAtTarget ? target.position.join() : '',
    walk: 0,
    stride: 0,
    seed: Math.random() * 100,
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
      let budget = WALK_SPEED * dt;
      let heading: THREE.Vector3 | null = null;
      while (budget > 0 && a.path.length > 0) {
        const step = a.path[0]!.clone().sub(a.pos);
        const dist = step.length();
        if (dist <= budget) {
          a.pos.copy(a.path.shift()!);
          budget -= dist;
        } else {
          a.pos.addScaledVector(step.normalize(), budget);
          budget = 0;
        }
        if (dist > 1e-4) heading = step;
      }
      if (heading) {
        a.rot = angleLerp(a.rot, Math.atan2(-heading.x, -heading.z), Math.min(1, dt * 12));
        moving = true;
      }
    } else {
      a.rot = angleLerp(a.rot, target.rotationY, Math.min(1, dt * 8));
    }
    a.walk = THREE.MathUtils.damp(a.walk, moving ? 1 : 0, 10, dt);
    if (moving) a.stride += dt * 11;
    if (props.isMe) {
      // A câmera em terceira pessoa segue este boneco.
      localAvatar.ready = true;
      localAvatar.pos.copy(a.pos);
      localAvatar.rot = a.rot;
      localAvatar.sit = a.sit;
    }

    // Gesto: sobe rápido, segura e desce (1,6 s no total).
    const age = props.gesture ? (performance.now() - props.gesture.at) / 1000 : 99;
    const gesture = {
      kind: props.gesture?.kind,
      amount: age < 0.2 ? age / 0.2 : age < 1.1 ? 1 : Math.max(0, 1 - (age - 1.1) / 0.5),
    };
    const t = clock.elapsedTime + a.seed;
    const s = a.sit;
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
        arm.rotation.x = THREE.MathUtils.lerp(-side * swing * 0.8, 1.15 + Math.sin(t * 1.3 + i) * 0.03, s);
        arm.rotation.z = THREE.MathUtils.lerp(side * 0.08, side * -0.35, s);
        // Gestos: quem canta ergue um braço; quem ganha a mão comemora com os dois.
        const raise = gesture.kind === 'canto' ? (i === 1 ? gesture.amount : 0) : gesture.kind === 'vitoria' ? gesture.amount : 0;
        if (raise > 0) {
          arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, 2.75 + Math.sin(t * 14) * 0.08 * raise, raise);
          arm.rotation.z = THREE.MathUtils.lerp(arm.rotation.z, side * -0.45, raise);
        }
      }
    }
    if (torso.current) {
      torso.current.rotation.x = -0.1 * s;
      torso.current.scale.y = 1 + Math.sin(t * 2.2) * 0.015;
    }
    if (head.current) {
      // Olha de leve em volta; desconectado, cochila; cantando, levanta o queixo.
      head.current.rotation.y = Math.sin(t * 0.5) * 0.35 * (props.connected ? 1 : 0.2);
      head.current.rotation.x = props.connected ? Math.sin(t * 0.37) * 0.08 + 0.12 * s - 0.25 * gesture.amount : 0.5;
    }
    if (hips.current && gesture.kind === 'vitoria') hips.current.position.y += Math.abs(Math.sin(t * 9)) * 0.03 * gesture.amount;
    if (blink.current) {
      const closed = !props.connected || t % 3.7 < 0.12;
      blink.current.scale.y = THREE.MathUtils.damp(blink.current.scale.y, closed ? 0.1 : 1, 30, dt);
    }
    if (cards.current) cards.current.visible = s > 0.9;
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
      <group ref={hips}>
        {/* Pernas: coxa e canela (com o sapato), com o joelho como segunda articulação. */}
        {[0, 1].map((i) => (
          <group key={i} ref={legs[i]} position={[i === 0 ? -0.11 : 0.11, 0, 0]}>
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
            <group key={i} ref={arms[i]} position={[i === 0 ? -0.27 : 0.27, 0.55, 0]}>
              <primitive object={parts.braco[i]!} />
            </group>
          ))}
          <group ref={cards} position={[0, 0.36, -0.42]} rotation-x={-0.35}>
            <HeldCards hand={props.hand} handKey={props.handKey} faceUp={props.isMe} />
          </group>
          <group ref={head} position-y={0.62 + r}>
            <primitive object={parts.cabeca} />
            <group ref={blink} position={[0, 0.04, -r + 0.03]}>
              <primitive object={parts.olhos} />
            </group>
          </group>
          {!props.isMe && (
            <Html position={[0, 0.95 + 2 * r, 0]} center distanceFactor={4} zIndexRange={[20, 0]} portal={htmlLayer}>
              <div className={`etiqueta${props.connected ? '' : ' caiu'}${props.active ? ' na-vez' : ''}`}>
                <Portrait character={character} size={44} />
                <div>
                  <strong>{props.name}</strong>
                  <span>
                    {CHARACTERS[character].name}
                    {props.host && ' · anfitrião'}
                  </span>
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
