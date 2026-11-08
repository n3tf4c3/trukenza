import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraMode } from '../store';
import { localAvatar } from './avatar';
import { DRAG_PX, freeCamera, resetFreeCamera } from './freeCamera';

const UP = new THREE.Vector3(0, 1, 0);

/** Posição da câmera e ponto para onde ela olha, no referencial do personagem (ele olha para -z). */
interface Frame {
  eye: THREE.Vector3;
  look: THREE.Vector3;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Câmera livre é a visão principal, de pé ou sentado: parte de trás do próprio personagem, um pouco acima e
 * ao lado, para a mesa com os outros jogadores aparecer inteira; arrastar gira em volta do ponto que ela
 * olha, a roda (ou a pinça) aproxima, e o duplo clique volta ao começo. As cartas da mão vão no pé da tela
 * (HandHud). Cartas de perto: primeira pessoa, só sentado.
 */
const THIRD_STANDING: Frame = { eye: v(0.45, 2.2, 2.1), look: v(0, 0.9, -3.0) };
// Alta o bastante para as cartas no centro da mesa não ficarem achatadas (inclinação de ~28°).
const THIRD_SEATED: Frame = { eye: v(0.55, 2.65, 1.25), look: v(-0.05, 0.88, -1.8) };
const THIRD_SEATED_PORTRAIT: Frame = { eye: v(0.35, 3.0, 1.85), look: v(0, 0.78, -2.1) };
// De perto: debruçado sobre a mesa, olhando o centro de cima.
const CLOSE_UP: Frame = { eye: v(0, 1.95, 0.05), look: v(0, 1.10, -2.0) };
const CLOSE_UP_PORTRAIT: Frame = { eye: v(0, 2.65, 0.8), look: v(0, 0.9, -2.0) };
/** Plano aberto para apreciar os destinos, com a mesa ainda ao alcance do jogador. */
const PANORAMA: Frame = { eye: v(0, 2.15, 0.8), look: v(0, 1.65, -3) };

/** Antes de o próprio personagem existir na cena: um plano de entrada, na altura das pessoas. */
const ENTRY: Frame = { eye: v(1.2, 2.2, 5.2), look: v(-0.5, 0.9, 0) };

/** Limites da câmera livre: dentro do bolicho (paredes a 6 m, forro a 3,4 m) e sem passar por baixo do piso. */
const ROOM_LIMIT = 5.6;
const FLOOR_Y = 0.35;
const CEILING_Y = 3.15;
const ZOOM = [0.4, 2.2] as const;
const PITCH = [-0.9, 1.2] as const;
const PHI = [0.12, 1.5] as const;

function lerpFrame(a: Frame, b: Frame, k: number): Frame {
  return { eye: a.eye.clone().lerp(b.eye, k), look: a.look.clone().lerp(b.look, k) };
}

const clamp = THREE.MathUtils.clamp;

/** Arrastar (mouse ou um dedo) gira; roda do mouse ou dois dedos aproximam. Só com a câmera livre. */
function useFreeControls(enabled: boolean, dragging: { current: boolean }): void {
  const dom = useThree((s) => s.gl.domElement);
  useEffect(() => {
    if (!enabled) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const now = spread();
        if (pinch > 0 && now > 0) freeCamera.zoom = clamp(freeCamera.zoom * (pinch / now), ZOOM[0], ZOOM[1]);
        pinch = now;
        dragging.current = true;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < DRAG_PX) return;
      dragging.current = true;
      const scale = 3 / Math.max(dom.clientHeight, 1);
      freeCamera.yaw -= dx * scale;
      freeCamera.pitch = clamp(freeCamera.pitch + dy * scale, PITCH[0], PITCH[1]);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = spread();
      if (pointers.size === 0) dragging.current = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      freeCamera.zoom = clamp(freeCamera.zoom * Math.exp(e.deltaY * 0.0012), ZOOM[0], ZOOM[1]);
    };
    dom.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.addEventListener('dblclick', resetFreeCamera);
    return () => {
      dom.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
      dom.removeEventListener('dblclick', resetFreeCamera);
      dragging.current = false;
    };
  }, [enabled, dom, dragging]);
}

export function CameraRig({ mode }: { mode: CameraMode }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const pointer = useThree((s) => s.pointer);
  const look = useRef(new THREE.Vector3(0, 1, 0));
  const dragging = useRef(false);
  const offset = useRef(new THREE.Vector3());
  const spherical = useRef(new THREE.Spherical());
  useFreeControls(mode === 'livre', dragging);
  useFrame(({ size }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const portrait = size.height > size.width;
    let eye: THREE.Vector3;
    let target: THREE.Vector3;
    const closeUp = mode === 'cartas' && localAvatar.sit > 0.9;
    const panorama = mode === 'panorama' && localAvatar.sit > 0.9;
    if (!localAvatar.ready) {
      eye = ENTRY.eye.clone();
      target = ENTRY.look.clone();
    } else {
      // Sentar aproxima a câmera aos poucos, junto com o corpo.
      const seated = portrait ? THIRD_SEATED_PORTRAIT : THIRD_SEATED;
      const f = panorama ? PANORAMA : closeUp ? (portrait ? CLOSE_UP_PORTRAIT : CLOSE_UP) : lerpFrame(THIRD_STANDING, seated, localAvatar.sit);
      // De perto, um leve deslocamento com o ponteiro dá profundidade sem tirar o controle de quem joga.
      const local = closeUp ? f.eye.clone().add(v(pointer.x * 0.04, pointer.y * 0.02, 0)) : f.eye.clone();
      eye = local.applyAxisAngle(UP, localAvatar.rot).add(localAvatar.pos);
      target = f.look.clone().applyAxisAngle(UP, localAvatar.rot).add(localAvatar.pos);
    }
    if (mode === 'livre' && localAvatar.ready) {
      // O ajuste do jogador gira o olho em volta do alvo, sem sair do bolicho.
      const s = spherical.current.setFromVector3(offset.current.copy(eye).sub(target));
      s.theta += freeCamera.yaw;
      s.phi = clamp(s.phi - freeCamera.pitch, PHI[0], PHI[1]);
      s.radius *= freeCamera.zoom;
      eye = target.clone().add(offset.current.setFromSpherical(s));
      eye.set(clamp(eye.x, -ROOM_LIMIT, ROOM_LIMIT), clamp(eye.y, FLOOR_Y, CEILING_Y), clamp(eye.z, -ROOM_LIMIT, ROOM_LIMIT));
    }
    // Arrastando, a câmera acompanha mais depressa a mão de quem gira.
    const k = 1 - Math.exp(-(dragging.current ? 12 : 4) * dt);
    camera.position.lerp(eye, k);
    look.current.lerp(target, k);
    camera.lookAt(look.current);
    const fov = portrait ? 68 : panorama ? 68 : closeUp ? 62 : 56;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov, 3, dt);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
