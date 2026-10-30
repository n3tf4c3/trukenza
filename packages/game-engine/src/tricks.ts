import { trucoPower, type Card } from './cards.ts';

/** Equipe: 0 ou 1. Na mesa de 4, parceiros frente a frente (cadeiras 0 e 2 contra 1 e 3). */
export type Team = 0 | 1;

export function teamOf(seat: number): Team {
  return (seat % 2) as Team;
}

export interface Play {
  seat: number;
  card: Card;
}

/** Resultado de uma vaza: a equipe vencedora ou 'parda' (empate entre equipes diferentes). */
export type TrickOutcome = Team | 'parda';

/**
 * Quem leva a vaza: a carta mais forte. Se as mais fortes forem da mesma equipe (dois parceiros), a vaza é
 * dela e quem abre a seguinte é quem jogou primeiro entre eles. Se forem de equipes diferentes, é parda.
 */
export function resolveTrick(plays: readonly Play[]): { outcome: TrickOutcome; winnerSeat: number | null } {
  const best = Math.max(...plays.map((p) => trucoPower(p.card)));
  const top = plays.filter((p) => trucoPower(p.card) === best);
  const teams = new Set(top.map((p) => teamOf(p.seat)));
  if (teams.size > 1) return { outcome: 'parda', winnerSeat: null };
  return { outcome: teamOf(top[0]!.seat), winnerSeat: top[0]!.seat };
}

/**
 * Quem ganha a mão pelas vazas jogadas até agora, ou null se ainda não está decidido.
 * - Duas vazas da mesma equipe: ela ganha.
 * - Parda na primeira: decide a segunda; parda também na segunda: decide a terceira.
 * - Ganhou a primeira e empatou a segunda: ganha quem ganhou a primeira.
 * - Uma vaza para cada e parda na terceira: ganha quem ganhou a primeira.
 * - Três pardas: ganha a equipe do mão.
 */
export function handWinner(results: readonly TrickOutcome[], manoTeam: Team): Team | null {
  const [r1, r2, r3] = results;
  if (r1 === undefined || r2 === undefined) return null;
  if (r1 === 'parda') {
    if (r2 !== 'parda') return r2;
    if (r3 === undefined) return null;
    return r3 === 'parda' ? manoTeam : r3;
  }
  if (r2 === 'parda' || r2 === r1) return r1;
  if (r3 === undefined) return null;
  return r3 === 'parda' ? r1 : r3;
}
