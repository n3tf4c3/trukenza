import type { MatchView } from '@trukenza/game-engine';

/**
 * Ritmo do computador numa mesa de verdade: responder a um canto pede uma pausa (olha o parceiro, pesa a
 * mão); a última carta sai quase sem pensar; a primeira decisão da mão, quando ainda dá para cantar, demora
 * um pouco mais. Usa só a visão pública: o atraso não denuncia as cartas de ninguém.
 */
export function botThinkScale(view: MatchView, seat: number): number {
  const h = view.hand;
  if (!h || h.ended) return 1;
  if (h.flor.pending || h.envido.pending || h.truco.pending) return 2.2;
  const left = h.cardsLeft[seat] ?? 0;
  if (left <= 1) return 0.55;
  if (left === 3) return 1.25;
  return 1;
}

/** Atraso sorteado na faixa do computador e ajustado pela decisão. */
export function botDelay([lo, hi]: readonly [number, number], scale: number, random: () => number): number {
  return Math.round((lo + random() * (hi - lo)) * scale);
}
