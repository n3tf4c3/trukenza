import { describe, expect, it, vi } from 'vitest';
import { SpanishMatch, gauderio, parseCardId, botAction, partnerSignal, type BotSignal } from '../src/index.ts';

const cards = [
  ['4-espadas', '12-ouros', '3-copas'], ['5-espadas', '10-bastos', '2-copas'],
  ['4-bastos', '5-ouros', '6-copas'], ['6-bastos', '4-ouros', '5-copas'],
];
function match() {
  const m = new SpanishMatch(gauderio({ flor: false }), 4, 5);
  m.setDealerForTests(3);
  m.startHand(cards.map(h => h.map(id => parseCardId(id)!)));
  return m;
}
const hint = (seat: number, claim: Partial<BotSignal> = {}): BotSignal => ({ seat, hand: 1, played: 0, power: 14, ...claim });
const play = (m: SpanishMatch, seat: number) => expect(m.apply(seat, { type: 'jogar', card: parseCardId(cards[seat]![0])! }).ok).toBe(true);

describe('computador interpreta somente sinais públicos do parceiro', () => {
  it('poupa carta forte quando o parceiro promete cobrir, mesmo se for blefe', () => {
    const m = match();
    expect(botAction(m, 0, () => 1).card).toEqual(parseCardId('12-ouros'));
    const hand = vi.spyOn(m, 'handOf');
    const dealt = vi.spyOn(m, 'dealtOf');
    const action = botAction(m, 0, () => 1, [hint(2)]);
    expect(action.card).toEqual(parseCardId('4-espadas'));
    expect(hand.mock.calls.every(([seat]) => seat === 0)).toBe(true);
    expect(dealt.mock.calls.every(([seat]) => seat === 0)).toBe(true);
    expect(m.legalActions(0)).toContainEqual(action);
  });

  it('ignora adversário, mão antiga, sinal superado por carta e parceiro recolhido', () => {
    const m = match();
    expect(partnerSignal(m.view(), 0, [hint(1)])).toBeUndefined();
    expect(partnerSignal(m.view(), 0, [hint(2, { hand: 2 })])).toBeUndefined();
    play(m, 0); play(m, 1); play(m, 2);
    expect(partnerSignal(m.view(), 0, [hint(2)])).toBeUndefined();
    const envido = hint(2, { power: undefined, envido: 30 });
    expect(partnerSignal(m.view(), 0, [envido])).toEqual(envido);
    const view = m.view();
    view.hand!.folded[2] = true;
    expect(partnerSignal(view, 0, [envido])).toBeUndefined();
    view.seats = 2;
    expect(partnerSignal(view, 0, [hint(2)])).toBeUndefined();
  });

  it('considera o parceiro ao aceitar Truco, sem garantir que ele tenha a carta', () => {
    const m = match(); play(m, 0);
    expect(m.apply(1, { type: 'truco' }).ok).toBe(true);
    expect(botAction(m, 2, () => 1).type).toBe('nao-quero');
    expect(botAction(m, 2, () => 1, [hint(0, { played: 1 })]).type).toBe('quero');
  });

  it('usa o Envido sinalizado, sem somar os pontos dos parceiros', () => {
    const m = match(); play(m, 0); play(m, 1);
    expect(m.apply(2, { type: 'envido' }).ok).toBe(true);
    expect(botAction(m, 3, () => 1).type).toBe('nao-quero');
    expect(botAction(m, 3, () => 1, [hint(1, { power: undefined, envido: 30, played: 1 })]).type).toBe('quero');
  });
});
