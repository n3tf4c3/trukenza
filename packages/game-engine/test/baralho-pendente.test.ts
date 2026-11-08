import { describe, expect, it } from 'vitest';
import { SpanishMatch, gauderio, parseCardId, type ActionType } from '../src/index.ts';

// Mesa de 4, mão na cadeira 0. A equipe 0 (cadeiras 0 e 2) leva a primeira vaza com o 1 de espadas.
const hands = [
  ['1-espadas', '7-espadas', '4-copas'],
  ['4-ouros', '5-bastos', '6-copas'],
  ['5-copas', '6-ouros', '4-bastos'],
  ['6-bastos', '5-ouros', '4-espadas'],
];

function act(m: SpanishMatch, seat: number, type: ActionType, card?: string) {
  expect(m.apply(seat, { type, ...(card ? { card: parseCardId(card)! } : {}) })).toEqual({ ok: true });
}

/** Primeira vaza da equipe 0; na segunda, 0, 1 e 2 jogam e a cadeira 3 é a última. */
function secondTrickLastToPlay(): SpanishMatch {
  const m = new SpanishMatch(gauderio({ goal: 24, flor: false }), 4, 1);
  m.setDealerForTests(3);
  m.startHand(hands.map((h) => h.map((id) => parseCardId(id)!)));
  for (let s = 0; s < 4; s++) act(m, s, 'jogar', hands[s]![0]);
  for (let s = 0; s < 3; s++) act(m, s, 'jogar', hands[s]![1]);
  expect(m.view().hand!.turn).toBe(3);
  return m;
}

/** 3 pede Truco, 0 responde Retruco e 3 vai ao baralho: o Retruco fica para o parceiro (cadeira 1) responder. */
function foldWithRetrucoPending(): SpanishMatch {
  const m = secondTrickLastToPlay();
  act(m, 3, 'truco');
  act(m, 0, 'retruco');
  act(m, 3, 'baralho');
  return m;
}

describe('ir ao baralho com resposta pendente da própria equipe', () => {
  it('não fecha a vaza nem a mão: o parceiro ainda responde ao Retruco', () => {
    const m = foldWithRetrucoPending();
    const hand = m.view().hand!;
    expect(hand.ended).toBeNull();
    expect(hand.decision).toBe('truco');
    expect(hand.truco.pending).toMatchObject({ team: 0, level: 3 });
    expect(m.actors()).toEqual([1]);
    expect(m.legalActions(1).map((a) => a.type)).toEqual(expect.arrayContaining(['quero', 'nao-quero', 'vale-quatro']));
    expect(m.legalActions(3)).toEqual([]);
    expect(hand.tricks).toHaveLength(2);
  });

  it('aceito o Retruco, a vaza fecha e a mão vale 3', () => {
    const m = foldWithRetrucoPending();
    act(m, 1, 'quero');
    const hand = m.view().hand!;
    expect(hand.ended).toEqual({ winnerTeam: 0, reason: 'vazas', value: 3 });
    expect(m.view().score).toEqual([3, 0]);
  });

  it('recusado o Retruco, quem pediu leva o Truco estabelecido (2)', () => {
    const m = foldWithRetrucoPending();
    act(m, 1, 'nao-quero');
    expect(m.view().hand!.ended).toEqual({ winnerTeam: 0, reason: 'recusa', value: 2 });
  });

  it('o parceiro pode aumentar; aceito o Vale Quatro, a vaza fecha valendo 4', () => {
    const m = foldWithRetrucoPending();
    act(m, 1, 'vale-quatro');
    expect(m.view().hand!.ended).toBeNull();
    act(m, 2, 'quero');
    expect(m.view().hand!.ended).toEqual({ winnerTeam: 0, reason: 'vazas', value: 4 });
  });

  it('controle: sem pedido pendente, ir ao baralho na própria vez fecha a vaza na hora', () => {
    const m = secondTrickLastToPlay();
    act(m, 3, 'baralho');
    expect(m.view().hand!.ended).toEqual({ winnerTeam: 0, reason: 'vazas', value: 1 });
  });
});
