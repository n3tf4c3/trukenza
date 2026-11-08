/**
 * Poses do bolicheiro e do cachorro do bolicho (sem three: testável no Node). Os pontos de giro são os
 * mesmos dos nós de `assets/blender/bolicho.py`. Eles só reagem ao que é público: gritos e falas da mesa.
 */

/** Pescoço do cachorro (focinho para -x) e do bolicheiro (rosto para +z), no chão do jogo (x, z). */
export const DOG_NECK: readonly [number, number] = [0.19, 4.5];
export const BARKEEP_NECK: readonly [number, number] = [0, -5.15];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (x: number) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };

/** Giro horizontal da cabeça do cachorro para olhar um ponto (o focinho aponta para -x no repouso). */
export function dogYaw(target: readonly [number, number]): number {
  return clamp(Math.atan2(target[1] - DOG_NECK[1], -(target[0] - DOG_NECK[0])), -1.15, 0.8);
}

/** Giro horizontal da cabeça do bolicheiro (rosto para +z no repouso). */
export function barkeepYaw(target: readonly [number, number]): number {
  return clamp(Math.atan2(target[0] - BARKEEP_NECK[0], target[1] - BARKEEP_NECK[1]), -0.8, 0.8);
}

/**
 * Cachorro: `alert` (0 a 1) ergue a cabeça e anima o rabo; em repouso ele cochila com o focinho nas patas
 * e o rabo mal se mexe. `t` em segundos.
 */
export function dogPose(t: number, alert: number) {
  const a = ease(alert);
  return {
    /** Positivo abaixa o focinho. */
    pitch: 0.32 * (1 - a) - 0.06 * a + 0.025 * Math.sin(t * 0.9),
    tailLift: 0.22 + 0.4 * a,
    tailWag: Math.sin(t * (2.2 + 11 * a)) * (0.12 + 0.45 * a),
    breath: 1 + Math.sin(t * (1.6 + 0.8 * a)) * 0.03,
  };
}

/**
 * Bolicheiro: seca o copo em círculos curtos; `attention` (0 a 1) para a mão e levanta o olhar para a mesa;
 * `nodAge` (s) faz o aceno de quem anotou o pedido.
 */
export function barkeepPose(t: number, attention: number, nodAge: number) {
  const a = ease(attention);
  const wipe = 1 - 0.75 * a;
  const nod = nodAge >= 0 && nodAge < 1.2 ? Math.sin(nodAge * 11) * 0.16 * (1 - nodAge / 1.2) : 0;
  return {
    /** Positivo inclina o rosto para baixo. */
    pitch: 0.34 * (1 - a) + 0.06 * a + nod,
    armX: 0.12 + Math.sin(t * 5.2) * 0.11 * wipe,
    armY: Math.cos(t * 5.2) * 0.13 * wipe,
  };
}
