import { expect, it } from 'vitest';
import { SpanishMatch, gauderio } from '@trukenza/game-engine';
import { SignalMemory } from '../src/signalMemory.ts';

it('guarda só o último gesto público por cadeira e limpa mão, saída e partida', () => {
  const m = new SpanishMatch(gauderio(), 4, 42); m.startHand();
  const memory = new SignalMemory();
  memory.observe(m.view(), 0, 'sobrancelhas');
  expect(memory.forHand(m.view())).toEqual([{ seat: 0, hand: 1, played: 0, power: 14 }]);
  memory.observe(m.view(), 0, 'nariz');
  expect(memory.forHand(m.view())).toEqual([{ seat: 0, hand: 1, played: 0, envido: 30 }]);
  memory.forget(0);
  expect(memory.forHand(m.view())).toEqual([]);
  memory.observe(m.view(), 0, 'olhos');
  const next = m.view(); next.hand!.number++;
  expect(memory.forHand(next)).toEqual([]);
  memory.observe(m.view(), 0, 'bico'); memory.clear();
  expect(memory.forHand(m.view())).toEqual([]);
});
