import { parseCardId, resolveTrick, type MatchView, type ResponseStakes, type Team } from '@trukenza/game-engine';

/** Reutiliza o motor também na vaza incompleta: empate entre duplas não tem líder. */
export function trickStanding(trick: NonNullable<MatchView['hand']>['tricks'][number]) {
  if (trick.outcome !== null) return { outcome: trick.outcome, winnerSeat: trick.winnerSeat };
  if (trick.plays.length === 0) return null;
  return resolveTrick(trick.plays.map(p => ({ seat: p.seat, card: parseCardId(p.card)! })));
}

export function responseHint(action: string, stakes: ResponseStakes | null | undefined): string | null {
  if (!stakes) return null;
  const tentos = (n: number) => `${n} ${n === 1 ? 'tento' : 'tentos'}`;
  if (action === 'quero') return `${stakes.kind === 'truco' ? 'Mão' : 'Disputa'} vale ${tentos(stakes.accepted)}`;
  if (action === 'nao-quero' || action === 'me-achico') return `Entrega ${tentos(stakes.refused)}`;
  return null;
}

/**
 * A partida como chega do servidor (`state.game`): a visão pública do motor e o relógio de quem decide.
 * O cliente só mostra: quem pode o quê vem pronto do servidor (`MSG_HAND`).
 */
export type GameView = MatchView & {
  lastHandSummary?: import('@trukenza/game-engine').HandSummary | null;
  timer: { seconds: number; remainingMs: number | null };
  /** Quando este estado chegou (relógio local), para contar o tempo que resta. */
  receivedAt: number;
};

/** Cores das duplas (ou dos dois lados no mano a mano): anel das cadeiras, placar e etiquetas. */
export const TEAM_COLORS: Record<Team, string> = { 0: '#4f8cff', 1: '#ff7a45' };

export const ACTION_LABELS: Record<string, string> = {
  truco: 'Truco!',
  retruco: 'Retruco!',
  'vale-quatro': 'Vale Quatro!',
  envido: 'Envido',
  'real-envido': 'Real Envido',
  'falta-envido': 'Falta Envido',
  flor: 'Flor!',
  'contra-flor': 'Contra-Flor',
  'contra-flor-resto': 'Contra-Flor e o Resto',
  quero: 'Quero',
  'nao-quero': 'Não quero',
  'me-achico': 'Me achico',
  baralho: 'Ir ao baralho',
  contestar: 'Contestar',
};

/** O grito que aparece na mesa quando alguém canta. */
export const SHOUTS: Record<string, string> = {
  truco: 'TRUCO!',
  retruco: 'RETRUCO!',
  'vale-quatro': 'VALE QUATRO!',
  envido: 'ENVIDO!',
  'real-envido': 'REAL ENVIDO!',
  'falta-envido': 'FALTA ENVIDO!',
  flor: 'FLOR!',
  'contra-flor': 'CONTRA-FLOR!',
  'contra-flor-resto': 'CONTRA-FLOR E O RESTO!',
  quero: 'Quero!',
  'nao-quero': 'Não quero!',
  'me-achico': 'Me achico',
};

/** Respostas a um pedido: ficam destacadas. */
export const RESPONSES = new Set(['quero', 'nao-quero', 'me-achico']);

export function teamOfSeat(seat: number): Team {
  return (seat % 2) as Team;
}

/** "Dupla A"/"Dupla B" na mesa de 4; no mano a mano, o nome de quem está naquele lado. */
export function teamName(team: Team, seats: number, nameAt: (seat: number) => string): string {
  if (seats === 4) return team === 0 ? 'Dupla A' : 'Dupla B';
  return nameAt(team);
}

/** Na partida de 24: de 0 a 11 são as malas, de 12 a 23 as boas. */
export function scoreBand(score: number, goal: number): 'malas' | 'boas' | null {
  if (goal !== 24) return null;
  return score < 12 ? 'malas' : 'boas';
}

/** Valor da mão agora, com o nome do nível do Truco. */
export const TRUCO_LEVELS: Record<number, string> = { 1: 'Sem Truco', 2: 'Truco', 3: 'Retruco', 4: 'Vale Quatro' };

