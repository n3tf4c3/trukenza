import { expect, it, vi } from 'vitest';
import { SpanishMatch, botAction, botContests, cardId, gauderio, parseCardId, seededRandom, summarizeHand } from '../src/index.ts';

it('os três níveis concluem partidas de dois e quatro sem consultar cartas alheias', () => {
  for (const level of ['tranquilo', 'equilibrado', 'competitivo'] as const) {
    for (let seed = 1; seed <= 20; seed++) {
      const m = new SpanishMatch(gauderio({ goal: seed % 3 ? 12 : 24, flor: seed % 2 === 0 }), seed % 2 ? 2 : 4, seed);
      m.startHand();
      const random = seededRandom(seed * 7);
      const hand = vi.spyOn(m, 'handOf'), dealt = vi.spyOn(m, 'dealtOf');
      for (let n = 0; m.winner === null; n++) {
        expect(n).toBeLessThan(4000);
        if (m.handOver) {
          const s = m.actors().find(s => botContests(m, s));
          if (s === undefined) m.nextHand(); else expect(m.apply(s, { type: 'contestar' }).ok).toBe(true);
          continue;
        }
        const seat = m.actors()[0]!;
        hand.mockClear(); dealt.mockClear();
        const action = botAction(m, seat, random, [], level);
        expect(hand.mock.calls.every(([s]) => s === seat)).toBe(true);
        expect(dealt.mock.calls.every(([s]) => s === seat)).toBe(true);
        expect(m.legalActions(seat)).toContainEqual(action);
        expect(m.apply(seat, action).ok).toBe(true);
      }
      expect(Math.max(...m.view().score)).toBeGreaterThanOrEqual(m.config.goal);
    }
  }
});

it('competitivo empata a primeira quando não pode ganhar; equilibrado conserva a carta', () => {
  const m = new SpanishMatch(gauderio({ flor: false }), 2, 1);
  m.setDealerForTests(1);
  m.startHand([['3-copas', '1-espadas', '5-ouros'], ['4-copas', '3-espadas', '5-bastos']].map(h => h.map(id => parseCardId(id)!)));
  expect(m.apply(0, { type: 'jogar', card: parseCardId('3-copas')! }).ok).toBe(true);
  expect(cardId(botAction(m, 1, () => 1, [], 'equilibrado').card!)).toBe('4-copas');
  const action = botAction(m, 1, () => 1, [], 'competitivo');
  expect(cardId(action.card!)).toBe('3-espadas');
  expect(m.apply(1, action).ok).toBe(true);
  expect(m.view().hand!.tricks[0]!.outcome).toBe('parda');
});

it('competitivo fecha a terceira parda e o resumo registra o vencedor', () => {
  const m = new SpanishMatch(gauderio({ flor: false }), 2, 1);
  m.setDealerForTests(1);
  m.startHand([['3-copas', '4-espadas', '5-ouros'], ['4-copas', '1-espadas', '5-bastos']].map(h => h.map(id => parseCardId(id)!)));
  const play = (seat: number, id: string) => expect(m.apply(seat, { type: 'jogar', card: parseCardId(id)! }).ok).toBe(true);
  play(0, '3-copas'); play(1, '4-copas'); play(0, '4-espadas'); play(1, '1-espadas'); play(1, '5-bastos');
  const action = botAction(m, 0, () => 1, [], 'competitivo');
  expect(cardId(action.card!)).toBe('5-ouros');
  expect(m.apply(0, action).ok).toBe(true);
  expect(m.view().hand!.ended!.winnerTeam).toBe(0);
  expect(summarizeHand(m.view())!.outcomes).toEqual([0, 1, 'parda']);
});

it('resumo soma cantos e penalidades por equipe e não inclui cartas', () => {
  const m = new SpanishMatch(gauderio({ flor: false }), 2, 2); m.startHand();
  expect(summarizeHand(m.view())).toBeNull();
  expect(m.apply(m.actors()[0]!, { type: 'baralho' }).ok).toBe(true);
  const view = m.view();
  view.history.push({ hand: 1, kind: 'envido', detail: 'Envido', team: 0, value: 3, score: [3, 1] },
    { hand: 1, kind: 'contestacao', detail: 'Contestação', team: 0, value: -2, score: [1, 1] },
    { hand: 0, kind: 'truco', detail: 'Anterior', team: 1, value: 4, score: [0, 4] });
  const summary = summarizeHand(view)!;
  expect(summary.points[0]).toBe(view.history[0]!.team === 0 ? 2 : 1);
  expect(summary.entries).toHaveLength(3);
  expect(JSON.stringify(summary)).not.toContain('cards');
});
