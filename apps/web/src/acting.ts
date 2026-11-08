import type { CharacterId } from '@trukenza/shared';
import { gesturePose, smooth, type GestureKind } from './performance.ts';

/** Ritmo, amplitude e assinatura corporal. Independente das vozes. */
export const ACTING = {
  neymt:        { tempo: 1.10, arm: 1.02, spread: 1.12, head: 0.9, lean: 1, sway: 0.065 },
  presuntinho:  { tempo: 1.04, arm: 0.90, spread: 0.9, head: 0.85, lean: 0.8, sway: 0.045 },
  moleti:       { tempo: 0.92, arm: 0.83, spread: 0.8, head: 0.8, lean: 0.9, sway: 0.025 },
  baiaca:       { tempo: 0.96, arm: 0.98, spread: 1.05, head: 0.85, lean: 0.85, sway: 0.075 },
  luistesoura:  { tempo: 1.12, arm: 0.88, spread: 0.75, head: 0.9, lean: 0.8, sway: 0.035 },
  sardinha:     { tempo: 1.14, arm: 0.78, spread: 0.9, head: 0, lean: 0.65, sway: 0.05 },
  gordodofusca: { tempo: 0.86, arm: 0.85, spread: 1.05, head: 0.8, lean: 0.7, sway: 0.04 },
  tiba:        { tempo: 1.08, arm: 1.08, spread: 1, head: 1, lean: 1.1, sway: 0.055 },
  negon:       { tempo: 0.98, arm: 0.96, spread: 0.85, head: 0.55, lean: 0.85, sway: 0.035 },
} satisfies Record<CharacterId, { tempo: number; arm: number; spread: number; head: number; lean: number; sway: number }>;

export function characterGesture(character: CharacterId, kind: GestureKind | undefined, age: number) {
  const style = ACTING[character];
  // A jogada acompanha o mesmo voo de carta em todos os personagens.
  const t = age * (kind === 'jogar' ? 1 : style.tempo);
  const p = { ...gesturePose(kind, t), sway: 0, brow: 0, smile: 0, leftArm: 0, cup: 0, tilt: 0 };
  if (!kind || !Number.isFinite(t) || t <= 0 || t >= 1.6) return p;
  const envelope = smooth(t / 0.22) * (1 - smooth((t - 0.65) / 0.95));
  p.arm *= style.arm; p.spread *= style.spread; p.lean *= style.lean;
  p.nod *= style.head; p.shake *= style.head;
  if (kind === 'derrota') {
    p.arm = -0.18 * envelope; p.lean = 0.05 * envelope;
    p.nod = 0.10 * style.head * envelope; p.brow = -0.007 * envelope;
    p.smile = -0.05 * envelope;
  } else if (kind === 'vitoria' || kind === 'vaza') {
    p.sway = Math.sin(t * 7) * style.sway * envelope;
    p.smile = 0.10 * envelope; p.brow = 0.012 * envelope;
    if (character === 'tiba') p.arm += Math.sin(t * 16) * 0.22 * envelope; // duas puxadas do punho
    if (character === 'presuntinho') p.bounce += Math.sin(t * 9) ** 2 * 0.018 * envelope;
    if (character === 'luistesoura') p.spread += Math.sin(t * 12) * 0.12 * envelope; // floreio curto
    if (character === 'gordodofusca') p.twist += Math.sin(t * 5) * 0.065 * envelope;
    if (character === 'sardinha') p.sway += Math.sin(t * 12) * 0.025 * envelope;
  } else if (kind === 'canto') {
    p.sway = style.sway * envelope;
    p.brow = 0.009 * envelope;
    if (character === 'luistesoura') p.twist += Math.sin(t * 8) * 0.04 * envelope;
    if (character === 'negon') p.nod += Math.sin(t * 8) * 0.045 * envelope;
  }
  return p;
}

/**
 * Vida entre as jogadas: pequenas ações que cada um faz sozinho na mesa, sem relação com as cartas
 * (o sorteio é local e nada aqui sabe o que alguém tem na mão). Somam-se à pose de repouso sentado.
 */
export type IdleKind = 'gole' | 'leque' | 'cocar' | 'recostar';

export const IDLE_DURATION: Record<IdleKind, number> = { gole: 2.6, leque: 1.4, cocar: 1.8, recostar: 3.2 };

