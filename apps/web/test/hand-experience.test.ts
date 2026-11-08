import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardShortcut, eventCursor, handExplanation, parseSeenTips, validSelection } from '../src/handExperience.ts';
import type { HandSummary } from '../../../packages/game-engine/src/handSummary.ts';

test('revanche processa novos eventos desde o início; reconexão pula os antigos', () => {
  const next = { winner: null, events: [{ id: 1, kind: 'nova-mao' as const, hand: 1, dealer: 0, mano: 1 }] };
  assert.equal(eventCursor({ winner: 1 }, next, 150), 0);
  assert.equal(eventCursor(null, next, -1), 1);
  assert.equal(eventCursor({ winner: null }, next, 1), 1);
  assert.equal(eventCursor({ winner: 1 }, null, 150), -1);
});

test('seleção antiga ou carta que deixou de ser jogável não confirma', () => {
  const s = { id: '1-espadas', version: 5 };
  assert.equal(validSelection(s, 5, [s.id]), s.id);
  assert.equal(validSelection(s, 6, [s.id]), null);
  assert.equal(validSelection(s, 5, []), null);
  assert.equal(validSelection(null, 5, [s.id]), null);
});
test('atalhos respeitam foco, combinações e repetição', () => {
  assert.equal(cardShortcut('2', false), 1);
  assert.equal(cardShortcut('Enter', false), 'play');
  assert.equal(cardShortcut('Escape', false), 'clear');
  assert.equal(cardShortcut('4', false), null);
  for (const key of ['1', 'Enter', 'Escape']) {
    assert.equal(cardShortcut(key, true), null);
    assert.equal(cardShortcut(key, false, true), null);
    assert.equal(cardShortcut(key, false, false, true), null);
  }
});
test('explicação distingue pardas, recusa, baralho e partida decidida pelo canto', () => {
  const summary = (outcomes: HandSummary['outcomes'], reason: HandSummary['ended']['reason'] = 'vazas'): HandSummary =>
    ({ number: 1, ended: { winnerTeam: 0, reason, value: 1 }, outcomes, entries: [], points: [1, 0] });
  assert.match(handExplanation(summary([0, 'parda'])), /primeira.*segunda/);
  assert.match(handExplanation(summary(['parda', 1])), /segunda vaza decidiu/);
  assert.match(handExplanation(summary(['parda', 'parda', 1])), /terceira vaza decidiu/);
  assert.match(handExplanation(summary(['parda', 'parda', 'parda'])), /lado do mão/);
  assert.match(handExplanation(summary([0, 1, 'parda'])), /quem ganhou a primeira/);
  assert.match(handExplanation(summary([], 'recusa')), /recusado/);
  assert.match(handExplanation(summary([], 'baralho')), /baralho/);
  assert.match(handExplanation(summary([], 'partida')), /meta/);
});
test('preferências de dicas toleram armazenamento inválido e não repetem ids', () => {
  assert.deepEqual(parseSeenTips('quebrado'), []);
  assert.deepEqual(parseSeenTips('{}'), []);
  assert.deepEqual(parseSeenTips('["cartas","cartas","inexistente",4]'), ['cartas']);
});
