import type { MatchView } from './match.ts';
import type { ScoreEntry } from './scoring.ts';
import type { Team, TrickOutcome } from './tricks.ts';

/** Só o resultado e os pontos públicos: continua disponível na mão seguinte. */
export interface HandSummary {
  number: number;
  ended: NonNullable<NonNullable<MatchView['hand']>['ended']>;
  outcomes: TrickOutcome[];
  points: [number, number];
  entries: ScoreEntry[];
}

export function summarizeHand(view: MatchView): HandSummary | null {
  const h = view.hand;
  if (!h?.ended) return null;
  const entries = view.history.filter(e => e.hand === h.number);
  const total = (team: Team) => entries.filter(e => e.team === team).reduce((sum, e) => sum + e.value, 0);
  return { number: h.number, ended: { ...h.ended }, outcomes: h.tricks.flatMap(t => t.outcome === null ? [] : [t.outcome]),
    points: [total(0), total(1)], entries };
}