/** Quanto cada personagem gosta de cada ação (soma livre): o Gordo bebe, o Luis arruma, o Moleti se recosta. */
export const IDLE_TASTE: Record<CharacterId, Record<IdleKind, number>> = {
  neymt:        { gole: 3, leque: 2, cocar: 1, recostar: 3 },
  presuntinho:  { gole: 4, leque: 2, cocar: 2, recostar: 1 },
  moleti:       { gole: 3, leque: 1, cocar: 1, recostar: 4 },
  baiaca:       { gole: 4, leque: 2, cocar: 1, recostar: 2 },
  luistesoura:  { gole: 2, leque: 4, cocar: 1, recostar: 2 },
  sardinha:     { gole: 3, leque: 2, cocar: 3, recostar: 1 },
  gordodofusca: { gole: 6, leque: 1, cocar: 1, recostar: 2 },
  tiba:         { gole: 4, leque: 1, cocar: 2, recostar: 2 },
  negon:        { gole: 3, leque: 2, cocar: 2, recostar: 2 },
};

/** Sorteia a próxima ação conforme o gosto do personagem; sem cartas na mão não há leque para arrumar. */
export function pickIdle(character: CharacterId, hasCards: boolean, random: number): IdleKind {
  const taste = IDLE_TASTE[character];
  const kinds = (Object.keys(taste) as IdleKind[]).filter(k => hasCards || k !== 'leque');
  const total = kinds.reduce((sum, k) => sum + taste[k], 0);
  let r = Math.max(0, Math.min(0.999999, random)) * total;
  for (const k of kinds) {
    r -= taste[k];
    if (r < 0) return k;
  }
  return kinds.at(-1)!;
}

type Key = [number, Partial<Record<'arm' | 'spread' | 'lean' | 'nod' | 'tilt' | 'cup' | 'leftArm', number>>];

/** Interpolação suave entre quadros-chave (valor ausente = 0). */
function keyed(keys: Key[], t: number, field: keyof Key[1] & string): number {
  if (t <= keys[0]![0]) return keys[0]![1][field] ?? 0;
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (t <= t1) return (v0[field] ?? 0) + ((v1[field] ?? 0) - (v0[field] ?? 0)) * smooth((t - t0) / (t1 - t0));
  }
  return keys.at(-1)![1][field] ?? 0;
}

/** O gole: estica o braço até o copo, leva à boca, inclina a cabeça, devolve à mesa e solta. */
const GOLE: Key[] = [
  [0, {}],
  [0.45, { arm: 0.6, lean: -0.12, cup: 1 }],
  [1.05, { arm: 1.3, spread: 0.18, lean: 0.05, nod: -0.28, tilt: 0.7, cup: 1 }],
  [1.6, { arm: 1.32, spread: 0.18, lean: 0.06, nod: -0.32, tilt: 0.85, cup: 1 }],
  [2.0, { arm: 0.6, lean: -0.12, cup: 1 }],
  [2.3, { arm: 0.5, lean: -0.08 }],
  [2.6, {}],
];
/** Segura o copo (na mão, fora da mesa) entre o pegar e o soltar. */
export const GOLE_HELD: readonly [number, number] = [0.45, 2.0];

export function idlePose(kind: IdleKind | undefined, age: number) {
  const p = { arm: 0, spread: 0, lean: 0, nod: 0, twist: 0, sway: 0, leftArm: 0, cup: 0, tilt: 0, brow: 0 };
  if (!kind || !Number.isFinite(age) || age <= 0 || age >= IDLE_DURATION[kind]) return p;
  const envelope = smooth(age / 0.35) * (1 - smooth((age - (IDLE_DURATION[kind] - 0.45)) / 0.45));
  switch (kind) {
    case 'gole':
      for (const f of ['arm', 'spread', 'lean', 'nod', 'tilt', 'cup'] as const) p[f] = keyed(GOLE, age, f);
      p.brow = 0.008 * smooth((age - 0.9) / 0.3) * (1 - smooth((age - 1.6) / 0.3));
      break;
    case 'leque':
      // Olha as cartas e reacomoda o leque com a mão que as segura.
      p.leftArm = (0.12 + Math.sin(age * 9) * 0.06) * envelope;
      p.nod = 0.16 * envelope;
      p.twist = 0.05 * envelope;
      break;
    case 'cocar':
      // Mão na nuca, coçando: dúvida de jogador.
      p.arm = 1.85 * envelope;
      p.spread = (0.5 + Math.sin(age * 19) * 0.05) * envelope;
      p.nod = 0.08 * envelope;
      p.twist = -0.06 * envelope;
      break;
    case 'recostar':
      p.lean = 0.13 * envelope;
      p.nod = -0.06 * envelope;
      p.sway = Math.sin(age * 1.6) * 0.03 * envelope;
      break;
  }
  return p;
}

/** Quem tem a vez pensa: mão no queixo, olhar nas próprias cartas e um tamborilar discreto. */
export function thinkingPose(weight: number, t: number) {
  const w = Math.max(0, Math.min(1, weight));
  return { arm: 1.45 * w, spread: (0.32 + Math.sin(t * 3.1) * 0.025) * w, nod: 0.14 * w, lean: -0.05 * w };
}
