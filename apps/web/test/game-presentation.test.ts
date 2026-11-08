import assert from 'node:assert/strict';
import { test } from 'node:test';
import { responseHint, trickStanding } from '../src/game.ts';

const openTrick = (plays: { seat: number; card: string }[]) => ({ leader: 0, plays, outcome: null, winnerSeat: null });

test('empate parcial entre adversários não destaca vencedor; carta mais forte desfaz empate', () => {
  const plays = [{ seat: 0, card: '3-copas' }, { seat: 1, card: '3-ouros' }];
  assert.deepEqual(trickStanding(openTrick(plays)), { outcome: 'parda', winnerSeat: null });
  assert.deepEqual(trickStanding(openTrick([...plays, { seat: 2, card: '1-espadas' }])), { outcome: 0, winnerSeat: 2 });
});

test('empate entre parceiros mantém a dupla na frente; vaza vazia não tem líder', () => {
  assert.deepEqual(trickStanding(openTrick([{ seat: 0, card: '3-copas' }, { seat: 2, card: '3-ouros' }])), { outcome: 0, winnerSeat: 0 });
  assert.equal(trickStanding(openTrick([])), null);
});

test('resultado fechado prevalece e textos distinguem disputa aceita de pontos entregues', () => {
  assert.deepEqual(trickStanding({ ...openTrick([]), outcome: 'parda' }), { outcome: 'parda', winnerSeat: null });
  assert.equal(responseHint('quero', { kind: 'truco', accepted: 2, refused: 1 }), 'Mão vale 2 tentos');
  assert.equal(responseHint('nao-quero', { kind: 'truco', accepted: 2, refused: 1 }), 'Entrega 1 tento');
  assert.equal(responseHint('quero', { kind: 'envido', accepted: 5, refused: 2 }), 'Disputa vale 5 tentos');
  assert.equal(responseHint('me-achico', { kind: 'flor', accepted: 12, refused: 6 }), 'Entrega 6 tentos');
  assert.equal(responseHint('quero', undefined), null, 'servidor antigo não faz a interface inventar valores');
});
