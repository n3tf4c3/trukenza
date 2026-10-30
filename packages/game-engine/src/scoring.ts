import type { Team } from './tricks.ts';

export type ScoreKind = 'truco' | 'envido' | 'flor' | 'contestacao';

/** Uma linha do histórico: o que deu pontos, quantos, para quem e como ficou o placar. */
export interface ScoreEntry {
  hand: number;
  kind: ScoreKind;
  /** Texto curto para a tela: "Truco aceito", "Real Envido recusado", "Flor"… */
  detail: string;
  team: Team;
  value: number;
  score: [number, number];
}

/**
 * Placar da partida. Cada concessão tem uma chave única (mão + aposta): repetir a mesma chave não dá pontos
 * de novo. Ao alcançar a meta, a partida acaba e nenhuma concessão posterior vale.
 */
export class Scoring {
  readonly goal: number;
  score: [number, number] = [0, 0];
  readonly history: ScoreEntry[] = [];
  winner: Team | null = null;
  private readonly keys = new Set<string>();

  constructor(goal: number) {
    this.goal = goal;
  }

  /** Devolve se os pontos entraram. */
  award(key: string, hand: number, kind: ScoreKind, detail: string, team: Team, value: number): boolean {
    if (this.winner !== null || this.keys.has(key) || value <= 0) return false;
    this.keys.add(key);
    this.score[team] += value;
    this.history.push({ hand, kind, detail, team, value, score: [this.score[0], this.score[1]] });
    if (this.score[team] >= this.goal) this.winner = team;
    return true;
  }

  /**
   * Tira tentos de uma equipe (contestação), sem passar de zero. A linha do histórico leva o valor negativo
   * que de fato saiu, para a soma do histórico continuar igual ao placar. Devolve quanto saiu.
   */
  penalize(key: string, hand: number, detail: string, team: Team, value: number): number {
    if (this.winner !== null || this.keys.has(key) || value <= 0) return 0;
    this.keys.add(key);
    const taken = Math.min(value, this.score[team]);
    this.score[team] -= taken;
    this.history.push({ hand, kind: 'contestacao', detail, team, value: 0 - taken, score: [this.score[0], this.score[1]] });
    return taken;
  }
}
