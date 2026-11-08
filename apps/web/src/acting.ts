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
  const p = { ...gesturePose(kind, t), sway: 0, brow: 0, smile: 0 };
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
