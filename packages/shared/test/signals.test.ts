import { describe, expect, it } from 'vitest';
import { SIGNAL_IDS, parseSignalRequest, parseTableSignal } from '../src/signals.ts';

describe('sinais públicos', () => {
  it('aceita somente gestos conhecidos e mãos válidas, sem carregar cartas ou identidade do pedido', () => {
    for (const signal of SIGNAL_IDS) expect(parseSignalRequest({ signal, hand: 2, seat: 3, card: '1-espadas' })).toEqual({ signal, hand: 2 });
    for (const raw of [null, 'piscada', {}, { signal: '__proto__', hand: 1 }, { signal: 'constructor', hand: 1 },
      { signal: 'piscada', hand: 0 }, { signal: 'piscada', hand: 1.5 }, { signal: 'piscada', hand: Infinity }]) {
      expect(parseSignalRequest(raw)).toBeNull();
    }
  });
  it('valida o evento de mesa e remove campos extras', () => {
    expect(parseTableSignal({ signal: 'olhos', hand: 3, seat: 2, id: 8, cards: ['1-paus'] })).toEqual({ signal: 'olhos', hand: 3, seat: 2, id: 8 });
    for (const seat of [-1, 4, 1.5, '1']) expect(parseTableSignal({ signal: 'olhos', hand: 1, seat, id: 1 })).toBeNull();
  });
});
