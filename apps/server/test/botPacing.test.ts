import { describe, expect, it } from 'vitest';
import type { MatchView } from '@trukenza/game-engine';
import { botDelay, botThinkScale } from '../src/botPacing.ts';

type Hand = NonNullable<MatchView['hand']>;
const view = (hand: Partial<Hand> | null): MatchView => ({
  hand: hand && {
    ended: false,
    cardsLeft: [3, 3, 3, 3],
    truco: { level: 1, raiseRight: null, pending: null },
    envido: { status: 'aberto', chain: [], pending: null, result: null },
    flor: { status: 'nenhuma', announced: [], chain: [], pending: null, result: null },
    ...hand,
  },
}) as unknown as MatchView;

describe('ritmo do computador', () => {
  it('pensa mais para responder a um canto do que para jogar', () => {
    const pending = { team: 0, seat: 0 } as unknown as Hand['truco']['pending'];
    const truco = view({ cardsLeft: [2, 2, 2, 2], truco: { level: 2, raiseRight: null, pending } });
    const play = view({ cardsLeft: [2, 2, 2, 2] });
    expect(botThinkScale(truco, 1)).toBeGreaterThan(botThinkScale(play, 1) * 2);
  });

  it('solta a última carta mais depressa e demora mais na primeira decisão da mão', () => {
    expect(botThinkScale(view({ cardsLeft: [1, 1, 1, 1] }), 2)).toBeLessThan(1);
    expect(botThinkScale(view({ cardsLeft: [3, 3, 3, 3] }), 2)).toBeGreaterThan(1);
    expect(botThinkScale(view(null), 0)).toBe(1);
  });

  it('o atraso fica na faixa escalada', () => {
    expect(botDelay([900, 1800], 1, () => 0)).toBe(900);
    expect(botDelay([900, 1800], 2.2, () => 0.999999)).toBeLessThanOrEqual(3960);
    expect(botDelay([900, 1800], 0.55, () => 0.5)).toBe(743);
  });
});
