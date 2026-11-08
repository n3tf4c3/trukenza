import { describe, expect, it } from 'vitest';
import { SpanishMatch, gauderio, parseCardId, type ActionType, type Goal } from '../src/index.ts';

const hands = [['1-espadas', '7-espadas', '3-copas'], ['4-ouros', '5-bastos', '6-copas']];
const flores = [['7-espadas', '6-espadas', '5-espadas'], ['4-ouros', '3-ouros', '2-ouros']];
function act(m: SpanishMatch, seat: number, type: ActionType, card?: string) {
  expect(m.apply(seat, { type, ...(card ? { card: parseCardId(card)! } : {}) })).toEqual({ ok: true });
}
function setup(chain: ActionType[], goal: Goal, flor: boolean) {
  const m = new SpanishMatch(gauderio({ goal, flor }), 2, 1);
  m.setDealerForTests(1);
  m.scoring.award('antes', 0, 'truco', 'Mãos anteriores', 0, goal - 6);
  m.startHand((flor ? flores : hands).map(h => h.map(id => parseCardId(id)!)));
  chain.forEach((call, i) => act(m, i % 2, call));
  return m;
}

describe('valores públicos da resposta coincidem com os tentos realmente contabilizados', () => {
  const chains: ActionType[][] = [
    ['truco'], ['truco', 'retruco'], ['truco', 'retruco', 'vale-quatro'],
    ['envido'], ['real-envido'], ['falta-envido'], ['envido', 'envido'],
    ['envido', 'real-envido'], ['envido', 'envido', 'real-envido', 'falta-envido'],
    ['flor'], ['flor', 'contra-flor'], ['flor', 'contra-flor-resto'], ['flor', 'contra-flor', 'contra-flor-resto'],
  ];
  for (const goal of [12, 24] as const) for (const chain of chains) for (const accept of [true, false]) {
    it(`${goal} tentos: ${chain.join(' → ')} / ${accept ? 'aceite' : 'recusa'}`, () => {
      const flor = chain[0] === 'flor';
      const m = setup(chain, goal, flor);
      const stakes = m.view().hand!.responseStakes!;
      expect(stakes).not.toBeNull();
      const kind = flor ? 'flor' : chain[0] === 'truco' ? 'truco' : 'envido';
      expect(stakes.kind).toBe(kind);
      act(m, m.actors()[0]!, accept ? 'quero' : flor ? 'me-achico' : 'nao-quero');
      if (accept && kind === 'truco') {
        expect(m.view().hand!.truco.level).toBe(stakes.accepted);
        for (let i = 0; i < 2; i++) {
          act(m, 0, 'jogar', hands[0]![i]);
          act(m, 1, 'jogar', hands[1]![i]);
        }
      }
      expect(m.view().history.at(-1)!.value).toBe(accept ? stakes.accepted : stakes.refused);
      expect(m.view().hand!.responseStakes).toBeNull();
      if (chain.includes('falta-envido') || chain.includes('contra-flor-resto')) expect(stakes.accepted).toBe(6);
    });
  }

  it('mostra primeiro o Envido pendente e volta aos valores do Truco depois da resposta', () => {
    const m = setup(['truco', 'envido'], 24, false);
    expect(m.view().hand!.responseStakes).toEqual({ kind: 'envido', accepted: 2, refused: 1 });
    act(m, 0, 'quero');
    expect(m.view().hand!.responseStakes).toEqual({ kind: 'truco', accepted: 2, refused: 1 });
  });

  it('não revela pontos das mãos escondidas nem oferece valores fora de uma disputa', () => {
    const m = setup([], 24, false);
    expect(m.view().hand!.responseStakes).toBeNull();
    act(m, 0, 'envido');
    expect(m.view().hand!.responseStakes).toEqual({ kind: 'envido', accepted: 2, refused: 1 });
    expect(m.view().hand!.envido.result).toBeNull();
    expect(m.view().hand!.review).toBeNull();
  });
});
